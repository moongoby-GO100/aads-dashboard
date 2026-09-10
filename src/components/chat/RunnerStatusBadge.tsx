"use client";

/**
 * RunnerStatusBadge — 채팅 헤더 상단 러너 진행상황 배지 (AADS P1-XS)
 *
 * 배경: P0(SSE hidden 필터)로 러너 알림 메시지가 채팅 버블에서 숨겨지면서
 * CEO가 러너 진행상황을 화면에서 볼 수 없게 됐다. 이 배지가 그 가시성을 대체한다.
 *
 * 동작:
 *  - 현재 세션의 러너 작업을 폴링(진행중 8초 / 유휴 30초, 탭 비활성 시 요청 생략)
 *  - 승인대기 > 실패 > 진행중 순으로 우선 노출, 모두 0이면 렌더하지 않음
 *  - 클릭 시 아티팩트 패널의 "로그" 탭을 연다
 *
 * 순수성: Date.now() 는 렌더 중 호출하지 않고 폴링/타이머 콜백에서만 호출해
 * react-hooks/purity 규칙을 지킨다.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RunnerBadgeJob = {
  job_id: string;
  project?: string | null;
  status: string;
  phase?: string | null;
  display_status?: string | null;
  status_label?: string | null;
  status_group?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  instruction?: string | null;
};

export type RunnerBadgeCounts = {
  active: number;
  awaiting: number;
  failed: number;
  total: number;
};

type Props = {
  sessionId: string | null;
  baseUrl: string;
  authHeaders: () => Record<string, string>;
  onOpenLog: () => void;
  screenSize?: "mobile" | "tablet" | "desktop";
  /** 상위(page.tsx)에 러너 카운트를 전달해 로그 탭 요약 스트립과 동기화 */
  onCountsChange?: (counts: RunnerBadgeCounts) => void;
};

const ACTIVE_STATUSES = new Set([
  "queued",
  "claimed",
  "running",
  "approved",
  "deploying",
  "restarting",
  "rolling_back",
  "reviewing",
]);

const FAILED_STATUSES = new Set([
  "error",
  "build_fail",
  "deploy_failed",
  "review_failed",
  "review_hold",
  "auth_unavailable",
  "auth_recovery_pending",
  "awaiting_user_auth",
  "tool_timeout",
]);

/** 실패 배지는 최근 30분 이내 건만 노출 (오래된 실패로 헤더가 계속 붉어지는 것 방지) */
const FAILED_WINDOW_MS = 30 * 60 * 1000;

const EMPTY_COUNTS: RunnerBadgeCounts = { active: 0, awaiting: 0, failed: 0, total: 0 };

function classify(job: RunnerBadgeJob): "active" | "awaiting" | "failed" | "other" {
  const raw = String(job.status || "").toLowerCase();
  const disp = String(job.display_status || "").toLowerCase();
  const group = String(job.status_group || "").toLowerCase();

  if (raw === "awaiting_approval" || disp === "awaiting_approval" || group === "approval") return "awaiting";
  if (group === "action_required" || FAILED_STATUSES.has(raw) || FAILED_STATUSES.has(disp)) return "failed";
  if (group === "active" || ACTIVE_STATUSES.has(raw)) return "active";
  return "other";
}

function elapsedLabel(startedIso: string | null, nowMs: number): string {
  if (!startedIso) return "";
  const started = new Date(startedIso).getTime();
  if (!Number.isFinite(started)) return "";
  const sec = Math.max(0, Math.floor((nowMs - started) / 1000));
  if (sec < 60) return sec + "초";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "분";
  const hr = Math.floor(min / 60);
  return hr + "시간 " + (min % 60) + "분";
}

export default function RunnerStatusBadge({
  sessionId,
  baseUrl,
  authHeaders,
  onOpenLog,
  screenSize = "desktop",
  onCountsChange,
}: Props) {
  const [counts, setCounts] = useState<RunnerBadgeCounts>(EMPTY_COUNTS);
  const [oldestActiveAt, setOldestActiveAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState("");
  const countsKeyRef = useRef("");
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => { onCountsChangeRef.current = onCountsChange; }, [onCountsChange]);

  const fetchJobs = useCallback(async () => {
    if (!sessionId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    let list: RunnerBadgeJob[] = [];
    try {
      const res = await fetch(
        baseUrl + "/pipeline/jobs?session_id=" + encodeURIComponent(sessionId) + "&limit=50",
        { headers: authHeaders(), credentials: "include" }
      );
      if (!res.ok) return;
      const data = await res.json();
      list = Array.isArray(data) ? data : Array.isArray(data?.jobs) ? data.jobs : [];
    } catch {
      // 네트워크/중단 오류는 무시 — 헤더가 에러로 깨지지 않게 한다
      return;
    }

    // 집계는 렌더가 아닌 폴링 콜백에서 수행한다 (Date.now 순수성 규칙 준수)
    const now = Date.now();
    let active = 0;
    let awaiting = 0;
    let failed = 0;
    let oldest: string | null = null;
    for (const job of list) {
      const kind = classify(job);
      if (kind === "active") {
        active += 1;
        if (job.started_at) {
          if (!oldest || new Date(job.started_at).getTime() < new Date(oldest).getTime()) {
            oldest = job.started_at;
          }
        }
      } else if (kind === "awaiting") {
        awaiting += 1;
      } else if (kind === "failed") {
        const ts = new Date(job.updated_at || job.created_at || 0).getTime();
        if (Number.isFinite(ts) && now - ts <= FAILED_WINDOW_MS) failed += 1;
      }
    }
    const next: RunnerBadgeCounts = { active, awaiting, failed, total: list.length };
    setCounts(next);
    setOldestActiveAt(oldest);

    const key = active + "/" + awaiting + "/" + failed + "/" + list.length;
    if (countsKeyRef.current !== key) {
      countsKeyRef.current = key;
      onCountsChangeRef.current?.(next);
    }
  }, [sessionId, baseUrl, authHeaders]);

  const busy = counts.active > 0 || counts.awaiting > 0;

  // 세션 전환 시 즉시 초기화 (이전 세션 카운트가 잔상으로 남지 않게)
  useEffect(() => {
    setCounts(EMPTY_COUNTS);
    setOldestActiveAt(null);
    setElapsed("");
    countsKeyRef.current = "";
  }, [sessionId]);

  // 최초 로드 + 적응형 폴링 (진행중 8초 / 유휴 30초)
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void fetchJobs();
    const timer = setInterval(() => {
      if (!cancelled) void fetchJobs();
    }, busy ? 8000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, fetchJobs, busy]);

  // 경과시간 문자열은 타이머 콜백에서 계산해 state 로 보관
  useEffect(() => {
    if (!oldestActiveAt) {
      setElapsed("");
      return;
    }
    const update = () => setElapsed(elapsedLabel(oldestActiveAt, Date.now()));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [oldestActiveAt]);

  if (!sessionId) return null;

  // 표시 우선순위: 승인대기 > 실패 > 진행중. 모두 0이면 렌더하지 않는다(헤더 청결 유지).
  let icon = "";
  let label = "";
  let fg = "";
  let bg = "";
  let border = "";
  let title = "";
  let spinning = false;

  if (counts.awaiting > 0) {
    icon = "✋";
    label = "승인대기 " + counts.awaiting;
    fg = "#f59e0b";
    bg = "rgba(245,158,11,0.14)";
    border = "rgba(245,158,11,0.45)";
    title = "러너 " + counts.awaiting + "건이 승인을 기다립니다. 클릭하면 로그 탭이 열립니다.";
  } else if (counts.failed > 0) {
    icon = "❌";
    label = "러너 실패 " + counts.failed;
    fg = "#ef4444";
    bg = "rgba(239,68,68,0.14)";
    border = "rgba(239,68,68,0.45)";
    title = "최근 30분 내 실패한 러너 작업 " + counts.failed + "건. 클릭하면 로그 탭이 열립니다.";
  } else if (counts.active > 0) {
    icon = "🔄";
    label = elapsed ? "러너 " + counts.active + " · " + elapsed : "러너 " + counts.active;
    fg = "#3b82f6";
    bg = "rgba(59,130,246,0.14)";
    border = "rgba(59,130,246,0.45)";
    title = "러너 작업 " + counts.active + "건 진행 중. 클릭하면 로그 탭이 열립니다.";
    spinning = true;
  } else {
    return null;
  }

  const isMobile = screenSize === "mobile";

  return (
    <button
      type="button"
      data-testid="runner-status-badge"
      onClick={onOpenLog}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: isMobile ? "0 10px" : "4px 9px",
        height: isMobile ? "34px" : "auto",
        borderRadius: "999px",
        border: "1px solid " + border,
        background: bg,
        color: fg,
        fontSize: isMobile ? "13px" : "11.5px",
        fontWeight: 700,
        lineHeight: 1.2,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        maxWidth: isMobile ? "46vw" : "220px",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span
        style={{
          display: "inline-block",
          animation: spinning ? "aads-runner-spin 1.6s linear infinite" : undefined,
        }}
      >
        {icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <style>{"@keyframes aads-runner-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
    </button>
  );
}
