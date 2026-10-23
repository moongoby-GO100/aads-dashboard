import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalStrip, type GoalStripProps } from "./GoalStrip";
import { DormancyCard, type DormancyCardProps } from "./DormancyCard";
import { cleanupCandidates, type GoalSignal, type StripChipGoal } from "@/lib/goalStrip";

const g = (id: string, over: Partial<StripChipGoal> = {}): StripChipGoal => ({
  goal_id: id, title: `목표 ${id}`, status: "active", progress: 0.5, milestone: null, dispatch_note: null, ...over,
});

// 서버 strip_group 이 없는 구서버 응답 — 화면이 같은 규칙으로 직접 7그룹을 판정해야 한다.
const OLD_SERVER_GOALS: StripChipGoal[] = [
  g("dorm", { priority: "P0", dormant: true }),
  g("pause", { priority: "P1", goal_paused: true, goal_paused_reason: "예산 확인" }),
  g("other", { priority: "P1" }),
  g("p0", { priority: "P0", is_lead: true, milestone: "M2 검증" }),
  g("blk", { priority: "P1", dispatch_note: "승인 대기 중" }),
  g("wait", { priority: "P1", activity: "awaiting" }),
  g("work", { priority: "P2", activity: "working", current_runner: { job_id: "runner-1", status: "running" } }),
];

const props = (over: Partial<GoalStripProps> = {}): GoalStripProps => ({
  goals: OLD_SERVER_GOALS, halted: false, open: false, onOpenChange: vi.fn(), panelGoalId: null, onToggleGoal: vi.fn(),
  summary: { open: 58, p0: 30 }, unlinkedCount: 0, cleanupTotal: 0, cardOpen: false, onToggleCard: vi.fn(),
  signalsError: false, isMobile: false, ...over,
});

const html = (over: Partial<GoalStripProps> = {}) => renderToStaticMarkup(<GoalStrip {...props(over)} />);

describe("GoalStrip dropdown button (closed)", () => {
  it("is a single listbox-popup button with counts and the first-priority goal", () => {
    const out = html();
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain("aria-controls=");
    expect(out).toContain("목표 7");
    expect(out).toContain("🔄1");
    expect(out).toContain("⏳1");
    expect(out).toContain("⛔1");
    expect(out).toContain("목표 work");
    expect(out).toContain("▾");
    expect(out).not.toContain('role="listbox"');
  });

  it("drops the chip row, +N and fold controls", () => {
    const out = html();
    expect(out).not.toContain("목표 +");
    expect(out).not.toContain("접기");
    expect(out).not.toContain("data-goal-chip");
  });

  it("omits zero counts and shows 목표 0 without goals", () => {
    const out = html({ goals: [g("a", { priority: "P1" })] });
    expect(out).not.toContain("🔄");
    expect(out).not.toContain("⏳");
    const none = html({ goals: [], cleanupTotal: 3 });
    expect(none).toContain("목표 0");
    expect(none).toContain("🧹 휴면·차단 정리 3");
  });

  it("uses the mobile height and compact copy", () => {
    const out = html({ isMobile: true });
    expect(out).toContain("height:36px");
    expect(out).toContain('data-goal-strip="mobile"');
  });

  it("keeps the halted badge and the signals error chip", () => {
    const out = html({ halted: true, signalsError: true });
    expect(out).toContain("전체 정지 중");
    expect(out).toContain("자동승인·정리 상태 확인 실패");
  });
});

describe("GoalStrip dropdown list (open)", () => {
  it("groups the old-server response into seven groups in progress-priority order", () => {
    const out = html({ open: true });
    expect(out).toContain('role="listbox"');
    expect(out).toContain('aria-expanded="true"');
    const labels = ["🔄 작업중", "⏳ 대표님 대기", "⛔ 막힘", "P0", "P1 · P2", "⏸ 멈춤", "💤 휴면·초안"];
    const at = labels.map((l) => out.indexOf(`aria-label="${l}"`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const rowOrder = ["work", "wait", "blk", "p0", "other", "pause", "dorm"].map((id) => out.indexOf(`data-goal-row="${id}"`));
    expect([...rowOrder].sort((a, b) => a - b)).toEqual(rowOrder);
  });

  it("skips empty groups", () => {
    const out = html({ open: true, goals: [g("a", { priority: "P1" })] });
    expect(out).toContain('aria-label="P1 · P2"');
    expect(out).not.toContain('aria-label="🔄 작업중"');
    expect(out).not.toContain('aria-label="⏸ 멈춤"');
  });

  it("renders option rows with aria-selected for the goal open in the panel", () => {
    const out = html({ open: true, panelGoalId: "p0" });
    expect(out.match(/role="option"/g)?.length).toBe(7);
    expect(out).toMatch(/role="option" aria-selected="true"[^>]*title="주도 목표/);
    expect(out.match(/aria-selected="true"/g)?.length).toBe(1);
  });

  it("shows the head counts, lead mark and second-line details", () => {
    const out = html({ open: true });
    expect(out).toContain("이 대화의 목표 7");
    expect(out).toContain("전체 열린 목표 58");
    expect(out).toContain("P0 <b");
    expect(out).toContain("👑 주도");
    expect(out).toContain("M2 검증");
    expect(out).toContain("막힘: 승인 대기 중");
    expect(out).toContain("⏸ 멈춤 — 예산 확인");
    expect(out).toContain("러너 runner-1 · running");
  });

  it("falls back to 사유 없음 for a paused goal without a reason", () => {
    expect(html({ open: true, goals: [g("p", { goal_paused: true })] })).toContain("⏸ 멈춤 — 사유 없음");
  });

  it("shows tool row: cleanup, unlinked and the /goals link", () => {
    const out = html({ open: true, cleanupTotal: 18, unlinkedCount: 2 });
    expect(out).toContain("🧹 휴면·차단 정리 18건");
    expect(out).toContain("🔗 목표 미연결 2건");
    expect(out).toContain('href="/goals"');
    expect(out).toContain("목표 화면 전체 보기 →");
  });

  it("shows the empty guidance when no goal is linked", () => {
    const out = html({ open: true, goals: [], cleanupTotal: 1 });
    expect(out).toContain("이 대화에 연결된 목표가 없습니다. 목표 화면에서 담당으로 연결하면 여기에 보입니다.");
  });

  it("shows the warning line with a retry button when signals failed", () => {
    const out = html({ open: true, signalsError: true });
    expect(out).toContain("자동승인·정리 상태를 불러오지 못했습니다");
    expect(out).toContain("다시 시도");
  });

  it("renders the auto-approval chip next to the option, not inside it", () => {
    const out = html({ open: true, goals: [g("a", { priority: "P1", auto_approval: { state: "manual" } })] });
    expect(out).toContain("승인: 수동");
  });

  it("mobile uses a fixed scrim and bottom sheet with a close button", () => {
    const out = html({ open: true, isMobile: true });
    expect(out).toContain("data-goal-scrim");
    expect(out).toContain('data-goal-dropdown="mobile"');
    expect(out).toContain("max-height:70vh");
    expect(out).toContain('aria-label="닫기"');
    expect(out).toContain("min-height:52px");
  });

  it("desktop uses an absolute 440px popover that does not push the page", () => {
    const out = html({ open: true });
    expect(out).toContain('data-goal-dropdown="desktop"');
    expect(out).toContain("position:absolute");
    expect(out).toContain("width:440px");
    expect(out).toContain("max-height:min(60vh, 520px)");
    expect(out).not.toContain("data-goal-scrim");
  });

  it("does not render the list while closed", () => {
    expect(html()).not.toContain("data-goal-dropdown");
  });
});

describe("approval chip and progress chip are separate", () => {
  const STATES: Array<[string, string]> = [
    ["working", "진행: 진행중"], ["no_owner", "진행: 담당 없음"], ["awaiting_reply", "진행: 답 대기"],
    ["answered_no_progress", "진행: 답했으나 진행 없음"], ["blocked", "진행: 막힘"], ["paused", "진행: 멈춤"], ["idle", "진행: 대기"],
  ];
  const one = (over: Partial<StripChipGoal>) => html({ open: true, goals: [g("row1", { priority: "P1", ...over })] });

  it("renders both chips on the same row, each with its own copy", () => {
    const out = one({ progress_state: "blocked", auto_approval: { state: "manual" } });
    expect(out).toContain("data-goal-chips");
    expect(out).toContain("승인: 수동");
    expect(out).toContain("진행: 막힘");
    expect(out).not.toContain("자동승인 🔒");
  });

  it("explains that approval is not progress in the approval chip tooltip", () => {
    const out = one({ auto_approval: { state: "high", used: 3, max: 10 } });
    expect(out).toContain("승인: 고위험까지 자동 3/10");
    expect(out).toContain("위험 작업 때 대표님 승인 버튼을 띄울지 정하는 설정입니다. 진행 여부와는 별개입니다.");
  });

  it.each(STATES)("shows the %s copy and never the raw state or an id", (state, text) => {
    const out = one({ progress_state: state });
    expect(out).toContain(text);
    if (state.includes("_")) expect(out).not.toContain(state);
    expect(out).not.toContain("progress_state");
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it("marks only the stuck states as expandable chips", () => {
    for (const [state] of STATES) {
      const out = one({ progress_state: state });
      const expandable = ["no_owner", "answered_no_progress", "blocked"].includes(state);
      expect(/<button[^>]*data-progress-tone[^>]*aria-expanded="false"/.test(out)).toBe(expandable);
    }
  });

  it("shows the substitute-dispatch copy for a no-owner goal run by the lead", () => {
    expect(one({ progress_state: "no_owner", progress_substitute: true })).toContain("진행: 담당 없음·주도 세션 대행");
  });

  it("falls back to the old rule when progress_state is missing", () => {
    expect(one({ activity: "working" })).toContain("진행: 진행중");
    expect(one({ activity: "awaiting" })).toContain("진행: 답 대기");
    expect(one({ dispatch_note: "승인 대기 중" })).toContain("진행: 막힘");
    expect(one({ goal_paused: true })).toContain("진행: 멈춤");
    expect(one({})).toContain("진행: 대기");
  });

  it("does not show the stuck detail until the chip is opened", () => {
    const out = one({ progress_state: "blocked", blocked_milestones: [{ milestone_id: "m-1", title: "M2", reason: "사유" }] });
    expect(out).not.toContain("data-goal-stuck");
    expect(out).not.toContain("다시 보내기");
  });
});

describe("DormancyCard selection UI", () => {
  const NOW_MS = Date.now();
  const ago = (d: number) => new Date(NOW_MS - d * 86_400_000).toISOString();
  const sig = (id: string, over: Partial<GoalSignal> = {}): GoalSignal =>
    ({ goal_id: id, title: `목표 ${id}`, status: "active", priority: "P0", last_activity_at: ago(1), candidates_version: "v1:abc", ...over });
  const pool: GoalSignal[] = [
    sig("p1"), sig("p2"), sig("p3"), sig("p4", { last_activity_at: ago(19) }),
    sig("d1", { priority: "P1", cleanup_lane: "dormant", last_activity_at: ago(30) }),
    sig("b1", { priority: "P1", status: "blocked", cleanup_lane: "blocked_resolution", last_activity_at: ago(20) }),
  ];
  const card = (over: Partial<DormancyCardProps> = {}) => renderToStaticMarkup(
    <DormancyCard state="default" candidates={cleanupCandidates(pool)} openGoals={pool} candidatesVersion="v1:abc" pausedAutoApproval={[]}
      openGoalCount={pool.length} openP0Count={4} isMobile={false} retrying={false} onRetry={vi.fn()} onClose={vi.fn()} onOpenGoal={vi.fn()}
      onApply={vi.fn()} onApplied={vi.fn()} onRefreshCandidates={vi.fn()} {...over} />,
  );

  it("renders the three lanes with one checkbox per active P0 and the segments per lane", () => {
    const out = card();
    expect((out.match(/type="checkbox"/g) || []).length).toBe(4);
    expect(out).toContain("진행 P0 3개 고르기");
    expect(out).toContain("재개");
    expect(out).toContain("차단 해소");
    expect(out).toContain("일시정지");
    expect(out).toContain("종료");
    expect(out).toContain("병합");
  });

  it("shows → P1 on every unselected P0 row and a disabled apply button with the zero-selection summary", () => {
    const out = card();
    expect((out.match(/→ P1/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(out).toContain("① P0 0개 · ② 0건 · ③ 0건 반영");
    expect(/<button[^>]*data-apply[^>]*disabled/.test(out)).toBe(true);
  });

  it("never lets the card collapse inside the fixed-height message column and bounds its body on both layouts", () => {
    for (const isMobile of [false, true]) {
      const out = card({ isMobile });
      expect(/<section[^>]*data-dormancy-card[^>]*style="[^"]*flex-shrink:0/.test(out)).toBe(true);
      expect(/max-height:(?:min\(46dvh, 420px\)|56vh);overflow-y:auto/.test(out)).toBe(true);
    }
  });

  it("disables apply when there is no candidates version", () => {
    expect(/<button[^>]*data-apply[^>]*disabled/.test(card({ candidatesVersion: null }))).toBe(true);
  });

  it("keeps every mobile control at least 44px high", () => {
    const out = card({ isMobile: true });
    const heights = [...out.matchAll(/<(?:button|select|label)[^>]*style="[^"]*?min-height:(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThan(8);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  it("keeps the loading, error and empty states", () => {
    expect(card({ state: "loading" })).toContain('data-dormancy-card="loading"');
    expect(card({ state: "error" })).toContain('data-dormancy-card="error"');
    expect(card({ state: "empty", candidates: cleanupCandidates([]) })).toContain('data-dormancy-card="empty"');
  });
});
