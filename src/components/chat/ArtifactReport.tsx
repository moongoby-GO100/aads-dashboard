"use client";
/**
 * AADS-172-C: ArtifactReport
 * 보고서 탭 - 마크다운 렌더링 + 목차 + 복사/PDF/편집/Drive저장
 */
import React, { useState, useMemo } from "react";
import { driveApi } from "@/services/driveApi";
import { chatApi } from "@/services/chatApi";

// ─── 인라인 마크다운 렌더러 ────────────────────────────────────────────────

function renderInline(text: string, keyPrefix = ""): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push(<span key={`${keyPrefix}t${idx++}`}>{text.slice(last, m.index)}</span>);
    if (m[3]) {
      parts.push(
        <img key={`${keyPrefix}img${idx++}`} src={m[3]} alt={m[2] || ""} loading="lazy"
          style={{ maxWidth: "100%", borderRadius: "8px", margin: "4px 0" }} />
      );
    } else if (m[5]) {
      parts.push(
        <a key={`${keyPrefix}a${idx++}`} href={m[5]} target="_blank" rel="noopener noreferrer"
          style={{ color: "var(--ct-accent)", textDecoration: "underline" }}>{m[4]}</a>
      );
    } else if (m[6])
      parts.push(<strong key={`${keyPrefix}b${idx++}`} className="font-semibold">{m[6]}</strong>);
    else if (m[7])
      parts.push(<em key={`${keyPrefix}i${idx++}`} className="italic">{m[7]}</em>);
    else if (m[8])
      parts.push(
        <code key={`${keyPrefix}c${idx++}`} className="px-1 py-0.5 rounded text-xs font-mono"
          style={{ background: "rgba(108,92,231,0.15)", color: "var(--ct-accent)" }}>{m[8]}</code>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length)
    parts.push(<span key={`${keyPrefix}t${idx++}`}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 코드 블록
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`cb${i}`} className="my-2 rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--ct-border)" }}>
          <div className="flex items-center justify-between px-3 py-1"
            style={{ background: "rgba(0,0,0,0.3)" }}>
            <span className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
              {lang || "code"}
            </span>
          </div>
          <pre className="p-3 text-xs font-mono overflow-auto max-h-60 whitespace-pre"
            style={{ background: "rgba(0,0,0,0.2)", color: "var(--ct-text)" }}>
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // 테이블
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!/^[-:| ]+$/.test(lines[i].trim())) rows.push(row);
        i++;
      }
      elements.push(
        <div key={`tbl${i}`} className="my-2 overflow-auto rounded"
          style={{ border: "1px solid var(--ct-border)" }}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "rgba(108,92,231,0.1)" }}>
                {rows[0]?.map((cell, ci) => (
                  <th key={ci} className="px-2 py-1.5 text-left font-semibold"
                    style={{ borderBottom: "1px solid var(--ct-border)", color: "var(--ct-text)" }}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1"
                      style={{ borderBottom: "1px solid var(--ct-border)", color: "var(--ct-text-muted)" }}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 헤더
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes: Record<number, string> = { 1: "text-base", 2: "text-sm", 3: "text-xs", 4: "text-xs" };
      const margins: Record<number, string> = { 1: "mt-4 mb-2", 2: "mt-3 mb-1.5", 3: "mt-2 mb-1", 4: "mt-1 mb-1" };
      elements.push(
        <p key={`h${i}`} className={`font-bold ${sizes[level]} ${margins[level]}`}
          style={{ color: "var(--ct-text)" }}
          id={`h-${hMatch[2].replace(/\s+/g, "-").toLowerCase()}`}>
          {renderInline(hMatch[2], `h${i}`)}
        </p>
      );
      i++;
      continue;
    }

    // 인용
    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={`bq${i}`} className="pl-3 my-1.5 text-xs italic"
          style={{ borderLeft: "3px solid var(--ct-accent)", color: "var(--ct-text-muted)" }}>
          {renderInline(trimmed.slice(2), `bq${i}`)}
        </blockquote>
      );
      i++;
      continue;
    }

    // 목록
    const liMatch = trimmed.match(/^(-|\*|\d+\.)\s+(.+)/);
    if (liMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].trim().match(/^(-|\*|\d+\.)\s+/)) {
        const m2 = lines[i].trim().match(/^(-|\*|\d+\.)\s+(.+)/);
        if (m2) items.push(<li key={i} style={{ color: "var(--ct-text)" }}>{renderInline(m2[2], `li${i}`)}</li>);
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside text-xs space-y-0.5 my-1.5 pl-2">
          {items}
        </ul>
      );
      continue;
    }

    // 구분선
    if (trimmed === "---" || trimmed === "***") {
      elements.push(<hr key={`hr${i}`} className="my-3" style={{ borderColor: "var(--ct-border)" }} />);
      i++;
      continue;
    }

    // 일반 단락
    if (trimmed) {
      elements.push(
        <p key={`p${i}`} className="text-xs leading-relaxed my-0.5"
          style={{ color: "var(--ct-text)" }}>
          {renderInline(trimmed, `p${i}`)}
        </p>
      );
    } else {
      elements.push(<div key={`br${i}`} className="h-2" />);
    }
    i++;
  }
  return <div className="leading-relaxed">{elements}</div>;
}

// ─── 목차 추출 ───────────────────────────────────────────────────────────────

function extractToc(content: string): Array<{ level: number; text: string; id: string }> {
  return content
    .split("\n")
    .filter((line) => /^#{1,3}\s+/.test(line.trim()))
    .map((line) => {
      const m = line.trim().match(/^(#{1,3})\s+(.+)/);
      if (!m) return null;
      return {
        level: m[1].length,
        text: m[2],
        id: `h-${m[2].replace(/\s+/g, "-").toLowerCase()}`,
      };
    })
    .filter(Boolean) as Array<{ level: number; text: string; id: string }>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  content: string;
  title?: string;
  workspaceId?: string;
  artifactId?: string;
  onContentUpdate?: (newContent: string) => void;
}

export default function ArtifactReport({ content, title, workspaceId, artifactId, onContentUpdate }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showToc, setShowToc] = useState(false);

  const displayContent = editMode ? editContent : content;
  const toc = useMemo(() => extractToc(content), [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePdf = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    // 마크다운 → HTML 변환
    const md = displayContent;
    let html = md
      // 코드 블록
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f4f4f4;padding:1rem;border-radius:4px;overflow-x:auto;font-size:0.85em"><code>$2</code></pre>')
      // 테이블 (간단 변환)
      .replace(/^\|(.+)\|$/gm, (row: string) => {
        if (/^[\s|:-]+$/.test(row)) return '';
        const cells = row.slice(1, -1).split('|').map((c: string) => c.trim());
        return '<tr>' + cells.map((c: string) => `<td style="border:1px solid #ddd;padding:8px 12px">${c}</td>`).join('') + '</tr>';
      })
      // 헤더
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // 이미지
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
      // 링크
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // 볼드/이탤릭
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 인라인 코드
      .replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 6px;border-radius:4px;font-size:0.85em">$1</code>')
      // 인용
      .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #6c5ce7;padding-left:1rem;color:#666;margin:0.5rem 0">$1</blockquote>')
      // 목록
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // 구분선
      .replace(/^---$/gm, '<hr>')
      // 줄바꿈
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    // tr 태그가 있으면 table로 감싸기
    if (html.includes('<tr>')) {
      html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, '<table style="border-collapse:collapse;width:100%;margin:1rem 0">$&</table>');
    }
    // li 태그가 있으면 ul로 감싸기
    if (html.includes('<li>')) {
      html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul style="padding-left:1.5rem">$&</ul>');
    }
    win.document.write(`
      <html><head><title>${title || "보고서"}</title>
      <style>
        body { font-family: 'Malgun Gothic', -apple-system, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.8; color: #333; }
        h1 { font-size: 1.5rem; border-bottom: 2px solid #6c5ce7; padding-bottom: 0.5rem; }
        h2 { font-size: 1.25rem; margin-top: 1.5rem; }
        h3 { font-size: 1.1rem; margin-top: 1.2rem; }
        p { margin: 0.5rem 0; }
        img { max-width: 100%; }
        @media print { body { padding: 0; } }
      </style></head>
      <body><p>${html}</p>
      <script>setTimeout(function(){window.print()},500);</script>
      </body></html>
    `);
    win.document.close();
  };

  const handleSaveToDrive = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const name = `${title || "report"}_${new Date().toISOString().slice(0, 10)}.md`;
      await driveApi.saveText(name, displayContent, workspaceId, "Reports");
      setSaveMsg("Drive에 저장됨");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!artifactId) {
      // artifactId 없으면 콜백만
      onContentUpdate?.(editContent);
      setEditMode(false);
      setSaveMsg("저장됨 (로컬)");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }
    setSaving(true);
    try {
      await chatApi.updateArtifact(artifactId, { content: editContent });
      onContentUpdate?.(editContent);
      setEditMode(false);
      setSaveMsg("DB에 저장됨");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDirective = () => {
    const snippet = displayContent.slice(0, 500);
    const directive = `>>>DIRECTIVE_START\nTITLE: ${title || "보고서 기반 지시서"}\nDESCRIPTION: |\n${snippet}\n>>>DIRECTIVE_END`;
    navigator.clipboard.writeText(directive);
    setSaveMsg("지시서 복사됨");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 액션 바 */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 flex-wrap"
        style={{ borderBottom: "1px solid var(--ct-border)" }}
      >
        {toc.length > 0 && (
          <button
            onClick={() => setShowToc(!showToc)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: showToc ? "var(--ct-accent)" : "var(--ct-hover)", color: showToc ? "#fff" : "var(--ct-text-muted)" }}
          >
            목차
          </button>
        )}
        <button
          onClick={() => setEditMode(!editMode)}
          className="text-xs px-2 py-1 rounded"
          style={{ background: editMode ? "var(--ct-accent)" : "var(--ct-hover)", color: editMode ? "#fff" : "var(--ct-text-muted)" }}
        >
          {editMode ? "미리보기" : "편집"}
        </button>
        {editMode && (
          <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="text-xs px-2 py-1 rounded font-semibold"
            style={{ background: "var(--ct-accent)", color: "#fff" }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        )}
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--ct-hover)", color: copied ? "var(--ct-success)" : "var(--ct-text-muted)" }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
        <button
          onClick={handlePdf}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
        >
          PDF
        </button>
        <button
          onClick={handleCreateDirective}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
        >
          지시서 생성
        </button>
        <button
          onClick={handleSaveToDrive}
          disabled={saving}
          className="text-xs px-2 py-1 rounded"
          style={{ background: "var(--ct-hover)", color: saving ? "var(--ct-text-muted)" : "var(--ct-accent)" }}
        >
          {saving ? "저장 중..." : "Drive 저장"}
        </button>
        {saveMsg && (
          <span className="text-xs" style={{ color: "var(--ct-success)" }}>{saveMsg}</span>
        )}
      </div>

      {/* 목차 패널 */}
      {showToc && toc.length > 0 && (
        <div
          className="px-3 py-2 flex-shrink-0 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--ct-border)", background: "rgba(108,92,231,0.05)" }}
        >
          <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--ct-accent)" }}>목차</p>
          <div className="space-y-0.5">
            {toc.map((item, idx) => (
              <a
                key={idx}
                href={`#${item.id}`}
                className="block text-xs hover:underline"
                style={{
                  paddingLeft: `${(item.level - 1) * 12}px`,
                  color: "var(--ct-text-muted)",
                }}
              >
                {item.text}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 컨텐츠 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 chat-scrollbar">
        {editMode ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full text-xs font-mono resize-none outline-none"
            style={{
              background: "transparent",
              color: "var(--ct-text)",
              border: "none",
              minHeight: "300px",
              lineHeight: 1.6,
            }}
          />
        ) : (
          <MarkdownView content={displayContent} />
        )}
      </div>
    </div>
  );
}
