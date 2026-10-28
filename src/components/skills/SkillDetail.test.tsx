import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseSkillDetail, permissionsFor } from "@/lib/skillCatalog";
import { SkillDetailView } from "./SkillDetail";

function detail(riskTier: string, activeVersion: string | null = "1.0.0") {
  const parsed = parseSkillDetail({
    skill_id: "s1", slug: "sample", title: "샘플 스킬", description: "설명", projects: ["AADS"], risk_tier: riskTier, enabled: true,
    active_version: activeVersion, source: "file", file_drift: true,
    versions: [
      { version_id: "v3", version: "1.1.0", status: "candidate", manifest: {} },
      { version_id: "v2", version: "1.0.0", status: activeVersion ? "active" : "draft", manifest: { allowed_tools: ["file_read"], preconditions: ["선행"] } },
      { version_id: "v1", version: "0.9.0", status: "deprecated", manifest: {} },
    ],
    runs: [{ run_id: "r1", version: "1.0.0", status: "succeeded", cost_usd: 0.01, latency_ms: 20, started_at: "2026-10-28T01:00:00Z" }],
  });
  if (!parsed) throw new Error("parse failed");
  return parsed;
}

const render = (user: Parameters<typeof permissionsFor>[0], d = detail("read")) =>
  renderToStaticMarkup(
    <SkillDetailView detail={d} perms={permissionsFor(user)} busy={false} onAction={vi.fn()} onVersionAction={vi.fn()} />,
  );

const has = (html: string, testId: string) => html.includes(`data-testid="${testId}"`);

describe("SkillDetailView buttons by role", () => {
  it("CEO sees every management button", () => {
    const html = render({ is_internal_admin: true });
    for (const id of ["skill-action-execute", "skill-action-rollback", "skill-action-disable", "skill-version-validate", "skill-version-promote"]) {
      expect(has(html, id)).toBe(true);
    }
  });

  it("a member can run a read skill but sees no management buttons", () => {
    const html = render({ tenant_role: "member" });
    expect(has(html, "skill-action-execute")).toBe(true);
    for (const id of ["skill-action-rollback", "skill-action-disable", "skill-version-validate", "skill-version-promote"]) {
      expect(has(html, id)).toBe(false);
    }
  });

  it("a viewer sees no action buttons at all", () => {
    const html = render({ tenant_role: "viewer" });
    expect(has(html, "skill-actions")).toBe(false);
    expect(has(html, "skill-version-promote")).toBe(false);
  });

  it("hides execute for non-read tiers even for the CEO", () => {
    const html = render({ is_internal_admin: true }, detail("write"));
    expect(has(html, "skill-action-execute")).toBe(false);
    expect(has(html, "skill-action-disable")).toBe(true);
    expect(html).toContain("조회 외 등급");
  });

  it("hides execute when there is no active version", () => {
    const html = render({ is_internal_admin: true }, detail("read", null));
    expect(has(html, "skill-action-execute")).toBe(false);
    expect(html).toContain("활성 버전이 없어");
  });
});

describe("SkillDetailView content", () => {
  it("shows tools, rules, version history, recent runs and the drift badge", () => {
    const html = render({ tenant_role: "member" });
    expect(html).toContain("file_read");
    expect(html).toContain("선행");
    expect(html.match(/data-testid="skill-version-row"/g)).toHaveLength(3);
    expect(html.match(/data-testid="skill-run-row"/g)).toHaveLength(1);
    expect(html).toContain("파일과 다름");
    expect(html).toContain("min-height:44px");
  });
});
