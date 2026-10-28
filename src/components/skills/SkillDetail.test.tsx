import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseSkillDetail, parseSkillList, permissionsFor } from "@/lib/skillCatalog";
import SkillDialog from "./SkillDialog";
import { SkillDetailView } from "./SkillDetail";
import { SkillListItem } from "./SkillList";

function detail(riskTier: string, activeVersion: string | null = "1.0.0", extra: Record<string, unknown> = {}) {
  const parsed = parseSkillDetail({
    skill_id: "s1", slug: "sample", title: "샘플 스킬", description: "설명", projects: ["AADS"], risk_tier: riskTier, enabled: true,
    active_version: activeVersion, source: "file", file_drift: true, ...extra,
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

const SHARED = { scope: "shared", read_only: true, owner_label: "공용" };
const sharedDetail = (riskTier = "read") => detail(riskTier, "1.0.0", SHARED);

describe("read-only shared skills", () => {
  it("disables execute, rollback, disable and version buttons and shows the notice", () => {
    const html = render({ is_internal_admin: true }, sharedDetail());
    for (const id of ["skill-action-execute", "skill-action-rollback", "skill-action-disable", "skill-version-validate", "skill-version-promote"]) {
      expect(has(html, id)).toBe(true);
      const tag = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
      expect(tag).toContain("disabled");
    }
    expect(html).toContain("공용 스킬은 조회만 가능합니다");
    expect(has(html, "skill-shared-badge")).toBe(true);
  });

  it("keeps the previous behavior when read_only is missing or false", () => {
    for (const extra of [{}, { read_only: false, scope: "tenant" }]) {
      const html = render({ is_internal_admin: true }, detail("read", "1.0.0", extra));
      const tag = html.match(/<button[^>]*data-testid="skill-action-execute"[^>]*>/)?.[0] ?? "";
      expect(tag).not.toContain("disabled");
      expect(html).not.toContain("공용 스킬은 조회만 가능합니다");
      expect(has(html, "skill-shared-badge")).toBe(false);
    }
  });
});

describe("shared badge in the list", () => {
  const list = (items: Record<string, unknown>[]) => {
    const parsed = parseSkillList({ items });
    if (!parsed) throw new Error("parse failed");
    return parsed;
  };
  const row = (extra: Record<string, unknown>) => list([{ skill_id: "a", slug: "a", title: "A", risk_tier: "read", ...extra }])[0];
  const html = (extra: Record<string, unknown>) =>
    renderToStaticMarkup(<SkillListItem skill={row(extra)} selected={false} onSelect={vi.fn()} />);

  it("shows owner_label, falls back to 공용, and hides the badge for normal skills", () => {
    expect(html({ scope: "shared", read_only: true, owner_label: "AADS 공용" })).toContain("AADS 공용");
    const fallback = html({ scope: "shared", read_only: true, owner_label: null });
    expect(fallback).toContain("skill-shared-badge");
    expect(fallback).toContain(">공용<");
    expect(html({})).not.toContain("skill-shared-badge");
    expect(html({ scope: "tenant", read_only: false })).not.toContain("skill-shared-badge");
  });
});

const GUIDE = {
  title_ko: "파이프라인 러너 작업 복구",
  summary_ko: "멈춘 러너 작업을 로그 근거로 확인하고 복구합니다.",
  what_it_does: ["러너 작업 상태를 다시 조회합니다."],
  use_when: ["러너 작업이 오래 진행되지 않을 때"],
  inputs: [{ name: "task_id", description: "복구할 작업 번호", example: "runner-1234", required: true }],
  outputs: "상태 재조회 결과와 실행 기록이 남습니다.",
  approval_ko: "쓰기 등급이라 대표님 승인 후에만 실행됩니다.",
  related_tools: ["pipeline_runner_status"],
};

describe("guide card", () => {
  it("renders the guide at the top with every item and moves slug/executor into the folded tech info", () => {
    const html = render({ is_internal_admin: true }, detail("read", "1.0.0", { guide: GUIDE, executor: "ohvis.runner", executable: true }));
    expect(html.indexOf("skill-guide-card")).toBeLessThan(html.indexOf("skill-actions"));
    for (const text of ["이 스킬은", "파이프라인 러너 작업 복구", "멈춘 러너 작업", "러너 작업 상태를 다시 조회", "오래 진행되지 않을 때", "task_id", "복구할 작업 번호", "예시: runner-1234", "상태 재조회 결과", "대표님 승인 후에만"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("안내 미작성");
    const tech = html.slice(html.indexOf('data-testid="skill-tech-info"'));
    expect(tech).toContain("sample");
    expect(tech).toContain("ohvis.runner");
    expect(html.slice(0, html.indexOf("skill-tech-info"))).not.toContain("ohvis.runner");
    expect(html).toContain("<details");
  });

  it("marks empty items as 안내 미작성 instead of leaving them blank", () => {
    const html = render({ tenant_role: "member" }, detail("read", "1.0.0", { guide: { title_ko: "빈 안내", summary_ko: "요약만 있음" } }));
    expect(html).toContain("요약만 있음");
    expect(html.match(/안내 미작성/g)).toHaveLength(4);
  });

  it("stays compatible with an old API response that has no guide fields", () => {
    const html = render({ is_internal_admin: true });
    expect(html).toContain("샘플 스킬");
    expect(html.match(/안내 미작성/g)).toHaveLength(5);
    expect(html).not.toContain("skill-not-executable-reason");
    const tag = html.match(/<button[^>]*data-testid="skill-action-execute"[^>]*>/)?.[0] ?? "";
    expect(tag).not.toContain("disabled");
  });
});

describe("executable=false", () => {
  const blocked = { executable: false, not_executable_reason_ko: "실제 동작이 연결되지 않은 후보입니다.", executor: "ohvis.contract-echo" };

  it("disables the execute button and shows the reason", () => {
    const html = render({ is_internal_admin: true }, detail("read", "1.0.0", blocked));
    const tag = html.match(/<button[^>]*data-testid="skill-action-execute"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain("disabled");
    expect(html).toContain("실제 동작이 연결되지 않은 후보입니다.");
    expect(html).toContain("실행 불가");
  });

  it("shows the reason even when the execute button is hidden", () => {
    const html = render({ tenant_role: "viewer" }, detail("read", null, blocked));
    expect(has(html, "skill-action-execute")).toBe(false);
    expect(html).toContain("실제 동작이 연결되지 않은 후보입니다.");
  });
});

describe("list title, summary and 실행 불가 badge", () => {
  const html = (extra: Record<string, unknown>) => {
    const parsed = parseSkillList({ items: [{ skill_id: "a", slug: "learned-site-x", title: "learned-site-x", risk_tier: "read", ...extra }] });
    if (!parsed) throw new Error("parse failed");
    return renderToStaticMarkup(<SkillListItem skill={parsed[0]} selected={false} onSelect={vi.fn()} />);
  };

  it("uses guide.title_ko and summary_ko, and badges non-executable skills", () => {
    const out = html({ guide: { title_ko: "사이트 관찰 후보: a.com", summary_ko: "실행해도 결과가 없습니다." }, executable: false });
    expect(out).toContain("사이트 관찰 후보: a.com");
    expect(out).toContain("실행해도 결과가 없습니다.");
    expect(out).toContain("skill-not-executable-badge");
  });

  it("falls back to title without a guide and shows no badge", () => {
    const out = html({});
    expect(out).toContain("learned-site-x");
    expect(out).not.toContain("skill-not-executable-badge");
    expect(out).not.toContain("skill-list-summary");
  });
});

describe("execute dialog guide", () => {
  const dialog = (extra: Record<string, unknown>) =>
    renderToStaticMarkup(<SkillDialog request={{ kind: "execute" }} skill={detail("read", "1.0.0", extra)} onClose={vi.fn()} onChanged={vi.fn()} />);

  it("shows input descriptions and examples from guide.inputs", () => {
    const html = dialog({ guide: GUIDE });
    expect(html).toContain("skill-execute-guide");
    expect(html).toContain("복구할 작업 번호");
    expect(html).toContain("예시: runner-1234");
  });

  it("omits the guide block when there is none", () => {
    expect(dialog({})).not.toContain("skill-execute-guide");
  });
});
