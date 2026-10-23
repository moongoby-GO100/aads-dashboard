"use client";

// 휴면·차단 정리 카드 — 승인 목업 dormancy-card_default / empty / error (+ _mobile).
// PRD goal-first-triage-execution-prd rev1 §3-3 UI-1~4: ① 진행 P0 3개 고르기 ② 휴면 목표별 ③ 차단 목표별 선택 →
// POST /goals/triage/apply 한 번으로 반영. 고르지 않은 것은 그대로 둔다(다음 주에 다시 묻는다).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_P0_CAP, autoApprovalChip, dormantReasonLabel, idleLabel, priorityBadge, shortGoalTitle,
  type CleanupCandidates, type DormancyCardState, type GoalSignal,
} from "@/lib/goalStrip";
import {
  ACTION_LABEL, APPLY_BLOCK_TEXT, EMPTY_SELECTION, LANE_ACTIONS, applyBlockReason, buildApplyRequest, chooseAction,
  isDemotedP0, mergeTargetLabel, mergeTargetOptions, newIdempotencyKey, reconcileSelection, requestFingerprint,
  requiredP0Count, runTriageApply, setMergeTarget, summarizeSelection, toggleKeepP0, triageFailureHeadline,
  triageFailureText, visibleCandidates,
  type KeyState, type TriageActionKind, type TriageApplyBody, type TriageFailure, type TriageLane, type TriageSelection,
} from "@/lib/goalTriage";

const BADGE_BG: Record<string, string> = { p0: "#b91c1c", p1: "#c2410c", p2: "#475569", other: "#475569" };
const ACTION_BG: Record<TriageActionKind, string> = {
  resume: "#0f7a63", unblock: "#0f7a63", pause: "#8a6d1f", close: "#7f2d2d", merge: "#3b4a9e",
};
const TOUCH_MIN = 44;

function Badge({ priority }: { priority: string | null | undefined }) {
  const b = priorityBadge(priority);
  if (!b) return null;
  return (
    <span style={{ flexShrink: 0, padding: "0 5px", borderRadius: 4, fontSize: 9.5, fontWeight: 800, lineHeight: "15px", color: "#fff",
                   background: BADGE_BG[b.tone], border: b.critical ? "1px solid #fca5a5" : "none" }}>{b.text}</span>
  );
}

const pill: React.CSSProperties = {
  display: "inline-block", padding: "0 6px", borderRadius: 4, fontSize: 10.5, lineHeight: "17px",
  border: "1px solid var(--ct-border)", color: "var(--ct-text2)", whiteSpace: "nowrap",
};
const demotePill: React.CSSProperties = { ...pill, color: "#fdba74", borderColor: "#8a6d1f" };

function OpenGoalButton({ goalId, onOpenGoal, isMobile }: { goalId: string; onOpenGoal: (goalId: string) => void; isMobile: boolean }) {
  return (
    <button type="button" onClick={() => onOpenGoal(goalId)}
      style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 11, cursor: "pointer",
               minHeight: isMobile ? TOUCH_MIN : undefined, minWidth: isMobile ? TOUCH_MIN : undefined }}>
      목표 열기
    </button>
  );
}

interface ChoiceRowProps {
  goal: GoalSignal;
  lane: TriageLane;
  now: number;
  isMobile: boolean;
  demoted: boolean;
  choice: { action: TriageActionKind; mergeInto: string | null } | undefined;
  mergeTargets: GoalSignal[];
  disabled: boolean;
  onChoose: (action: TriageActionKind) => void;
  onMergeTarget: (target: string | null) => void;
  onOpenGoal: (goalId: string) => void;
}

function ChoiceRow(p: ChoiceRowProps) {
  const { goal, lane, choice } = p;
  const noReason = lane === "blocked" && dormantReasonLabel(goal.dormant_reason);
  const chip = autoApprovalChip(goal.auto_approval, p.now);
  const segHeight = p.isMobile ? TOUCH_MIN : 30;
  const stacked = true;
  const mergeMissing = choice?.action === "merge" && !choice.mergeInto;
  return (
    <div data-cleanup-row={goal.goal_id} data-choice={choice?.action ?? ""}
      style={{ padding: "8px 10px", borderRadius: 10, border: choice ? "1px solid #4a417f" : "1px solid var(--ct-border)",
               background: choice ? "rgba(108,92,231,.07)" : "var(--ct-bg)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: stacked ? "stretch" : "center", flexDirection: stacked ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Badge priority={goal.priority} />
            <span title={goal.title} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortGoalTitle(goal.title, goal.project)}
            </span>
            {p.demoted && <span style={demotePill}>P0→P1 하향</span>}
            <OpenGoalButton goalId={goal.goal_id} onOpenGoal={p.onOpenGoal} isMobile={p.isMobile} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <span style={pill}>{lane === "blocked" ? "blocked" : "active"}</span>
            <span style={{ ...pill, color: "#f59e0b", borderColor: "rgba(245,158,11,.5)" }}>{idleLabel(goal.last_activity_at, p.now)}</span>
            {noReason && <span style={{ ...pill, color: "#f59e0b", borderColor: "rgba(245,158,11,.7)" }}>⚠️ {noReason}</span>}
            {chip && <span style={pill}>{chip.text}</span>}
          </div>
        </div>
        <div role="radiogroup" aria-label={`${shortGoalTitle(goal.title, goal.project)} 처리`}
          style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: stacked ? (lane === "blocked" ? "1.75fr 1.05fr .8fr .8fr" : "repeat(4, 1fr)") : "repeat(4, auto)",
                   border: "1px solid var(--ct-border)", borderRadius: 8, overflow: "hidden" }}>
          {LANE_ACTIONS[lane].map((a, i) => {
            const on = choice?.action === a;
            return (
              <button key={a} type="button" role="radio" aria-checked={on} data-action={a} disabled={p.disabled}
                onClick={() => p.onChoose(a)}
                style={{ height: segHeight, minHeight: segHeight, padding: "0 9px", border: 0, borderLeft: i === 0 ? 0 : "1px solid var(--ct-border)",
                         background: on ? ACTION_BG[a] : "var(--ct-bg)", color: on ? "#fff" : "var(--ct-text2)", fontWeight: on ? 700 : 400,
                         fontSize: 11.5, whiteSpace: "nowrap", cursor: p.disabled ? "default" : "pointer" }}>
                {ACTION_LABEL[a]}
              </button>
            );
          })}
        </div>
      </div>
      {choice?.action === "merge" && (
        <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ct-text2)" }}>
          병합 대상 ▸
          <select value={choice.mergeInto ?? ""} disabled={p.disabled} data-merge-target={goal.goal_id}
            onChange={(e) => p.onMergeTarget(e.target.value || null)}
            style={{ flex: 1, minWidth: 0, height: p.isMobile ? TOUCH_MIN : 30, borderRadius: 6, padding: "0 8px", fontSize: 12,
                     border: mergeMissing ? "1px dashed #8a6d1f" : "1px solid #3b4a9e", background: "var(--ct-bg)", color: "var(--ct-text)" }}>
            <option value="">병합 대상 고르기…</option>
            {p.mergeTargets.map((t) => <option key={t.goal_id} value={t.goal_id}>{mergeTargetLabel(t)}</option>)}
          </select>
          {mergeMissing && <span style={{ color: "#f59e0b" }}>대상을 골라야 반영됩니다</span>}
        </label>
      )}
    </div>
  );
}

function P0Pick({ goal, now, picked, locked, isMobile, onToggle, onOpenGoal }: {
  goal: GoalSignal; now: number; picked: boolean; locked: boolean; isMobile: boolean;
  onToggle: () => void; onOpenGoal: (goalId: string) => void;
}) {
  const dormant = goal.cleanup_lane === "dormant";
  const blockedOut = locked && !picked;
  return (
    <div data-cleanup-row={goal.goal_id} data-p0-picked={picked ? "1" : "0"}
      style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "0 8px", minHeight: isMobile ? TOUCH_MIN : 34,
               border: picked ? "1px solid #6c5ce7" : "1px solid var(--ct-border)", background: picked ? "rgba(108,92,231,.16)" : "var(--ct-bg)",
               opacity: blockedOut ? 0.6 : 1 }}>
      <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: isMobile ? TOUCH_MIN : 34, cursor: blockedOut ? "default" : "pointer" }}>
        <input type="checkbox" checked={picked} disabled={blockedOut} onChange={onToggle} data-p0-pick={goal.goal_id}
          style={{ width: isMobile ? 22 : 16, height: isMobile ? 22 : 16, flexShrink: 0, accentColor: "#6c5ce7" }} />
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "3px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span title={goal.title} style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortGoalTitle(goal.title, goal.project)}
            </span>
            {!picked && <span style={demotePill}>→ P1</span>}
          </span>
          <span style={{ fontSize: 11, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>
            {dormant ? "휴면 · " : ""}active · {idleLabel(goal.last_activity_at, now).replace("마지막 활동 ", "")}
          </span>
        </span>
      </label>
      <OpenGoalButton goalId={goal.goal_id} onOpenGoal={onOpenGoal} isMobile={isMobile} />
    </div>
  );
}

function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

// 292 + 16 + 240(최소) + 16 + 240(최소). 이보다 좁으면 3열 고정 대신 열을 줄바꿈한다.
const WIDE_GRID_MIN_PX = 804;
const WRAP_COLUMNS = "repeat(auto-fit, minmax(min(100%, 240px), 1fr))";

function useWideGrid(): [(el: HTMLDivElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (!el) return;
    const update = () => setWide(el.clientWidth >= WIDE_GRID_MIN_PX);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, wide];
}

export interface DormancyCardProps {
  state: DormancyCardState;
  candidates: CleanupCandidates;
  /** 병합 대상 후보 — 열린 목표 전체. */
  openGoals: GoalSignal[];
  /** GET /goals 가 내려준 후보 지문. 없으면 반영할 수 없다. */
  candidatesVersion: string | null;
  pausedAutoApproval: GoalSignal[];
  openGoalCount: number | null;
  openP0Count: number | null;
  isMobile: boolean;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
  onOpenGoal: (goalId: string) => void;
  /** POST /goals/triage/apply. 실패하면 throw 한다. */
  onApply: (body: TriageApplyBody, idempotencyKey: string) => Promise<unknown>;
  /** 반영 성공 뒤 목표 띠 재조회. */
  onApplied: () => Promise<unknown> | void;
  /** stale_candidates 응답 뒤 최신 후보 재조회. */
  onRefreshCandidates: () => Promise<unknown> | void;
}

export function DormancyCard(p: DormancyCardProps) {
  const [pausedOpen, setPausedOpen] = useState(false);
  const [p0More, setP0More] = useState(false);
  const now = useNow();
  const [gridRef, wideGrid] = useWideGrid();
  const { dormant, blocked, activeP0, total } = p.candidates;
  const P0_PREVIEW = 5;

  const [rawSel, setRawSel] = useState<TriageSelection>(EMPTY_SELECTION);
  // 목록을 다시 불러오는 동안(loading·error)은 후보가 비어 보이므로 고른 내용을 지우지 않는다.
  const sel = useMemo(
    () => (p.state === "default" ? reconcileSelection(rawSel, p.candidates, p.openGoals) : rawSel),
    [p.state, rawSel, p.candidates, p.openGoals],
  );

  // 카드를 열 때 한 번 만든다. 재시도는 같은 키를 쓰고, 서버가 처리해 거절한 뒤의 새 시도는 새 키를 쓴다.
  const [keyBox] = useState<{ current: KeyState }>(() => ({ current: { key: newIdempotencyKey(), fingerprint: null } }));
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<TriageFailure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedFp, setConfirmedFp] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // 카드는 메시지 목록 맨 위에 붙는다. 대화 아래쪽을 보다가 칩을 누르면 카드가 화면 위쪽 밖에 열리므로 열 때 한 번 보이는 자리로 옮긴다.
  useEffect(() => { sectionRef.current?.scrollIntoView?.({ block: "start" }); }, []);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  // 확인 문구와 버튼은 카드 맨 아래에 열리므로 PC 처럼 카드가 목록보다 길면 화면 밖이다. 열릴 때 보이는 자리로 옮긴다.
  useEffect(() => { if (confirming) confirmRef.current?.scrollIntoView?.({ block: "nearest" }); }, [confirming]);

  const summary = summarizeSelection(sel, p.candidates);
  const block = applyBlockReason(sel, p.candidates, p.candidatesVersion);
  const view = visibleCandidates(p.candidates, sel);
  const required = requiredP0Count(p.candidates);
  const p0Locked = sel.keepP0.length >= ACTIVE_P0_CAP;
  const destructive = summary.closing + summary.merging;

  const apply = async (confirmed: boolean) => {
    if (busyRef.current || block || !p.candidatesVersion) return;
    const body = buildApplyRequest(sel, p.candidates, p.candidatesVersion);
    const fp = requestFingerprint(body);
    if (destructive > 0 && !confirmed && confirmedFp !== fp) { setConfirming(true); return; }
    busyRef.current = true;
    setConfirming(false);
    setConfirmedFp(fp);
    setFailure(null);
    setSubmitting(true);
    const result = await runTriageApply(keyBox, body, {
      apply: p.onApply, applied: p.onApplied, refresh: p.onRefreshCandidates,
    });
    busyRef.current = false;
    if (!mountedRef.current) return;
    setSubmitting(false);
    if (!result.ok) setFailure(result.failure);
  };

  const frame = (body: React.ReactNode, footer: React.ReactNode, subtitle?: React.ReactNode, banner?: React.ReactNode) => (
    <section ref={sectionRef} data-dormancy-card={p.state} data-apply-state={failure ? "error" : submitting ? "submitting" : "idle"} aria-label="휴면·차단 목표 정리"
      style={{ margin: "8px 0 12px", border: "1px solid rgba(129,140,248,.55)", borderRadius: 14, background: "var(--ct-card)",
               // 메시지 목록은 높이가 고정된 column flex 다. overflow:hidden 요소는 min-height:auto 가 0 이라 줄어들어 2px 로 접힌다.
               flexShrink: 0, scrollMarginTop: 56,
               overflow: p.isMobile ? "clip" : "hidden" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--ct-border)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ct-text)" }}>💤 휴면·차단 목표 정리</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--ct-text2)", marginTop: 3 }}>{subtitle}</div>}
        </div>
        {p.state === "default" && (
          <div style={{ fontSize: 11.5, color: "#34d399", border: "1px solid rgba(52,211,153,.5)", borderRadius: 8, padding: "5px 9px", maxWidth: p.isMobile ? "none" : 320, flex: p.isMobile ? "1 1 100%" : undefined }}>
            자동으로 종료·삭제되지 않습니다. 고른 것만 바뀌고, 나머지는 다음 주에 다시 묻습니다.
          </div>
        )}
      </header>
      {banner}
      {body}
      <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--ct-border)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: p.isMobile ? "stretch" : "center",
                       flexDirection: p.isMobile && p.state === "default" ? "column" : "row", justifyContent: "space-between",
                       ...(p.isMobile ? { position: "sticky", bottom: 0, background: "var(--ct-card)", zIndex: 2 } : {}) }}>
        {footer}
      </footer>
    </section>
  );

  const closeBtn = (
    <button type="button" onClick={p.onClose}
      style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 12.5, cursor: "pointer",
               minHeight: p.isMobile ? TOUCH_MIN : undefined }}>
      닫기
    </button>
  );

  if (p.state === "loading") {
    return frame(
      <div role="status" style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--ct-text2)" }}>정리 후보를 불러오는 중입니다…</div>,
      <><span style={{ fontSize: 12, color: "var(--ct-text2)" }}>아무것도 바뀌지 않습니다.</span>{closeBtn}</>,
    );
  }

  if (p.state === "error") {
    return frame(
      <div role="alert" style={{ margin: 16, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(220,38,38,.55)", background: "rgba(220,38,38,.08)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ct-text)" }}>⛔ 정리 후보를 불러오지 못했습니다 — 아무것도 바뀌지 않았습니다</div>
        <div style={{ fontSize: 12.5, color: "var(--ct-text2)", margin: "4px 0 10px" }}>
          목표 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하면 같은 카드가 열립니다.
        </div>
        <button type="button" onClick={p.onRetry} disabled={p.retrying}
          style={{ padding: "6px 16px", borderRadius: 8, border: 0, background: "#6366f1", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: p.retrying ? "default" : "pointer", opacity: p.retrying ? 0.6 : 1,
                   minHeight: p.isMobile ? TOUCH_MIN : undefined }}>
          {p.retrying ? "다시 불러오는 중…" : "다시 시도"}
        </button>
      </div>,
      <><span style={{ fontSize: 12, color: "var(--ct-text2)" }}>목표 띠는 그대로 쓸 수 있습니다.</span>{closeBtn}</>,
    );
  }

  if (p.state === "empty") {
    return frame(
      <div style={{ padding: "34px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ct-text)" }}>정리할 휴면·차단 목표가 없습니다</div>
        <div style={{ fontSize: 12.5, color: "var(--ct-text2)", marginTop: 6, lineHeight: 1.6 }}>
          14일 넘게 멈춘 목표도, 차단 해소가 필요한 목표도 없고 진행 P0 도 3개 이하입니다.
        </div>
      </div>,
      <><span style={{ fontSize: 12, color: "var(--ct-text2)" }}>닫아도 목표 띠의 🧹 칩은 후보가 생길 때만 나타납니다.</span>{closeBtn}</>,
    );
  }

  const col = (title: React.ReactNode, hint: React.ReactNode, rows: React.ReactNode, count?: React.ReactNode, id?: string) => (
    <div data-col={id} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ct-text)" }}>{title}</div>
        {count && <div style={{ fontSize: 11.5, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{count}</div>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ct-text2)", lineHeight: 1.5 }}>{hint}</div>
      {rows}
    </div>
  );

  const keptSet = new Set(sel.keepP0);
  const p0Shown = p0More ? activeP0 : activeP0.filter((g, i) => i < P0_PREVIEW || keptSet.has(g.goal_id));
  const p0Hidden = activeP0.length - p0Shown.length;
  const p0Done = sel.keepP0.length >= required;
  const row = (g: GoalSignal, lane: TriageLane) => (
    <ChoiceRow key={g.goal_id} goal={g} lane={lane} now={now} isMobile={p.isMobile} demoted={isDemotedP0(g, sel)}
      choice={sel.choices[g.goal_id]} mergeTargets={mergeTargetOptions(p.openGoals, sel, g.goal_id)} disabled={submitting}
      onChoose={(a) => setRawSel(chooseAction(sel, g.goal_id, lane, a))}
      onMergeTarget={(t) => setRawSel(setMergeTarget(sel, g.goal_id, t))}
      onOpenGoal={p.onOpenGoal} />
  );

  const body = (
    <div ref={bodyRef}
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxHeight: p.isMobile ? "min(46dvh, 420px)" : "56vh", overflowY: "auto" }}>
      {p.pausedAutoApproval.length > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(245,158,11,.55)", background: "rgba(245,158,11,.08)", fontSize: 12.5, color: "var(--ct-text)", lineHeight: 1.6 }}>
          ⏸ 보류 목표 {p.pausedAutoApproval.length}개의 자동승인이 정지되어 있습니다 — 자동으로 승인되지 않고 승인 대기로 바뀝니다. 재개·차단 해소한 목표만 다시 켜집니다.{" "}
          <button type="button" onClick={() => setPausedOpen((v) => !v)}
            style={{ border: 0, background: "transparent", color: "#f59e0b", cursor: "pointer", fontSize: 12.5, padding: 0, minHeight: p.isMobile ? TOUCH_MIN : undefined }}>
            정지 목록 {p.pausedAutoApproval.length}건 {pausedOpen ? "접기 ▴" : "보기 ▾"}
          </button>
          {pausedOpen && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--ct-text2)" }}>
              {p.pausedAutoApproval.map((g) => <li key={g.goal_id}>{shortGoalTitle(g.title, g.project)} · {g.status}</li>)}
            </ul>
          )}
        </div>
      )}
      <div ref={gridRef}
        style={{ display: "grid", gap: 16, gridTemplateColumns: p.isMobile ? "minmax(0,1fr)" : wideGrid ? "292px minmax(0,1fr) minmax(0,392px)" : WRAP_COLUMNS }}>
        {col(
          `① 진행 P0 ${required || ACTIVE_P0_CAP}개 고르기`,
          "고른 P0 는 ②·③ 에 다시 나오지 않습니다. 고르지 않은 진행 P0 는 P1 로 내려갑니다.",
          <>
            {activeP0.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>진행 중인 P0 가 없습니다.</div>
              : p0Shown.map((g) => (
                <P0Pick key={g.goal_id} goal={g} now={now} picked={keptSet.has(g.goal_id)} locked={p0Locked} isMobile={p.isMobile}
                  onToggle={() => setRawSel(toggleKeepP0(sel, g.goal_id))} onOpenGoal={p.onOpenGoal} />
              ))}
            {activeP0.length > P0_PREVIEW && (p0Hidden > 0 || p0More) && (
              <button type="button" onClick={() => setP0More((v) => !v)}
                style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "var(--ct-text2)", fontSize: 11.5, cursor: "pointer", padding: 0, minHeight: p.isMobile ? TOUCH_MIN : undefined }}>
                {p0More ? "접기 ▴" : `나머지 진행 P0 ${p0Hidden}개 보기 ▾ — 고르지 않은 P0 는 P1 로 내려갑니다`}
              </button>
            )}
          </>,
          <span data-p0-count style={{ color: p0Done ? "#5eead4" : "var(--ct-text2)", fontWeight: 700 }}>
            {sel.keepP0.length} / {ACTIVE_P0_CAP}{p0Done && activeP0.length > 0 ? " ✓" : ""}
          </span>,
          "p0",
        )}
        {col(
          `② 휴면 후보 ${view.dormant.length}개 — 목표별 선택`,
          "14일 넘게 활동이 없는 진행(active) 목표입니다. 차단(blocked) 목표는 여기 없고 ③ 에서 따로 묻습니다. 고르지 않으면 그대로 둡니다.",
          view.dormant.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>휴면 후보가 없습니다.</div>
            : view.dormant.map((g) => row(g, "dormant")),
          `선택 ${summary.dormant} · 보류 ${view.dormant.length - summary.dormant}`,
          "dormant",
        )}
        {col(
          <>③ 차단 해소 또는 종료 <span style={{ fontSize: 11, color: "var(--ct-text2)", fontWeight: 400 }}>blocked {view.blocked.length}개</span></>,
          <>blocked 는 휴면으로 세지 않고 <span style={{ color: "#f59e0b" }}>따로</span> 묻습니다. 차단 사유가 없으면 경고로 표시합니다.</>,
          view.blocked.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>차단된 후보가 없습니다.</div>
            : view.blocked.map((g) => row(g, "blocked")),
          `선택 ${summary.blocked} · 보류 ${view.blocked.length - summary.blocked}`,
          "blocked",
        )}
      </div>
    </div>
  );

  const subtitle = p.openGoalCount !== null
    ? `열린 목표 ${p.openGoalCount}개 중 정리 후보 ${total}개 = 휴면 active ${dormant.length} + 차단 blocked ${blocked.length}${p.openP0Count !== null ? ` · 열린 P0 ${p.openP0Count}개(진행 P0 상한 3)` : ""}`
    : `정리 후보 ${total}개 = 휴면 active ${dormant.length} + 차단 blocked ${blocked.length}`;

  const btn: React.CSSProperties = {
    padding: "7px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", minHeight: p.isMobile ? TOUCH_MIN : 34,
    whiteSpace: "nowrap",
    ...(p.isMobile ? { flex: "none" } : {}),
  };
  const applyLabel = `① P0 ${summary.p0}개 · ② ${summary.dormant}건 · ③ ${summary.blocked}건 반영`;
  const act = (a: TriageActionKind, n: number) => (n > 0 ? `${ACTION_LABEL[a]} ${n}` : null);
  const parts = (list: TriageActionKind[]) => list.map((a) => act(a, summary.byAction[a])).filter(Boolean).join(" · ");

  const banner = failure ? (
    <div role="alert" data-apply-error={failure.code ?? String(failure.status ?? "network")}
      style={{ margin: "12px 16px 0", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(220,38,38,.55)", background: "rgba(220,38,38,.08)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ct-text)" }}>⛔ {triageFailureHeadline(failure)}</div>
      <div style={{ fontSize: 12.5, color: "var(--ct-text2)", margin: "4px 0 10px", lineHeight: 1.6 }}>
        {triageFailureText(failure)} 고른 내용은 그대로 남아 있습니다.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" data-apply-retry onClick={() => void apply(false)} disabled={submitting || p.retrying || block !== null}
          style={{ ...btn, flex: p.isMobile ? 1 : undefined, border: 0, background: "#6366f1", color: "#fff", opacity: submitting || p.retrying || block !== null ? 0.6 : 1 }}>
          {submitting ? "반영하는 중…" : "다시 시도"}
        </button>
        <button type="button" onClick={() => { setFailure(null); bodyRef.current?.scrollIntoView?.({ block: "start" }); }}
          style={{ ...btn, flex: p.isMobile ? 1 : undefined, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontWeight: 400 }}>
          고른 내용 보기
        </button>
      </div>
    </div>
  ) : null;

  const destructiveText = [summary.closing > 0 ? `종료 ${summary.closing}건` : null, summary.merging > 0 ? `병합 ${summary.merging}건` : null].filter(Boolean).join(" · ");

  return frame(
    body,
    confirming ? (
      <div ref={confirmRef} role="alertdialog" aria-label="종료·병합 확인" data-confirm="1"
        style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: "var(--ct-text)", lineHeight: 1.6 }}>
          <b>{destructiveText}</b>이 포함되어 있습니다. 종료는 &quot;취소됨&quot;, 병합은 &quot;보관됨&quot; 상태로 바뀌어 목표 목록에서 사라지고, 이 카드에서는 되돌릴 수 없습니다(데이터는 지워지지 않습니다). 반영할까요?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setConfirming(false)}
            style={{ ...btn, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontWeight: 400 }}>돌아가기</button>
          <button type="button" data-confirm-apply onClick={() => void apply(true)}
            style={{ ...btn, border: 0, background: "#6366f1", color: "#fff" }}>확인하고 반영</button>
        </div>
      </div>
    ) : (
      <>
        <div data-apply-summary style={{ fontSize: 12, color: "var(--ct-text2)", lineHeight: 1.5, minWidth: 0, flex: 1 }}>
          <span style={{ color: "var(--ct-text)" }}>
            ① P0 <b>{summary.p0}</b> · ② 휴면 <b>{summary.dormant}</b>{summary.dormant > 0 ? ` (${parts(["resume", "pause", "close", "merge"])})` : ""}
            {" "}· ③ 차단 <b>{summary.blocked}</b>{summary.blocked > 0 ? ` (${parts(["unblock", "pause", "close", "merge"])})` : ""}
            {" "}· 선택 안 함 <b>{summary.unselected}</b>
          </span>
          <br />
          <span style={{ color: block && block !== "nothing" ? "#f59e0b" : undefined }}>
            {block ? APPLY_BLOCK_TEXT[block] : `P0 ${summary.p0}개 확정 → 고르지 않은 진행 P0 는 P1 로 내려갑니다. 고르지 않은 목표는 그대로 둡니다.`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(p.isMobile ? { flexDirection: "column-reverse", width: "100%" } : {}) }}>
          <button type="button" onClick={p.onClose} disabled={submitting}
            style={{ ...btn, fontWeight: 400, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)" }}>
            나중에 결정
          </button>
          <button type="button" data-apply disabled={block !== null || submitting} aria-disabled={block !== null || submitting} onClick={() => void apply(false)}
            style={{ ...btn, border: 0, background: "#6366f1", color: "#fff", opacity: block !== null || submitting ? 0.45 : 1, cursor: block !== null || submitting ? "default" : "pointer" }}>
            {submitting ? "반영하는 중…" : applyLabel}
          </button>
        </div>
      </>
    ),
    subtitle,
    banner,
  );
}
