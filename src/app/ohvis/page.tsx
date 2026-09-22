"use client";

/**
 * 오비스 창 — 지시·실행·보고 콘솔 (AADS-OHVIS-CONSOLE-ROUTE-20260917)
 *
 * 레이아웃 정본은 `aads-server/app/static/reports/20260917_ohvis_console.html` 이다.
 * 색·간격·구조를 그대로 옮기되 **목업의 데모 데이터는 한 줄도 옮기지 않았다** —
 * 화면에 뜨는 값은 전부 `GET /api/v1/ohvis/console/summary` 가 돌려준 실데이터고,
 * 데이터가 없으면 목업과 같은 빈 상태 문구를 보여준다.
 *
 * 인증·fetch·폴링은 `src/app/browser-tasks/page.tsx` 의 패턴을 따른다(그 파일은
 * 읽기만 했다). 폴링은 진행 중 run 이 있을 때 3초, 없으면 15초다 — 아무 일도
 * 없는 화면이 종일 3초마다 DB 를 긁을 이유가 없다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LiveBrowserStage, { type LiveBrowserConnection } from "@/components/browser/LiveBrowserStage";
import {
  api,
  type OhvisConsoleApproval,
  type OhvisConsoleFrame,
  type OhvisConsoleLoop,
  type OhvisConsoleMessage,
  type OhvisConsoleReport,
  type OhvisConsoleStep,
  type OhvisConsoleSummary,
} from "@/lib/api";

const POLL_LIVE_MS = 3000;
const POLL_IDLE_MS = 15000;

// 목업 팔레트. 하드코딩이 아니라 CEO 승인 디자인의 값이다.
const C = {
  bg: "#0f1117",
  nav: "#1a1d27",
  pane: "#151722",
  card: "#1e2130",
  border: "#2d3148",
  borderSoft: "#3d4468",
  text: "#e2e8f0",
  muted: "#7c8db5",
  dim: "#4b5563",
  accent: "#3b82f6",
  ok: "#10b981",
  warn: "#f59e0b",
  blk: "#ef4444",
  inf: "#60a5fa",
  indigo: "#6366f1",
} as const;

const MONO = "'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";

const EMPTY_SCREEN = "오비스가 보는 화면이 여기 그대로 표시됩니다";
const EMPTY_APPROVALS = "대기 중인 승인이 없습니다.";
const EMPTY_REPORTS = "아직 보고가 없습니다.";
const EMPTY_CHAT = "대기 중입니다. 아래 예시를 누르거나 한 줄로 지시해 주십시오.";
const EMPTY_SCHEDULES = "등록된 자동실행이 없습니다.";
const EMPTY_TIMELINE = "실행 기록이 없습니다.";

type MobileTab = "chat" | "live" | "right";
type LiveLane = "server" | "pc";

interface LiveAgent {
  agent_id: string;
  agent_name?: string;
  hostname?: string;
  status?: string;
  is_online?: boolean;
  capabilities?: string[];
}

/**
 * `?session_id=` 만 읽는다. 없으면 **서버가** 이 테넌트의 실재하는 채팅 세션을
 * 골라 `conversation.session_id` 로 내려준다.
 *
 * 화면에서 UUID 를 만들어 쓰면 안 된다 — `ohvis_tasks.session_id` 에는
 * `chat_sessions(id)` 외래키가 걸려 있어서 지어낸 id 로 지시를 보내면
 * FK 위반으로 실패한다.
 */
function requestedSessionId(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("session_id") || "";
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return isMobile;
}

function clockTime(value?: string | null): string {
  if (!value) return "--:--:--";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  } catch {
    return "--:--:--";
  }
}

function shortTime(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function intervalLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "주기 미설정";
  if (seconds % 86400 === 0) return `${seconds / 86400}일마다`;
  if (seconds % 3600 === 0) return `${seconds / 3600}시간마다`;
  if (seconds % 60 === 0) return `${seconds / 60}분마다`;
  return `${seconds}초마다`;
}

function stepToneColor(status: string): string {
  if (status === "success") return C.ok;
  if (status === "blocked") return C.blk;
  if (status === "failed") return C.warn;
  return "#a0aec0";
}

function runStatusLabel(status: string | undefined, isLive: boolean): string {
  if (isLive) return "실행 중";
  const labels: Record<string, string> = {
    success: "완료",
    failed: "실패",
    blocked: "차단(승인 대기)",
    cancelled: "취소",
    running: "실행 중",
  };
  return labels[status || ""] || "대기";
}

function loopTag(loop: OhvisConsoleLoop): { text: string; bg: string; color: string } {
  if (loop.enabled) return { text: "가동", bg: "#064e3b", color: "#6ee7b7" };
  if (loop.failed) return { text: "실패", bg: "#4c0519", color: "#fca5a5" };
  return { text: "중지", bg: "#3f3f46", color: "#d4d4d8" };
}

function paneHeadStyle(): React.CSSProperties {
  return {
    padding: "9px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: ".7px",
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };
}

function cardStyle(pending = false): React.CSSProperties {
  return {
    margin: "8px 10px",
    background: pending ? "#1c1008" : C.card,
    border: `1px solid ${pending ? "#92400e" : C.border}`,
    borderRadius: 8,
    padding: "9px 11px",
  };
}

export default function OhvisConsolePage() {
  const [summary, setSummary] = useState<OhvisConsoleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const [frameSrc, setFrameSrc] = useState("");
  const [modalApproval, setModalApproval] = useState<OhvisConsoleApproval | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("live");
  const [liveLane, setLiveLane] = useState<LiveLane>("server");
  const [streamStatus, setStreamStatus] = useState("대기");
  const [recordingId, setRecordingId] = useState("");
  const [recordedSteps, setRecordedSteps] = useState(0);
  const [registrationId, setRegistrationId] = useState("");
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const recordingIdRef = useRef("");

  useEffect(() => setSessionId(requestedSessionId()), []);
  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getPCAgents();
        if (cancelled) return;
        const items = (Array.isArray(data) ? data : data?.agents || []) as LiveAgent[];
        const online = items.filter((item) => item.is_online === true || item.status === "online");
        setAgents(online);
        setSelectedAgentId((current) => current || online[0]?.agent_id || "");
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isLive = Boolean(summary?.live.is_live);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getOhvisConsoleSummary({
        session_id: sessionId || undefined,
        limit: 30,
      });
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };
    tick();
    const id = setInterval(tick, isLive ? POLL_LIVE_MS : POLL_IDLE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh, isLive]);

  // 중앙 화면 이미지. summary 는 프레임 메타만 싣는다(base64 는 최대 2.5MB라
  // 3초 폴링에 얹을 수 없다) — 실제 그림은 기존 browser-tasks 라이브프레임
  // 엔드포인트에서 받는다.
  const frame: OhvisConsoleFrame | null = summary?.live.frame ?? null;
  const frameKey = frame ? `${frame.task_id}:${frame.captured_at ?? ""}` : "";
  useEffect(() => {
    if (liveLane !== "server") return;
    if (!frame) {
      setFrameSrc("");
      return;
    }
    if (frame.frame_url) {
      setFrameSrc(frame.frame_url);
      return;
    }
    if (!frame.has_image) {
      setFrameSrc("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await api.getBrowserTaskLiveFrame(frame.task_id, {
          event_limit: 0,
          capture: false,
        })) as { frame?: { frame_base64?: string; media_type?: string } | null };
        if (cancelled) return;
        const base64 = res.frame?.frame_base64 || "";
        if (!base64) {
          setFrameSrc("");
          return;
        }
        setFrameSrc(
          base64.startsWith("data:")
            ? base64
            : `data:${res.frame?.media_type || frame.media_type || "image/jpeg"};base64,${base64}`,
        );
      } catch {
        if (!cancelled) setFrameSrc("");
      }
    })();
    return () => {
      cancelled = true;
    };
    // frameKey 가 바뀔 때만 다시 받는다 — 같은 프레임을 3초마다 재다운로드하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, liveLane]);

  const messages: OhvisConsoleMessage[] = summary?.conversation.messages ?? [];
  const timeline: OhvisConsoleStep[] = useMemo(
    () => summary?.live.timeline ?? [],
    [summary?.live.timeline],
  );
  const approvals: OhvisConsoleApproval[] = summary?.approvals.items ?? [];
  const loops: OhvisConsoleLoop[] = summary?.schedules.items ?? [];
  const reports: OhvisConsoleReport[] = summary?.reports.items ?? [];
  const quick: string[] = summary?.conversation.quick_commands ?? [];
  const kpis = summary?.live.kpis ?? { llm_calls: 0, steps: 0, approvals: 0, blocked: 0 };
  const run = summary?.live.run ?? null;
  // 서버가 확인해 준 실재 세션. 이것이 없으면 지시를 넣을 곳이 없다.
  const activeSessionId = summary?.conversation.session_id ?? "";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length]);

  const address = useMemo(() => {
    const stepUrl = [...timeline].reverse().find((step) => step.url)?.url;
    return frame?.current_url || stepUrl || "about:blank";
  }, [frame, timeline]);

  const handleStreamConnection = (status: LiveBrowserConnection) => {
    const laneLabel = liveLane === "server" ? "서버 브라우저" : "PC 화면";
    setStreamStatus(status === "live" ? `${laneLabel} 실시간` : status === "connecting" ? `${laneLabel} 연결 중` : status === "failed" ? `${laneLabel} 연결 오류` : "대기");
  };

  const recordRecipeStep = async (step: Record<string, unknown>) => {
    const activeRecording = recordingIdRef.current;
    if (!activeRecording) return;
    try {
      const saved = await api.recordOhvisRecipeStep(activeRecording, step);
      setRecordedSteps(saved.step_count || 0);
    } catch (reason) {
      setError(`레시피 단계 기록 실패: ${String(reason)}`);
    }
  };

  const startRecipeRecording = async () => {
    if (recordingBusy || recordingId) return;
    setRecordingBusy(true);
    setError(null);
    try {
      const parsed = new URL(address);
      const started = await api.startOhvisRecipeRecording({
        name: `${parsed.hostname} 사용자 보조 경로`,
        domain: parsed.hostname,
      });
      setRecordingId(started.recording_id);
      recordingIdRef.current = started.recording_id;
      const first = await api.recordOhvisRecipeStep(started.recording_id, {
        action: "navigate",
        url: address,
        risk: "READ",
        description: "사용자 보조 시작 페이지",
      });
      setRecordedSteps(first.step_count || 1);
      setRegistrationId("");
    } catch (reason) {
      setError(`레시피 학습 시작 실패: ${String(reason)}`);
    } finally {
      setRecordingBusy(false);
    }
  };

  const finishRecipeRecording = async () => {
    if (recordingBusy || !recordingId) return;
    setRecordingBusy(true);
    setError(null);
    try {
      const result = await api.finishOhvisRecipeRecording(recordingId);
      const id = String(result.registration?.id || result.registration?.registration_id || "");
      setRegistrationId(id);
      setRecordingId("");
      recordingIdRef.current = "";
      setStreamStatus(id ? "레시피 승인 대기" : "레시피 기록 완료");
    } catch (reason) {
      setError(`레시피 승인 요청 실패: ${String(reason)}`);
    } finally {
      setRecordingBusy(false);
    }
  };

  const approveRecipeRegistration = async () => {
    if (recordingBusy || !registrationId) return;
    setRecordingBusy(true);
    setError(null);
    try {
      await api.decideOhvisRecipeRegistration(registrationId, "approve", "대표님 화면 조작 경로 확인 후 승인");
      setStreamStatus("레시피 v1 승인 완료");
      setRegistrationId("");
    } catch (reason) {
      setError(`레시피 승인 실패: ${String(reason)}`);
    } finally {
      setRecordingBusy(false);
    }
  };

  const sendCommand = async (text: string) => {
    const title = text.trim();
    if (!title || sending) return;
    if (!activeSessionId) {
      // 조용히 return 하면 버튼이 고장 난 것과 구분되지 않는다.
      setError("붙을 채팅 세션이 없습니다. 채팅에서 대화를 하나 연 뒤 다시 보내주세요.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      // 실행까지 거는 경로는 이것 하나다. POST /ohvis/tasks 는 기록만 하고
      // 끝나서 지시가 pending 으로 굳었다 (2026-09-18).
      await api.runOhvisConsoleCommand({ session_id: activeSessionId, title });
      setCommand("");
      await refresh();
    } catch (e) {
      // 서버가 준 detail 을 그대로 보여준다 — no_chat_session /
      // ai_reaction_dispatch_failed 를 화면에서 구분할 수 있어야 한다.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const openApproval = (approval: OhvisConsoleApproval) => {
    setModalApproval(approval);
    setConfirmInput("");
    setDecideError(null);
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!modalApproval || deciding) return;
    setDeciding(true);
    setDecideError(null);
    try {
      await api.decideOhvisConsoleApproval(modalApproval.id, {
        decision,
        confirm_text: confirmInput,
        reason: decision === "reject" ? "대표님 거부" : "",
      });
      setModalApproval(null);
      setConfirmInput("");
      await refresh();
    } catch (e) {
      setDecideError(String(e));
    } finally {
      setDeciding(false);
    }
  };

  const confirmReady =
    !modalApproval?.requires_confirmation ||
    (confirmInput.trim().length > 0 && confirmInput.trim() === modalApproval.confirm_text.trim());

  const showChat = !isMobile || mobileTab === "chat";
  const showLive = !isMobile || mobileTab === "live";
  const showRight = !isMobile || mobileTab === "right";

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* 상단: 네비 + 실행상태 뱃지 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "10px 16px",
          background: C.nav,
          borderBottom: `1px solid ${C.border}`,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>🤖 오비스 창</span>
        <Link href="/browser-tasks" style={{ color: C.muted, textDecoration: "none", fontSize: 13, padding: "4px 10px", borderRadius: 5 }}>
          🌐 브라우저 실행
        </Link>
        <Link href="/chat" style={{ color: C.muted, textDecoration: "none", fontSize: 13, padding: "4px 10px", borderRadius: 5 }}>
          💬 AI Chat
        </Link>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 10,
            border: `1px solid ${isLive ? "#166534" : C.border}`,
            background: isLive ? "#052e1b" : C.card,
            color: isLive ? "#6ee7b7" : C.muted,
          }}
        >
          {loading && !summary ? "불러오는 중…" : `실행상태 · ${runStatusLabel(run?.status, isLive)}`}
        </span>
      </div>

      {error && (
        <div style={{ padding: "7px 16px", fontSize: 12, background: "#2a0d0d", color: "#fca5a5", borderBottom: `1px solid ${C.border}` }}>
          {error}
        </div>
      )}

      {isMobile && (
        <div style={{ display: "flex", gap: 6, padding: "7px 10px", borderBottom: `1px solid ${C.border}`, background: C.pane }}>
          {([["chat", "오비스 대화"], ["live", "라이브"], ["right", "스케줄·승인·보고"]] as Array<[MobileTab, string]>).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                style={{
                  flex: 1,
                  background: mobileTab === key ? C.accent : C.card,
                  color: mobileTab === key ? "#fff" : "#a0aec0",
                  border: `1px solid ${mobileTab === key ? C.accent : C.borderSoft}`,
                  borderRadius: 7,
                  fontSize: 12,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* 좌: 오비스 대화 */}
        {showChat && (
          <aside
            style={{
              width: isMobile ? "100%" : 330,
              flexShrink: 0,
              background: C.pane,
              borderRight: isMobile ? "none" : `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={paneHeadStyle()}>
              오비스 대화
              <small style={{ fontSize: 10, color: C.dim, textTransform: "none", letterSpacing: 0 }}>지시 → 판단 → 실행 → 보고</small>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              {messages.length === 0 && (
                <div style={{ alignSelf: "flex-start", maxWidth: "94%", padding: "9px 12px", borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.55 }}>
                  <span style={{ display: "block", fontSize: 10, color: C.muted, marginBottom: 3 }}>오비스</span>
                  {EMPTY_CHAT}
                </div>
              )}
              {messages.map((message) => (
                <div key={message.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      alignSelf: "flex-end",
                      maxWidth: "94%",
                      padding: "9px 12px",
                      borderRadius: 10,
                      borderBottomRightRadius: 3,
                      background: "#1e40af",
                      color: "#e0ecff",
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <span style={{ display: "block", fontSize: 10, color: "#bfdbfe", marginBottom: 3 }}>
                      대표님 · {clockTime(message.created_at)}
                    </span>
                    {message.title}
                  </div>
                  {(message.judgement || message.result_summary || message.status) && (
                    <div
                      style={{
                        alignSelf: "flex-start",
                        maxWidth: "94%",
                        padding: "9px 12px",
                        borderRadius: 10,
                        borderBottomLeftRadius: 3,
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${message.status === "error" ? C.blk : message.status === "done" ? C.ok : C.indigo}`,
                        fontSize: 13,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 10, color: C.muted, marginBottom: 3 }}>
                        오비스 · {message.status}
                      </span>
                      {message.judgement || message.result_summary || `단계 ${message.step_count}개`}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {quick.length > 0 && (
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                {quick.map((text) => (
                  <button
                    key={text}
                    onClick={() => sendCommand(text)}
                    disabled={sending || !activeSessionId}
                    title={text}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.borderSoft}`,
                      color: "#a0aec0",
                      textAlign: "left",
                      fontSize: 12,
                      padding: "7px 10px",
                      borderRadius: 7,
                      cursor: sending ? "not-allowed" : "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: `1px solid ${C.border}` }}>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendCommand(command);
                }}
                placeholder={activeSessionId ? "오비스에게 지시…" : "연결된 대화 세션이 없습니다"}
                autoComplete="off"
                disabled={!activeSessionId}
                style={{
                  flex: 1,
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 7,
                  padding: "8px 11px",
                  color: C.text,
                  fontSize: 13,
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => sendCommand(command)}
                disabled={sending || !command.trim() || !activeSessionId}
                style={{
                  background: C.accent,
                  border: "none",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: 7,
                  fontSize: 13,
                  cursor: sending ? "not-allowed" : "pointer",
                  opacity: sending || !command.trim() || !activeSessionId ? 0.5 : 1,
                }}
              >
                {sending ? "전송 중" : "보내기"}
              </button>
            </div>
          </aside>
        )}

        {/* 중앙: 라이브 화면 */}
        {showLive && (
          <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>
            <div
              style={{
                background: C.card,
                borderBottom: `1px solid ${C.border}`,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: isLive ? C.blk : "#374151",
                  animation: isLive ? "ohvisBlink 1.1s infinite" : undefined,
                  flexShrink: 0,
                }}
              />
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} aria-label="브라우저 실행 위치">
                {(["server", "pc"] as LiveLane[]).map((lane) => (
                  <button
                    key={lane}
                    type="button"
                    onClick={() => setLiveLane(lane)}
                    style={{
                      minHeight: 34,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: `1px solid ${liveLane === lane ? C.accent : C.borderSoft}`,
                      background: liveLane === lane ? "#1e3a8a" : C.bg,
                      color: liveLane === lane ? "#dbeafe" : C.muted,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {lane === "server" ? "서버 브라우저" : "PC 브라우저"}
                  </button>
                ))}
              </div>
              {liveLane === "pc" && (
                <select
                  aria-label="PC Agent 선택"
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  style={{ minHeight: 34, maxWidth: 180, background: C.bg, color: C.text, border: `1px solid ${C.borderSoft}`, borderRadius: 6 }}
                >
                  {agents.length === 0 && <option value="">온라인 PC 없음</option>}
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>{agent.agent_name || agent.hostname || agent.agent_id}</option>
                  ))}
                </select>
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 120,
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  color: "#a0aec0",
                  fontFamily: MONO,
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {address}
              </span>
              <span style={{ color: streamStatus.includes("오류") ? C.blk : C.ok, fontSize: 11, whiteSpace: "nowrap" }}>{streamStatus}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {([["LLM", kpis.llm_calls], ["단계", kpis.steps], ["승인", kpis.approvals], ["차단", kpis.blocked]] as Array<[string, number]>).map(
                  ([label, value]) => (
                    <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: C.muted }}>
                      {label} <b style={{ color: C.text }}>{value}</b>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div style={{ flex: 1, background: "#0f172a", color: "#e2e8f0", overflow: "auto", minHeight: 0, padding: 10 }}>
              <LiveBrowserStage
                lane={liveLane}
                taskId={frame?.task_id}
                agentId={selectedAgentId}
                interactive
                fallbackSrc={liveLane === "server" ? frameSrc : ""}
                emptyMessage={EMPTY_SCREEN}
                onConnectionChange={handleStreamConnection}
                onControlError={(message) => setError(`브라우저 조작 실패: ${message}`)}
                onRecipeStep={recordRecipeStep}
              />
            </div>

            <div style={{ padding: "8px 10px", background: C.card, borderTop: `1px solid ${C.border}`, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              {liveLane === "server" ? (
                <>
                  {!recordingId ? (
                    <button type="button" onClick={startRecipeRecording} disabled={recordingBusy || address === "about:blank"} style={{ minHeight: 36, border: `1px solid ${C.ok}`, borderRadius: 6, padding: "0 10px", background: "#052e1b", color: "#6ee7b7", fontWeight: 700 }}>학습 시작</button>
                  ) : (
                    <button type="button" onClick={finishRecipeRecording} disabled={recordingBusy} style={{ minHeight: 36, border: `1px solid ${C.warn}`, borderRadius: 6, padding: "0 10px", background: "#3b2000", color: "#fbbf24", fontWeight: 700 }}>기록 종료 · {recordedSteps}단계</button>
                  )}
                  {registrationId && (
                    <button type="button" onClick={approveRecipeRegistration} disabled={recordingBusy} style={{ minHeight: 36, border: 0, borderRadius: 6, padding: "0 12px", background: C.ok, color: "#052e1b", fontWeight: 800 }}>레시피 v1 승인</button>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 11, color: C.muted }}>PC Agent 화면에서 클릭·텍스트 입력·Enter 조작을 보낼 수 있습니다.</span>
              )}
            </div>

            <div style={{ height: 168, background: "#0a0d14", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ padding: "5px 13px", background: "#111420", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.muted, display: "flex", gap: 10, alignItems: "center" }}>
                실행 단계 · 감사 기록(append-only)
                <span style={{ marginLeft: "auto", color: C.dim }}>
                  {run ? `${run.recipe_name || "run"} · ${run.id.slice(0, 8)}` : "run 없음"}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "7px 13px", fontFamily: MONO, fontSize: 12, lineHeight: 1.65, minHeight: 0 }}>
                {timeline.length === 0 && <div style={{ color: C.dim }}>{EMPTY_TIMELINE}</div>}
                {timeline.map((step) => (
                  <div key={`${step.seq}-${step.created_at}`} style={{ display: "flex", gap: 9 }}>
                    <span style={{ color: C.dim, whiteSpace: "nowrap" }}>{clockTime(step.created_at)}</span>
                    <span style={{ color: C.indigo, minWidth: 72 }}>{step.action}</span>
                    <span style={{ color: stepToneColor(step.status) }}>
                      {step.error || step.url || `${step.phase} · ${step.risk} · ${step.status}`}
                      {step.llm_calls > 0 ? ` · LLM ${step.llm_calls}` : ""}
                    </span>
                  </div>
                ))}
                <div ref={timelineEndRef} />
              </div>
            </div>
          </section>
        )}

        {/* 우: 자동실행 / 승인 / 보고 */}
        {showRight && (
          <aside
            style={{
              width: isMobile ? "100%" : 300,
              flexShrink: 0,
              background: C.pane,
              borderLeft: isMobile ? "none" : `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              minHeight: 0,
            }}
          >
            <div style={paneHeadStyle()}>
              자동실행 <small style={{ fontSize: 10, color: C.dim, textTransform: "none", letterSpacing: 0 }}>스케줄</small>
            </div>
            {loops.length === 0 ? (
              <div style={cardStyle()}>
                <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{EMPTY_SCHEDULES}</p>
              </div>
            ) : (
              loops.map((loop) => {
                const tag = loopTag(loop);
                return (
                  <div key={loop.id} style={cardStyle()}>
                    <h4 style={{ fontSize: 12.5, color: C.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={loop.name}>
                      {loop.name || `${loop.loop_type} 루프 #${loop.id}`}
                    </h4>
                    <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                      {intervalLabel(loop.interval_seconds)} · {loop.loop_type}
                      {loop.project ? ` · ${loop.project}` : ""}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 11, color: C.muted }}>
                      <span>
                        {loop.last_run_at ? `최근 ${shortTime(loop.last_run_at)}` : "실행 이력 없음"}
                        {loop.last_success === null ? "" : loop.last_success ? " 성공" : " 실패"}
                      </span>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: tag.bg, color: tag.color }}>{tag.text}</span>
                    </div>
                  </div>
                );
              })
            )}

            <div style={paneHeadStyle()}>승인 대기</div>
            {approvals.length === 0 ? (
              <div style={cardStyle()}>
                <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{EMPTY_APPROVALS}</p>
              </div>
            ) : (
              approvals.map((approval) => (
                <div key={approval.id} style={cardStyle(true)}>
                  <h4 style={{ fontSize: 12.5, color: C.text, marginBottom: 3 }}>{approval.action || "승인 대기"}</h4>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{approval.summary || `단계 ${approval.step_seq}`}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 11, color: C.muted }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "#3b2000", color: "#fbbf24" }}>{approval.risk}</span>
                    <button
                      onClick={() => openApproval(approval)}
                      style={{ background: "#1e40af", border: "none", color: "#dbeafe", fontSize: 11, padding: "4px 9px", borderRadius: 5, cursor: "pointer" }}
                    >
                      열기
                    </button>
                  </div>
                </div>
              ))
            )}

            <div style={paneHeadStyle()}>오늘 보고</div>
            {reports.length === 0 ? (
              <div style={cardStyle()}>
                <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{EMPTY_REPORTS}</p>
              </div>
            ) : (
              reports.map((report) => (
                <div key={report.id} style={cardStyle()}>
                  <h4 style={{ fontSize: 12.5, color: C.text, marginBottom: 3 }}>{report.title}</h4>
                  {report.summary && <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{report.summary}</p>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 11, color: C.muted }}>
                    <span>{shortTime(report.completed_at)} KST</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 8,
                        background: report.status === "done" ? "#064e3b" : "#4c0519",
                        color: report.status === "done" ? "#6ee7b7" : "#fca5a5",
                      }}
                    >
                      {report.status === "done" ? "보고 완료" : report.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </aside>
        )}
      </div>

      {/* 승인 모달 — IRREVERSIBLE 은 재확인 문구를 그대로 입력해야 승인 버튼이 열린다 */}
      {modalApproval && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99,
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
        >
          <div style={{ background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 12, width: 440, maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ padding: "15px 19px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#7c2d12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚠️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {modalApproval.requires_confirmation ? "되돌릴 수 없는 행위입니다" : "승인이 필요합니다"}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted }}>오비스가 이 단계 앞에서 멈췄습니다</div>
              </div>
            </div>
            <div style={{ padding: "18px 19px" }}>
              <div style={{ background: "#1c1008", border: "1px solid #92400e", borderRadius: 8, padding: "9px 13px", marginBottom: 14, fontSize: 12, color: "#fbbf24" }}>
                <b>{modalApproval.risk}</b> — {modalApproval.summary || "승인 후에만 실행됩니다."}
              </div>
              <div style={{ background: C.bg, borderRadius: 8, padding: 11, fontFamily: MONO, fontSize: 12, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", gap: 12 }}>
                  <span style={{ color: C.muted }}>행위</span>
                  <span style={{ textAlign: "right", wordBreak: "break-all" }}>{modalApproval.action || "-"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", gap: 12 }}>
                  <span style={{ color: C.muted }}>단계</span>
                  <span>#{modalApproval.step_seq}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", gap: 12 }}>
                  <span style={{ color: C.muted }}>요청</span>
                  <span>{clockTime(modalApproval.requested_at)}</span>
                </div>
              </div>
              {modalApproval.requires_confirmation && (
                <>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
                    승인하시려면 <b style={{ color: "#fbbf24" }}>{modalApproval.confirm_text}</b> 을(를) 그대로 입력하십시오.
                  </div>
                  <input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={modalApproval.confirm_text}
                    autoComplete="off"
                    style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "8px 11px", color: C.text, fontSize: 13 }}
                  />
                </>
              )}
              {decideError && <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>{decideError}</div>}
            </div>
            <div style={{ padding: "13px 19px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 9, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalApproval(null)}
                disabled={deciding}
                style={{ background: C.border, border: "none", color: "#a0aec0", padding: "8px 15px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                닫기
              </button>
              <button
                onClick={() => decide("reject")}
                disabled={deciding}
                style={{ background: "#3f3f46", border: "none", color: "#e4e4e7", padding: "8px 15px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                거부
              </button>
              <button
                onClick={() => decide("approve")}
                disabled={deciding || !confirmReady}
                style={{
                  background: "#dc2626",
                  border: "none",
                  color: "#fff",
                  padding: "8px 19px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: deciding || !confirmReady ? 0.45 : 1,
                  cursor: deciding || !confirmReady ? "not-allowed" : "pointer",
                }}
              >
                승인
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes ohvisBlink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.25;
          }
        }
      `}</style>
    </div>
  );
}
