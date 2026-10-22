import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// DOM 환경이 없어 훅을 고정 값으로 바꾸고 GoalStrip 을 함수로 호출해 핸들러를 직접 실행한다.
const stateProbe = vi.hoisted(() => ({ calls: 0, overrides: {} as Record<number, unknown> }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: <T,>(init: T | (() => T)) => {
      const i = stateProbe.calls++;
      const v = i in stateProbe.overrides ? (stateProbe.overrides[i] as T) : typeof init === "function" ? (init as () => T)() : init;
      return [v, () => {}];
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useMemo: <T,>(fn: () => T) => fn(),
    useId: () => "goal-list",
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

import { GoalStrip, type GoalStripProps } from "./GoalStrip";
import { createStuckHandlers, MilestoneStuckActions, OwnerPicker, INITIAL_STUCK_STATE, type StuckState } from "@/components/GoalStuckActions";
import type { StripChipGoal } from "@/lib/goalStrip";

const g = (id: string, over: Partial<StripChipGoal> = {}): StripChipGoal => ({
  goal_id: id, title: `목표 ${id}`, status: "active", progress: 0.5, milestone: null, dispatch_note: null, ...over,
});

const props = (over: Partial<GoalStripProps> = {}): GoalStripProps => ({
  goals: [g("a", { priority: "P1" }), g("b", { priority: "P0" })], halted: false, open: true,
  onOpenChange: vi.fn(), panelGoalId: null, onToggleGoal: vi.fn(), summary: null, unlinkedCount: 0, cleanupTotal: 4,
  cardOpen: false, onToggleCard: vi.fn(), signalsError: false, isMobile: false, ...over,
});

type Node = ReactElement<{ children?: ReactNode; [k: string]: unknown }>;
function find(node: ReactNode, pred: (el: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => find(n, pred, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as Node;
    if (pred(el)) out.push(el);
    find(el.props.children, pred, out);
  }
  return out;
}
const render = (p: GoalStripProps, overrides: Record<number, unknown> = {}) => {
  stateProbe.calls = 0;
  stateProbe.overrides = overrides;
  return GoalStrip(p) as Node;
};

describe("GoalStrip interactions", () => {
  it("clicking the button when closed asks to open, when open asks to close", () => {
    const closed = props({ open: false });
    (find(render(closed), (e) => e.props["data-goal-trigger"] !== undefined)[0].props.onClick as () => void)();
    expect(closed.onOpenChange).toHaveBeenCalledWith(true);
    const opened = props();
    (find(render(opened), (e) => e.props["data-goal-trigger"] !== undefined)[0].props.onClick as () => void)();
    expect(opened.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking a row toggles that goal and closes the dropdown", () => {
    const p = props();
    const rows = find(render(p), (e) => e.props.role === "option");
    expect(rows).toHaveLength(2);
    (rows[0].props.onClick as () => void)();
    expect(p.onToggleGoal).toHaveBeenCalledTimes(1);
    expect(p.onToggleGoal).toHaveBeenCalledWith("b");
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc closes the dropdown", () => {
    const p = props();
    const stopPropagation = vi.fn();
    (render(p).props.onKeyDown as (e: unknown) => void)({ key: "Escape", stopPropagation });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keys do nothing while closed", () => {
    const p = props({ open: false });
    (render(p).props.onKeyDown as (e: unknown) => void)({ key: "Escape", stopPropagation: vi.fn() });
    expect(p.onOpenChange).not.toHaveBeenCalled();
  });

  it("mobile scrim and ✕ close the sheet", () => {
    const p = props({ isMobile: true });
    const tree = render(p);
    (find(tree, (e) => e.props["data-goal-scrim"] !== undefined)[0].props.onClick as () => void)();
    (find(tree, (e) => e.props["aria-label"] === "닫기")[0].props.onClick as () => void)();
    expect(p.onOpenChange).toHaveBeenCalledTimes(2);
    expect(p.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("tool-row cleanup button opens the cleanup card and closes the dropdown", () => {
    const p = props();
    const btn = find(render(p), (e) => e.type === "button" && typeof e.props.title === "string" && String(e.props.title).startsWith("14일"))
      .find((e) => !("aria-pressed" in e.props));
    (btn?.props.onClick as () => void)();
    expect(p.onToggleCard).toHaveBeenCalledTimes(1);
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("warning-line retry calls onToggleCard", () => {
    const p = props({ signalsError: true });
    const retry = find(render(p), (e) => e.type === "button" && e.props.children === "다시 시도")[0];
    (retry.props.onClick as () => void)();
    expect(p.onToggleCard).toHaveBeenCalledTimes(1);
  });
});

// ProgressPill 은 함수 컴포넌트라 트리에 요소로만 있다 — 직접 호출해 실제 칩(button/span)을 얻는다.
const progressChipOf = (tree: Node): Node => {
  const pill = find(tree, (e) => typeof e.type === "function" && "chip" in e.props)[0];
  return (pill.type as (p: unknown) => Node)(pill.props);
};

// useState 호출 순서: 0 aaGoalId, 1 stuckGoalId, 2 frozen, 3 focusId
const STUCK_OPEN = { 1: "blk" };
const MID = "0a1b2c3d-1111-2222-3333-444455556666";
const stuckGoal = g("blk", {
  priority: "P1", progress_state: "blocked", progress_reason: "3회 보냈으나 답이 확인되지 않음",
  blocked_milestones: [{ milestone_id: MID, title: "M2 검증", state: "blocked", reason: "3회 보냈으나 답이 확인되지 않음", blocked_at: "2026-10-22T08:24:00Z" }],
});

describe("GoalStrip stuck chip", () => {
  it("clicking the stuck chip toggles the detail without selecting the goal", () => {
    const p = props({ goals: [stuckGoal] });
    const chip = progressChipOf(render(p));
    expect(chip.type).toBe("button");
    expect(chip.props["data-progress-tone"]).toBe("stuck");
    expect(chip.props["aria-expanded"]).toBe(false);
    (chip.props.onClick as () => void)();
    expect(p.onToggleGoal).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalled();
  });

  it("a non-stuck progress chip is not a button", () => {
    const chip = progressChipOf(render(props({ goals: [g("w", { progress_state: "working" })] })));
    expect(chip.type).toBe("span");
    expect(chip.props.onClick).toBeUndefined();
  });

  it("the opened detail lists reason, KST time and passes the milestone id to the actions", () => {
    const tree = render(props({ goals: [stuckGoal] }), STUCK_OPEN);
    const detail = find(tree, (e) => e.props["data-goal-stuck"] === "blk");
    expect(detail).toHaveLength(1);
    const text = JSON.stringify(detail[0].props.children, (k, v) => (k === "key" || k === "milestoneId" ? undefined : v));
    expect(text).toContain("3회 보냈으나 답이 확인되지 않음");
    expect(text).toContain("10/22 17:24 (KST)");
    expect(text).not.toContain(MID.slice(0, 8));
    const actions = find(tree, (e) => e.type === MilestoneStuckActions);
    expect(actions).toHaveLength(1);
    expect(actions[0].props.milestoneId).toBe(MID);
    expect(actions[0].props.goalId).toBe("blk");
  });

  it("passes onRefresh to the actions and 담당 지정 opens the goal panel", () => {
    const onRefresh = vi.fn();
    const p = props({ goals: [stuckGoal], onRefresh });
    const actions = find(render(p, STUCK_OPEN), (e) => e.type === MilestoneStuckActions)[0];
    expect(actions.props.onChanged).toBe(onRefresh);
    (actions.props.onNeedOwner as () => void)();
    expect(p.onToggleGoal).toHaveBeenCalledWith("blk");
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("without milestone ids it shows the goal reason and a panel button instead of fake actions", () => {
    const p = props({ goals: [g("blk", { priority: "P1", progress_state: "no_owner", progress_reason: "담당 세션이 없습니다" })] });
    const tree = render(p, STUCK_OPEN);
    expect(find(tree, (e) => e.type === MilestoneStuckActions)).toHaveLength(0);
    const btn = find(tree, (e) => e.type === "button" && e.props.children === "목표 패널에서 처리")[0];
    expect(btn.props.style).toMatchObject({ minHeight: 44 });
    (btn.props.onClick as () => void)();
    expect(p.onToggleGoal).toHaveBeenCalledWith("blk");
  });
});

describe("stuck action handlers", () => {
  const apiErr = (status: number, body: unknown) => new Error(`API error ${status}: ${JSON.stringify(body)}`);
  function setup(opts: { hasPicker?: boolean; redispatch?: () => Promise<unknown>; owner?: () => Promise<unknown> } = {}) {
    const states: Partial<StuckState>[] = [];
    const apiClient = {
      redispatchMilestone: vi.fn(opts.redispatch ?? (async () => ({ milestone_id: "m", goal_id: "g", redispatched: true, goal_paused: false }))),
      setMilestoneOwner: vi.fn(opts.owner ?? (async () => ({ goal_id: "g", milestone_id: "m", owner_session_id: "s", changed: true }))),
    };
    const onChanged = vi.fn();
    const onNeedOwner = vi.fn();
    const h = createStuckHandlers({
      goalId: "g1", milestoneId: "m1", apiClient: apiClient as never, patch: (x) => states.push(x),
      onChanged, hasPicker: opts.hasPicker ?? true, onNeedOwner,
    });
    return { h, states, apiClient, onChanged, onNeedOwner, last: () => states[states.length - 1] };
  }

  it("다시 보내기 success calls POST redispatch for the milestone and refreshes the list", async () => {
    const t = setup();
    await t.h.redispatch();
    expect(t.apiClient.redispatchMilestone).toHaveBeenCalledWith("m1");
    expect(t.states[0]).toMatchObject({ busy: "redispatch" });
    expect(t.last().notice).toContain("다시 보냈습니다");
    expect(t.last().failure).toBeNull();
    expect(t.onChanged).toHaveBeenCalledTimes(1);
  });

  it("409 no_dispatch_target shows the guidance and opens the owner picker", async () => {
    const t = setup({ redispatch: async () => { throw apiErr(409, { detail: { code: "no_dispatch_target" } }); } });
    await t.h.redispatch();
    expect(t.last().failure?.text).toBe("보낼 담당·주도 세션이 없습니다. 먼저 담당을 지정하세요");
    expect(t.last().picking).toBe(true);
    expect(t.onChanged).not.toHaveBeenCalled();
  });

  it("409 no_dispatch_target without a picker leaves the choice to the owner screen", async () => {
    const t = setup({ hasPicker: false, redispatch: async () => { throw apiErr(409, { detail: { code: "no_dispatch_target" } }); } });
    await t.h.redispatch();
    expect(t.last().picking).toBe(false);
    t.h.openAssign(false);
    expect(t.onNeedOwner).toHaveBeenCalledTimes(1);
  });

  it("an unexpected failure shows the message with a retry that calls the API again", async () => {
    let n = 0;
    const t = setup({ redispatch: async () => { if (n++ === 0) throw apiErr(500, "boom"); return { goal_paused: false }; } });
    await t.h.redispatch();
    const failure = t.last().failure!;
    expect(failure.text).toContain("오류 500");
    await t.h.retry(failure);
    expect(t.apiClient.redispatchMilestone).toHaveBeenCalledTimes(2);
    expect(t.last().failure).toBeNull();
  });

  it("milestone_not_in_progress shows a notice and refreshes instead of an error", async () => {
    const t = setup({ redispatch: async () => { throw apiErr(409, { detail: { code: "milestone_not_in_progress" } }); } });
    await t.h.redispatch();
    expect(t.last().failure).toBeNull();
    expect(t.last().notice).not.toBe("");
    expect(t.onChanged).toHaveBeenCalledTimes(1);
  });

  it("담당 지정 calls PATCH owner with goal, milestone, session and role, then refreshes", async () => {
    const t = setup();
    await t.h.assign({ session_id: "sess-9", role_key: "cto", title: "CTO 창" });
    expect(t.apiClient.setMilestoneOwner).toHaveBeenCalledWith("g1", "m1", "sess-9", "cto");
    expect(t.last().picking).toBe(false);
    expect(t.last().notice).toContain("담당을 지정했습니다");
    expect(t.onChanged).toHaveBeenCalledTimes(1);
  });

  it("담당 지정 failure keeps the picker open with a retry for the same session", async () => {
    let n = 0;
    const t = setup({ owner: async () => { if (n++ === 0) throw apiErr(422, { detail: "owner_not_linked" }); return {}; } });
    const owner = { session_id: "sess-9", role_key: "" };
    await t.h.assign(owner);
    expect(t.last().picking).toBe(true);
    expect(t.last().failure?.retry).toBe("owner");
    await t.h.retry(t.last().failure!);
    expect(t.apiClient.setMilestoneOwner).toHaveBeenNthCalledWith(2, "g1", "m1", "sess-9", undefined);
  });

  it("openAssign toggles the in-place picker when owners are available", () => {
    const t = setup();
    t.h.openAssign(false);
    expect(t.last()).toMatchObject({ picking: true });
    t.h.openAssign(true);
    expect(t.last()).toMatchObject({ picking: false });
    expect(t.onNeedOwner).not.toHaveBeenCalled();
  });

  it("the rendered buttons have a 44px touch target and the alert has a retry button", () => {
    stateProbe.calls = 0;
    stateProbe.overrides = { 0: { ...INITIAL_STUCK_STATE, failure: { text: "실패", retry: "redispatch" }, picking: true } };
    const tree = MilestoneStuckActions({ goalId: "g1", milestoneId: "m1", owners: [{ session_id: "s1", title: "개발 창" }] }) as Node;
    const buttons = find(tree, (e) => e.type === "button");
    const labels = buttons.map((b) => b.props.children);
    expect(labels).toContain("다시 보내기");
    expect(labels).toContain("담당 지정");
    expect(labels).toContain("재시도");
    for (const b of buttons) expect(b.props.style).toMatchObject({ minHeight: 44 });
    expect(find(tree, (e) => e.props.role === "alert")).toHaveLength(1);
    expect(find(tree, (e) => e.type === OwnerPicker)).toHaveLength(1);
  });
});
