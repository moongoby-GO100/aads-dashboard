import { describe, expect, it } from "vitest";
import { sortDropdownGoals } from "./goalStrip";
import type { StripGoal } from "./goalStrip";

const g = (goal_id: string, extra: Partial<StripGoal> = {}): StripGoal => ({
  goal_id, title: goal_id, status: "active", progress: 0, milestone: null, dispatch_note: null,
  priority: "P1", strip_group: "other", strip_order: 4, ...extra,
});
const ids = (list: StripGoal[]) => sortDropdownGoals(list).map((x) => x.goal_id).join(",");

describe("sortDropdownGoals priority_order", () => {
  it("orders by priority_order after priority within a group, missing last", () => {
    expect(ids([g("c", { priority_order: 9 }), g("none"), g("a", { priority_order: 2 }), g("p0", { priority: "P0", priority_order: 50 })]))
      .toBe("p0,a,c,none");
  });

  it("keeps the old order (recent activity, then title) when no goal has priority_order", () => {
    expect(ids([
      g("old", { last_activity_at: "2026-10-01T00:00:00Z" }),
      g("new", { last_activity_at: "2026-10-20T00:00:00Z" }),
      g("none"),
    ])).toBe("new,old,none");
  });

  it("does not override the group order", () => {
    expect(ids([g("late", { priority_order: 1, strip_group: "dormant", strip_order: 6 }), g("work", { priority_order: 99, strip_group: "working", strip_order: 0 })]))
      .toBe("work,late");
  });
});
