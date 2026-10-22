import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseCanonicalDocHref } from "@/lib/canonicalDocLinks";
import { buildGoalCanonicalHref, goalDocumentKindLabel, goalDocumentView, type GoalDocument } from "@/lib/goalDocuments";
import { GoalDocumentChips } from "./GoalDocumentChips";

const canonical = (over: Partial<GoalDocument> = {}): GoalDocument => ({
  source: "canonical", kind: "prd", title: "목표 패널 요구사항", document_key: "goal-panel-prd",
  project_key: "AADS", version: "3", approved: true, doc_path: null, ...over,
});
const legacy = (over: Partial<GoalDocument> = {}): GoalDocument => ({
  source: "legacy", id: 7, kind: "plan", title: "옛 기획서", doc_path: "/root/aads/aads-docs/docs/old-plan.md",
  document_key: "old-plan", version: "2", ...over,
});

describe("buildGoalCanonicalHref", () => {
  it("builds the /docs canonical deep link", () => {
    expect(buildGoalCanonicalHref(canonical())).toBe("/docs?tab=canonical&project=AADS&document_key=goal-panel-prd");
  });
  it("round-trips through the /docs parser", () => {
    expect(parseCanonicalDocHref(buildGoalCanonicalHref(canonical()))).toMatchObject({ project: "AADS", documentKey: "goal-panel-prd" });
  });
  it("returns no link for a missing or malformed reference", () => {
    expect(buildGoalCanonicalHref(canonical({ project_key: "" }))).toBe("");
    expect(buildGoalCanonicalHref(canonical({ document_key: "../etc/passwd" }))).toBe("");
  });
});

describe("goalDocumentKindLabel", () => {
  it("uses business names", () => {
    expect([goalDocumentKindLabel("plan"), goalDocumentKindLabel("prd"), goalDocumentKindLabel("design"), goalDocumentKindLabel("report")])
      .toEqual(["기획", "PRD", "설계", "보고"]);
    expect(goalDocumentKindLabel("weird")).toBe("문서");
  });
});

describe("goalDocumentView", () => {
  it("keeps legacy docs on the file viewer link", () => {
    const v = goalDocumentView(legacy());
    expect(v.canonical).toBe(false);
    expect(v.href).toContain("/docs?");
    expect(v.href).toContain("file_path=old-plan.md");
    expect(v.versionLabel).toBe("최신 v2");
  });
});

describe("GoalDocumentChips", () => {
  it("shows the empty notice when there are no documents", () => {
    expect(renderToStaticMarkup(<GoalDocumentChips documents={[]} />)).toContain("연결된 문서 없음");
  });
  it("renders a canonical doc with title, kind, version, approval and deep link", () => {
    const html = renderToStaticMarkup(<GoalDocumentChips documents={[canonical()]} />);
    expect(html).toContain("목표 패널 요구사항");
    expect(html).toContain("PRD");
    expect(html).toContain("v3");
    expect(html).toContain("승인");
    expect(html).not.toContain("승인 전");
    expect(html).toContain('href="/docs?tab=canonical&amp;project=AADS&amp;document_key=goal-panel-prd"');
    expect(html).not.toContain("연결된 문서 없음");
  });
  it("marks unapproved canonical docs", () => {
    const html = renderToStaticMarkup(<GoalDocumentChips documents={[canonical({ approved: false })]} />);
    expect(html).toContain("승인 전");
    expect(html).toContain('data-approved="false"');
  });
  it("renders canonical and legacy docs together", () => {
    const html = renderToStaticMarkup(<GoalDocumentChips documents={[canonical(), legacy()]} />);
    expect(html).toContain('data-doc-source="canonical"');
    expect(html).toContain('data-doc-source="legacy"');
    expect(html).toContain("옛 기획서");
  });
  it("renders a canonical doc without a valid reference as a non-link", () => {
    const html = renderToStaticMarkup(<GoalDocumentChips documents={[canonical({ project_key: null })]} />);
    expect(html).toContain("목표 패널 요구사항");
    expect(html).not.toContain("<a ");
  });
});
