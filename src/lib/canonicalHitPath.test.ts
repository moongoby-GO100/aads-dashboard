import { describe, expect, it } from "vitest";
import { parseCanonicalHitPath } from "./canonicalHitPath";

describe("parseCanonicalHitPath", () => {
  it("parses real DB path with revision UUID (crosscheck)", () => {
    expect(parseCanonicalHitPath("canonical://AADS/aads-canonical-crosscheck-m8@2d23de86-8fb3-46d9-8080-71a35faa76c3")).toEqual({
      project: "AADS", documentKey: "aads-canonical-crosscheck-m8",
      revisionId: "2d23de86-8fb3-46d9-8080-71a35faa76c3", revision: undefined,
    });
  });

  it("parses real DB path with revision UUID (scroll fix)", () => {
    expect(parseCanonicalHitPath("canonical://AADS/aads-chat-scroll-automove-recur-fix-20261012@a257ac92-de17-4837-bcaf-76528b061197")).toEqual({
      project: "AADS", documentKey: "aads-chat-scroll-automove-recur-fix-20261012",
      revisionId: "a257ac92-de17-4837-bcaf-76528b061197", revision: undefined,
    });
  });

  it("accepts upper-case UUID and normalizes to lower-case", () => {
    expect(parseCanonicalHitPath("canonical://AADS/k@2D23DE86-8FB3-46D9-8080-71A35FAA76C3")?.revisionId)
      .toBe("2d23de86-8fb3-46d9-8080-71a35faa76c3");
  });

  it("parses legacy numeric revision", () => {
    expect(parseCanonicalHitPath("canonical://AADS/m5-evidence-report@3")).toEqual({
      project: "AADS", documentKey: "m5-evidence-report", revisionId: undefined, revision: 3,
    });
  });

  it("keeps dotted/colon keys and upper-cases the project", () => {
    expect(parseCanonicalHitPath("canonical://go100/spec.v2:main@12")).toEqual({
      project: "GO100", documentKey: "spec.v2:main", revisionId: undefined, revision: 12,
    });
  });

  it("allows a missing revision", () => {
    expect(parseCanonicalHitPath("canonical://AADS/some-key")).toEqual({
      project: "AADS", documentKey: "some-key", revisionId: undefined, revision: undefined,
    });
  });

  it("rejects malformed or non-canonical paths", () => {
    for (const bad of [
      "", "/root/aads/docs/a.md", "canonical:/AADS/k@1", "canonical://", "canonical://AADS",
      "canonical://AADS/", "canonical:///k@1", "canonical://AADS/k@", "canonical://AADS/k@0",
      "canonical://AADS/k@x", "canonical://AADS/k@1@2", "canonical://AADS/a/b@1",
      "canonical://bad key/k@1", "canonical://AADS/@1", "canonical://../k@1",
      "canonical://AADS/k@2d23de86-8fb3-46d9-8080-71a35faa76c", // UUID 한 글자 부족
      "canonical://AADS/k@2d23de86-8fb3-46d9-8080-71a35faa76c3x",
      "canonical://AADS/k@zd23de86-8fb3-46d9-8080-71a35faa76c3",
      "canonical://AADS/../x@2d23de86-8fb3-46d9-8080-71a35faa76c3",
      "canonical://AADS/a/b@2d23de86-8fb3-46d9-8080-71a35faa76c3",
    ]) {
      expect(parseCanonicalHitPath(bad)).toBeNull();
    }
    expect(parseCanonicalHitPath(undefined)).toBeNull();
    expect(parseCanonicalHitPath(null)).toBeNull();
  });
});
