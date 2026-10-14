import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanonicalDocument } from "@/lib/api";
import {
  duplicateKeyTails, filterDocuments, kstShort, listBodyState, NO_FILTERS, optionCounts, recentDocuments, selectionPresence,
} from "@/lib/canonicalDocumentView";
import { CanonicalListBody, CanonicalSummary, ProblemBox } from "./CanonicalDocuments";

const doc = (key: string, title = key): CanonicalDocument => ({
  id: key, document_key: key, title, kind: "prd", status: "draft", updated_at: "2026-10-14T02:00:00Z",
} as unknown as CanonicalDocument);

const noop = () => {};
const render = (overrides: Partial<Parameters<typeof CanonicalListBody>[0]> = {}) => renderToStaticMarkup(
  <CanonicalListBody loading={false} slow={false} error={null} documents={[]} query="" selected={null}
    onSelect={noop} onRetry={noop} onClearSearch={noop} {...overrides} />,
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

describe("목록 행 디자인", () => {
  it("does not render the placeholder phrase", () => {
    const html = render({ documents: [doc("a"), doc("b")], selected: "a" });
    expect(html).not.toContain("버전 상세에서 확인");
    expect(html).not.toContain("상세에서 확인");
    expect(html).toContain("제품 요구사항");
    expect(html).toContain("초안");
    expect(html).toContain("10/14 11:00");
  });

  it("marks the selected row with the accent bar", () => {
    const html = render({ documents: [doc("a"), doc("b")], selected: "b" });
    expect(html.match(/border-left:3px solid var\(--accent\)/g)).toHaveLength(1);
  });

  it("shows a dimmed document_key tail only for duplicated titles", () => {
    const documents = [
      doc("chat-scroll-report-aaaa1111", "채팅 스크롤 보고서"),
      doc("chat-scroll-report-bbbb2222", "채팅 스크롤 보고서"),
      doc("unique-doc-key-cccc3333", "다른 문서"),
    ];
    const html = render({ documents });
    expect(html).toContain("…aa1111");
    expect(html).toContain("…bb2222");
    expect(html).not.toContain("cccc3333");
    expect(html).toContain("opacity-60");
  });

  it("shows the revision number only when the API provides it", () => {
    const withRevision = { ...doc("r", "개정 문서"), revision: 3 } as unknown as CanonicalDocument;
    expect(render({ documents: [withRevision] })).toContain("<span>r3</span>");
    expect(render({ documents: [doc("n", "개정 문서")] })).not.toContain("<span>r");
  });

  it("renders skeleton rows instead of a visible loading sentence", () => {
    const html = render({ loading: true });
    expect(html).toContain('data-testid="doc-list-skeleton"');
    expect(html.match(/animate-pulse/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("sr-only");
  });
});

describe("상태·종류 필터", () => {
  const docs = [
    { ...doc("a"), status: "approved", kind: "prd" }, { ...doc("b"), status: "draft", kind: "prd" },
    { ...doc("c"), status: "draft", kind: "report" }, { ...doc("d"), status: "draft", kind: "report" },
  ] as unknown as CanonicalDocument[];

  it("counts options within the other filter and filters the loaded list", () => {
    const counts = optionCounts(docs, NO_FILTERS);
    expect(counts.status.get("approved")).toBe(1);
    expect(counts.status.get("draft")).toBe(3);
    expect(filterDocuments(docs, { status: "draft", kind: "" })).toHaveLength(3);
    expect(filterDocuments(docs, { status: "draft", kind: "report" }).map((d) => d.document_key)).toEqual(["c", "d"]);
    expect(optionCounts(docs, { status: "", kind: "report" }).status.get("approved")).toBeUndefined();
    expect(optionCounts(docs, { status: "approved", kind: "" }).status.get("draft")).toBe(3);
  });

  it("tells the user when the filter hides everything", () => {
    const html = render({ documents: [], totalCount: 4, filtered: true, onClearFilters: noop });
    expect(html).toContain("필터 초기화");
    expect(html).not.toContain("승인된 정본 없음");
  });

  it("keeps the 100 cap notice based on the unfiltered total", () => {
    expect(render({ documents: [doc("x")], totalCount: 100, filtered: true })).toContain("최대 100건이 표시됩니다");
  });
});

describe("선택 없음 요약", () => {
  const docs = [
    { ...doc("a"), status: "approved", kind: "prd", updated_at: "2026-10-14T01:00:00Z" },
    { ...doc("b"), status: "draft", kind: "report", updated_at: "2026-10-14T03:00:00Z" },
    { ...doc("c"), status: "draft", kind: "report", updated_at: "2026-10-13T03:00:00Z" },
  ] as unknown as CanonicalDocument[];

  it("shows status counts, kind counts and recent documents", () => {
    const html = renderToStaticMarkup(<CanonicalSummary project="AADS" documents={docs} loading={false} error={false}
      keyTails={duplicateKeyTails(docs)} onSelect={noop} />);
    expect(html).toContain("AADS 정본 요약");
    expect(html).toContain("상태별");
    expect(html).toContain("종류별");
    expect(html).toContain("최근 수정 5건");
    expect(html).toContain("보고서");
    expect(html.indexOf(">b<")).toBeLessThan(html.indexOf(">c<"));
  });

  it("sorts recent documents newest first and caps at five", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...doc(`k${i}`), updated_at: `2026-10-1${i}T00:00:00Z` })) as unknown as CanonicalDocument[];
    expect(recentDocuments(many).map((d) => d.document_key)).toEqual(["k7", "k6", "k5", "k4", "k3"]);
  });

  it("shows a skeleton while loading", () => {
    const html = renderToStaticMarkup(<CanonicalSummary project="AADS" documents={[]} loading error={false} keyTails={new Map()} onSelect={noop} />);
    expect(html).toContain('data-testid="doc-list-skeleton"');
  });
});

describe("시각 헬퍼", () => {
  it("formats same-year times as MM/DD HH:mm in KST and other years with the year", () => {
    const now = new Date("2026-10-14T05:00:00Z");
    expect(kstShort("2026-10-14T03:47:00Z", now)).toBe("10/14 12:47");
    expect(kstShort("2026-01-01T00:00:00Z", now)).toBe("01/01 09:00");
    expect(kstShort("2025-10-01T00:00:00Z", now)).toBe("2025/10/01 09:00");
    expect(kstShort(null, now)).toBe("—");
  });

  it("finds the shortest distinguishing key tail", () => {
    const tails = duplicateKeyTails([
      { document_key: "same-title-key-1", title: "T", kind: "", status: "", updated_at: "" },
      { document_key: "same-title-key-2", title: "T", kind: "", status: "", updated_at: "" },
    ]);
    expect(tails.get("same-title-key-1")).toBe("…-key-1");
    expect(tails.get("same-title-key-2")).toBe("…-key-2");
    expect(tails.get("same-title-key-1")).not.toBe(tails.get("same-title-key-2"));
  });
});
