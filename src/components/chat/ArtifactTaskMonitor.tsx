"use client";
/**
 * 실시간 작업 모니터 — Pipeline B/C 진행 상황 터미널 스타일 표시
 */
import { useState, useEffect, useRef, useCallback } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface TaskInfo {
  task_id: string;
  project: string;
  title: string;
  pipeline: string;
  phase: string;
  status: string;
  elapsed_sec: number;
  created_at: string;
}

interface LogEntry {
  id?: number;
  log_type: string;
  content: string;
  phase: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#3b82f6",
  in_progress: "#3b82f6",
  awaiting_approval: "#f59e0b",
  done: "#22c55e",
  error: "#ef4444",
  failed: "#ef4444",
  queued: "#9ca3af",
};

const LOG_TYPE_COLORS: Record<string, string> = {
  command: "#fbbf24",
  output: "#e5e7eb",
  error: "#f87171",
  phase_change: "#22d3ee",
  info: "#9ca3af",
};

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
  return `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`;
}

export default function ArtifactTaskMonitor({ sessionId }: { sessionId?: string }) {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // 작업 목록 로드
  const fetchTasks = useCallback(async () => {
    try {
      const url = sessionId
        ? `${BASE_URL}/tasks/active?session_id=${sessionId}`
        : `${BASE_URL}/tasks/active`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // 로그 로드
  const fetchLogs = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/tasks/${taskId}/logs?last_n=50`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setLogs((prev) => ({ ...prev, [taskId]: data.logs || [] }));
    } catch {
      /* ignore */
    }
  }, []);

  // 초기 로드 + 폴링
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // 카드 확장 시 로그 로드 + SSE 구독
  useEffect(() => {
    if (!expandedTask) return;
    fetchLogs(expandedTask);

    // SSE 스트림 구독
    const abortController = new AbortController();
    const connectSSE = async () => {
      try {
        const res = await fetch(`${BASE_URL}/tasks/${expandedTask}/stream`, {
          headers: getAuthHeaders(),
          signal: abortController.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            for (const line of event.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "task_log") {
                  setLogs((prev) => {
                    const existing = prev[expandedTask] || [];
                    return {
                      ...prev,
                      [expandedTask]: [
                        ...existing,
                        {
                          log_type: data.log_type,
                          content: data.content,
                          phase: data.phase || "",
                          created_at: data.timestamp || new Date().toISOString(),
                        },
                      ].slice(-200),
                    };
                  });
                } else if (data.type === "task_completed") {
                  fetchTasks();
                }
              } catch {
                /* ignore parse errors */
              }
            }
          }
        }
      } catch {
        /* SSE 연결 종료 */
      }
    };
    connectSSE();

    // 폴링 폴백 (SSE 끊겼을 때)
    const logPoll = setInterval(() => fetchLogs(expandedTask), 5000);

    return () => {
      abortController.abort();
      clearInterval(logPoll);
    };
  }, [expandedTask, fetchLogs, fetchTasks]);

  // 자동 스크롤
  useEffect(() => {
    if (autoScrollRef.current && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, expandedTask]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  const activeTasks = tasks.filter((t) => ["running", "in_progress", "queued", "awaiting_approval"].includes(t.status));

  return (
    <div className="flex flex-col h-full" style={{ color: "var(--ct-text)" }}>
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ct-border)" }}
      >
        <span className="text-xs font-medium">
          {activeTasks.length > 0
            ? `활성 작업 ${activeTasks.length}건`
            : "작업 없음"}
        </span>
        <button
          onClick={fetchTasks}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: "var(--ct-hover)",
            border: "none",
            color: "var(--ct-text-muted)",
            cursor: "pointer",
          }}
        >
          새로고침
        </button>
      </div>

      {/* 작업 카드 목록 */}
      <div className="flex-1 overflow-y-auto chat-scrollbar" style={{ padding: 8 }}>
        {loading && <p className="text-xs text-center py-4" style={{ color: "var(--ct-text-muted)" }}>로딩 중...</p>}
        {!loading && tasks.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--ct-text-muted)" }}>
            진행 중인 작업이 없습니다.
          </p>
        )}
        {tasks.map((task) => {
          const isExpanded = expandedTask === task.task_id;
          const taskLogs = logs[task.task_id] || [];
          const statusColor = STATUS_COLORS[task.status] || "#9ca3af";

          return (
            <div
              key={task.task_id}
              style={{
                marginBottom: 8,
                borderRadius: 8,
                border: `1px solid ${isExpanded ? statusColor : "var(--ct-border)"}`,
                background: "var(--ct-bg)",
                overflow: "hidden",
              }}
            >
              {/* 카드 헤더 */}
              <button
                onClick={() => setExpandedTask(isExpanded ? null : task.task_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--ct-text)",
                }}
              >
                {/* 상태 점 */}
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: statusColor,
                    flexShrink: 0,
                    animation: task.status === "running" || task.status === "in_progress"
                      ? "pulse 2s infinite"
                      : "none",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-xs font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    [{task.project}] {task.title}
                  </div>
                  <div className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                    {task.pipeline === "pipeline_c" ? "Pipeline C" : "Pipeline B"} &middot;{" "}
                    {task.phase} &middot; {formatElapsed(task.elapsed_sec)}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "var(--ct-text-muted)" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* 로그 영역 (터미널 스타일) */}
              {isExpanded && (
                <div
                  onScroll={handleScroll}
                  className="chat-scrollbar"
                  style={{
                    maxHeight: 300,
                    overflowY: "auto",
                    background: "#0d1117",
                    padding: "8px 10px",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 11,
                    lineHeight: 1.6,
                    borderTop: "1px solid #21262d",
                  }}
                >
                  {taskLogs.length === 0 && (
                    <span style={{ color: "#6e7681" }}>로그 대기 중...</span>
                  )}
                  {taskLogs.map((log, i) => (
                    <div key={i} style={{ color: LOG_TYPE_COLORS[log.log_type] || "#9ca3af" }}>
                      <span style={{ color: "#6e7681", marginRight: 6 }}>
                        {new Date(log.created_at).toLocaleTimeString("ko-KR", { hour12: false })}
                      </span>
                      {log.phase && (
                        <span style={{ color: "#22d3ee", marginRight: 6 }}>
                          [{log.phase}]
                        </span>
                      )}
                      {log.content}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
