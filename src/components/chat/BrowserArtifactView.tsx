"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiveBrowserStage, { type LiveBrowserConnection, type LiveBrowserLane } from "@/components/browser/LiveBrowserStage";
import { api } from "@/lib/api";

type BrowserTask = {
  id: string;
  session_id?: string | null;
  work_key: string;
  target_url: string;
  status: string;
  current_step?: string;
  updated_at?: string;
  egress_policy?: "direct" | "cafe24" | "auto";
  egress_effective?: string;
  egress_reason?: string;
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

type ArtifactStatus = {
  current_url?: string;
  execution_actor?: "Browser" | "Windows PC" | "Human" | "대기";
  current_step?: string;
  progress_percent?: number | null;
  learning_state?: "learned" | "reused" | "rediscover" | "approval_required" | "idle";
  freshness_status?: "CURRENT" | "STALE" | "CONFLICT" | "UNAVAILABLE" | "NOT_APPLICABLE";
  evidence_count?: number;
  approval_required?: boolean;
  last_error?: string;
  retry_action?: Record<string, unknown> | null;
  can_retry?: boolean;
};

type Props = { sessionId?: string };

type LiveAgent = {
  agent_id: string;
  agent_name?: string;
  hostname?: string;
  status?: string;
  is_online?: boolean;
};

const COUPANGEATS_URL = "https://store.coupangeats.com/merchant/login";
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
  const [artifactStatus, setArtifactStatus] = useState<ArtifactStatus | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [egressPolicy, setEgressPolicy] = useState<"direct" | "cafe24" | "auto">("auto");
  const restoredSession = useRef<string | undefined>(undefined);
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lane, setLane] = useState<LiveBrowserLane>("server");
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [liveConnection, setLiveConnection] = useState<LiveBrowserConnection>("idle");
  const recordingRef = useRef<Promise<string> | null>(null);
  const [recording, setRecording] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [registrationId, setRegistrationId] = useState("");
  const stepQueueRef = useRef<Promise<void>>(Promise.resolve());

  const visibleTasks = useMemo(() => {
    return sessionId ? tasks.filter((task) => task.session_id === sessionId) : tasks;
  }, [sessionId, tasks]);

  const selected = visibleTasks.find((task) => task.id === selectedId) || visibleTasks[0] || null;

  const selectedTaskRef = useRef(selected?.id);
  selectedTaskRef.current = selected?.id;

  const loadTasks = useCallback(async () => {
    try {
      const response = await api.getBrowserTasks({ limit: 50, session_id: sessionId }) as { tasks?: BrowserTask[] };
      if (currentSession.current !== sessionId) return;
      setTasks(Array.isArray(response.tasks) ? response.tasks : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [sessionId]);

  const loadLive = useCallback(async (capture = false) => {
    if (!selected?.id) {
      setFrame(null);
      setEvents([]);
      setArtifactStatus(null);
      return;
    }
    try {
      const response = await api.getBrowserTaskLiveFrame(selected.id, {
        event_limit: 20,
        capture,
      }) as { frame?: LiveFrame | null; events?: BrowserEvent[]; artifact_status?: ArtifactStatus | null };
      if (selectedTaskRef.current !== selected.id) return;
      setFrame(response.frame || null);
      setEvents(Array.isArray(response.events) ? response.events : []);
      setArtifactStatus(response.artifact_status || null);
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
    let cancelled = false;
    const refresh = () => { void api.getPCAgents().then((response) => {
      if (cancelled) return;
      const items = (Array.isArray(response) ? response : response?.agents || []) as LiveAgent[];
      const online = items.filter((agent) => agent.is_online === true || agent.status === "online");
      setAgents(online);
      setSelectedAgentId((current) => online.some((agent) => agent.agent_id === current) ? current : online[0]?.agent_id || "");
    }).catch(() => { if (!cancelled) setAgents([]); }); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (!sessionId || restoredSession.current === sessionId || !visibleTasks.length || typeof window === "undefined") return;
    restoredSession.current = sessionId;
    const restored = window.localStorage.getItem(`smart-browser-task:${sessionId}`);
    if (restored && visibleTasks.some((task) => task.id === restored)) setSelectedId(restored);
  }, [sessionId, visibleTasks]);

  useEffect(() => {
    if (!sessionId || !selectedId || typeof window === "undefined") return;
    window.localStorage.setItem(`smart-browser-task:${sessionId}`, selectedId);
  }, [selectedId, sessionId]);

  useEffect(() => {
    void loadLive(false);
    const shouldPoll = liveConnection !== "live";
    const timer = shouldPoll ? window.setInterval(() => void loadLive(false), 3000) : undefined;
    const onVisible = () => { if (document.visibilityState === "visible") void loadLive(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveConnection, loadLive, selected?.id]);

  useEffect(() => { recordingRef.current = null; setRecording(false); setStepCount(0); setRegistrationId(""); }, [sessionId, selected?.id, lane]);

  const startRecording = async () => {
    if (!selected || lane !== "server") return;
    const domain = new URL(frame?.current_url || selected.target_url).hostname;
    const request = api.startOhvisRecipeRecording({ name: `${domain} 채팅 브라우저 조작`, domain }).then((result) => result.recording_id);
    recordingRef.current = request;
    try {
      const id = await request;
      const saved = await api.recordOhvisRecipeStep(id, { action: "navigate", url: frame?.current_url || selected.target_url, risk: "READ", description: "학습 시작 페이지" });
      setRecording(true); setStepCount(saved.step_count); setRegistrationId("");
    }
    catch (reason) { recordingRef.current = null; setError(String(reason)); }
  };

  const recordRecipeStep = useCallback((step: Record<string, unknown>) => {
    const active = recordingRef.current;
    if (!active) return;
    stepQueueRef.current = stepQueueRef.current.then(async () => {
      const saved = await api.recordOhvisRecipeStep(await active, step);
      if (recordingRef.current === active) setStepCount(saved.step_count);
    }).catch((reason) => setError(`레시피 단계 기록 실패: ${String(reason)}`));
    return stepQueueRef.current;
  }, []);

  const finishRecording = async () => {
    const active = recordingRef.current;
    if (!active) return;
    setBusy(true);
    try {
      await stepQueueRef.current;
      const result = await api.finishOhvisRecipeRecording(await active);
      setRegistrationId(String(result.registration.registration_id || result.registration.id || ""));
      recordingRef.current = null;
      setRecording(false);
    } catch (reason) { setError(`등록 요청 실패: ${String(reason)}`); }
    finally { setBusy(false); }
  };

  const retryTask = async () => {
    if (!selected?.id || !artifactStatus?.can_retry) return;
    setBusy(true);
    try {
      await api.retryBrowserTask(selected.id);
      await Promise.all([loadTasks(), loadLive(false)]);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (presetUrl?: string) => {
    const url = (presetUrl || targetUrl).trim();
    if (!url) return;
    setBusy(true);
    try {
      const response = await api.createBrowserTask({
        work_key: sessionId ? `chat-${sessionId.slice(0, 12)}` : "aads-ceo-browser",
        target_url: url,
        session_id: sessionId || undefined,
        current_step: presetUrl === COUPANGEATS_URL ? "쿠팡이츠 로그인 화면 열기" : "서버 Playwright 실행 준비",
        egress_policy: egressPolicy,
      }) as { task?: BrowserTask };
      if (!response.task?.id || response.task.status === "creation_failed") throw new Error("브라우저 작업을 저장하지 못했습니다.");
      if (currentSession.current !== sessionId) return;
      const created = response.task;
      setTasks((previous) => [created, ...previous.filter((task) => task.id !== created.id)]);
      setLane("server");
      setSelectedId(created.id);
      restoredSession.current = sessionId;
      if (sessionId) window.localStorage.setItem(`smart-browser-task:${sessionId}`, response.task.id);
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <button type="button" disabled={busy} onClick={() => void createTask(COUPANGEATS_URL)} style={{ minHeight: 44, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--ct-accent)", background: "var(--ct-card)", color: "var(--ct-text)" }}>쿠팡이츠 열기</button>
          <select aria-label="서버 접속 경로" value={egressPolicy} onChange={(event) => setEgressPolicy(event.target.value as "direct" | "cafe24" | "auto")} style={{ minHeight: 44, flex: "1 1 160px", background: "var(--ct-input)", color: "var(--ct-text)", border: "1px solid var(--ct-border)", borderRadius: 8 }}>
            <option value="auto">자동 · 쿠팡이츠는 한국 경유</option>
            <option value="direct">기본 연결</option>
            <option value="cafe24">한국 · Cafe24</option>
          </select>
          <span style={{ width: "100%", fontSize: 11, color: "var(--ct-text2)" }}>접속 경로는 새로 여는 서버 작업에 적용됩니다. PC 화면은 PC의 네트워크를 사용합니다.</span>
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
          <button disabled={busy || !targetUrl.trim()} onClick={() => void createTask()} style={{ minHeight: 44, border: 0, borderRadius: 7, padding: "8px 10px", background: "var(--ct-accent)", color: "#fff", cursor: busy ? "wait" : "pointer", opacity: busy || !targetUrl.trim() ? 0.55 : 1 }}>
            열기
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: "var(--ct-text2)" }}>
          서버 Playwright를 먼저 사용합니다. 인증서·로컬 앱처럼 PC 환경이 꼭 필요할 때만 Windows 오비스로 전환하고, 전환 이유를 단계 기록에 표시합니다.
        </div>
      </div>

      {error && <div role="alert" style={{ padding: 9, borderRadius: 8, background: "rgba(239,68,68,.12)", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {selected && (
        <section aria-label="스마트 브라우저 실행 상태" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
          {[
            ["접속 경로", lane === "pc" ? "PC 네트워크" : selected.egress_effective === "cafe24" ? (liveConnection === "live" ? "한국 · Cafe24 연결됨" : "한국 · Cafe24 연결 대기") : selected.egress_effective === "unavailable" ? "한국 경유 사용 불가" : "기본 연결"],
            ["실행 주체", artifactStatus?.execution_actor || frameSource(frame)],
            ["학습 상태", ({ learned: "처음 학습", reused: "검증된 흐름 재사용", rediscover: "구조 다시 찾는 중", approval_required: "승인 필요", idle: "학습 대기" } as Record<string, string>)[artifactStatus?.learning_state || "idle"]],
            ["사실 최신성", ({ CURRENT: "최신 확인", STALE: "기한 만료", CONFLICT: "값 불일치", UNAVAILABLE: "재확인 실패", NOT_APPLICABLE: "변동 사실 없음" } as Record<string, string>)[artifactStatus?.freshness_status || "NOT_APPLICABLE"]],
            ["근거", `${artifactStatus?.evidence_count || 0}건`],
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 0, border: "1px solid var(--ct-border)", borderRadius: 8, padding: "9px 10px", background: "var(--ct-card)" }}>
              <div style={{ color: "var(--ct-text2)", fontSize: 10 }}>{label}</div>
              <strong style={{ display: "block", marginTop: 3, fontSize: 12, overflowWrap: "anywhere" }}>{value}</strong>
            </div>
          ))}
        </section>
      )}

      {artifactStatus?.approval_required && (
        <div role="status" style={{ padding: 10, borderRadius: 8, background: "rgba(245,158,11,.13)", color: "#d97706", fontSize: 12 }}>
          사용자 승인 또는 로그인이 필요합니다. 승인 화면에서 처리하면 현재 단계부터 이어집니다.
        </div>
      )}

      {artifactStatus?.last_error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.12)", color: "#ef4444", fontSize: 12 }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{artifactStatus.last_error}</span>
          {artifactStatus.can_retry && (
            <button onClick={() => void retryTask()} disabled={busy} style={{ minHeight: 44, minWidth: 72, border: 0, borderRadius: 8, background: "#ef4444", color: "#fff", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
              다시 시도
            </button>
          )}
        </div>
      )}

      {visibleTasks.length > 0 && (
        <select value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} style={{ width: "100%", minHeight: 44, border: "1px solid var(--ct-border)", borderRadius: 7, padding: 8, background: "var(--ct-input)", color: "var(--ct-text)", fontSize: 12 }}>
          {visibleTasks.map((task) => <option key={task.id} value={task.id}>{task.status} · {task.current_step || task.target_url}</option>)}
        </select>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }} aria-label="브라우저 실행 위치">
        {(["server", "pc"] as LiveBrowserLane[]).map((value) => (
          <button aria-pressed={lane === value} key={value} type="button" onClick={() => setLane(value)} disabled={value === "pc" && agents.length === 0} style={{ minHeight: 44, border: `1px solid ${lane === value ? "var(--ct-accent)" : "var(--ct-border)"}`, borderRadius: 8, padding: "0 12px", background: lane === value ? "rgba(37,99,235,.16)" : "var(--ct-card)", color: "var(--ct-text)", opacity: value === "pc" && agents.length === 0 ? 0.5 : 1 }}>
            {value === "server" ? "서버 Playwright" : "PC Agent"}
          </button>
        ))}
        {lane === "pc" && (
          <select aria-label="PC Agent 선택" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} style={{ minHeight: 44, flex: "1 1 160px", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "0 9px", background: "var(--ct-input)", color: "var(--ct-text)" }}>
            {agents.length === 0 && <option value="">온라인 PC 없음</option>}
            {agents.map((agent) => <option key={agent.agent_id} value={agent.agent_id}>{agent.agent_name || agent.hostname || agent.agent_id}</option>)}
          </select>
        )}
      </div>

      <LiveBrowserStage
        key={`${sessionId}:${lane}:${selected?.id}:${selectedAgentId}`}
        lane={lane}
        taskId={selected?.id}
        agentId={selectedAgentId}
        interactive={Boolean((lane === "server" && selected?.id) || (lane === "pc" && selectedAgentId))}
        fallbackSrc={lane === "server" ? imageSrc : ""}
        emptyMessage="브라우저 작업을 시작하면 현재 화면이 여기에 표시됩니다."
        onConnectionChange={setLiveConnection}
        onControlError={(message) => setError(`브라우저 조작 실패: ${message}`)}
        onRecipeStep={recordRecipeStep}
      />

      {lane === "server" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!recording ? <button type="button" disabled={liveConnection !== "live"} onClick={() => void startRecording()} style={{ minHeight: 44 }}>학습 시작</button>
          : <button type="button" disabled={busy || stepCount === 0} onClick={() => void finishRecording()} style={{ minHeight: 44 }}>학습 종료 · 등록 요청 ({stepCount}단계)</button>}
        {registrationId && <span role="status">레시피 등록 요청을 저장했습니다. 승인 대기 상태입니다.</span>}
      </div>}
      {lane === "pc" && <p style={{ fontSize: 11, color: "var(--ct-text2)" }}>연결된 PC의 화면을 조작합니다. 레시피 등록은 브라우저 요소 검증이 가능한 서버 화면에서 진행하세요.</p>}

      {liveConnection === "failed" && lane === "server" && (
        <button onClick={() => void loadLive(true)} disabled={!selected || busy} style={{ alignSelf: "flex-end", minHeight: 44, border: "1px solid var(--ct-border)", borderRadius: 8, padding: "7px 10px", background: "var(--ct-card)", color: "var(--ct-text)", fontSize: 11, cursor: selected ? "pointer" : "not-allowed" }}>
          스크린샷 새로고침
        </button>
      )}

      <div style={{ border: "1px solid var(--ct-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "9px 11px", background: "var(--ct-card)", borderBottom: "1px solid var(--ct-border)", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ flex: 1 }}>{artifactStatus?.current_step || selected?.current_step || "대기 중"}</strong>
            {typeof artifactStatus?.progress_percent === "number" && <span aria-label={`진행률 ${artifactStatus.progress_percent}%`}>{artifactStatus.progress_percent}%</span>}
          </div>
          <div style={{ marginTop: 4, color: "var(--ct-text2)", fontSize: 11 }}>{artifactStatus?.execution_actor || frameSource(frame)} · {artifactStatus?.current_url || frame?.current_url || selected?.target_url || "작업 없음"}</div>
          {typeof artifactStatus?.progress_percent === "number" && (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={artifactStatus.progress_percent} style={{ height: 5, marginTop: 8, overflow: "hidden", borderRadius: 999, background: "var(--ct-border)" }}>
              <div style={{ width: `${artifactStatus.progress_percent}%`, height: "100%", background: "var(--ct-accent)" }} />
            </div>
          )}
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
