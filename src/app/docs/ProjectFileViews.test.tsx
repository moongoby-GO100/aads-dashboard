import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocContentViewer, { renderMarkdown, viewerKind } from "./DocContentViewer";
import type { ListedDocFile } from "./docFileTypes";
import FileViewerHeader, { viewerMetaText } from "./FileViewerHeader";
import { FileListNotice, fileListState, FileListSummary, ProjectChipRow, ProjectFileRows } from "./ProjectFileList";

const noop = () => {};
const file = (over: Partial<ListedDocFile> = {}): ListedDocFile => ({
  name: "20261014_화면 목업.md", path: "docs/design/20261014_화면 목업.md", size: 18200, modified: Date.parse("2026-10-14T03:28:00Z") / 1000,
  type: "plan", base_path: "/app", label: "서버 문서", format: "markdown", project: "AADS", ...over,
});

describe("ProjectFileRows (경로·라벨은 툴팁이 아니라 글자로)", () => {
  const html = (showProject: boolean) => renderToStaticMarkup(
    <ProjectFileRows files={[file()]} selectedFile={null} showProject={showProject} onOpen={noop} />,
  );
  it("shows the folder and the label as visible text", () => {
    const out = html(false);
    expect(out).toMatch(/data-part="folder"[^>]*>docs\/design</);
    expect(out).toMatch(/data-part="label"[^>]*>서버 문서</);
    expect(out).toContain("10-14 12:28 · 17.8KB");
  });
  it("hides the label on phones (<600px) and keeps it from 600px up", () => {
    expect(html(false)).toMatch(/data-part="label" class="hidden [^"]*min-\[600px\]:inline"/);
  });
  it("shows the project badge only in the 전체 view", () => {
    expect(html(true)).toContain('data-tone="project"');
    expect(html(false)).not.toContain('data-tone="project"');
  });
  it("marks the open file", () => {
    const out = renderToStaticMarkup(<ProjectFileRows files={[file()]} selectedFile={file()} showProject={false} onOpen={noop} />);
    expect(out).toContain('aria-current="true"');
  });
});

describe("목록 머리·프로젝트 칩", () => {
  it("renders the one-line summary", () => {
    const out = renderToStaticMarkup(<FileListSummary count={4016} scannedAt={Date.parse("2026-10-14T03:28:51Z") / 1000} />);
    expect(out).toContain("4,016건 · 12:28 갱신");
  });
  it("keeps the project chips on one scrolling line", () => {
    const out = renderToStaticMarkup(
      <ProjectChipRow total={6474} projects={[{ project: "AADS", total: 4024 }, { project: "KIS", total: 167 }]} selected="all" onSelect={noop} onRefresh={noop} refreshTitle="강제 재스캔" />,
    );
    expect(out).toContain("overflow-x-auto");
    expect(out).toContain("whitespace-nowrap");
    expect(out).not.toContain("flex-wrap");
    expect(out).toContain("전체 6,474");
  });
});

describe("목록 상태", () => {
  it("separates loading, error, empty and list", () => {
    expect(fileListState({ loading: true, error: null, count: 3 })).toBe("loading");
    expect(fileListState({ loading: false, error: "x", count: 0 })).toBe("error");
    expect(fileListState({ loading: false, error: null, count: 0 })).toBe("empty");
    expect(fileListState({ loading: false, error: null, count: 2 })).toBe("list");
  });
  const notice = (state: "loading" | "error" | "empty", extra = {}) => renderToStaticMarkup(
    <FileListNotice state={state} error="스캔 실패" search="" filtered={false} onRetry={noop} onResetFilters={noop} onClearSearch={noop} {...extra} />,
  );
  it("shows skeleton rows while loading", () => {
    expect(notice("loading")).toContain("doc-list-skeleton");
  });
  it("offers 다시 시도 on error", () => {
    const out = notice("error");
    expect(out).toContain("파일 목록을 불러오지 못했습니다");
    expect(out).toContain("스캔 실패");
    expect(out).toContain("다시 시도");
  });
  it("offers resets only for what is active when empty", () => {
    expect(notice("empty")).not.toContain("필터 초기화");
    const out = notice("empty", { search: "없는말", filtered: true });
    expect(out).toContain("필터 초기화");
    expect(out).toContain("검색어 지우기");
    expect(out).toContain("검색어: 없는말");
  });
});

describe("FileViewerHeader", () => {
  it("shows name, actions, label chip and the full path as text", () => {
    const out = renderToStaticMarkup(<FileViewerHeader file={file()} />);
    expect(out).toContain("직접 열기");
    expect(out).toContain("경로 복사");
    expect(out).toContain("서버 문서");
    expect(out).toContain("/app/docs/design/20261014_화면 목업.md");
    expect(out).toContain("수정 2026-10-14 12:28 KST · 17.8KB");
    expect(out).not.toContain("← 목록");
  });
  it("adds 목록 only when a back handler is given", () => {
    expect(renderToStaticMarkup(<FileViewerHeader file={file()} onBack={noop} />)).toContain("← 목록");
  });
  it("hides the size instead of printing 0B when it is unknown", () => {
    const unknown = file({ size: -1, modified: 0, name: "a.html", format: "html", label: "직접 열기" });
    expect(viewerMetaText(unknown)).toBe("");
    const out = renderToStaticMarkup(<FileViewerHeader file={unknown} />);
    expect(out).not.toContain("0B");
    expect(viewerMetaText(file({ size: 0 }))).toContain("0B");
  });
});

describe("마크다운 본문", () => {
  const table = "| 이름 | 값 |\n| --- | --- |\n| a | 1 |\n| b | 2 |\n";
  it("wraps tables for horizontal scroll and joins header and body into one table", () => {
    const out = renderMarkdown(table);
    expect(out).toContain('<div class="docs-md-table"><table');
    expect(out.match(/<table/g)).toHaveLength(1);
    expect(out).not.toContain("<br/><tr");
    expect(out).toContain("<td");
    expect(out.indexOf("이름")).toBeLessThan(out.indexOf(">a<"));
  });
  it("marks code blocks for horizontal scroll", () => {
    const out = renderMarkdown("```ts\nconst a = 1;\n```\n");
    expect(out).toMatch(/<pre class="docs-md-code [^"]*overflow-x-auto/);
  });
  it("still escapes HTML", () => {
    const out = renderMarkdown("<script>alert(1)</script>\n\n| <img src=x onerror=1> | b |\n| - | - |\n| c | d |");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
  it("renders in a centered ~860px column", () => {
    const out = renderToStaticMarkup(
      <DocContentViewer selectedFile={file()} fileContent={"# 제목\n본문"} fileMeta={{ encoding: "text", mime_type: "text/markdown", is_binary: false }} contentLoading={false} />,
    );
    expect(out).toContain("docs-md mx-auto w-full max-w-[860px]");
    expect(out).toContain("doc-viewer-scroll");
  });
});

describe("HTML 미리보기", () => {
  const html = file({ name: "a.html", path: "a.html", format: "html" });
  it("fills the pane height instead of a calc(100vh - …) guess", () => {
    expect(viewerKind(html, null)).toBe("frame");
    const out = renderToStaticMarkup(
      <DocContentViewer selectedFile={html} fileContent="<p>hi</p>" fileMeta={{ encoding: "text", mime_type: "text/html", is_binary: false }} contentLoading={false} />,
    );
    expect(out).toContain("doc-viewer-frame");
    expect(out).toContain("absolute inset-0 h-full w-full");
    expect(out).not.toContain("100vh");
    expect(out).toContain('sandbox="allow-same-origin allow-popups"');
  });
  it("scrolls everything that is not a frame", () => {
    expect(viewerKind(file(), null)).toBe("scroll");
    expect(viewerKind(file({ name: "a.pdf", format: "pdf" }), null)).toBe("frame");
    expect(viewerKind(file({ name: "a.png", format: "image" }), null)).toBe("scroll");
  });
});
