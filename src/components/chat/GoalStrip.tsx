"use client";

// 채팅 상단 목표 띠 — 한 줄 드롭다운 버튼 + 진행 우선순 목록.
// 정본: PRD aads-goal-strip-dropdown-prd rev1, 설계 명세 aads-goal-strip-dropdown-spec rev1 §3-2,
//       시안 20261022_goal_strip_dropdown/goal-dropdown_*.html (목업 검토 ba4a0f2e, rev1).
// 분류·정렬·순서 고정은 src/lib/goalStrip.ts 의 순수 함수가 한다. 여기는 그리기와 열림·키보드만 한다.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  activityIcon, autoApprovalChip, autoApprovalDetailRows, autoApprovalHint, cleanupChipLabel,
  dropdownGroupOf, dropdownTriggerSummary, freezeOrder, goalDisplayTitle, groupDropdownGoals, nextOptionIndex,
  p0IdleDays, priorityBadge, progressPct, shortGoalTitle, sortDropdownGoals, unlinkedChipLabel,
  type AutoApprovalChip, type DropdownGroupKey, type StripChipGoal,
} from "@/lib/goalStrip";

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

type FrozenView = { ids: string[]; groups: Record<string, DropdownGroupKey> };

const COUNT_CHIP: Record<"working" | "awaiting" | "blocked", { bg: string; color: string }> = {
  working: { bg: "rgba(59,130,246,.18)", color: "#93c5fd" },
  awaiting: { bg: "rgba(245,158,11,.16)", color: "#fbbf24" },
  blocked: { bg: "rgba(220,38,38,.18)", color: "#fca5a5" },
};
const BAR_FILL = "#2563eb";
const BLOCKED_TEXT = "#fca5a5";
const IDLE_TEXT = "#f59e0b";
const MUTED = "var(--ct-text2)";

/** 줄 아이콘: 멈춤이면 ⏸ (돌던 러너가 있으면 🔄·⏳ 를 함께), 아니면 러너 상태 → 막힘 → 휴면 → ●. */
function rowIcon(g: StripChipGoal, group: DropdownGroupKey): string {
  const act = activityIcon(g.activity);
  if (g.goal_paused) return act ? `⏸${act}` : "⏸";
  if (act) return act;
  if (group === "blocked") return "⛔";
  if (group === "dormant" || g.dormant) return "💤";
  return "●";
}

function ProgressBar({ pct, width = 48 }: { pct: number; width?: number }) {
  return (
    <span aria-hidden style={{ flexShrink: 0, display: "inline-block", width, height: 4, borderRadius: 2, background: "var(--ct-border)", overflow: "hidden" }}>
      <i style={{ display: "block", height: "100%", width: `${pct}%`, background: BAR_FILL }} />
    </span>
  );
}

interface DetailPart { text: string; color: string }

/** 둘째 줄 조각. 모바일은 막힘·멈춤 사유만. */
function detailParts(g: StripChipGoal, now: number, mobile: boolean): DetailPart[] {
  const parts: DetailPart[] = [];
  const note = (g.dispatch_note || "").trim();
  if (!mobile && g.milestone) parts.push({ text: g.milestone, color: MUTED });
  if (note) parts.push({ text: `막힘: ${note}`, color: BLOCKED_TEXT });
  else if (String(g.status || "").toLowerCase() === "blocked") {
    parts.push({ text: "목표 상태 차단(blocked) — 사유·해제 조건은 목표 패널", color: BLOCKED_TEXT });
  }
  if (g.goal_paused) parts.push({ text: `⏸ 멈춤 — ${(g.goal_paused_reason || "").trim() || "사유 없음"}`, color: "var(--ct-text)" });
  if (!mobile) {
    if (g.activity && g.current_runner) {
      parts.push({ text: `${activityIcon(g.activity)} 러너 ${g.current_runner.job_id} · ${g.current_runner.status}`, color: MUTED });
    }
    const idle = p0IdleDays(g, now);
    if (idle !== null) parts.push({ text: `⚠️ ${idle}일 무활동`, color: IDLE_TEXT });
  }
  return parts;
}

export function GoalStrip(p: GoalStripProps) {
  const { goals, open, panelGoalId, isMobile, onOpenChange } = p;
  const [aaGoalId, setAaGoalId] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const now = useNow();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => dropdownTriggerSummary(goals), [goals]);
  const top = summary.top;

  // 열린 동안 순서·그룹을 고정한다. 값(진행률·아이콘·막힘)은 새 goals 로 갱신하고 새 목표는 자기 그룹 끝에 붙는다.
  useEffect(() => {
    if (!open) { setFrozen(null); return; }
    setFrozen((prev) => {
      const ordered = prev ? freezeOrder(prev.ids, goals) : sortDropdownGoals(goals);
      const ids = ordered.map((g) => g.goal_id);
      const groups: Record<string, DropdownGroupKey> = {};
      for (const g of ordered) groups[g.goal_id] = prev?.groups[g.goal_id] ?? dropdownGroupOf(g);
      if (prev && ids.join("|") === prev.ids.join("|") && ids.every((id) => prev.groups[id] === groups[id])) return prev;
      return { ids, groups };
    });
  }, [open, goals]);

  const view = useMemo(() => {
    if (!open) return null;
    const ordered = frozen ? freezeOrder(frozen.ids, goals) : sortDropdownGoals(goals);
    const keyOf = (g: StripChipGoal) => frozen?.groups[g.goal_id] ?? dropdownGroupOf(g);
    const groups = groupDropdownGoals(ordered, keyOf);
    return { groups, flat: groups.flatMap((g) => g.goals), keyOf };
  }, [open, frozen, goals]);

  const flat = view?.flat ?? [];
  const selectedIdx = flat.findIndex((g) => g.goal_id === panelGoalId);
  const focusIdx = flat.findIndex((g) => g.goal_id === focusId);
  const activeIdx = focusIdx >= 0 ? focusIdx : selectedIdx >= 0 ? selectedIdx : 0;

  const close = (returnFocus = true) => {
    setAaGoalId(null);
    onOpenChange(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // 열리면 선택된 줄(없으면 첫 줄)로 포커스를 옮긴다.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const opts = list.querySelectorAll<HTMLElement>('[role="option"]');
    (opts[selectedIdx >= 0 ? selectedIdx : 0] ?? null)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 데스크톱: 바깥 pointerdown 으로 닫는다 (모바일은 스크림이 맡는다). 포커스는 건드리지 않는다.
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        setAaGoalId(null);
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, isMobile, onOpenChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      if (aaGoalId) setAaGoalId(null);
      else close(true);
      return;
    }
    const opts = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const cur = opts.findIndex((o) => o === document.activeElement);
    const next = nextOptionIndex(e.key, cur, opts.length);
    if (next !== null) {
      e.preventDefault();
      opts[next]?.focus();
    }
  };

  const selectGoal = (goalId: string) => {
    p.onToggleGoal(goalId);
    close(true);
  };

  const aaGoal = aaGoalId ? goals.find((g) => g.goal_id === aaGoalId) || null : null;
  const cleanupLabel = p.signalsError ? null : cleanupChipLabel(p.cleanupTotal, isMobile);
  const unlinkedLabel = unlinkedChipLabel(p.unlinkedCount);

  const aaChip = (g: StripChipGoal) => {
    const chip = autoApprovalChip(g.auto_approval, now);
    if (!chip || !g.auto_approval) return null;
    const rows = autoApprovalDetailRows(g.auto_approval, now);
    const title = [`자동승인 — ${g.title}`, ...rows.map((r) => `${r.label}: ${r.value}`), autoApprovalHint(g.auto_approval) || ""]
      .filter(Boolean).join("\n");
    return <AutoApprovalPill chip={chip} title={title} block
      onClick={() => setAaGoalId(aaGoalId === g.goal_id ? null : g.goal_id)} />;
  };

  const row = (g: StripChipGoal, group: DropdownGroupKey, idx: number) => {
    const selected = panelGoalId === g.goal_id;
    const pct = progressPct(g.progress);
    const parts = detailParts(g, now, isMobile);
    const runner = g.activity && g.current_runner ? `\n${activityIcon(g.activity)} 러너 ${g.current_runner.job_id} · ${g.current_runner.status}` : "";
    return (
      <div key={g.goal_id} role="none" data-goal-row={g.goal_id}
        style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--ct-border)",
                 background: selected ? "rgba(37,99,235,.14)" : "transparent",
                 boxShadow: selected ? "inset 3px 0 0 #2563eb" : undefined }}>
        <button type="button" role="option" aria-selected={selected} tabIndex={idx === activeIdx ? 0 : -1}
          onFocus={() => setFocusId(g.goal_id)}
          onClick={() => selectGoal(g.goal_id)}
          title={`${g.is_lead ? "주도 목표 — 이 창이 취합하고 판정합니다" : "담당 목표 — 맡은 몫을 진행합니다"}\n${g.title}${g.dormant ? "\n💤 14일 넘게 활동이 없어 휴면으로 표시됩니다" : ""}${runner}`}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, minHeight: isMobile ? 52 : 44, padding: "6px 0 6px 12px",
                   border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--ct-text)", textAlign: "left" }}>
          <span aria-hidden style={{ flexShrink: 0, minWidth: 18, textAlign: "center", fontSize: 12, color: MUTED }}>{rowIcon(g, group)}</span>
          <Badge priority={g.priority} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: g.is_lead ? 800 : 600 }}>
                {goalDisplayTitle(g.title, g.project)}
              </span>
              {g.is_lead && <span style={{ flexShrink: 0, fontSize: 10, color: "#d97706" }}>👑 주도</span>}
            </span>
            {parts.length > 0 && (
              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, marginTop: 1 }}>
                {parts.map((t, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: MUTED }}> · </span>}
                    <span style={{ color: t.color }}>{t.text}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
          </span>
          <ProgressBar pct={pct} />
          <span style={{ flexShrink: 0, minWidth: 28, textAlign: "right", fontSize: 11, color: MUTED }}>{pct}%</span>
        </button>
        <span style={{ flexShrink: 0, paddingRight: 12 }}>{aaChip(g)}</span>
      </div>
    );
  };

  const toolButtonStyle: React.CSSProperties = {
    flexShrink: 0, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  };

  const cleanupChip = cleanupLabel && (
    <button type="button" onClick={p.onToggleCard} aria-pressed={p.cardOpen}
      title="14일 넘게 멈춘 목표와 차단된 목표를 한 번에 정리합니다. 자동으로 종료·삭제되지 않습니다."
      style={{ ...toolButtonStyle, border: "1px solid rgba(129,140,248,.7)", color: "#c7d2fe",
               background: p.cardOpen ? "rgba(99,102,241,.35)" : "rgba(99,102,241,.16)" }}>
      {cleanupLabel}
    </button>
  );
  const errorChip = p.signalsError && (
    <button type="button" onClick={p.onToggleCard} aria-pressed={p.cardOpen}
      title="자동승인·정리 후보 정보를 불러오지 못했습니다. 눌러서 다시 시도합니다."
      style={{ ...toolButtonStyle, border: "1px solid rgba(245,158,11,.7)", color: "#f59e0b",
               background: p.cardOpen ? "rgba(245,158,11,.25)" : "rgba(245,158,11,.10)" }}>
      ⚠️ {isMobile ? "상태 확인 실패" : "자동승인·정리 상태 확인 실패"}
    </button>
  );
  const haltedBadge = p.halted && (
    <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", padding: "3px 9px", borderRadius: 999, border: "1px solid #dc2626", flexShrink: 0, whiteSpace: "nowrap" }}>
      전체 정지 중 — 조사만 가능합니다
    </span>
  );

  const trigger = (
    <button ref={triggerRef} type="button" data-goal-trigger
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-label={`목표 ${summary.total}건${top ? `, 1순위 ${top.title}` : ""}`}
      title={top ? top.title : undefined}
      onClick={() => (open ? close(true) : onOpenChange(true))}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, height: isMobile ? 36 : 32, minWidth: 0,
        maxWidth: isMobile ? undefined : 660, flex: isMobile ? 1 : undefined, padding: "0 10px 0 12px", borderRadius: 999,
        border: `1px solid ${open ? "#2563eb" : "var(--ct-border)"}`, background: "var(--ct-card)", color: "var(--ct-text)",
        boxShadow: open ? "0 0 0 2px rgba(37,99,235,.25)" : undefined, fontSize: 12, whiteSpace: "nowrap", cursor: "pointer", font: "inherit",
      }}>
      <span style={{ flexShrink: 0 }}>🎯 <b>{isMobile ? summary.total : `목표 ${summary.total}`}</b></span>
      {(["working", "awaiting", "blocked"] as const).map((k) => summary[k] > 0 && (
        <span key={k} style={{ flexShrink: 0, padding: "0 6px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, lineHeight: "17px",
                               background: COUNT_CHIP[k].bg, color: COUNT_CHIP[k].color }}>
          {k === "working" ? "🔄" : k === "awaiting" ? "⏳" : "⛔"}{summary[k]}
        </span>
      ))}
      {top && (
        <>
          <span aria-hidden style={{ flexShrink: 0, width: 1, height: 16, background: "var(--ct-border)" }} />
          <span aria-hidden style={{ flexShrink: 0 }}>{rowIcon(top, dropdownGroupOf(top))}</span>
          {!isMobile && <Badge priority={top.priority} />}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 700 }}>
            {isMobile ? shortGoalTitle(top.title, top.project) : goalDisplayTitle(top.title, top.project)}
          </span>
          {!isMobile && <ProgressBar pct={progressPct(top.progress)} />}
          {!isMobile && <span style={{ flexShrink: 0, minWidth: 28, textAlign: "right", fontSize: 11, color: MUTED }}>{progressPct(top.progress)}%</span>}
        </>
      )}
      <span aria-hidden style={{ flexShrink: 0, fontSize: 11, color: MUTED }}>{open ? "▴" : "▾"}</span>
    </button>
  );

  const head = (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "10px 12px 8px", borderBottom: "1px solid var(--ct-border)", fontSize: 12.5, fontWeight: 700 }}>
      <span>이 대화의 목표 {summary.total}</span>
      {p.summary && (
        <span style={{ fontWeight: 400, color: MUTED }}>
          · 전체 열린 목표 {p.summary.open} · P0 <b style={{ color: IDLE_TEXT }}>{p.summary.p0}</b>
        </span>
      )}
      {isMobile && (
        <button type="button" aria-label="닫기" onClick={() => close(true)}
          style={{ marginLeft: "auto", minWidth: 44, minHeight: 32, padding: "0 4px", border: 0, background: "transparent", color: MUTED, fontSize: 16, cursor: "pointer" }}>
          ✕
        </button>
      )}
    </div>
  );

  const list = view && (
    <div ref={listRef} id={listId} role="listbox" aria-label="이 대화의 목표"
      style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {view.groups.length === 0 && (
        <div style={{ padding: "26px 18px", color: MUTED, fontSize: 12.5, lineHeight: 1.7, textAlign: "center" }}>
          이 대화에 연결된 목표가 없습니다. 목표 화면에서 담당으로 연결하면 여기에 보입니다.
        </div>
      )}
      {view.groups.map((grp) => (
        <div key={grp.key} role="group" aria-label={grp.label}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 12px", fontSize: 11, fontWeight: 700,
                        color: MUTED, background: "var(--ct-bg)", borderBottom: "1px solid var(--ct-border)" }}>
            {grp.label} <span style={{ color: "var(--ct-text)" }}>{grp.goals.length}</span>
          </div>
          {grp.goals.map((g) => row(g, grp.key, flat.indexOf(g)))}
        </div>
      ))}
    </div>
  );

  const errorLine = view && p.signalsError && (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: "1px solid var(--ct-border)", fontSize: 11.5, color: IDLE_TEXT }}>
      <span>⚠️ 자동승인·정리 상태를 불러오지 못했습니다</span>
      <button type="button" onClick={() => { p.onToggleCard(); close(false); }}
        style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)", fontSize: 11.5, cursor: "pointer" }}>
        다시 시도
      </button>
    </div>
  );

  const tools = view && (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "9px 12px", borderTop: "1px solid var(--ct-border)", fontSize: 11.5 }}>
      {cleanupLabel && (
        <button type="button" onClick={() => { p.onToggleCard(); close(false); }}
          title="14일 넘게 멈춘 목표와 차단된 목표를 한 번에 정리합니다. 자동으로 종료·삭제되지 않습니다."
          style={{ ...toolButtonStyle, minHeight: isMobile ? 36 : undefined, border: "1px solid rgba(129,140,248,.7)", color: "#c7d2fe", background: "rgba(99,102,241,.16)" }}>
          {cleanupChipLabel(p.cleanupTotal)}
        </button>
      )}
      {unlinkedLabel && (
        <span title="이 대화가 최근 48시간에 제출했지만 어떤 목표에도 연결되지 않은 러너 작업입니다"
          style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 999, border: "1px dashed var(--ct-border)", color: MUTED, whiteSpace: "nowrap" }}>
          {unlinkedLabel}
        </span>
      )}
      <a href="/goals" style={{ marginLeft: "auto", color: "#93c5fd", textDecoration: "none", whiteSpace: "nowrap" }}>목표 화면 전체 보기 →</a>
    </div>
  );

  const popupBody = (
    <>
      {head}
      {list}
      {errorLine}
      {tools}
    </>
  );

  const popover = open && view && !isMobile && (
    <div role="dialog" aria-label="이 대화의 목표 목록" data-goal-dropdown="desktop"
      style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 30, width: 440, maxWidth: "calc(100vw - 24px)",
               maxHeight: "min(60vh, 520px)", display: "flex", flexDirection: "column", overflow: "hidden",
               background: "var(--ct-card)", border: "1px solid var(--ct-border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.6)" }}>
      {popupBody}
    </div>
  );

  const bottomSheet = open && view && isMobile && (
    <>
      <div data-goal-scrim onClick={() => close(true)} aria-hidden
        style={{ position: "fixed", inset: 0, zIndex: 59, background: "rgba(0,0,0,.55)" }} />
      <div role="dialog" aria-label="이 대화의 목표 목록" data-goal-dropdown="mobile"
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, maxHeight: "70vh", display: "flex", flexDirection: "column",
                 overflow: "hidden", paddingBottom: 18, background: "var(--ct-card)", borderTop: "1px solid var(--ct-border)",
                 borderRadius: "14px 14px 0 0", boxShadow: "0 -8px 24px rgba(0,0,0,.45)" }}>
        <div aria-hidden style={{ flexShrink: 0, width: 40, height: 4, borderRadius: 2, background: "var(--ct-border)", margin: "8px auto 2px" }} />
        {popupBody}
      </div>
    </>
  );

  const sheet = aaGoal && aaGoal.auto_approval && (
    <div role="dialog" aria-label={`자동승인 상세 — ${aaGoal.title}`}
      style={isMobile
        ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61, padding: "14px 14px 18px", background: "var(--ct-card)",
            borderTop: "1px solid rgba(129,140,248,.6)", borderRadius: "14px 14px 0 0", boxShadow: "0 -8px 24px rgba(0,0,0,.35)" }
        : { position: "absolute", left: 70, top: "calc(100% + 6px)", zIndex: 40, width: 300, padding: "10px 12px", background: "var(--ct-card)",
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
        <button type="button" onClick={() => { const id = aaGoal.goal_id; setAaGoalId(null); if (panelGoalId !== id) p.onToggleGoal(id); close(true); }}
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

  return (
    <div ref={wrapRef} data-goal-strip={isMobile ? "mobile" : "desktop"} onKeyDown={onKeyDown}
      style={{ position: "relative", display: "flex", flexWrap: "nowrap", gap: 8, alignItems: "center" }}>
      {haltedBadge}
      {trigger}
      <span style={{ flex: isMobile ? undefined : 1 }} />
      {errorChip}{cleanupChip}
      {popover}
      {bottomSheet}
      {sheet}
    </div>
  );
}
