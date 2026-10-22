import { describe, expect, it, vi } from "vitest";
import { chooseAction, EMPTY_SELECTION, buildApplyRequest, runTriageApply, setMergeTarget, toggleKeepP0, type KeyState } from "./goalTriage";
import { cleanupCandidates, type GoalSignal } from "./goalStrip";

const s = (id: string, over: Partial<GoalSignal> = {}): GoalSignal => ({ goal_id: id, title: id, status: "active", priority: "P0", ...over });
const cands = cleanupCandidates([s("p1"), s("p2"), s("p3"), s("d1", { priority: "P1", cleanup_lane: "dormant" })]);
const body = () => {
  let sel = EMPTY_SELECTION;
  for (const id of ["p1", "p2", "p3"]) sel = toggleKeepP0(sel, id);
  return buildApplyRequest(chooseAction(sel, "d1", "dormant", "resume"), cands, "v1:abc");
};
const keyBox = (): { current: KeyState } => ({ current: { key: "k-open", fingerprint: null } });
const err = (status: number, text: string) => Object.assign(new Error(`${status}: ${text}`), { status });

describe("runTriageApply", () => {
  it("sends the opening key and refreshes the strip on success", async () => {
    const deps = { apply: vi.fn().mockResolvedValue({}), applied: vi.fn(), refresh: vi.fn() };
    expect(await runTriageApply(keyBox(), body(), deps)).toEqual({ ok: true });
    expect(deps.apply).toHaveBeenCalledWith(body(), "k-open");
    expect(deps.applied).toHaveBeenCalledTimes(1);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("does not call applied when the request fails", async () => {
    const deps = { apply: vi.fn().mockRejectedValue(err(409, '{"detail":{"error":"p0_cap_exceeded"}}')), applied: vi.fn(), refresh: vi.fn() };
    const r = await runTriageApply(keyBox(), body(), deps);
    expect(r.ok).toBe(false);
    expect(deps.applied).not.toHaveBeenCalled();
  });

  it("still succeeds when the strip re-fetch throws", async () => {
    const deps = { apply: vi.fn().mockResolvedValue({}), applied: vi.fn().mockRejectedValue(new Error("x")), refresh: vi.fn() };
    expect(await runTriageApply(keyBox(), body(), deps)).toEqual({ ok: true });
  });

  it("reuses the key after a network error and sends the same one on retry", async () => {
    const box = keyBox();
    const apply = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({});
    const deps = { apply, applied: vi.fn(), refresh: vi.fn() };
    const first = await runTriageApply(box, body(), deps);
    expect(first.ok === false && first.failure.definitive).toBe(false);
    await runTriageApply(box, body(), deps);
    expect(apply.mock.calls.map((c) => c[1])).toEqual(["k-open", "k-open"]);
  });

  it("reuses the key after a 5xx", async () => {
    const box = keyBox();
    const apply = vi.fn().mockRejectedValueOnce(err(503, "down")).mockResolvedValueOnce({});
    const deps = { apply, applied: vi.fn(), refresh: vi.fn() };
    await runTriageApply(box, body(), deps);
    await runTriageApply(box, body(), deps);
    expect(apply.mock.calls.map((c) => c[1])).toEqual(["k-open", "k-open"]);
  });

  it("rotates the key after a definitive 4xx failure", async () => {
    const box = keyBox();
    const apply = vi.fn().mockRejectedValueOnce(err(409, '{"detail":{"error":"p0_cap_exceeded"}}')).mockResolvedValueOnce({});
    const deps = { apply, applied: vi.fn(), refresh: vi.fn() };
    await runTriageApply(box, body(), deps);
    await runTriageApply(box, body(), deps);
    const keys = apply.mock.calls.map((c) => c[1] as string);
    expect(keys[0]).toBe("k-open");
    expect(keys[1]).not.toBe("k-open");
    expect(keys[1]).toMatch(/^triage-/);
  });

  it("uses a new key when the selection changed between attempts", async () => {
    const box = keyBox();
    const apply = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({});
    const deps = { apply, applied: vi.fn(), refresh: vi.fn() };
    await runTriageApply(box, body(), deps);
    const other = buildApplyRequest(chooseAction(toggleKeepP0(toggleKeepP0(toggleKeepP0(EMPTY_SELECTION, "p1"), "p2"), "p3"), "d1", "dormant", "pause"), cands, "v1:abc");
    await runTriageApply(box, other, deps);
    expect(apply.mock.calls[1][1]).not.toBe("k-open");
  });

  it("refreshes candidates on stale_candidates and reports the failure", async () => {
    const deps = { apply: vi.fn().mockRejectedValue(err(409, '{"detail":{"error":"stale_candidates","candidates":[]}}')), applied: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
    const r = await runTriageApply(keyBox(), body(), deps);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(r.ok === false && r.failure.code).toBe("stale_candidates");
  });

  it("survives a failing refresh after stale_candidates", async () => {
    const deps = { apply: vi.fn().mockRejectedValue(err(409, '{"detail":{"error":"stale_candidates"}}')), applied: vi.fn(), refresh: vi.fn().mockRejectedValue(new Error("x")) };
    expect((await runTriageApply(keyBox(), body(), deps)).ok).toBe(false);
  });

  it("builds merge requests with the target", () => {
    let sel = chooseAction(EMPTY_SELECTION, "d1", "dormant", "merge");
    sel = setMergeTarget(sel, "d1", "p1");
    expect(buildApplyRequest(sel, cands, "v").actions).toEqual([{ goal_id: "d1", action: "merge", merge_into: "p1" }]);
  });
});
