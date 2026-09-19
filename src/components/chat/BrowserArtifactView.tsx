"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type BrowserTask = {
  id: string;
  session_id?: string | null;
  work_key: string;
  target_url: string;
  status: string;
  current_step?: string;
  updated_at?: string;
};

type BrowserEvent = {
  id: string;
  event_type: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

type LiveFrame = {
  frame_base64?: string;
  frame_url?: string;
  media_type?: string;
  current_url?: string;
  page_title?: string;
  current_step?: string;
  captured_at?: string;
  metadata?: Record<string, unknown>;
};

type Props = { sessionId?: string };

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function frameSource(frame: LiveFrame | null): string {
  const source = frame?.metadata?.source;
  if (source === "self_hosted_playwright") return "서버 Playwright";
  if (source === "pc_agent_browser_screenshot") return "PC Agent";
  return "화면 대기";
}

function frameSrc(frame: LiveFrame | null): string {
  if (!frame) return "";
  if (frame.frame_url) return frame.frame_url;
  if (!frame.frame_base64) return "";
  if (frame.frame_base64.startsWith("data:")) return frame.frame_base64;
  return `data:${frame.media_type || "image/jpeg"};base64,${frame.frame_base64}`;
}

function eventText(event: BrowserEvent): string {
  const payload = event.payload || {};
  const value = payload.user_message || payload.current_step || payload.guide || payload.action_type || payload.reason;
  return typeof value === "string" && value.trim() ? value : event.event_type;
}

function time(value?: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function BrowserArtifactView({ sessionId }: Props) {
  const [tasks, setTasks] = useState<BrowserTask[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [events, setEvents] = useState<BrowserEvent[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const visibleTasks = useMemo(() => {
    return sessionId ? tasks.filter((task) => task.session_id === sessionId) : tasks;
  }, [sessionId, tasks]);

  const selected = visibleTasks.find((task) => task.id === selectedId) || visibleTasks[0] || null;

  const loadTasks = useCallback(async () => {
    try {
      const response = await api.getBrowserTasks({ limit: 50 }) as { tasks?: BrowserTask[] };
      setTasks(Array.isArray(response.tasks) ? response.tasks : []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const loadLive = useCallback(async (capture = false) => {
    if (!selected?.id) {
      setFrame(null);
      setEvents([]);
      return;
    }
    try {
      const response = await api.getBrowserTaskLiveFrame(selected.id, {
        event_limit: 20,
        capture,
      }) as { frame?: LiveFrame | null; events?: BrowserEvent[] };
      setFrame(response.frame || null);
      setEvents(Array.isArray(response.events) ? response.events : []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [selected?.id]);

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => void loadTasks(), 8000);
    return () => window.clearInterval(timer);
  }, [loadTasks]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    void loadLive(false);
    const timer = window.setInterval(() => void loadLive(false), 3000);
    return () => window.clearInterval(timer);
  }, [loadLive]);

  const createTask = async () => {
    const url = targetUrl.trim();
    if (!url) return;
    setBusy(true);
    try {
      await api.createBrowserTask({
        work_key: sessionId ? `chat-${sessionId.slice(0, 12)}` : "aads-ceo-browser",
        target_url: url,
        session_id: sessionId || undefined,
        current_step: "서버 Playwright 실행 준비",
      });
      setTargetUrl("");
      await loadTasks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const imageSrc = frameSrc(frame);
  const running = visibleTasks.filter((task) => !TERMINAL.has(task.status)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: "100%" }}>
      <div style={{ border: "1px solid var(--ct-border)", borderRadius: 10, padding: 12, background: "var(--ct-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <strong style={{ flex: 1, fontSize: 13 }}>스마트 브라우저</strong>
          <span style={{ fontSize: 11, color: "var(--ct-text2)" }}>진행 {running} · 전체 {visibleTasks.length}</span>
          <a href="/browser-tasks" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--ct-accent)" }}>전체 화면 ↗</a>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            aria-label="브라우저로 열 URL"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void createTask(); }}
            placeholder="https://... 주소를 입력하세요"
            style={{ flex: 1, minWidth: 0, border: "1px solid var(--ct-border)", borderRadius: 7, padding: "8px 9px", background: "var(--ct-input)", color: "var(--ct-text)", fontSize: 12 }}
          />
          <button disabled={busy || !targetUrl.trim()} onClick={() => void createTask()} style={{ border: 0, borderRadius: 7, padding: "8px 10px", background: "var(--ct-accent)", color: "#fff", cursor: busy ? "wait" : "pointer", opacity: busy || !targetUrl.trim() ? 0.55 : 1 }}>
            열기
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: "var(--ct-text2)" }}>
          서버 Playwright를 먼저 사용합니다. 인증서·로컬 앱처럼 PC 환경이 꼭 필요할 때만 Windows 오비스로 전환하고, 전환 이유를 단계 기록에 표시합니다.
        </div>
      </div>

      {error && <div role="alert" style={{ padding: 9, borderRadius: 8, background: "rgba(239,68,68,.12)", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {visibleTasks.length > 0 && (
        <select value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} style={{ width: "100%", border: "1px solid var(--ct-border)", borderRadius: 7, padding: 8, background: "var(--ct-input)", color: "var(--ct-text)", fontSize: 12 }}>
          {visibleTasks.map((task) => <option key={task.id} value={task.id}>{task.status} · {task.current_step || task.target_url}</option>)}
        </select>
      )}

      <div style={{ position: "relative", display: "grid", placeItems: "center", aspectRatio: "16 / 9", border: "1px solid var(--ct-border)", borderRadius: 10, overflow: "hidden", background: "#0f172a" }}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="스마트 브라우저 현재 화면" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>브라우저 작업을 시작하면 현재 화면이 여기에 표시됩니다.</span>
        )}
        <button onClick={() => void loadLive(true)} disabled={!selected || busy} style={{ position: "absolute", right: 8, top: 8, border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "5px 7px", background: "rgba(15,23,42,.82)", color: "#e2e8f0", fontSize: 10, cursor: selected ? "pointer" : "not-allowed" }}>
          화면 새로고침
        </button>
      </div>

      <div style={{ border: "1px solid var(--ct-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "9px 11px", background: "var(--ct-card)", borderBottom: "1px solid var(--ct-border)", fontSize: 12 }}>
          <strong>{selected?.current_step || "대기 중"}</strong>
          <div style={{ marginTop: 4, color: "var(--ct-text2)", fontSize: 11 }}>{frameSource(frame)} · {frame?.current_url || selected?.target_url || "작업 없음"}</div>
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {events.map((event) => (
            <div key={event.id} style={{ display: "grid", gridTemplateColumns: "62px minmax(0,1fr)", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--ct-border)", fontSize: 11 }}>
              <span style={{ color: "var(--ct-text2)" }}>{time(event.created_at)}</span>
              <span style={{ overflowWrap: "anywhere" }}>{eventText(event)}</span>
            </div>
          ))}
          {events.length === 0 && <div style={{ padding: 14, textAlign: "center", color: "var(--ct-text2)", fontSize: 11 }}>아직 단계 기록이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
