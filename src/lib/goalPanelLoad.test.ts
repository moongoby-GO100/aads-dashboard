import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { createLatestController, createLazyLoader, loadSectionsParallel, type SectionOutcome } from "./goalPanelLoad";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("loadSectionsParallel", () => {
  it("starts every section request before any of them resolves", async () => {
    const started: string[] = [];
    const gates = { board: deferred<string>(), policy: deferred<string>(), tree: deferred<string>(), grants: deferred<string>() };
    const ctrl = new AbortController();
    const sections = (Object.keys(gates) as (keyof typeof gates)[]).map((key) => ({
      task: () => { started.push(key); return gates[key].promise; },
      signal: ctrl.signal,
      onOutcome: () => {},
    }));
    const done = loadSectionsParallel(sections);
    expect(started).toEqual(["board", "policy", "tree", "grants"]);
    Object.values(gates).forEach((g) => g.resolve("ok"));
    const settled = await done;
    expect(settled.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  });

  it("fills each section as its own result arrives and isolates failures", async () => {
    const order: string[] = [];
    const slow = deferred<string>();
    const fast = deferred<string>();
    const broken = deferred<string>();
    const ctrl = new AbortController();
    const record = (name: string) => (o: SectionOutcome<string>) => order.push(`${name}:${o.ok ? o.value : `err(${o.error})`}`);
    const done = loadSectionsParallel([
      { task: () => slow.promise, signal: ctrl.signal, onOutcome: record("tree") },
      { task: () => fast.promise, signal: ctrl.signal, onOutcome: record("policy") },
      { task: () => broken.promise, signal: ctrl.signal, onOutcome: record("grants") },
    ]);
    fast.resolve("P");
    broken.reject(new Error("API error 500"));
    await tick();
    expect(order).toEqual(["policy:P", "grants:err(API error 500)"]);
    slow.resolve("T");
    await done;
    expect(order).toEqual(["policy:P", "grants:err(API error 500)", "tree:T"]);
  });
});

describe("createLatestController (goalId switch)", () => {
  it("drops a late response of the previous goal after the next goal began", async () => {
    const latest = createLatestController();
    const goalA = deferred<string>();
    const goalB = deferred<string>();
    const shown: string[] = [];

    const signalA = latest.begin();
    const doneA = loadSectionsParallel([{ task: () => goalA.promise, signal: signalA, onOutcome: (o) => o.ok && shown.push(o.value) }]);
    const signalB = latest.begin();
    const doneB = loadSectionsParallel([{ task: () => goalB.promise, signal: signalB, onOutcome: (o) => o.ok && shown.push(o.value) }]);
    expect(signalA.aborted).toBe(true);
    expect(signalB.aborted).toBe(false);

    goalB.resolve("goal-B");
    goalA.resolve("goal-A");
    await Promise.all([doneA, doneB]);
    expect(shown).toEqual(["goal-B"]);
  });

  it("drops a late error of the previous goal too", async () => {
    const latest = createLatestController();
    const goalA = deferred<string>();
    const outcomes: unknown[] = [];
    const signalA = latest.begin();
    const doneA = loadSectionsParallel([{ task: () => goalA.promise, signal: signalA, onOutcome: (o) => outcomes.push(o) }]);
    latest.abort();
    goalA.reject(new DOMException("aborted", "AbortError"));
    await doneA;
    expect(outcomes).toEqual([]);
  });
});

describe("createLazyLoader (approval preview)", () => {
  it("does not request anything until a section is expanded, and requests each item once", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const onChange = vi.fn();
    const lazy = createLazyLoader(fetchOne, onChange);
    expect(fetchOne).not.toHaveBeenCalled();
    lazy.request("w1");
    lazy.request("w1");
    expect(fetchOne).toHaveBeenCalledTimes(1);
    await tick();
    expect(lazy.snapshot().w1).toEqual({ status: "ok", data: { id: "w1" } });
  });

  it("keeps the error per item and retries on request", async () => {
    const fetchOne = vi.fn().mockRejectedValueOnce(new Error("API error 500")).mockResolvedValueOnce({ id: "w1" });
    const lazy = createLazyLoader(fetchOne, () => {});
    lazy.request("w1");
    await tick();
    expect(lazy.snapshot().w1).toEqual({ status: "error", error: "API error 500" });
    lazy.request("w1");
    await tick();
    expect(lazy.snapshot().w1).toEqual({ status: "ok", data: { id: "w1" } });
  });

  it("ignores a response that arrives after reset/abort", async () => {
    const gate = deferred<{ id: string }>();
    const lazy = createLazyLoader(() => gate.promise, () => {});
    lazy.request("w1");
    lazy.reset();
    gate.resolve({ id: "w1" });
    await tick();
    expect(lazy.snapshot()).toEqual({});
  });
});

describe("api abort signal", () => {
  it("forwards the AbortSignal to fetch for every panel section", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const ctrl = new AbortController();
      await Promise.all([
        api.getGoalBoard("g1", ctrl.signal),
        api.getGoalApprovalPolicy("g1", ctrl.signal),
        api.getGoalWorkTree("g1", ctrl.signal),
        api.getGoalGovernance("g1", ctrl.signal),
        api.getGoalApprovalGrants("g1", "sess", ctrl.signal),
        api.getWorkItemApprovalPreview("w1", "sess", ctrl.signal),
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(6);
      for (const call of fetchSpy.mock.calls as unknown as [string, RequestInit][]) expect(call[1].signal).toBe(ctrl.signal);
    } finally { vi.unstubAllGlobals(); }
  });
});
