import { describe, expect, it } from "vitest";
import type { GoalWorkItem } from "@/lib/api";
import {
  averageRootProgress, countMismatches, countPendingApprovals, expansionKey, groupWorkItemsByMilestone, parseExpansionState, serializeExpansionState,
} from "./goalMilestoneGrouping";

function item(id: string, milestone: string | null, over: Partial<GoalWorkItem> = {}): GoalWorkItem {
  return {
    id, goal_id: "g1", milestone_id: milestone as string, parent_id: null, type: "epic", title: `title-${id}`,
    status: "ready", priority: "medium", progress: 0, version: 1, pending_approval_count: 0, children: [],
    ...over,
  };
}

describe("groupWorkItemsByMilestone", () => {
  it("places root epics by milestone_id and keeps descendants with the parent", () => {
    const task = item("t1", "m1", { type: "task", parent_id: "s1" });
    const story = item("s1", "m1", { type: "story", parent_id: "e1", children: [task] });
    const e1 = item("e1", "m1", { children: [story] });
    const e2 = item("e2", "m2");
    const out = groupWorkItemsByMilestone([e1, e2], ["m1", "m2", "m3"]);
    expect(out.byMilestone.m1.roots.map((n) => n.item.id)).toEqual(["e1"]);
    expect(out.byMilestone.m1.itemCount).toBe(3);
    expect(out.byMilestone.m2.itemCount).toBe(1);
    expect(out.byMilestone.m3.roots).toEqual([]);
    expect(out.unassigned).toEqual([]);
    expect(out.totalCount).toBe(4);
  });

  it("collects roots without or with unknown milestone into unassigned, losing none", () => {
    const orphanChild = item("c", "m1", { type: "story" });
    const out = groupWorkItemsByMilestone(
      [item("a", null), item("b", ""), item("c0", "gone", { children: [orphanChild] }), item("d", "m1")],
      ["m1"],
    );
    expect(out.unassigned.map((n) => n.item.id)).toEqual(["a", "b", "c0"]);
    expect(out.unassignedCount).toBe(4);
    expect(out.byMilestone.m1.itemCount).toBe(1);
    expect(out.totalCount).toBe(5);
  });

  it("does not match by title", () => {
    const e = item("e", "other", { title: "M1 로드맵" });
    const out = groupWorkItemsByMilestone([e], ["m1"]);
    expect(out.byMilestone.m1.roots).toEqual([]);
    expect(out.unassigned).toHaveLength(1);
  });

  it("flags a child whose milestone differs from its parent without moving it", () => {
    const child = item("s1", "m2", { type: "story", parent_id: "e1" });
    const inherits = item("s2", null, { type: "story", parent_id: "e1" });
    const e1 = item("e1", "m1", { children: [child, inherits] });
    const out = groupWorkItemsByMilestone([e1], ["m1", "m2"]);
    const [mismatched, plain] = out.byMilestone.m1.roots[0].children;
    expect(mismatched.mismatch).toEqual({ parentMilestoneId: "m1", ownMilestoneId: "m2" });
    expect(plain.mismatch).toBeNull();
    expect(out.byMilestone.m2.roots).toEqual([]);
    expect(countMismatches(out.byMilestone.m1.roots)).toBe(1);
  });

  it("handles no work items", () => {
    const out = groupWorkItemsByMilestone([], ["m1"]);
    expect(out.totalCount).toBe(0);
    expect(out.unassigned).toEqual([]);
    expect(out.byMilestone.m1.roots).toEqual([]);
    expect(groupWorkItemsByMilestone([], []).totalCount).toBe(0);
  });
});

describe("summaries", () => {
  it("averages root progress and sums pending approvals through descendants", () => {
    const child = item("s", "m1", { type: "story", pending_approval_count: 2 });
    const out = groupWorkItemsByMilestone(
      [item("a", "m1", { progress: 50, pending_approval_count: 1, children: [child] }), item("b", "m1", { progress: 25 })],
      ["m1"],
    );
    expect(averageRootProgress(out.byMilestone.m1.roots)).toBe(38);
    expect(countPendingApprovals(out.byMilestone.m1.roots)).toBe(3);
    expect(averageRootProgress([])).toBeNull();
  });
});

describe("expansion state", () => {
  it("round-trips for the same goal and resets for another goal", () => {
    const state = { [expansionKey("g1", "e1")]: true, [expansionKey("g1", "e2")]: false };
    const raw = serializeExpansionState("g1", state);
    expect(parseExpansionState(raw, "g1")).toEqual(state);
    expect(parseExpansionState(raw, "g2")).toEqual({});
  });

  it("ignores corrupt storage and foreign keys", () => {
    expect(parseExpansionState("{nope", "g1")).toEqual({});
    expect(parseExpansionState(null, "g1")).toEqual({});
    const raw = JSON.stringify({ goalId: "g1", expanded: { "g1:a": true, "g2:b": true, "g1:c": "yes" } });
    expect(parseExpansionState(raw, "g1")).toEqual({ "g1:a": true });
  });
});
