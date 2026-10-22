import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// DOM 환경이 없어 훅을 고정 값으로 바꾸고 GoalStrip 을 함수로 호출해 핸들러를 직접 실행한다.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: <T,>(init: T | (() => T)) => [typeof init === "function" ? (init as () => T)() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useMemo: <T,>(fn: () => T) => fn(),
    useId: () => "goal-list",
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

import { GoalStrip, type GoalStripProps } from "./GoalStrip";
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
const render = (p: GoalStripProps) => GoalStrip(p) as Node;

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
