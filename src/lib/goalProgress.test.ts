import { describe, expect, it, vi } from "vitest";
import {
  FORBIDDEN_MESSAGE, REASON_REQUIRED_MESSAGE, createSingleFlight, goalStatusLabel, isGoalTerminal,
  normalizeProgress, progressPercent, runGoalPauseAction,
} from "./goalProgress";

const client = () => ({ pauseGoal: vi.fn().mockResolvedValue({}), resumeGoal: vi.fn().mockResolvedValue({}) });

describe("progress display", () => {
  it("shows 0.42 and 42 both as 42%", () => {
    expect(progressPercent(0.42)).toBe(42);
    expect(progressPercent(42)).toBe(42);
    expect(normalizeProgress(0.42)).toBeCloseTo(42);
  });
  it("clamps and tolerates missing values", () => {
    expect(progressPercent(undefined)).toBe(0);
    expect(progressPercent(null)).toBe(0);
    expect(progressPercent(250)).toBe(100);
    expect(progressPercent(-3)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});

describe("status", () => {
  it("maps work names in Korean and keeps unknown values", () => {
    expect(["active", "blocked", "draft", "completed", "cancelled", "archived"].map(goalStatusLabel))
      .toEqual(["진행 중", "막힘", "초안", "완료", "취소", "보관"]);
    expect(goalStatusLabel("weird")).toBe("weird");
  });
  it("treats completed/cancelled/archived as terminal", () => {
    expect(["completed", "cancelled", "archived"].every(isGoalTerminal)).toBe(true);
    expect(["active", "blocked", "draft", undefined].some(isGoalTerminal)).toBe(false);
  });
});

describe("runGoalPauseAction", () => {
  it("blocks a blank reason without calling the server", async () => {
    const c = client();
    for (const reason of ["", "   \n"]) {
      expect(await runGoalPauseAction(c, "g1", { type: "pause", reason }))
        .toEqual({ ok: false, kind: "reason", message: REASON_REQUIRED_MESSAGE });
    }
    expect(c.pauseGoal).not.toHaveBeenCalled();
  });
  it("sends the trimmed reason on pause and calls resume on start", async () => {
    const c = client();
    expect(await runGoalPauseAction(c, "g1", { type: "pause", reason: "  점검  " })).toEqual({ ok: true });
    expect(c.pauseGoal).toHaveBeenCalledWith("g1", "점검");
    expect(await runGoalPauseAction(c, "g1", { type: "resume" })).toEqual({ ok: true });
    expect(c.resumeGoal).toHaveBeenCalledWith("g1");
  });
  it("turns a 403 into the CEO-permission notice", async () => {
    const c = client();
    c.pauseGoal.mockRejectedValue(new Error('API error 403: {"detail":"internal_admin_required"}'));
    expect(await runGoalPauseAction(c, "g1", { type: "pause", reason: "x" }))
      .toEqual({ ok: false, kind: "forbidden", message: FORBIDDEN_MESSAGE });
  });
  it("reports other errors with their message so the user can retry", async () => {
    const c = client();
    c.resumeGoal.mockRejectedValue(new Error("API error 500: boom"));
    expect(await runGoalPauseAction(c, "g1", { type: "resume" }))
      .toEqual({ ok: false, kind: "error", message: "API error 500: boom" });
  });
});

describe("createSingleFlight", () => {
  it("drops a second call while the first is pending, then accepts again", async () => {
    const flight = createSingleFlight();
    let release!: () => void;
    const first = flight.run(() => new Promise<void>((r) => { release = r; }));
    expect(flight.pending).toBe(true);
    expect(await flight.run(async () => "second")).toEqual({ ran: false });
    release();
    expect((await first).ran).toBe(true);
    expect(await flight.run(async () => "third")).toEqual({ ran: true, value: "third" });
  });
  it("releases the lock when the task throws", async () => {
    const flight = createSingleFlight();
    await expect(flight.run(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(flight.pending).toBe(false);
  });
});
