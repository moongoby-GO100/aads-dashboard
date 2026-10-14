import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTRACT_OPEN_KEY,
  PinnedContractCard,
  ProjectFileFilters,
  readStoredFlag,
  summarizeFilters,
  writeStoredFlag,
  type ProjectFileFiltersProps,
} from "./ProjectFileFilters";

const noop = () => {};
const baseProps: ProjectFileFiltersProps = {
  expanded: false,
  onToggle: noop,
  selectedType: "all",
  selectedFormat: "all",
  availableTypes: ["plan", "report"],
  availableFormats: ["markdown", "pdf"],
  typeCounts: { plan: 3, report: 9 },
  formatCounts: { markdown: 10, pdf: 2 },
  totalCount: 12,
  typeLabels: { plan: "기획/계획", report: "리포트" },
  formatLabels: { markdown: "Markdown", pdf: "PDF" },
  onTypeChange: noop,
  onFormatChange: noop,
  onReset: noop,
};
const renderFilters = (overrides: Partial<ProjectFileFiltersProps> = {}) =>
  renderToStaticMarkup(<ProjectFileFilters {...baseProps} {...overrides} />);

describe("ProjectFileFilters", () => {
  it("is collapsed by default: one 필터 button, no chips, no reset", () => {
    const html = renderFilters();
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-testid=\"docs-filter-chips\"");
    expect(html).not.toContain("전체 유형");
    expect(html).not.toContain("리포트");
    expect(html).not.toContain("초기화");
    expect((html.match(/<button/g) || []).length).toBe(1);
  });

  it("summarizes active filters on the button and offers 초기화 on the same row", () => {
    const html = renderFilters({ selectedType: "plan", selectedFormat: "markdown" });
    expect(html).toContain("필터 · 기획/계획 · Markdown");
    expect(html).toContain("초기화");
    expect(html).not.toContain("data-testid=\"docs-filter-chips\"");
  });

  it("summarizes a single active filter without the other", () => {
    expect(summarizeFilters(null, null)).toBe("필터");
    expect(summarizeFilters("리포트", null)).toBe("필터 · 리포트");
    expect(summarizeFilters(null, "PDF")).toBe("필터 · PDF");
  });

  it("shows chips in a height-limited scroll area when expanded", () => {
    const html = renderFilters({ expanded: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="docs-filter-chips"');
    expect(html).toMatch(/data-testid="docs-filter-chips"[^>]*class="[^"]*max-h-40[^"]*overflow-y-auto/);
    expect(html).toContain("전체 유형 12");
    expect(html).toContain("기획/계획 3");
    expect(html).toContain("PDF 2");
  });
});

const files = ["a.md", "b.md"].map((name) => ({
  key: name, name, typeLabel: "계약/전자계약", typeClassName: "x", onOpen: noop,
}));
const renderCard = (expanded: boolean) => renderToStaticMarkup(
  <PinnedContractCard files={files} totalCount={7} expanded={expanded} onToggle={noop} onShowAll={noop} />,
);

describe("PinnedContractCard", () => {
  it("collapsed: only the title and the true count are visible", () => {
    const html = renderCard(false);
    expect(html).toContain("전자계약 문서");
    expect(html).toContain("7건");
    expect(html).not.toContain("a.md");
    expect(html).not.toContain("전체 보기");
    expect(html).toContain('aria-expanded="false"');
  });

  it("expanded: lists the pinned files and 전체 보기", () => {
    const html = renderCard(true);
    expect(html).toContain("a.md");
    expect(html).toContain("b.md");
    expect(html).toContain("전체 보기");
  });
});

describe("stored open flag", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to collapsed and round-trips through localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    expect(readStoredFlag(CONTRACT_OPEN_KEY)).toBe(false);
    writeStoredFlag(CONTRACT_OPEN_KEY, true);
    expect(readStoredFlag(CONTRACT_OPEN_KEY)).toBe(true);
    writeStoredFlag(CONTRACT_OPEN_KEY, false);
    expect(readStoredFlag(CONTRACT_OPEN_KEY)).toBe(false);
  });

  it("stays collapsed when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
      },
    });
    expect(readStoredFlag(CONTRACT_OPEN_KEY)).toBe(false);
    expect(() => writeStoredFlag(CONTRACT_OPEN_KEY, true)).not.toThrow();
  });
});
