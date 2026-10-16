"use client";

// 채팅 상단 목표 띠 — 승인 목업 goal-strip_default / goal-strip_icons-option (b90bbca3, rev c22f3fb1).
// 정렬·아이콘·자동승인 판정은 src/lib/goalStrip.ts 의 순수 함수가 한다. 여기는 그리기만 한다.
import React, { useEffect, useState } from "react";
import {
  activityIcon, autoApprovalChip, autoApprovalDetailRows, autoApprovalHint, cleanupChipLabel,
  groupStripGoals, p0IdleDays, priorityBadge, shortGoalTitle, unlinkedChipLabel,
  type AutoApprovalChip, type StripChipGoal, type StripGroup,
} from "@/lib/goalStrip";

const VISIBLE_CHIPS = 4;

const BADGE_BG: Record<string, string> = { p0: "#b91c1c", p1: "#c2410c", p2: "#475569", other: "#475569" };
const AA_STYLE: Record<AutoApprovalChip["tone"], { color: string; border: string; bg: string; dashed?: boolean }> = {
  manual: { color: "var(--ct-text2)", border: "var(--ct-border)", bg: "transparent" },
  auto: { color: "#34d399", border: "rgba(52,211,153,.55)", bg: "rgba(16,185,129,.10)" },
  strong: { color: "#ecfdf5", border: "#059669", bg: "#047857" },
  warn: { color: "#f59e0b", border: "rgba(245,158,11,.65)", bg: "rgba(245,158,11,.10)" },
  off: { color: "var(--ct-text2)", border: "var(--ct-border)", bg: "transparent", dashed: true },
  info: { color: "#a5b4fc", border: "rgba(129,140,248,.55)", bg: "rgba(99,102,241,.12)" },
  paused: { color: "var(--ct-text2)", border: "var(--ct-border)", bg: "rgba(148,163,184,.12)" },
};

function Badge({ priority }: { priority: string | null | undefined }) {
  const b = priorityBadge(priority);
  if (!b) return null;
  return (
    <span style={{
      flexShrink: 0, padding: "0 5px", borderRadius: 4, fontSize: 9.5, fontWeight: 800, lineHeight: "15px",
      color: "#fff", background: BADGE_BG[b.tone], letterSpacing: b.critical ? 0.2 : 0,
      border: b.critical ? "1px solid #fca5a5" : "none",
    }}>{b.text}</span>
  );
}

function AutoApprovalPill({ chip, title, onClick, block }: {
  chip: AutoApprovalChip; title: string; onClick: () => void; block?: boolean;
}) {
  const st = AA_STYLE[chip.tone];
  return (
    <button type="button" title={title} onClick={onClick}
      aria-label={`자동승인 ${chip.text}`}
      style={{
        flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap",
        padding: block ? "3px 9px" : "1px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
        color: st.color, background: st.bg, border: `1px ${st.dashed ? "dashed" : "solid"} ${st.border}`,
      }}>
      {chip.text}{chip.warn ? " ⚠️" : ""}
    </button>
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

export interface GoalStripProps {
  goals: StripChipGoal[];
  halted: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelGoalId: string | null;
  onToggleGoal: (goalId: string) => void;
  summary: { open: number; p0: number } | null;
  unlinkedCount: number;
  cleanupTotal: number;
  cardOpen: boolean;
  onToggleCard: () => void;
  signalsError: boolean;
  isMobile: boolean;
}

export function GoalStrip(p: GoalStripProps) {
  const { goals, open, panelGoalId, isMobile } = p;
  const [aaGoalId, setAaGoalId] = useState<string | null>(null);
  const groups = groupStripGoals(goals);
  const flat = groups.flatMap((g) => g.goals);
  const keepVisible = (g: StripChipGoal, i: number) =>
    i < VISIBLE_CHIPS || Boolean(g.dispatch_note) || Boolean(g.is_lead) || Boolean(g.activity);
  const shown = open ? flat : flat.filter(keepVisible);
  const hidden = flat.length - shown.length;
  const now = useNow();
  const aaGoal = aaGoalId ? goals.find((g) => g.goal_id === aaGoalId) || null : null;
  const cleanupLabel = p.signalsError ? null : cleanupChipLabel(p.cleanupTotal, isMobile);
  const unlinkedLabel = unlinkedChipLabel(p.unlinkedCount);

  const chipColor = (g: StripChipGoal) =>
    g.dispatch_note ? "#dc2626" : g.is_lead ? "#d97706" : g.status === "active" ? "#2563eb" : "#64748b";

  const leadIcon = (g: StripChipGoal): string => {
    const a = activityIcon(g.activity);
    if (a) return a;
    return g.dormant ? "💤" : g.is_lead ? "👑" : "●";
  };

  const aaChip = (g: StripChipGoal, block = false) => {
    const chip = autoApprovalChip(g.auto_approval, now);
    if (!chip || !g.auto_approval) return null;
    const rows = autoApprovalDetailRows(g.auto_approval, now);
    const title = [`자동승인 — ${g.title}`, ...rows.map((r) => `${r.label}: ${r.value}`), autoApprovalHint(g.auto_approval) || ""]
      .filter(Boolean).join("\n");
    return <AutoApprovalPill chip={chip} title={title} block={block}
      onClick={() => setAaGoalId(aaGoalId === g.goal_id ? null : g.goal_id)} />;
  };

  const chip = (g: StripChipGoal) => {
    const c = chipColor(g);
    const isOpen = panelGoalId === g.goal_id;
    const idle = p0IdleDays(g, now);
    const name = shortGoalTitle(g.title, g.project);
    const pct = Math.round(Number(g.progress || 0) <= 1 ? Number(g.progress || 0) * 100 : Number(g.progress || 0));
    const runner = g.activity && g.current_runner ? `\n${activityIcon(g.activity)} 러너 ${g.current_runner.job_id} · ${g.current_runner.status}` : "";
    return (
      <span key={g.goal_id} data-goal-chip={g.goal_id}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, maxWidth: 360,
          padding: g.is_lead ? "3px 8px 3px 10px" : "3px 7px 3px 9px", borderRadius: 999,
          border: `${g.is_lead ? 2 : 1}px ${g.dormant ? "dashed" : "solid"} ${c}`,
          background: isOpen ? "rgba(37,99,235,.10)" : g.is_lead ? "rgba(217,119,6,.08)" : "var(--ct-card)",
          fontSize: g.is_lead ? 11.5 : 11, whiteSpace: "nowrap",
        }}>
        <button type="button"
          title={`${g.is_lead ? "주도 목표 — 이 창이 취합하고 판정합니다" : "담당 목표 — 맡은 몫을 진행합니다"}\n${g.title}${g.dormant ? "\n💤 14일 넘게 활동이 없어 휴면으로 표시됩니다" : ""}${g.dispatch_note ? `\n막힘: ${g.dispatch_note}` : ""}${runner}`}
          onClick={() => p.onToggleGoal(g.goal_id)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, padding: 0, border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "inherit" }}>
          <span aria-hidden>{leadIcon(g)}</span>
          <Badge priority={g.priority} />
          <span style={{ fontWeight: 800, color: c, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          <span style={{ color: "var(--ct-text2)" }}>{pct}%</span>
          {g.is_lead && g.milestone && (
            <span style={{ color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>· {g.milestone}</span>
          )}
          {idle !== null && <span style={{ color: "#f59e0b", fontWeight: 700 }}>⚠️ {idle}일</span>}
          {g.dispatch_note && <span style={{ color: "#dc2626", fontWeight: 700 }}>· 막힘</span>}
        </button>
        {aaChip(g)}
      </span>
    );
  };

  const row = (g: StripChipGoal) => {
    const idle = p0IdleDays(g, now);
    const pct = Math.round(Number(g.progress || 0) <= 1 ? Number(g.progress || 0) * 100 : Number(g.progress || 0));
    const isOpen = panelGoalId === g.goal_id;
    return (
      <div key={g.goal_id} data-goal-row={g.goal_id}
        style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 35, padding: "0 10px",
                 borderBottom: "1px solid var(--ct-border)", background: isOpen ? "rgba(37,99,235,.10)" : "transparent" }}>
        <button type="button" onClick={() => p.onToggleGoal(g.goal_id)} title={g.title}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: 0, border: 0, background: "transparent",
                   cursor: "pointer", font: "inherit", fontSize: 12.5, color: "var(--ct-text)", textAlign: "left", whiteSpace: "nowrap" }}>
          <span aria-hidden>{leadIcon(g)}</span>
          <Badge priority={g.priority} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontWeight: g.is_lead ? 800 : 500 }}>{shortGoalTitle(g.title, g.project)}</span>
          <span style={{ color: "var(--ct-text2)", fontSize: 11 }}>{pct}%</span>
          {idle !== null && <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>⚠️{idle}일</span>}
          {g.dispatch_note && <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 700 }}>막힘</span>}
        </button>
        {aaChip(g, true)}
      </div>
    );
  };

  const summaryChip = p.summary && (
    <span style={{ flexShrink: 0, padding: "3px 10px", borderRadius: 999, border: "1px solid var(--ct-border)", background: "var(--ct-card)",
                   fontSize: 11, fontWeight: 600, color: "var(--ct-text)", whiteSpace: "nowrap" }}>
      {isMobile ? "열린" : "열린 목표"} {p.summary.open} · P0 <b style={{ color: "#f59e0b" }}>{p.summary.p0}</b>
    </span>
  );
  const unlinkedChip = unlinkedLabel && (
    <span title="이 대화가 최근 48시간에 제출했지만 어떤 목표에도 연결되지 않은 러너 작업입니다"
      style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 999, border: "1px dashed var(--ct-border)", fontSize: 11,
               color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{unlinkedLabel}</span>
  );
  const cleanupChip = cleanupLabel && (
    <button type="button" onClick={p.onToggleCard} aria-pressed={p.cardOpen}
      title="14일 넘게 멈춘 목표와 차단된 목표를 한 번에 정리합니다. 자동으로 종료·삭제되지 않습니다."
      style={{ padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(129,140,248,.7)", fontSize: 11, fontWeight: 700,
               color: "#c7d2fe", background: p.cardOpen ? "rgba(99,102,241,.35)" : "rgba(99,102,241,.16)", cursor: "pointer", whiteSpace: "nowrap" }}>
      {cleanupLabel}
    </button>
  );
  const errorChip = p.signalsError && (
    <button type="button" onClick={p.onToggleCard} aria-pressed={p.cardOpen}
      title="자동승인·정리 후보 정보를 불러오지 못했습니다. 눌러서 다시 시도합니다."
      style={{ padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(245,158,11,.7)", fontSize: 11, fontWeight: 700,
               color: "#f59e0b", background: p.cardOpen ? "rgba(245,158,11,.25)" : "rgba(245,158,11,.10)", cursor: "pointer", whiteSpace: "nowrap" }}>
      ⚠️ {isMobile ? "상태 확인 실패" : "자동승인·정리 상태 확인 실패"}
    </button>
  );
  const needsToggle = hidden > 0 || (open && flat.length > VISIBLE_CHIPS);

  const groupHeader = (g: StripGroup<StripChipGoal>) => (
    <span key={`h-${g.key}`} style={{ flexShrink: 0, alignSelf: "center", paddingLeft: 8, marginLeft: 2, borderLeft: "1px solid var(--ct-border)",
                                       fontSize: 10.5, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>
      {g.label} {g.goals.length}
    </span>
  );

  const sheet = aaGoal && aaGoal.auto_approval && (
    <div role="dialog" aria-label={`자동승인 상세 — ${aaGoal.title}`}
      style={isMobile
        ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, padding: "14px 14px 18px", background: "var(--ct-card)",
            borderTop: "1px solid rgba(129,140,248,.6)", borderRadius: "14px 14px 0 0", boxShadow: "0 -8px 24px rgba(0,0,0,.35)" }
        : { position: "absolute", left: 12, top: "100%", zIndex: 30, width: 300, padding: "10px 12px", background: "var(--ct-card)",
            border: "1px solid var(--ct-border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, color: "var(--ct-text)" }}>
        {autoApprovalChip(aaGoal.auto_approval)?.text.split(" ")[0]} 자동승인 — {shortGoalTitle(aaGoal.title, aaGoal.project)}
      </div>
      {autoApprovalDetailRows(aaGoal.auto_approval).map((r) => (
        <div key={r.label} style={{ display: "flex", gap: 10, fontSize: 12, padding: "2px 0" }}>
          <span style={{ width: 52, color: "var(--ct-text2)", flexShrink: 0 }}>{r.label}</span>
          <span style={{ color: "var(--ct-text)" }}>{r.value}</span>
        </div>
      ))}
      {autoApprovalHint(aaGoal.auto_approval) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ct-border)", fontSize: 11.5, color: "#f59e0b" }}>
          {autoApprovalHint(aaGoal.auto_approval)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => { if (panelGoalId !== aaGoal.goal_id) p.onToggleGoal(aaGoal.goal_id); setAaGoalId(null); }}
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 12, cursor: "pointer" }}>
          목표 열기
        </button>
        <button type="button" onClick={() => setAaGoalId(null)}
          style={{ padding: "7px 14px", borderRadius: 8, border: 0, background: "transparent", color: "var(--ct-text2)", fontSize: 12, cursor: "pointer" }}>
          닫기
        </button>
      </div>
    </div>
  );

  const toggles = needsToggle && (
    <>
      {hidden > 0 && (
        <button type="button" onClick={() => p.onOpenChange(true)}
          title={flat.filter((g) => !shown.includes(g)).map((g) => g.title).join("\n")}
          style={{ padding: "3px 9px", borderRadius: 999, border: "1px dashed var(--ct-border)", background: "transparent",
                   color: "var(--ct-text2)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          목표 +{hidden}
        </button>
      )}
      {open && flat.length > VISIBLE_CHIPS && (
        <button type="button" onClick={() => p.onOpenChange(false)}
          style={{ padding: "3px 7px", borderRadius: 999, border: 0, background: "transparent", color: "var(--ct-text2)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          접기
        </button>
      )}
    </>
  );

  const halted = p.halted && (
    <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", padding: "3px 9px", borderRadius: 999, border: "1px solid #dc2626", flexShrink: 0, whiteSpace: "nowrap" }}>
      전체 정지 중 — 조사만 가능합니다
    </span>
  );

  if (isMobile && open) {
    return (
      <div data-goal-strip="mobile-open" style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", flexWrap: "wrap" }}>
          {halted}{summaryChip}{unlinkedChip}
          <span style={{ flex: 1 }} />
          {errorChip}{cleanupChip}{toggles}
        </div>
        <div style={{ maxHeight: "46vh", overflowY: "auto", borderTop: "1px solid var(--ct-border)" }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: "0 10px", height: 22, display: "flex", alignItems: "center", fontSize: 10.5, color: "var(--ct-text2)" }}>
                {g.label} {g.goals.length}
              </div>
              {g.goals.map(row)}
            </div>
          ))}
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <div data-goal-strip={isMobile ? "mobile" : "desktop"}
      style={{ position: "relative", display: "flex", flexWrap: "nowrap", gap: 6, alignItems: "flex-start" }}>
      {halted}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: open ? "wrap" : "nowrap", gap: 6, alignItems: "center",
                    maxHeight: open ? 290 : undefined, overflowX: open ? "hidden" : "auto", overflowY: open ? "auto" : "hidden" }}>
        {summaryChip}{unlinkedChip}
        {open
          ? groups.map((g) => (
              <React.Fragment key={g.key}>
                {groupHeader(g)}
                {g.goals.map(chip)}
              </React.Fragment>
            ))
          : shown.map(chip)}
      </div>
      {(errorChip || cleanupChip || needsToggle) && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>{errorChip}{cleanupChip}{toggles}</div>
      )}
      {sheet}
    </div>
  );
}
