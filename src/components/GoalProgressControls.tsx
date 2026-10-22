"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  GOAL_STATUS_COLOR, formatPausedAt, goalStatusLabel, isGoalTerminal, normalizeProgress,
  createSingleFlight, progressPercent, runGoalPauseAction, type GoalPauseApi,
} from "@/lib/goalProgress";

type Notice = { kind: "reason" | "forbidden" | "error"; message: string };
type Action = { type: "pause"; reason: string } | { type: "resume" };

export type GoalProgressViewProps = {
  status?: string;
  progress?: number | null;
  paused?: boolean;
  pausedReason?: string | null;
  pausedAt?: string | null;
  milestonesDone?: number;
  milestonesTotal?: number;
  busy?: boolean;
  forbidden?: boolean;
  notice?: Notice | null;
  onToggle?: () => void;
  onRetry?: () => void;
};

const badge = (color: string, filled = false) => ({
  fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" as const,
  border: `1px solid ${color}`, color: filled ? "white" : color, background: filled ? color : "transparent",
});

export function GoalProgressView({
  status, progress, paused, pausedReason, pausedAt, milestonesDone, milestonesTotal,
  busy = false, forbidden = false, notice = null, onToggle, onRetry,
}: GoalProgressViewProps) {
  const color = (status && GOAL_STATUS_COLOR[status]) || "#64748b";
  const hasProgress = progress !== undefined && progress !== null;
  const pct = progressPercent(progress);
  const canControl = paused !== undefined && !isGoalTerminal(status);
  const disabled = busy || forbidden;
  const pausedAtText = formatPausedAt(pausedAt);
  return (
    <div data-testid="goal-progress-controls" style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {status && <span data-testid="goal-status-badge" style={badge(color)}>{goalStatusLabel(status)}</span>}
        {paused && <span data-testid="goal-paused-badge" style={badge("#d97706", true)}>멈춤</span>}
        {milestonesTotal !== undefined && (
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
            {milestonesTotal > 0 ? `마일스톤 ${milestonesDone ?? 0}/${milestonesTotal} 완료` : "마일스톤 없음"}
          </span>
        )}
        {canControl && (
          <button type="button" data-testid="goal-pause-toggle" onClick={onToggle} disabled={disabled}
            aria-busy={busy}
            title={forbidden ? "대표님 권한이 필요합니다" : undefined}
            style={{
              marginLeft: "auto", minHeight: 30, padding: "0 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 7,
              border: `1px solid ${paused ? "#16a34a" : "#d97706"}`, background: "var(--bg-card)",
              color: paused ? "#16a34a" : "#d97706", cursor: disabled ? (busy ? "wait" : "not-allowed") : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}>
            {busy ? "처리 중…" : paused ? "▶ 시작" : "⏸ 멈춤"}
          </button>
        )}
      </div>

      {hasProgress && (
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8 }}>
          <div role="progressbar" aria-label="목표 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            style={{ flex: 1, height: 7, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${normalizeProgress(progress)}%`, height: "100%", background: color }} />
          </div>
          <span data-testid="goal-progress-percent" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)", minWidth: 34, textAlign: "right" }}>{pct}%</span>
        </div>
      )}

      {paused && (pausedReason || pausedAtText) && (
        <div data-testid="goal-paused-detail" style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {pausedReason ? `멈춤 사유 — ${pausedReason}` : "멈춤"}{pausedAtText ? ` · ${pausedAtText}에 멈춤` : ""}
        </div>
      )}

      {notice && (
        <div role="alert" style={{ marginTop: 6, padding: "6px 9px", borderRadius: 7, border: "1px solid #dc2626", background: "rgba(239,68,68,.07)", color: "#dc2626", fontSize: 11, lineHeight: 1.5 }}>
          {notice.message}
          {notice.kind === "error" && onRetry && (
            <button type="button" onClick={onRetry} disabled={busy}
              style={{ marginLeft: 8, border: 0, background: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", fontSize: 11 }}>
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type GoalProgressControlsProps = Omit<GoalProgressViewProps, "busy" | "forbidden" | "notice" | "onToggle" | "onRetry"> & {
  goalId: string;
  onChanged: () => Promise<unknown> | void;
  client?: GoalPauseApi;
  promptReason?: (message: string) => string | null;
};

// goalId 가 바뀌면 호출부에서 key={goalId} 로 상태를 비운다.
export function GoalProgressControls({
  goalId, onChanged, client = api, promptReason, ...view
}: GoalProgressControlsProps) {
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const flight = useMemo(() => createSingleFlight(), []);
  const lastAction = useRef<Action | null>(null);

  const run = useCallback(async (action: Action) => {
    if (flight.pending) return;
    lastAction.current = action;
    setBusy(true); setNotice(null);
    try {
      await flight.run(async () => {
        const outcome = await runGoalPauseAction(client, goalId, action);
        if (outcome.ok) {
          try { await onChanged(); } catch { /* 갱신 실패가 처리 결과를 뒤집지 않는다 */ }
        } else {
          if (outcome.kind === "forbidden") setForbidden(true);
          setNotice({ kind: outcome.kind, message: outcome.message });
        }
      });
    } finally {
      setBusy(false);
    }
  }, [client, goalId, onChanged, flight]);

  const onToggle = useCallback(() => {
    if (flight.pending) return;
    if (view.paused) { void run({ type: "resume" }); return; }
    const ask = promptReason ?? ((m: string) => window.prompt(m));
    const reason = ask("이 목표를 멈춥니다.\n왜 멈추는지 적어 주십시오.");
    if (reason === null) return;
    void run({ type: "pause", reason });
  }, [view.paused, promptReason, run, flight]);

  const onRetry = useCallback(() => {
    if (lastAction.current) void run(lastAction.current);
  }, [run]);

  return <GoalProgressView {...view} busy={busy} forbidden={forbidden} notice={notice} onToggle={onToggle} onRetry={onRetry} />;
}
