import { detectFormat, type DocFileMeta, type ListedDocFile } from "./docFileTypes";
import { formatFileSize } from "@/lib/docFileView";

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvPreview(text: string): { title: string; rows: string[][] }[] {
  const sections: { title: string; rows: string[][] }[] = [];
  let current = { title: "Sheet", rows: [] as string[][] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith("## Sheet:") || line.startsWith("# sheet:")) {
      if (current.rows.length) sections.push(current);
      current = { title: line.replace(/^#+\s*/g, ""), rows: [] };
      continue;
    }
    if (line.startsWith("# ")) continue;
    current.rows.push(splitCsvLine(line));
  }
  if (current.rows.length) sections.push(current);
  return sections;
}

export function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="docs-md-code bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto text-sm"><code class="text-green-300">${code.trim()}</code></pre>`,
  );
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-sm text-yellow-200">$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-4 mb-1 text-blue-300">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-2 text-blue-200">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2 text-white border-b border-gray-700 pb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3 text-white">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>');
  html = html.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line.split("|").filter(Boolean);
    if (cells.every((c) => /^[\s-:]+$/.test(c))) return "";
    const row = cells.map((c) => `<td class="border border-gray-700 px-2 py-1 text-sm">${c.trim()}</td>`).join("");
    return `<tr class="hover:bg-gray-800">${row}</tr>`;
  });
  // 표 안의 줄바꿈은 아래 \n→<br/> 변환에서 <br/> 가 되어 표 밖으로 밀려나므로 먼저 걷어낸다.
  html = html.replace(/(<tr[^>]*>.*<\/tr>\n?)+/g, (m) =>
    `<div class="docs-md-table"><table class="w-full border-collapse border border-gray-700 my-3">${m.replace(/\n/g, "")}</table></div>`,
  );
  // 구분선 줄(|---|)이 비면서 머리 행과 본문 행이 표 둘로 갈라지므로 하나로 합친다.
  html = html.replace(/<\/table><\/div>\n<div class="docs-md-table"><table class="[^"]*">/g, "");
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-blue-500 pl-3 my-2 text-gray-400 italic text-sm">$1</blockquote>');
  html = html.replace(/\n\n/g, '<div class="my-2"></div>');
  html = html.replace(/\n/g, "<br/>");

  return html;
}

function ViewerBody({ selectedFile, fileContent, fileMeta }: { selectedFile: ListedDocFile; fileContent: string; fileMeta: DocFileMeta | null }) {
  const fmt = fileMeta?.format || selectedFile.format || detectFormat(selectedFile.name);
  const lowerName = selectedFile.name.toLowerCase();
  const isBinary = fileMeta?.is_binary || fileMeta?.encoding === "base64";
  const mime = fileMeta?.mime_type || "application/octet-stream";

  if (fmt === "image") {
    const src = isBinary
      ? `data:${mime};base64,${fileContent}`
      : `data:${mime || "image/svg+xml"};utf8,${encodeURIComponent(fileContent)}`;
    return (
      <div className="flex items-center justify-center bg-gray-900/40 rounded-lg p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={selectedFile.name}
          className="max-w-full object-contain rounded"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        />
      </div>
    );
  }

  if (fmt === "pdf") {
    const src = `data:application/pdf;base64,${fileContent}`;
    return (
      <iframe
        src={src}
        className="absolute inset-0 h-full w-full border-0 bg-white"
        title={selectedFile.name}
      />
    );
  }

  if (fmt === "excel-csv" || (selectedFile.format === "excel" && !isBinary && fileMeta?.converted_from)) {
    const sections = parseCsvPreview(fileContent);
    return (
      <div className="space-y-6">
        {sections.length ? sections.map((section, sectionIndex) => (
          <div key={`${section.title}-${sectionIndex}`} className="overflow-auto">
            <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
              {section.title}
            </div>
            <table className="min-w-full text-xs border-collapse">
              <tbody>
                {section.rows.map((row, rowIndex) => (
                  <tr key={`${section.title}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${section.title}-${rowIndex}-${cellIndex}`}
                        className="border px-2 py-1 align-top"
                        style={{
                          borderColor: "var(--border)",
                          color: rowIndex === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: rowIndex === 0 ? 600 : 400,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : (
          <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
            {fileContent}
          </pre>
        )}
      </div>
    );
  }

  if ((fmt === "word" || fmt === "excel" || fmt === "powerpoint") && isBinary) {
    const downloadHref = `data:${mime};base64,${fileContent}`;
    const officeLabel = fmt === "word" ? "Word" : fmt === "excel" ? "Excel" : "PowerPoint";
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">📎</div>
        <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {officeLabel} 문서는 브라우저에서 미리보기를 지원하지 않습니다
        </p>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          {[selectedFile.name, formatFileSize(selectedFile.size)].filter(Boolean).join(" · ")}
        </p>
        <a
          href={downloadHref}
          download={selectedFile.name}
          className="mt-5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          ⬇️ 다운로드
        </a>
      </div>
    );
  }

  if (isBinary) {
    const downloadHref = `data:${mime};base64,${fileContent}`;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">📎</div>
        <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          이 파일은 다운로드로 열 수 있습니다
        </p>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          {[selectedFile.name, formatFileSize(selectedFile.size)].filter(Boolean).join(" · ")}
        </p>
        <a
          href={downloadHref}
          download={selectedFile.name}
          className="mt-5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          다운로드
        </a>
      </div>
    );
  }

  if (lowerName.endsWith(".md")) {
    return (
      <div
        className="docs-md mx-auto w-full max-w-[860px]"
        style={{ color: "var(--text-primary)" }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
      />
    );
  }

  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return (
      <iframe
        srcDoc={fileContent}
        className="absolute inset-0 h-full w-full border-0"
        style={{ background: "#fff" }}
        title={selectedFile.name}
        sandbox="allow-same-origin allow-popups"
      />
    );
  }

  if (lowerName.endsWith(".json")) {
    return (
      <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
        {(() => { try { return JSON.stringify(JSON.parse(fileContent), null, 2); } catch { return fileContent; } })()}
      </pre>
    );
  }

  return (
    <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
      {fileContent}
    </pre>
  );
}

export type ViewerKind = "frame" | "scroll";

// 미리보기 iframe 은 본문 칸을 꽉 채우고, 나머지는 칸 안에서 스크롤한다.
export function viewerKind(file: ListedDocFile, fileMeta: DocFileMeta | null): ViewerKind {
  const fmt = fileMeta?.format || file.format || detectFormat(file.name);
  const lowerName = file.name.toLowerCase();
  const isBinary = fileMeta?.is_binary || fileMeta?.encoding === "base64";
  if (fmt === "image") return "scroll";
  if (fmt === "pdf") return "frame";
  if (fmt === "excel-csv" || (file.format === "excel" && !isBinary && fileMeta?.converted_from)) return "scroll";
  if (isBinary || lowerName.endsWith(".md")) return "scroll";
  return lowerName.endsWith(".html") || lowerName.endsWith(".htm") ? "frame" : "scroll";
}

export default function DocContentViewer({
  selectedFile,
  fileContent,
  fileMeta,
  contentLoading,
}: {
  selectedFile: ListedDocFile;
  fileContent: string | null;
  fileMeta: DocFileMeta | null;
  contentLoading: boolean;
}) {
  const scrollClass = "min-h-0 flex-1 overflow-auto px-3 py-4 min-[600px]:px-6 min-[600px]:py-5";
  if (contentLoading) {
    return (
      <div className={scrollClass}>
        <div className="py-12 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
      </div>
    );
  }
  if (fileContent === null) return null;
  if (viewerKind(selectedFile, fileMeta) === "frame") {
    return (
      <div className="relative min-h-0 flex-1" data-testid="doc-viewer-frame">
        <ViewerBody selectedFile={selectedFile} fileContent={fileContent} fileMeta={fileMeta} />
      </div>
    );
  }
  return (
    <div className={scrollClass} data-testid="doc-viewer-scroll">
      <ViewerBody selectedFile={selectedFile} fileContent={fileContent} fileMeta={fileMeta} />
    </div>
  );
}
