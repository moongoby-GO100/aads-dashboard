import { describe, expect, it } from "vitest";
import { CANONICAL_NAV_PROJECTS, canonicalErrorKind, mergeCanonicalProjects } from "./canonicalProjects";

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
