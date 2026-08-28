"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type BrowserTask = {
  id: string;
  work_key: string;
  target_url: string;
  status: string;
  current_step: string;
  requires_approval: boolean;
  approval_request_id?: string | null;
  updated_at?: string;
};

type BrowserTaskEvent = {
  id: string;
  event_type: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

type PermissionRequest = {
  id: string;
  task_id?: string | null;
  work_key: string;
  origin: string;
  action_type: string;
  action_summary: string;
  risk_level: string;
  decision: string;
  expires_at?: string;
};

type VaultCredential = {
  id: string;
  work_key: string;
  origin: string;
  label: string;
  username: string;
  updated_at?: string;
};

type LiveFrame = {
  task_id: string;
  frame_base64?: string;
  frame_url?: string;
  media_type?: string;
  width?: number | null;
  height?: number | null;
  current_url?: string;
  page_title?: string;
  current_step?: string;
  captured_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

const STATUS_OPTIONS = ["", "queued", "running", "approval_required", "auth_required", "completed", "failed"];

function statusStyle(status: string): React.CSSProperties {
  if (status === "completed") return { color: "#15803d", background: "#dcfce7" };
  if (status === "failed") return { color: "#b91c1c", background: "#fee2e2" };
  if (status === "approval_required" || status === "auth_required") return { color: "#a16207", background: "#fef3c7" };
  if (status === "running") return { color: "#1d4ed8", background: "#dbeafe" };
  return { color: "var(--text-secondary)", background: "var(--bg-hover)" };
}

function formatTime(value?: string): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function getInitialSessionId(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("session_id") || "";
}

function getFrameSrc(frame: LiveFrame | null): string {
  if (!frame) return "";
  if (frame.frame_url) return frame.frame_url;
  if (!frame.frame_base64) return "";
  const mediaType = frame.media_type || "image/jpeg";
  if (frame.frame_base64.startsWith("data:")) return frame.frame_base64;
  return `data:${mediaType};base64,${frame.frame_base64}`;
}

function eventSummary(event: BrowserTaskEvent): string {
  const payload = event.payload || {};
  const step = payload.current_step || payload.action_type || payload.reason || payload.page_title || payload.current_url;
  return typeof step === "string" && step.trim() ? step : "-";
}

function liveFrameSource(frame: LiveFrame | null): string {
  const source = frame?.metadata?.source;
  if (source === "self_hosted_playwright") return "서버 Playwright";
  if (source === "pc_agent_browser_screenshot") return "PC Agent";
  return "대기";
}

export default function BrowserTasksPage() {
  const [tasks, setTasks] = useState<BrowserTask[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workKey, setWorkKey] = useState("aads-ceo-browser");
  const [targetUrl, setTargetUrl] = useState("https://aads.newtalk.kr/chat");
  const [sessionId, setSessionId] = useState(getInitialSessionId);
  const [busy, setBusy] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [liveFrame, setLiveFrame] = useState<LiveFrame | null>(null);
  const [liveEvents, setLiveEvents] = useState<BrowserTaskEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const activeTasks = useMemo(() => tasks.filter((task) => !["completed", "failed", "cancelled"].includes(task.status)).length, [tasks]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, permissionRes, credentialRes] = await Promise.all([
        api.getBrowserTasks({ status: status || undefined, limit: 50 }),
        api.getBrowserTaskPermissions({ decision: "pending", limit: 50 }),
        api.getAgentVaultCredentials({ work_key: workKey || undefined }),
      ]);
      const taskData = taskRes as { tasks?: BrowserTask[] };
      const permissionData = permissionRes as { requests?: PermissionRequest[] };
      const credentialData = credentialRes as { credentials?: VaultCredential[] };
      setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);
      setPermissions(Array.isArray(permissionData.requests) ? permissionData.requests : []);
      setCredentials(Array.isArray(credentialData.credentials) ? credentialData.credentials : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setLiveFrame(null);
      setLiveEvents([]);
      return;
    }

    let cancelled = false;
    const loadLive = async () => {
      try {
        const res = await api.getBrowserTaskLiveFrame(selectedTaskId, { event_limit: 30, capture: true }) as {
          frame?: LiveFrame | null;
          events?: BrowserTaskEvent[];
        };
        if (cancelled) return;
        setLiveFrame(res.frame || null);
        setLiveEvents(Array.isArray(res.events) ? res.events : []);
        setLiveError(null);
      } catch (e) {
        if (!cancelled) setLiveError(String(e));
      }
    };

    loadLive();
    const id = setInterval(loadLive, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedTaskId]);

  const createTask = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createBrowserTask({
        work_key: workKey,
        target_url: targetUrl,
        session_id: sessionId || undefined,
        current_step: "대기 중",
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (requestId: string, approved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (approved) await api.approveBrowserTaskPermission(requestId, "dashboard approval");
      else await api.rejectBrowserTaskPermission(requestId, "dashboard rejection");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const frameSrc = getFrameSrc(liveFrame);

  return (
    <div className="p-6 space-y-6" style={{ color: "var(--text-primary)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <h1 className="text-xl font-bold">Managed Browser</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>서버/PC 브라우저 작업, 권한 승인, Agent Vault</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded text-sm font-medium hover:opacity-80"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#fca5a5", color: "#b91c1c", background: "#fee2e2" }}>
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">작업 생성</h2>
          <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>work_key</label>
          <input className="w-full rounded border px-3 py-2 text-sm" value={workKey} onChange={(e) => setWorkKey(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>target_url</label>
          <input className="w-full rounded border px-3 py-2 text-sm" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>chat session_id</label>
          <input className="w-full rounded border px-3 py-2 text-sm" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="현재 채팅 세션 자동 귀속" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <button disabled={busy} onClick={createTask} className="w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>
            작업 등록
          </button>
        </section>

        <section className="rounded-lg border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">Agent Vault</h2>
          <p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
            계정 등록은 전용 보안 콘솔에서 처리합니다. Managed Browser는 작업 실행과 권한 승인에 집중하고,
            비밀번호 원문은 화면 목록에 표시하지 않습니다.
          </p>
          <Link
            href={`/agent-vault?work_key=${encodeURIComponent(workKey)}`}
            className="block w-full rounded px-4 py-2 text-center text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Agent Vault 열기
          </Link>
        </section>

        <section className="rounded-lg border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">요약</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{tasks.length}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Tasks</div>
            </div>
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{activeTasks}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Active</div>
            </div>
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{permissions.length}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Approvals</div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold">브라우저 작업</h2>
            <select className="rounded border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item || "all"}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead style={{ color: "var(--text-secondary)" }}>
                <tr className="text-left">
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">work_key</th>
                  <th className="px-4 py-3">target</th>
                  <th className="px-4 py-3">단계</th>
                  <th className="px-4 py-3">갱신</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const selected = selectedTaskId === task.id;
                  return (
                    <tr
                      key={task.id}
                      className="border-t cursor-pointer"
                      style={{
                        borderColor: "var(--border)",
                        background: selected ? "var(--bg-hover)" : "transparent",
                      }}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <td className="px-4 py-3"><span className="rounded px-2 py-1 text-xs font-medium" style={statusStyle(task.status)}>{task.status}</span></td>
                      <td className="px-4 py-3 font-mono text-xs">{task.work_key}</td>
                      <td className="px-4 py-3 truncate max-w-[260px]">{task.target_url}</td>
                      <td className="px-4 py-3">{task.current_step || "-"}</td>
                      <td className="px-4 py-3">{formatTime(task.updated_at)}</td>
                    </tr>
                  );
                })}
                {!loading && tasks.length === 0 && (
                  <tr><td className="px-4 py-8 text-center" colSpan={5} style={{ color: "var(--text-secondary)" }}>작업이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="font-semibold">Live View</h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {selectedTask ? selectedTask.work_key : "작업을 선택하세요"}
              </p>
            </div>
            <span className="rounded px-2 py-1 text-xs font-medium" style={statusStyle(selectedTask?.status || "")}>
              {selectedTask?.status || "idle"}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {liveError && (
              <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: "#fca5a5", color: "#b91c1c", background: "#fee2e2" }}>
                {liveError}
              </div>
            )}

            <div
              className="relative grid aspect-video place-items-center overflow-hidden rounded border"
              style={{ background: "#0f172a", borderColor: "var(--border)" }}
            >
              {frameSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frameSrc}
                  alt="브라우저 작업 현재 화면"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="px-4 text-center text-sm" style={{ color: "#cbd5e1" }}>
                  아직 수신된 화면 프레임이 없습니다.
                </div>
              )}
              <div className="absolute left-2 top-2 rounded px-2 py-1 text-[11px]" style={{ background: "rgba(15,23,42,.78)", color: "#e2e8f0" }}>
                {liveFrame?.captured_at ? `캡처 ${formatTime(liveFrame.captured_at)}` : "대기"}
              </div>
            </div>

            <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              <div className="truncate">URL: {liveFrame?.current_url || selectedTask?.target_url || "-"}</div>
              <div className="truncate">제목: {liveFrame?.page_title || "-"}</div>
              <div className="truncate">단계: {liveFrame?.current_step || selectedTask?.current_step || "-"}</div>
              <div className="truncate">캡처: {liveFrameSource(liveFrame)}</div>
            </div>

            <div className="rounded border" style={{ borderColor: "var(--border)" }}>
              <div className="border-b px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>최근 실행 이벤트</div>
              <div className="max-h-64 overflow-y-auto">
                {liveEvents.map((event) => (
                  <div key={event.id} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2 border-b px-3 py-2 text-xs last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{formatTime(event.created_at)}</span>
                    <div className="min-w-0">
                      <div className="font-medium">{event.event_type}</div>
                      <div className="truncate" style={{ color: "var(--text-secondary)" }}>{eventSummary(event)}</div>
                    </div>
                  </div>
                ))}
                {!selectedTask && <div className="p-4 text-center text-xs" style={{ color: "var(--text-secondary)" }}>작업을 선택하면 이벤트가 표시됩니다.</div>}
                {selectedTask && liveEvents.length === 0 && <div className="p-4 text-center text-xs" style={{ color: "var(--text-secondary)" }}>이벤트가 없습니다.</div>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">승인 대기</h2></div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {permissions.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{item.action_type}</div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.action_summary || item.origin}</div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => decide(item.id, true)} className="rounded px-3 py-1.5 text-sm" style={{ background: "#dcfce7", color: "#15803d" }}>승인</button>
                    <button disabled={busy} onClick={() => decide(item.id, false)} className="rounded px-3 py-1.5 text-sm" style={{ background: "#fee2e2", color: "#b91c1c" }}>거부</button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && permissions.length === 0 && <div className="p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>승인 대기 항목이 없습니다.</div>}
          </div>
        </section>

        <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">저장된 자격증명</h2></div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {credentials.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.origin} · {item.username}</div>
                </div>
                <span className="rounded px-2 py-1 text-xs font-medium" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>원문 비밀번호 숨김</span>
              </div>
            ))}
            {!loading && credentials.length === 0 && <div className="p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>저장된 자격증명이 없습니다.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
