import { describe, expect, it } from "vitest";
import {
  CANONICAL_CONFLICT_FALLBACK, CANONICAL_NAV_PROJECTS, CANONICAL_NO_APPROVAL_TEXT, canonicalApprovalBadge, canonicalConflictText,
  canonicalErrorKind, isLegacyApprovalList, mergeCanonicalProjects,
} from "./canonicalProjects";

describe("mergeCanonicalProjects", () => {
  it("offers AADS, ACCT and GO100 when the file scan is empty, failed or pending", () => {
    for (const scanned of [[], undefined]) {
      const names = mergeCanonicalProjects(scanned);
      expect(names).toEqual(expect.arrayContaining(["AADS", "ACCT", "GO100"]));
      expect(names).toEqual([...CANONICAL_NAV_PROJECTS]);
    }
  });

  it("adds scanned projects once and drops keys the document API would reject", () => {
    const names = mergeCanonicalProjects(["ACCT", "NEWPROJ", "ShortFlow", "bad key", "../x"]);
    expect(names.filter((name) => name === "ACCT")).toHaveLength(1);
    expect(names).toContain("NEWPROJ");
    expect(names).not.toContain("ShortFlow");
    expect(names).not.toContain("bad key");
    expect(names).not.toContain("../x");
  });
});

describe("canonicalErrorKind", () => {
  it("separates auth, grant, conflict and network failures", () => {
    expect(canonicalErrorKind(new Error("401: 세션이 만료되었습니다."))).toBe("auth");
    expect(canonicalErrorKind(new Error('API error 403: {"detail":"project_access_denied"}'))).toBe("forbidden");
    expect(canonicalErrorKind(new Error("API error 409: stale"))).toBe("conflict");
    expect(canonicalErrorKind(new Error("API error 500: id 4031 failed"))).toBe("network");
    expect(canonicalErrorKind(new TypeError("Failed to fetch"))).toBe("network");
    expect(canonicalErrorKind("x")).toBe("network");
  });
});

describe("canonicalConflictText", () => {
  const conflict = (detail: unknown) => new Error(`API error 409: ${JSON.stringify({ detail })}`);

  it("explains each server rejection code", () => {
    expect(canonicalConflictText(conflict({ code: "document_split_required", message: "분할 권고" }))).toBe(
      "문서가 너무 길어(5만 자 초과) 검토·승인할 수 없습니다. 문서를 나누어 등록해 주세요.");
    const cross = canonicalConflictText(conflict({ code: "cross_review_required", message: "x", review_state: "pending" }));
    expect(cross).toContain("교차 검토가 필요합니다(현재: pending)");
    expect(cross).toContain("자동 시작");
    expect(canonicalConflictText(conflict({ code: "cross_review_required" }))).not.toContain("현재:");
    expect(canonicalConflictText(conflict({ code: "approval_not_required" }))).toContain("D1");
    expect(canonicalConflictText(conflict("revision_not_in_review"))).toContain("검토로 이동");
    expect(canonicalConflictText(conflict("revision_already_decided"))).toContain("이미 승인 또는 보관");
  });

  it("keeps the legacy text for generation_conflict, missing code and unparsable bodies", () => {
    expect(canonicalConflictText(conflict("generation_conflict"))).toBe(CANONICAL_CONFLICT_FALLBACK);
    expect(canonicalConflictText(conflict({ message: "no code" }))).toBe(CANONICAL_CONFLICT_FALLBACK);
    expect(canonicalConflictText(new Error("API error 409: stale"))).toBe(CANONICAL_CONFLICT_FALLBACK);
    expect(canonicalConflictText("x")).toBe(CANONICAL_CONFLICT_FALLBACK);
  });

  it("shows the server message for unknown codes", () => {
    expect(canonicalConflictText(conflict({ code: "new_rule", message: "새 규칙 위반" }))).toBe("새 규칙 위반");
    expect(canonicalConflictText(conflict({ code: "new_rule" }))).toBe(CANONICAL_CONFLICT_FALLBACK);
  });
});

describe("canonicalApprovalBadge", () => {
  it("marks approval_required documents as '승인 필요'", () => {
    expect(canonicalApprovalBadge({ approval_required: true, status: "draft" })).toBe("required");
    expect(canonicalApprovalBadge({ approval_required: true, status: "approved", approved_revision_id: "r1" })).toBe("required");
  });

  it("marks non-required, non-approved documents as '기록용'", () => {
    expect(canonicalApprovalBadge({ approval_required: false, status: "draft" })).toBe("record");
    expect(canonicalApprovalBadge({ approval_required: false, status: "review", approved_revision_id: null })).toBe("record");
  });

  it("keeps the existing display for approved documents", () => {
    expect(canonicalApprovalBadge({ approval_required: false, status: "approved" })).toBeNull();
    expect(canonicalApprovalBadge({ approval_required: false, status: "draft", approved_revision_id: "r1" })).toBeNull();
  });

  it("shows no badge when an old server omits the field", () => {
    expect(canonicalApprovalBadge({ status: "draft" })).toBeNull();
    expect(canonicalApprovalBadge({ approval_required: "true", status: "draft" })).toBeNull();
  });
});

describe("isLegacyApprovalList", () => {
  it("detects an old server response and treats empty lists as undecided", () => {
    expect(isLegacyApprovalList([])).toBe(false);
    expect(isLegacyApprovalList([{ approval_required: true }, { approval_required: false }])).toBe(false);
    expect(isLegacyApprovalList([{}, {}])).toBe(true);
    expect(isLegacyApprovalList([{ approval_required: true }, {}])).toBe(true);
  });

  it("has the zero-result guidance text", () => {
    expect(CANONICAL_NO_APPROVAL_TEXT).toContain("승인할 문서가 없습니다");
    expect(CANONICAL_NO_APPROVAL_TEXT).toContain("승인 없이 기록으로 보관");
  });
});
