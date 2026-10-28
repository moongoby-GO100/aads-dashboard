import { describe, expect, it, vi } from "vitest";
import {
  buildApprovalDecidePath, classifyApprovalError, enqueueHighRisk, pruneHighRisk, runApprovalDecision,
  type HighRiskRequest,
} from "./approvalDecision";

const grant = { scope: "single", hours: 2, max: 1 };
const http = (status: number, body: string, prefix = "") => Object.assign(new Error(`${prefix}${status}: ${body}`), { status });
const HIGH = http(409, '{"detail":"high_risk_confirmation_required"}');

describe("classifyApprovalError", () => {
  it("treats only 409 + exact high_risk_confirmation_required as reconfirmation", () => {
    expect(classifyApprovalError(HIGH).kind).toBe("high_risk_confirmation");
    expect(classifyApprovalError(http(409, '{"detail":"high_risk_confirmation_required"}', "API error ")).kind).toBe("high_risk_confirmation");
    for (const other of [
      http(409, '{"detail":"high_risk_confirmation_required_x"}'),
      http(409, '{"detail":"registration_not_pending"}'),
      http(403, '{"detail":"high_risk_confirmation_required"}'),
      http(500, '{"detail":"high_risk_confirmation_required"}'),
      http(409, "high_risk_confirmation_required is mentioned in prose"),
      http(409, '{"detail":{"code":"high_risk_confirmation_required"}}'),
    ]) {
      expect(classifyApprovalError(other).kind).not.toBe("high_risk_confirmation");
    }
  });

  it("separates 401/403/404/already-decided/expired without raw JSON", () => {
    const cases: Array<[unknown, string, boolean]> = [
      [http(401, "x"), "unauthenticated", true],
      [http(403, '{"detail":"human_decider_required"}'), "human_required", true],
      [http(403, '{"detail":"self_approval_blocked"}'), "self_approval", false],
      [http(403, '{"detail":"tenant_mismatch"}'), "forbidden", false],
      [http(404, '{"detail":"대기 중인 요청이 아닙니다"}'), "not_found", false],
      [http(409, '{"detail":"registration_already_decided:approved"}'), "already_decided", false],
      [http(409, '{"detail":"registration_spec_changed"}'), "conflict", false],
      [http(503, '{"detail":"승인 처리 실패"}'), "unavailable", true],
    ];
    for (const [err, kind, stop] of cases) {
      const f = classifyApprovalError(err);
      expect(f.kind).toBe(kind);
      expect(f.stopBatch).toBe(stop);
      expect(f.message).not.toMatch(/[{}"]|detail/);
    }
    expect(classifyApprovalError(http(404, "x")).refresh).toBe(true);
    expect(classifyApprovalError(http(409, '{"detail":"registration_already_decided:rejected"}')).message).toContain("반려됨");
  });
});

describe("buildApprovalDecidePath", () => {
  it("adds confirm_high_risk only for confirmed approvals", () => {
    expect(buildApprovalDecidePath("a b", "approved", grant)).toBe("/approvals/a%20b/decide?decision=approved&scope=single&hours=2");
    expect(buildApprovalDecidePath("x", "approved", grant, true)).toContain("&confirm_high_risk=true");
    expect(buildApprovalDecidePath("x", "rejected", grant, true)).toBe("/approvals/x/decide?decision=rejected");
    expect(buildApprovalDecidePath("x", "approved", { scope: "mission", hours: 12, max: 20 })).toContain("&max_executions=20");
  });
});

describe("runApprovalDecision", () => {
  it("409 -> needs_confirm without retry; confirm sends confirm_high_risk=true once -> ok", async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(HIGH)
      .mockResolvedValueOnce({ decision: "approved" });
    const first = await runApprovalDecision(post, { id: "c1", decision: "approved", grant });
    expect(first.status).toBe("needs_confirm");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).not.toContain("confirm_high_risk");

    const second = await runApprovalDecision(post, { id: "c1", decision: "approved", grant, confirmHighRisk: true });
    expect(second.status).toBe("ok");
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toContain("/approvals/c1/decide?");
    expect(post.mock.calls[1][0]).toContain("confirm_high_risk=true");
  });

  it("does not loop when the server asks again after confirmation", async () => {
    const post = vi.fn().mockRejectedValue(HIGH);
    const out = await runApprovalDecision(post, { id: "c1", decision: "approved", grant, confirmHighRisk: true });
    expect(out.status).toBe("failed");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a wrong 409 is a plain failure with a single call", async () => {
    const post = vi.fn().mockRejectedValue(http(409, '{"detail":"registration_spec_changed"}'));
    const out = await runApprovalDecision(post, { id: "c1", decision: "approved", grant });
    expect(out.status).toBe("failed");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("plain approve and reject succeed without the confirm flag", async () => {
    const post = vi.fn().mockResolvedValue({});
    expect((await runApprovalDecision(post, { id: "a", decision: "approved", grant })).status).toBe("ok");
    expect((await runApprovalDecision(post, { id: "a", decision: "rejected", grant })).status).toBe("ok");
    expect(post.mock.calls.map((c) => c[0]).join("\n")).not.toContain("confirm_high_risk");
  });

  it("reject never produces a reconfirmation", async () => {
    const post = vi.fn().mockRejectedValue(HIGH);
    expect((await runApprovalDecision(post, { id: "a", decision: "rejected", grant })).status).toBe("failed");
  });

  it("bulk: only the high-risk item is held back, the others are decided", async () => {
    const post = vi.fn(async (path: string) => {
      if (path.includes("/hi/")) throw HIGH;
      return {};
    });
    const results = [];
    for (const id of ["n1", "hi", "n2"]) results.push((await runApprovalDecision(post, { id, decision: "approved", grant })).status);
    expect(results).toEqual(["ok", "needs_confirm", "ok"]);
    expect(post.mock.calls.filter((c) => c[0].includes("confirm_high_risk"))).toHaveLength(0);
  });
});

describe("high-risk queue guards", () => {
  const req = (id: string, epoch = 1): HighRiskRequest => ({ id, epoch, scope: "single", tool: "t", summary: "s" });
  it("dedupes double requests for the same card", () => {
    const q = enqueueHighRisk([], req("a"));
    expect(enqueueHighRisk(q, req("a"))).toBe(q);
    expect(enqueueHighRisk(q, req("b"))).toHaveLength(2);
  });
  it("drops requests after a session switch (epoch) or when the card is gone", () => {
    const q = [req("a", 1), req("b", 1)];
    expect(pruneHighRisk(q, 2, new Set(["a", "b"]))).toEqual([]);
    expect(pruneHighRisk(q, 1, new Set(["b"])).map((r) => r.id)).toEqual(["b"]);
    expect(pruneHighRisk(q, 1, new Set(["a", "b"]))).toBe(q);
  });
});
