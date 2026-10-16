"use client";

// 휴면·차단 정리 카드 — 승인 목업 dormancy-card_default / empty / error (b90bbca3, rev c22f3fb1).
// 표시 전용이다. 재개·일시정지·종료·병합 반영과 P0 3개 선택은 첫 정리(M4) 범위라 여기서 서버를 바꾸지 않는다.
import React, { useEffect, useState } from "react";
import {
  autoApprovalChip, dormantReasonLabel, idleLabel, priorityBadge, shortGoalTitle,
  type CleanupCandidates, type DormancyCardState, type GoalSignal,
} from "@/lib/goalStrip";

const BADGE_BG: Record<string, string> = { p0: "#b91c1c", p1: "#c2410c", p2: "#475569", other: "#475569" };

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

function GoalRow({ goal, lane, onOpenGoal, now }: {
  goal: GoalSignal; lane: "p0" | "dormant" | "blocked"; onOpenGoal: (goalId: string) => void; now: number;
}) {
  const noReason = lane === "blocked" && dormantReasonLabel(goal.dormant_reason);
  return (
    <div data-cleanup-row={goal.goal_id}
      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ct-border)", background: "var(--ct-bg)", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <Badge priority={goal.priority} />
        <span title={goal.title} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortGoalTitle(goal.title, goal.project)}
        </span>
        <button type="button" onClick={() => onOpenGoal(goal.goal_id)}
          style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 11, cursor: "pointer" }}>
          목표 열기
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        <span style={pill}>{lane === "blocked" ? "blocked" : "active"}</span>
        <span style={{ ...pill, color: "#f59e0b", borderColor: "rgba(245,158,11,.5)" }}>{idleLabel(goal.last_activity_at, now)}</span>
        {noReason && <span style={{ ...pill, color: "#f59e0b", borderColor: "rgba(245,158,11,.7)" }}>⚠️ {noReason}</span>}
        {(() => {
          const chip = autoApprovalChip(goal.auto_approval, now);
          return chip ? <span style={pill}>자동승인 {chip.text}</span> : null;
        })()}
      </div>
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
  pausedAutoApproval: GoalSignal[];
  openGoalCount: number | null;
  openP0Count: number | null;
  isMobile: boolean;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
  onOpenGoal: (goalId: string) => void;
}

export function DormancyCard(p: DormancyCardProps) {
  const [pausedOpen, setPausedOpen] = useState(false);
  const [p0More, setP0More] = useState(false);
  const now = useNow();
  const [gridRef, wideGrid] = useWideGrid();
  const { dormant, blocked, activeP0, total } = p.candidates;
  const P0_PREVIEW = 5;

  const frame = (body: React.ReactNode, footer: React.ReactNode, subtitle?: React.ReactNode) => (
    <section data-dormancy-card={p.state} aria-label="휴면·차단 목표 정리"
      style={{ margin: "8px 0 12px", border: "1px solid rgba(129,140,248,.55)", borderRadius: 14, background: "var(--ct-card)", overflow: "hidden" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--ct-border)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ct-text)" }}>💤 휴면·차단 목표 정리</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--ct-text2)", marginTop: 3 }}>{subtitle}</div>}
        </div>
        {p.state === "default" && (
          <div style={{ fontSize: 11.5, color: "#34d399", border: "1px solid rgba(52,211,153,.5)", borderRadius: 8, padding: "5px 9px", maxWidth: 320 }}>
            자동으로 종료·삭제되지 않습니다. 고른 것만 바뀌고, 나머지는 다음 주에 다시 묻습니다.
          </div>
        )}
      </header>
      {body}
      <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--ct-border)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        {footer}
      </footer>
    </section>
  );

  const closeBtn = (
    <button type="button" onClick={p.onClose}
      style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 12.5, cursor: "pointer" }}>
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
          style={{ padding: "6px 16px", borderRadius: 8, border: 0, background: "#6366f1", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: p.retrying ? "default" : "pointer", opacity: p.retrying ? 0.6 : 1 }}>
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

  const col = (title: React.ReactNode, hint: React.ReactNode, rows: React.ReactNode, count?: React.ReactNode) => (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ct-text)" }}>{title}</div>
        {count && <div style={{ fontSize: 11.5, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{count}</div>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ct-text2)", lineHeight: 1.5 }}>{hint}</div>
      {rows}
    </div>
  );

  const p0Shown = p0More ? activeP0 : activeP0.slice(0, P0_PREVIEW);
  const body = (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxHeight: p.isMobile ? "62vh" : "56vh", overflowY: "auto" }}>
      {p.pausedAutoApproval.length > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(245,158,11,.55)", background: "rgba(245,158,11,.08)", fontSize: 12.5, color: "var(--ct-text)", lineHeight: 1.6 }}>
          ⏸ 보류 목표 {p.pausedAutoApproval.length}개의 자동승인이 정지되어 있습니다 — 자동으로 승인되지 않고 승인 대기로 바뀝니다. 재개·차단 해소한 목표만 다시 켜집니다.{" "}
          <button type="button" onClick={() => setPausedOpen((v) => !v)}
            style={{ border: 0, background: "transparent", color: "#f59e0b", cursor: "pointer", fontSize: 12.5, padding: 0 }}>
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
          "① 진행 P0 (상한 3개)",
          "진행 중인 P0 목표입니다. P0 3개를 고르는 일은 첫 정리 단계에서 열립니다. 고른 P0 는 ②·③ 에 다시 나오지 않습니다.",
          <>
            {activeP0.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>진행 중인 P0 가 없습니다.</div>
              : p0Shown.map((g) => <GoalRow key={g.goal_id} goal={g} lane="p0" onOpenGoal={p.onOpenGoal} now={now} />)}
            {activeP0.length > P0_PREVIEW && (
              <button type="button" onClick={() => setP0More((v) => !v)}
                style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "var(--ct-text2)", fontSize: 11.5, cursor: "pointer", padding: 0 }}>
                {p0More ? "접기 ▴" : `나머지 진행 P0 ${activeP0.length - P0_PREVIEW}개 보기 ▾`}
              </button>
            )}
          </>,
          `진행 P0 ${activeP0.length}개`,
        )}
        {col(
          `② 휴면 후보 ${dormant.length}개`,
          "14일 넘게 활동이 없는 진행(active) 목표입니다. 차단(blocked) 목표는 여기 없고 ③ 에서 따로 묻습니다.",
          dormant.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>휴면 후보가 없습니다.</div>
            : dormant.map((g) => <GoalRow key={g.goal_id} goal={g} lane="dormant" onOpenGoal={p.onOpenGoal} now={now} />),
        )}
        {col(
          <>③ 차단 해소 또는 종료 <span style={{ fontSize: 11, color: "var(--ct-text2)", fontWeight: 400 }}>blocked {blocked.length}개</span></>,
          <>blocked 는 휴면으로 세지 않고 <span style={{ color: "#f59e0b" }}>따로</span> 묻습니다. 차단 사유가 없으면 경고로 표시합니다.</>,
          blocked.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>차단된 후보가 없습니다.</div>
            : blocked.map((g) => <GoalRow key={g.goal_id} goal={g} lane="blocked" onOpenGoal={p.onOpenGoal} now={now} />),
        )}
      </div>
    </div>
  );

  const subtitle = p.openGoalCount !== null
    ? `열린 목표 ${p.openGoalCount}개 중 정리 후보 ${total}개 = 휴면 active ${dormant.length} + 차단 blocked ${blocked.length}${p.openP0Count !== null ? ` · 열린 P0 ${p.openP0Count}개(진행 P0 상한 3)` : ""}`
    : `정리 후보 ${total}개 = 휴면 active ${dormant.length} + 차단 blocked ${blocked.length}`;

  return frame(
    body,
    <>
      <div style={{ fontSize: 12, color: "var(--ct-text2)", lineHeight: 1.5, minWidth: 0, flex: 1 }}>
        ② 휴면 {dormant.length} · ③ 차단 {blocked.length}. 재개·일시정지·종료·병합 반영은 첫 정리 단계에서 열립니다. 지금은 아무것도 바뀌지 않습니다.
      </div>
      {closeBtn}
    </>,
    subtitle,
  );
}
