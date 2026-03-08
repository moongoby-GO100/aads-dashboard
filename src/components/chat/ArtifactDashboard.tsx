"use client";
/**
 * AADS-172-C: ArtifactDashboard
 * 대시보드 탭 - 미니 서버 상태 + 파이프라인 위젯
 */
import { useEffect, useState } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface ServerStatus {
  name: string;
  ip: string;
  status: "ok" | "warn" | "error" | "unknown";
  cpu?: number;
  mem?: number;
  uptime?: string;
}

interface PipelineTask {
  task_id: string;
  title: string;
  status: string;
  project: string;
  completed_at?: string;
}

interface CircuitBreaker {
  state: string;
  fail_count: number;
  threshold: number;
}

// ─── 상태 뱃지 ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServerStatus["status"] }) {
  const colors: Record<string, string> = {
    ok:      "#00B894",
    warn:    "#FDCB6E",
    error:   "#FF6B6B",
    unknown: "#888888",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[status] || "#888",
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function StatusBadge({ value }: { value: string }) {
  const color =
    value === "ok" || value === "completed" ? "#00B894"
    : value === "running" || value === "active" ? "#6C5CE7"
    : value === "failed" || value === "error" ? "#FF6B6B"
    : "#FDCB6E";
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{ background: `${color}22`, color, fontWeight: 500 }}
    >
      {value}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const SERVERS: ServerStatus[] = [
  { name: "서버 68 (AADS)",  ip: "68.183.183.11",  status: "unknown" },
  { name: "서버 211 (Hub)",   ip: "211.188.51.113", status: "unknown" },
  { name: "서버 114 (SF/NTV)",ip: "116.120.58.155", status: "unknown" },
];

export default function ArtifactDashboard() {
  const [servers, setServers] = useState<ServerStatus[]>(SERVERS);
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [circuit, setCircuit] = useState<CircuitBreaker | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const [opsRes, taskRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/ops/status`, { headers: getAuthHeaders() }),
        fetch(`${BASE_URL}/ops/pipeline-history?limit=5`, { headers: getAuthHeaders() }),
      ]);

      if (opsRes.status === "fulfilled" && opsRes.value.ok) {
        const data = await opsRes.value.json();
        // 서버 상태 파싱 (API 형태에 따라 처리)
        if (data.servers) {
          setServers(
            SERVERS.map((s) => {
              const found = data.servers.find((srv: { ip: string }) => srv.ip === s.ip);
              return found ? { ...s, ...found } : s;
            })
          );
        }
        if (data.circuit_breaker) setCircuit(data.circuit_breaker);
      }

      if (taskRes.status === "fulfilled" && taskRes.value.ok) {
        const data = await taskRes.value.json();
        setTasks(Array.isArray(data) ? data.slice(0, 5) : (data.items || []).slice(0, 5));
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    load();
    // 30초마다 자동 갱신
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 chat-scrollbar space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>
          🖥️ 시스템 대시보드
        </p>
        <button
          onClick={load}
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
        >
          새로고침
        </button>
      </div>

      {/* 서버 상태 */}
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
      >
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--ct-text)" }}>서버 상태</p>
        <div className="space-y-2">
          {servers.map((srv, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex items-center">
                <StatusDot status={srv.status} />
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--ct-text)" }}>{srv.name}</p>
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{srv.ip}</p>
                </div>
              </div>
              <div className="text-right">
                {srv.cpu !== undefined && (
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                    CPU {srv.cpu}%
                  </p>
                )}
                {srv.mem !== undefined && (
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                    MEM {srv.mem}%
                  </p>
                )}
                {!srv.cpu && !srv.mem && (
                  <StatusBadge value={srv.status} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 서킷 브레이커 */}
      {circuit && (
        <div
          className="rounded-lg p-3"
          style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--ct-text)" }}>
            ⚡ 서킷 브레이커
          </p>
          <div className="flex items-center justify-between">
            <StatusBadge value={circuit.state} />
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
              실패 {circuit.fail_count}/{circuit.threshold}
            </span>
          </div>
        </div>
      )}

      {/* 최근 파이프라인 */}
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
      >
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--ct-text)" }}>
          🚀 최근 파이프라인
        </p>
        {loading && tasks.length === 0 ? (
          <p className="text-xs animate-pulse" style={{ color: "var(--ct-text-muted)" }}>로딩 중...</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>태스크 없음</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t, idx) => (
              <div key={idx} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--ct-text)" }}>
                    {t.task_id}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--ct-text-muted)" }}>
                    {t.title}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <StatusBadge value={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 마지막 갱신 */}
      <p className="text-xs text-center" style={{ color: "var(--ct-text-muted)" }}>
        마지막 갱신: {lastRefresh.toLocaleTimeString("ko-KR")}
      </p>
    </div>
  );
}
