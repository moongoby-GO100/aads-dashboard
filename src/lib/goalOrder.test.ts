import { describe, expect, it, vi } from "vitest";
import { buildReorderIds, moveGoal, neighborOf, sortGoalsByOrder, swapOrders } from "./goalOrder";

type G = { goal_id: string; priority: string; priority_order?: number | null };
const g = (goal_id: string, priority: string, priority_order?: number | null): G => ({ goal_id, priority, priority_order });
const ids = (list: G[]) => list.map((x) => x.goal_id).join(",");

describe("sortGoalsByOrder", () => {
  it("sorts priority first, then priority_order, nulls last", () => {
    const list = [g("p1-b", "P1", 5), g("p0", "P0", 9), g("p1-a", "P1", 2), g("p1-none", "P1", null), g("p0c", "P0-CRITICAL", 30)];
    expect(ids(sortGoalsByOrder(list))).toBe("p0c,p0,p1-a,p1-b,p1-none");
  });

  it("keeps server order for an old response without priority_order", () => {
    const list = [g("c", "P1"), g("a", "P1"), g("b", "P1")];
    expect(ids(sortGoalsByOrder(list))).toBe("c,a,b");
  });
});

describe("neighborOf", () => {
  const sorted = sortGoalsByOrder([g("a", "P0", 1), g("b", "P0", 2), g("c", "P1", 3), g("d", "P1", null)]);
  it("returns the adjacent goal in the same priority", () => {
    expect(neighborOf(sorted, "a", "down")?.goal_id).toBe("b");
    expect(neighborOf(sorted, "b", "up")?.goal_id).toBe("a");
  });
  it("is null at group edges, across priorities and for goals without an order", () => {
    expect(neighborOf(sorted, "a", "up")).toBeNull();
    expect(neighborOf(sorted, "b", "down")).toBeNull();
    expect(neighborOf(sorted, "c", "up")).toBeNull();
    expect(neighborOf(sorted, "c", "down")).toBeNull();
    expect(neighborOf(sorted, "d", "up")).toBeNull();
  });
});

describe("buildReorderIds / swapOrders", () => {
  it("swaps two goals inside the tenant-wide order and keeps the rest", () => {
    const all = [g("x", "P1", 4), g("a", "P0", 1), g("b", "P0", 2), g("done", "P1", null)];
    expect(buildReorderIds(all, "b", "a")).toEqual(["b", "a", "x"]);
    expect(buildReorderIds(all, "a", "x")).toEqual(["x", "b", "a"]);
  });
  it("throws when a goal is missing from the list", () => {
    expect(() => buildReorderIds([g("a", "P0", 1)], "a", "zzz")).toThrow();
  });
  it("swaps order values of the two visible goals only", () => {
    const out = swapOrders([g("a", "P0", 1), g("b", "P0", 2), g("c", "P0", 3)], "a", "b");
    expect(out.map((x) => x.priority_order)).toEqual([2, 1, 3]);
  });
});

describe("moveGoal", () => {
  const list = [g("a", "P0", 1), g("b", "P0", 2), g("c", "P0", 3)];

  it("posts the full new order when moving down", async () => {
    const reorder = vi.fn().mockResolvedValue({});
    const fetchAll = vi.fn();
    const r = await moveGoal(list, false, "a", "down", { reorder, fetchAll });
    expect(reorder).toHaveBeenCalledTimes(1);
    expect(reorder).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(fetchAll).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(ids(sortGoalsByOrder(r.goals))).toBe("b,a,c");
  });

  it("posts the full new order when moving up", async () => {
    const reorder = vi.fn().mockResolvedValue({});
    await moveGoal(list, false, "c", "up", { reorder, fetchAll: vi.fn() });
    expect(reorder).toHaveBeenCalledWith(["a", "c", "b"]);
  });

  it("uses the unfiltered list when a project filter is on", async () => {
    const reorder = vi.fn().mockResolvedValue({});
    const all = [g("o1", "P0", 1), g("a", "P0", 2), g("o2", "P0", 3), g("b", "P0", 4)];
    const fetchAll = vi.fn().mockResolvedValue(all);
    await moveGoal([all[1], all[3]], true, "b", "up", { reorder, fetchAll });
    expect(reorder).toHaveBeenCalledWith(["o1", "b", "o2", "a"]);
  });

  it("returns the original list and the error when the server fails", async () => {
    const reorder = vi.fn().mockRejectedValue(new Error("API error 500"));
    const r = await moveGoal(list, false, "a", "down", { reorder, fetchAll: vi.fn() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("500");
    expect(r.goals).toEqual(list);
  });

  it("also rolls back when the unfiltered fetch fails", async () => {
    const reorder = vi.fn();
    const r = await moveGoal(list, true, "a", "down", { reorder, fetchAll: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(r.ok).toBe(false);
    expect(reorder).not.toHaveBeenCalled();
  });

  it("does nothing at an edge or for an old response without priority_order", async () => {
    const reorder = vi.fn();
    expect((await moveGoal(list, false, "a", "up", { reorder, fetchAll: vi.fn() })).ok).toBe(true);
    expect((await moveGoal([g("x", "P1"), g("y", "P1")], false, "x", "down", { reorder, fetchAll: vi.fn() })).ok).toBe(true);
    expect(reorder).not.toHaveBeenCalled();
  });
});
