import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanonicalDocument } from "@/lib/api";
import { listBodyState, selectionPresence } from "@/lib/canonicalDocumentView";
import { CanonicalListBody, ProblemBox } from "./CanonicalDocuments";

const doc = (key: string, title = key): CanonicalDocument => ({
  id: key, document_key: key, title, kind: "prd", status: "draft", updated_at: "2026-10-14T02:00:00Z",
} as unknown as CanonicalDocument);

const noop = () => {};
const render = (overrides: Partial<Parameters<typeof CanonicalListBody>[0]> = {}) => renderToStaticMarkup(
  <CanonicalListBody loading={false} slow={false} error={null} documents={[]} query="" selected={null}
    selectedVersion={null} onSelect={noop} onRetry={noop} onClearSearch={noop} {...overrides} />,
);

describe("selectionPresence (검색 후 상세 유지)", () => {
  const keys = ["a", "b"];
  it("keeps the detail when the selected document is still in the result", () => {
    expect(selectionPresence({ selected: "a", keys, loading: false, hasError: false })).toBe("present");
  });
  it("tells the user when the selected document is not in the search result", () => {
    expect(selectionPresence({ selected: "z", keys, loading: false, hasError: false })).toBe("missing");
  });
  it("does not claim anything while the list is loading or failed", () => {
    expect(selectionPresence({ selected: "z", keys: [], loading: true, hasError: false })).toBe("unknown");
    expect(selectionPresence({ selected: "z", keys: [], loading: false, hasError: true })).toBe("unknown");
    expect(selectionPresence({ selected: null, keys, loading: false, hasError: false })).toBe("none");
  });
});

describe("listBodyState (0건·검색 0건·오류 구분)", () => {
  it("separates the five states", () => {
    expect(listBodyState({ loading: true, hasError: false, count: 3, query: "" })).toBe("loading");
    expect(listBodyState({ loading: false, hasError: true, count: 0, query: "x" })).toBe("error");
    expect(listBodyState({ loading: false, hasError: false, count: 0, query: "" })).toBe("empty");
    expect(listBodyState({ loading: false, hasError: false, count: 0, query: "x" })).toBe("no-results");
    expect(listBodyState({ loading: false, hasError: false, count: 2, query: "x" })).toBe("list");
  });
});

describe("CanonicalListBody", () => {
  it("highlights the deep-linked document", () => {
    const html = render({ documents: [doc("first"), doc("target")], selected: "target" });
    const items = html.match(/<button[^>]*aria-current="true"[^>]*>/g) || [];
    expect(items).toHaveLength(1);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("target"));
  });

  it("shows the login recovery link in the list slot on 401", () => {
    const error = { kind: "auth" as const, text: "로그인이 만료되었습니다. 다시 로그인한 뒤 재시도하세요." };
    const html = render({ error });
    expect(html).toContain('role="alert"');
    expect(html).toContain("로그인 복구");
    expect(html).toContain("/login?next=");
    expect(html).not.toContain("승인된 정본 없음");
    expect(html).not.toContain("검색 결과가 없습니다");
  });

  it("does not show the login link for network errors", () => {
    const html = renderToStaticMarkup(<ProblemBox problem={{ kind: "network", text: "연결 실패" }} />);
    expect(html).toContain("연결 실패");
    expect(html).not.toContain("로그인 복구");
  });

  it("uses different copy for empty list, empty search and error", () => {
    const empty = render();
    const noResults = render({ query: "상세" });
    const failed = render({ error: { kind: "network", text: "연결 실패" } });
    expect(empty).toContain("승인된 정본 없음");
    expect(noResults).toContain("검색 결과가 없습니다");
    expect(noResults).toContain("검색 해제");
    expect(failed).toContain("연결 실패");
    expect(new Set([empty, noResults, failed]).size).toBe(3);
  });

  it("shows retry only once loading is slow", () => {
    expect(render({ loading: true })).toContain("목록을 불러오는 중");
    expect(render({ loading: true })).not.toContain("재시도");
    const slow = render({ loading: true, slow: true });
    expect(slow).toContain("아직 불러오는 중");
    expect(slow).toContain("재시도");
  });

  it("keeps the 100-item cap notice", () => {
    const documents = Array.from({ length: 100 }, (_, i) => doc(`k${i}`));
    expect(render({ documents })).toContain("최대 100건이 표시됩니다");
    expect(render({ documents: documents.slice(0, 99) })).not.toContain("최대 100건");
  });
});
