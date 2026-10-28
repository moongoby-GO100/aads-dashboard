import { describe, expect, it } from "vitest";
import {
  buildExecuteBody, buildPromoteBody, buildRollbackBody, describeRunResult, EMPTY_FILTERS, filterSkills, formatCost, formatLatency,
  hasRollbackTarget, parseSkillDetail, parseSkillList, permissionsFor, projectOptions, riskLabel, skillActions, skillErrorMessage,
  versionActions, type SkillSummary,
} from "./skillCatalog";

const rows = [
  { skill_id: "s1", slug: "sf-health", title: "영상 큐 점검", description: "ShortFlow 큐 상태", projects: ["SF"], risk_tier: "read", enabled: true, version: "1.0.0", status: "active", version_count: 2, active_version: "1.0.0", run_count: 5, latest_run: { status: "succeeded", started_at: "2026-10-28T01:00:00Z" }, source: "db", file_drift: false },
  { skill_id: "s1", slug: "sf-health", title: "영상 큐 점검", description: "ShortFlow 큐 상태", projects: ["SF"], risk_tier: "read", enabled: true, version: "0.9.0", status: "deprecated", version_count: 2, active_version: "1.0.0", run_count: 5, latest_run: { status: "succeeded", started_at: "2026-10-28T01:00:00Z" }, source: "db", file_drift: false },
  { skill_id: "s2", slug: "release", title: "AADS 배포", description: "블루그린 배포", projects: ["AADS", "CEO"], risk_tier: "deploy", enabled: true, version: "2.0.0", status: "active", version_count: 1, active_version: "2.0.0", run_count: 0, latest_run: null, source: "file", file_drift: true },
  { skill_id: "s3", slug: "old", title: "옛 수집", description: "사용 중지됨", projects: ["aads"], risk_tier: "auth", enabled: false, version: null, status: null, version_count: 0, active_version: null, run_count: 1, latest_run: { status: "failed", started_at: "2026-10-27T00:00:00Z" }, source: "file", file_drift: false },
];

function skills(): SkillSummary[] {
  const parsed = parseSkillList({ items: rows });
  if (!parsed) throw new Error("parse failed");
  return parsed;
}

describe("parseSkillList", () => {
  it("groups per-version rows into one entry per skill", () => {
    const list = skills();
    expect(list).toHaveLength(3);
    const s1 = list.find((s) => s.skillId === "s1");
    expect(s1).toMatchObject({ activeVersion: "1.0.0", versionCount: 2, runCount: 5, source: "db", fileDrift: false });
    expect(s1?.latestRun?.status).toBe("succeeded");
  });

  it("keeps file drift, no-run and no-version skills", () => {
    const list = skills();
    expect(list.find((s) => s.skillId === "s2")).toMatchObject({ fileDrift: true, latestRun: null, source: "file" });
    expect(list.find((s) => s.skillId === "s3")).toMatchObject({ enabled: false, activeVersion: null });
  });

  it("returns null for an unexpected payload", () => {
    expect(parseSkillList(null)).toBeNull();
    expect(parseSkillList({ items: "x" })).toBeNull();
    expect(parseSkillList({ items: [] })).toEqual([]);
  });
});

describe("filterSkills", () => {
  const list = skills();
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterSkills(list, { ...EMPTY_FILTERS, ...f }).map((s) => s.skillId).sort();

  it("returns everything with no filter", () => expect(ids({})).toEqual(["s1", "s2", "s3"]));
  it("filters by project case-insensitively", () => {
    expect(ids({ project: "AADS" })).toEqual(["s2", "s3"]);
    expect(ids({ project: "sf" })).toEqual(["s1"]);
  });
  it("filters by risk tier", () => expect(ids({ risk: "deploy" })).toEqual(["s2"]));
  it("filters by enabled state", () => {
    expect(ids({ enabled: "on" })).toEqual(["s1", "s2"]);
    expect(ids({ enabled: "off" })).toEqual(["s3"]);
  });
  it("filters by source", () => {
    expect(ids({ source: "db" })).toEqual(["s1"]);
    expect(ids({ source: "file" })).toEqual(["s2", "s3"]);
  });
  it("searches title, slug and description", () => {
    expect(ids({ query: "큐" })).toEqual(["s1"]);
    expect(ids({ query: " RELEASE " })).toEqual(["s2"]);
    expect(ids({ query: "블루그린" })).toEqual(["s2"]);
    expect(ids({ query: "없는말" })).toEqual([]);
  });
  it("combines filters with AND", () => expect(ids({ source: "file", enabled: "on" })).toEqual(["s2"]));
  it("lists distinct projects once", () => expect(projectOptions(list)).toEqual(["AADS", "CEO", "SF"]));
});

describe("permissions and button exposure", () => {
  const ceo = permissionsFor({ is_internal_admin: true });
  const owner = permissionsFor({ tenant_role: "owner" });
  const member = permissionsFor({ tenant_role: "member" });
  const viewer = permissionsFor({ tenant_role: "viewer" });
  const read = { riskTier: "read", enabled: true, activeVersion: "1.0.0" };

  it("maps roles the way the server does", () => {
    expect(ceo).toEqual({ elevated: true, canExecute: true });
    expect(owner.elevated).toBe(true);
    expect(permissionsFor({ membership: { role: "admin" } }).elevated).toBe(true);
    expect(member).toEqual({ elevated: false, canExecute: true });
    expect(viewer).toEqual({ elevated: false, canExecute: false });
    expect(permissionsFor(null)).toEqual({ elevated: false, canExecute: false });
  });

  it("shows execute only for read tier with an active version", () => {
    expect(skillActions(read, member, false)).toEqual(["execute"]);
    expect(skillActions({ ...read, riskTier: "write" }, member, false)).toEqual([]);
    expect(skillActions({ ...read, activeVersion: null }, member, false)).toEqual([]);
    expect(skillActions({ ...read, enabled: false }, ceo, true)).toEqual([]);
    expect(skillActions({ ...read, riskTier: "financial" }, ceo, false)).toEqual(["disable"]);
  });

  it("gives management actions to elevated users only", () => {
    expect(skillActions(read, ceo, true)).toEqual(["execute", "rollback", "disable"]);
    expect(skillActions(read, ceo, false)).toEqual(["execute", "disable"]);
    expect(skillActions(read, viewer, true)).toEqual([]);
    expect(skillActions(read, member, true)).not.toContain("rollback");
    expect(skillActions(read, member, true)).not.toContain("disable");
  });

  it("limits validate/promote to elevated users on candidate or shadow versions", () => {
    expect(versionActions("candidate", ceo)).toEqual(["validate", "promote"]);
    expect(versionActions("shadow", ceo)).toEqual(["validate", "promote"]);
    expect(versionActions("active", ceo)).toEqual([]);
    expect(versionActions("deprecated", ceo)).toEqual([]);
    expect(versionActions("candidate", member)).toEqual([]);
  });
});

describe("detail", () => {
  const detail = parseSkillDetail({
    skill_id: "s1", slug: "sf-health", title: "영상 큐 점검", description: "d", projects: ["SF"], risk_tier: "read", enabled: true,
    allowed_tools: ["run_remote_command"], source: "db", file_drift: false, active_version: "1.0.0",
    versions: [
      { version_id: "v2", version: "1.1.0", status: "candidate", manifest: { preconditions: ["a"], postconditions: ["b"], evidence: ["c"], input_schema: { required: ["queue"] }, idempotency: { mode: "required" } } },
      { version_id: "v1", version: "1.0.0", status: "active", manifest: { preconditions: ["x"], postconditions: [], evidence: [], idempotency: { mode: "forbidden" } } },
      { version_id: "v0", version: "0.9.0", status: "deprecated", manifest: {} },
    ],
    runs: [{ run_id: "r1", version: "1.0.0", status: "failed", error: "boom", cost_usd: 0.0012, latency_ms: 1500, started_at: "2026-10-28T01:00:00Z", result_summary: "{}" }],
  });

  it("parses versions and runs", () => {
    expect(detail?.versions).toHaveLength(3);
    expect(detail?.runs[0]).toMatchObject({ status: "failed", error: "boom", costUsd: 0.0012, latencyMs: 1500 });
    expect(detail?.versions[0].manifest.inputRequired).toEqual(["queue"]);
  });

  it("detects a rollback target only when an active and a deprecated version exist", () => {
    expect(detail && hasRollbackTarget(detail)).toBe(true);
    expect(hasRollbackTarget({ activeVersion: "1", versions: [] })).toBe(false);
    expect(hasRollbackTarget({ activeVersion: null, versions: detail?.versions ?? [] })).toBe(false);
  });

  it("rejects a payload without skill_id", () => expect(parseSkillDetail({ title: "x" })).toBeNull());
});

describe("request bodies", () => {
  let n = 0;
  const id = () => `id${++n}`;
  const baseManifest = { allowedTools: [], preconditions: [], postconditions: [], evidence: [], inputRequired: [], idempotencyMode: "optional", timeoutSeconds: 10 };

  it("builds an execute body and adds an idempotency key only when required", () => {
    const plain = buildExecuteBody("1.0.0", "", baseManifest, id);
    expect(plain.ok && plain.body.input).toEqual({});
    expect(plain.ok && plain.body.idempotency_key).toBeUndefined();
    const required = buildExecuteBody("1.0.0", '{"queue":"a"}', { ...baseManifest, idempotencyMode: "required" }, id);
    expect(required.ok && required.body.idempotency_key).toMatch(/^skills-ui-/);
    expect(required.ok && required.body.input).toEqual({ queue: "a" });
  });

  it("rejects non-object or broken execute input", () => {
    expect(buildExecuteBody("1", "{", baseManifest, id).ok).toBe(false);
    expect(buildExecuteBody("1", "[1]", baseManifest, id).ok).toBe(false);
  });

  const gate = JSON.stringify({ focused_results: {}, affected_regressions: {}, candidate_metrics: {}, active_metrics: {} });
  const form = { handoverKey: "runner:abc", commit: "abc123", push: "pushed", deploy: "none", gateJson: gate };

  it("builds a promote body with handover and release evidence", () => {
    const built = buildPromoteBody(form, "key-1");
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.body.evidence.map((e) => e.type)).toEqual(["aads_handover_db", "release_state"]);
      expect(built.body.evidence[1]).toMatchObject({ commit: "abc123", push: "pushed", deploy: "none" });
    }
  });

  it("refuses to promote with missing evidence or incomplete gate results", () => {
    expect(buildPromoteBody({ ...form, handoverKey: " " }, "k").ok).toBe(false);
    expect(buildPromoteBody({ ...form, deploy: "" }, "k").ok).toBe(false);
    expect(buildPromoteBody({ ...form, gateJson: "" }, "k").ok).toBe(false);
    const partial = buildPromoteBody({ ...form, gateJson: '{"focused_results":{}}' }, "k");
    expect(!partial.ok && partial.error).toContain("affected_regressions");
  });

  it("requires a rollback reason", () => {
    expect(buildRollbackBody("  ", "k").ok).toBe(false);
    const built = buildRollbackBody("회귀 발견", "k");
    expect(built.ok && built.body.evidence).toHaveLength(1);
  });
});

describe("messages and formatting", () => {
  it("explains a 403 in plain Korean", () => {
    expect(skillErrorMessage({ status: 403, code: "", message: "elevated role required" })).toContain("대표");
    expect(skillErrorMessage({ status: 403, code: "human_gateway_approval_required", message: "" })).toContain("사람 승인");
  });
  it("covers network, conflict and server errors", () => {
    expect(skillErrorMessage({ status: 0, code: "network", message: "" })).toContain("연결");
    expect(skillErrorMessage({ status: 409, code: "previous_active_not_available", message: "" })).toContain("이전 활성");
    expect(skillErrorMessage({ status: 500, code: "", message: "" })).toContain("서버");
    expect(skillErrorMessage({ status: 502, code: "skill_execution_failed", message: "timeout" })).toContain("timeout");
  });
  it("labels risk tiers in Korean", () => {
    expect(["read", "write", "deploy", "auth", "financial"].map(riskLabel)).toEqual(["조회", "수정", "배포", "인증", "금융"]);
  });
  it("formats cost, latency and run results", () => {
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.0012)).toBe("$0.0012");
    expect(formatLatency(250)).toBe("250ms");
    expect(formatLatency(1500)).toBe("1.5초");
    const run = describeRunResult({ status: "succeeded", output: { queue: 3 }, latency_ms: 12 });
    expect(run).toMatchObject({ status: "succeeded", error: null, latencyMs: 12 });
    expect(run.outputText).toContain('"queue": 3');
  });
});
