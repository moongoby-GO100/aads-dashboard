"use client";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import type { ChatMessage } from "@/services/chatApi";
import SourceCard from "./SourceCard";
import ConfidenceBadge from "./ConfidenceBadge";
import InlineChart from "./InlineChart";
import { isFileDownloadHref, normalizeDocumentHref } from "@/lib/documentLinks";
import { openManagedFile } from "@/lib/fileDownload";
import SectionCardContent, { detectCrfSections } from "./SectionCardContent";

// ─── Scoped Styles (inject once into head) ───────────────────────────────────

const CB_STYLE_ID = "chatbubble-v2";
const CB_CSS = `
@keyframes cb-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes cb-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes cb-lb-bg{from{opacity:0}to{opacity:1}}
@keyframes cb-lb-img{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
.cb-shimmer{background:linear-gradient(90deg,rgba(167,139,250,.06) 25%,rgba(167,139,250,.18) 50%,rgba(167,139,250,.06) 75%);background-size:200% 100%;animation:cb-shimmer 1.8s ease-in-out infinite;border-radius:8px}
.cb-enter{animation:cb-enter .22s ease-out both}
.cb-code{border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.1);margin:8px 0;position:relative}
.cb-code::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px}
.cb-code[data-lang=python]::before,.cb-code[data-lang=py]::before{background:#3572A5}
.cb-code[data-lang=javascript]::before,.cb-code[data-lang=js]::before{background:#f7df1e}
.cb-code[data-lang=typescript]::before,.cb-code[data-lang=ts]::before,.cb-code[data-lang=tsx]::before,.cb-code[data-lang=jsx]::before{background:#3178c6}
.cb-code[data-lang=sql]::before{background:#e38c00}
.cb-code[data-lang=bash]::before,.cb-code[data-lang=sh]::before,.cb-code[data-lang=shell]::before{background:#89e051}
.cb-code[data-lang=json]::before,.cb-code[data-lang=yaml]::before,.cb-code[data-lang=yml]::before{background:#a78bfa}
.cb-code[data-lang=""]::before,.cb-code[data-lang=code]::before{background:rgba(148,163,184,.4)}
.cb-code[data-lang=css]::before{background:#563d7c}
.cb-code[data-lang=html]::before{background:#e34c26}
.cb-code[data-lang=go]::before{background:#00ADD8}
.cb-code[data-lang=rust]::before,.cb-code[data-lang=rs]::before{background:#dea584}
.cb-tbl{border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.08);margin:8px 0}
.cb-tbl table{width:100%;border-collapse:collapse;font-size:12px}
.cb-tbl thead tr{background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.06))}
.cb-tbl th{padding:6px 10px;text-align:left;font-weight:600;font-size:11px;color:#c4b5fd;border-bottom:1px solid rgba(255,255,255,.1);letter-spacing:.3px}
.cb-tbl td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1}
.cb-tbl tbody tr{transition:background .15s}
.cb-tbl tbody tr:nth-child(even){background:rgba(255,255,255,.02)}
.cb-tbl tbody tr:hover{background:rgba(167,139,250,.06)!important}
.cb-tbl tbody tr:last-child td{border-bottom:none}
.cb-glass{background:rgba(15,23,42,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:8px}
.cb-pill{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,.06)}
.cb-img-wrap{overflow:hidden;border-radius:12px;margin:8px 0;cursor:pointer;display:inline-block;max-width:100%}
.cb-img-wrap img{transition:transform .3s ease,box-shadow .3s ease;display:block;max-width:100%;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.cb-img-wrap:hover img{transform:scale(1.02);box-shadow:0 8px 30px rgba(167,139,250,.2)}
.cb-heading{position:relative;padding-left:10px;margin:10px 0 6px}
.cb-heading::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;background:linear-gradient(180deg,#6366f1,#a78bfa)}
.cb-action-btn{font-size:12px;padding:4px 8px;border-radius:6px;transition:all .15s;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;background:transparent;color:var(--text-secondary)}
.cb-action-btn:hover{background:rgba(255,255,255,.12)!important}
@media(hover:none){.cb-hover-show{opacity:.5!important;display:flex!important}}
`;

function useInjectStyles() {
  useEffect(() => {
    if (document.getElementById(CB_STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = CB_STYLE_ID;
    el.textContent = CB_CSS;
    document.head.appendChild(el);
  }, []);
}

// ─── ResponseMiniMap — content overview pills ────────────────────────────────

function ResponseMiniMap({ content }: { content: string }) {
  const pills = useMemo(() => {
    const tableRows = (content.match(/^\|.+\|$/gm) || []).length;
    const tbl = tableRows > 0 ? Math.max(1, Math.floor(tableRows / 3)) : 0;
    const allFences = (content.match(/^```/gm) || []).length;
    const charts = (content.match(/^```chart/gm) || []).length;
    const code = Math.max(0, Math.floor(allFences / 2) - charts);
    const imgs = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const secs = (content.match(/^#{1,4}\s/gm) || []).length;

    const items: { icon: string; label: string; bg: string }[] = [];
    if (tbl > 0) items.push({ icon: "📊", label: `표 ${tbl}`, bg: "rgba(99,102,241,0.12)" });
    if (code > 0) items.push({ icon: "💻", label: `코드 ${code}`, bg: "rgba(34,197,94,0.1)" });
    if (charts > 0) items.push({ icon: "📈", label: `차트 ${charts}`, bg: "rgba(245,158,11,0.1)" });
    if (imgs > 0) items.push({ icon: "🖼️", label: `이미지 ${imgs}`, bg: "rgba(236,72,153,0.1)" });
    if (secs >= 3) items.push({ icon: "📑", label: `섹션 ${secs}`, bg: "rgba(148,163,184,0.1)" });
    return items;
  }, [content]);

  if (!pills.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {pills.map((p, i) => (
        <span key={i} className="cb-pill" style={{ background: p.bg, color: "var(--text-secondary)" }}>
          {p.icon} {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── Inline Markdown Renderer ────────────────────────────────────────────────

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) return false;
  if (!trimmed.includes(":")) return true;
  return false;
}

function renderInline(text: string, key?: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(@(?:KIS|GO100|AADS|SF|NTV2|NAS)\b|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|(https?:\/\/[^\s<>)"\]]+))/gi;
  let last = 0, m: RegExpExecArray | null, idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("@") && /^@(?:KIS|GO100|AADS|SF|NTV2|NAS)$/i.test(m[0])) {
      parts.push(
        <span key={`mention${key}-${idx++}`}
          style={{
            display: "inline-block", padding: "1px 6px", borderRadius: 4,
            fontSize: "0.85em", fontWeight: 600,
            background: "rgba(99,102,241,0.15)", color: "#818cf8",
            verticalAlign: "baseline",
          }}>
          {m[0]}
        </span>
      );
    } else if (m[3]) {
      const imgSrc = isSafeUrl(m[3]) ? m[3] : "";
      parts.push(
        imgSrc
          ? <span key={`img${key}-${idx++}`} className="cb-img-wrap">
              <img src={imgSrc} alt={m[2] || ""} loading="lazy" />
            </span>
          : <span key={`img${key}-${idx++}`}>[image blocked: unsafe URL]</span>
      );
    } else if (m[5]) {
      const linkHref = isSafeUrl(m[5]) ? normalizeDocumentHref(m[5]) : "#";
      const managedFile = isFileDownloadHref(linkHref);
      parts.push(
        <a
          key={`a${key}-${idx++}`}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          title={managedFile ? "클릭하면 파일을 내려받습니다" : undefined}
          onClick={
            managedFile
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openManagedFile(linkHref).then((r) => {
                    if (!r.ok) window.alert(`파일을 열 수 없습니다.\n${r.error || ""}`);
                  });
                }
              : undefined
          }
          style={{ color: "#a78bfa", textDecoration: "underline" }}
        >{managedFile ? "📥 " : ""}{m[4]}</a>
      );
    } else if (m[6]) parts.push(<strong key={`b${key}-${idx++}`} className="font-semibold">{m[6]}</strong>);
    else if (m[7]) parts.push(<em key={`i${key}-${idx++}`} className="italic">{m[7]}</em>);
    else if (m[8])
      parts.push(
        <code key={`c${key}-${idx++}`} className="px-1 py-0.5 rounded text-xs font-mono"
          style={{ background: "rgba(255,255,255,0.1)", color: "#f9c74f" }}>{m[8]}</code>
      );
    else if (m[9]) {
      const linkHref = normalizeDocumentHref(m[9]);
      const managedFile = isFileDownloadHref(linkHref);
      parts.push(
        <a
          key={`au${key}-${idx++}`}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          title={managedFile ? "클릭하면 파일을 내려받습니다" : undefined}
          onClick={
            managedFile
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openManagedFile(linkHref).then((r) => {
                    if (!r.ok) window.alert(`파일을 열 수 없습니다.\n${r.error || ""}`);
                  });
                }
              : undefined
          }
          style={{ color: "#a78bfa", textDecoration: "underline" }}
        >{managedFile ? "📥 " : ""}{m[9]}</a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

// ─── CodeBlock ───────────────────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="cb-code" data-lang={lang || ""}>
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(30,41,59,0.7) 100%)" }}>
        <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{lang || "code"}</span>
        <button onClick={copy} className="cb-action-btn"
          style={{ color: copied ? "#22c55e" : "#94a3b8", background: copied ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)", fontSize: "11px", padding: "2px 8px" }}>
          {copied ? "✓ 복사됨" : "복사"}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre"
        style={{ background: "rgba(0,0,0,0.3)", color: "#e2e8f0", margin: 0 }}>
        {code}
      </pre>
    </div>
  );
}

// ─── MarkdownContent ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (lang === "chart") {
        elements.push(<InlineChart key={`chart${i}`} raw={codeLines.join("\n")} />);
      } else {
        elements.push(<CodeBlock key={`cb${i}`} lang={lang} code={codeLines.join("\n")} />);
      }
      i++;
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!/^[-:| ]+$/.test(lines[i].trim())) rows.push(row);
        i++;
      }
      elements.push(
        <div key={`tbl${i}`} className="cb-tbl" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {rows[0]?.map((cell, ci) => (
                  <th key={ci}>{renderInline(cell, ci)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizeMap: Record<number, string> = { 1: "text-base", 2: "text-sm", 3: "text-xs", 4: "text-xs" };
      const useAccent = level <= 2;
      elements.push(
        <p key={`h${i}`} className={`font-bold ${sizeMap[level]} ${useAccent ? "cb-heading" : "my-2"}`}>
          {renderInline(hMatch[2], i)}
        </p>
      );
      i++; continue;
    }

    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={`bq${i}`} className="pl-3 my-1 text-xs italic"
          style={{ borderLeft: "3px solid rgba(167,139,250,0.5)", color: "#94a3b8" }}>
          {renderInline(trimmed.slice(2), i)}
        </blockquote>
      );
      i++; continue;
    }

    const liMatch = trimmed.match(/^(-|\*|\d+\.)\s+(.+)/);
    if (liMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].trim().match(/^(-|\*|\d+\.)\s+/)) {
        const lm = lines[i].trim().match(/^(-|\*|\d+\.)\s+(.+)/);
        if (lm) items.push(<li key={i}>{renderInline(lm[2], i)}</li>);
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside text-xs space-y-0.5 my-1 pl-2"
          style={{ color: "#e2e8f0" }}>{items}</ul>
      );
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      elements.push(<hr key={`hr${i}`} className="my-2" style={{ borderColor: "rgba(255,255,255,0.1)" }} />);
      i++; continue;
    }

    if (trimmed) {
      elements.push(
        <p key={`p${i}`} className="text-sm leading-relaxed my-0.5">{renderInline(trimmed, i)}</p>
      );
    } else {
      elements.push(<div key={`br${i}`} className="h-2" />);
    }
    i++;
  }
  return <div>{elements}</div>;
}

// ─── ThoughtSummary ──────────────────────────────────────────────────────────

function ThoughtSummary({ summary }: { summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 rounded-lg overflow-hidden"
      style={{ border: "1px solid rgba(167,139,250,0.2)", background: "rgba(139,92,246,0.04)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
        style={{ background: open ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.06)", color: "#a78bfa" }}
      >
        <span style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0)", display: "inline-block" }}>▶</span>
        <span className="font-medium">사고 과정</span>
      </button>
      {open && (
        <div className="px-3 py-2 text-xs" style={{ background: "rgba(0,0,0,0.15)", color: "#94a3b8", lineHeight: 1.6 }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── Image Lightbox ──────────────────────────────────────────────────────────

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "zoom-out", animation: "cb-lb-bg 0.2s ease-out",
      }}
    >
      <img
        src={src} alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "92vw", maxHeight: "90vh",
          borderRadius: "12px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          cursor: "default", animation: "cb-lb-img 0.25s ease-out",
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: "16px", right: "20px",
          background: "rgba(255,255,255,0.12)", border: "none",
          color: "#fff", fontSize: "20px", width: "40px", height: "40px",
          borderRadius: "50%", cursor: "pointer", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s",
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
        onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
      >✕</button>
    </div>
  );
}

// ─── Attachment File Cards ───────────────────────────────────────────────────

function FileAttachmentCards({ attachments }: { attachments: unknown[] }) {
  if (!attachments || attachments.length === 0) return null;

  const fileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["py", "js", "ts", "tsx", "jsx", "sh", "sql", "go", "rs"].includes(ext)) return "💻";
    if (["pdf"].includes(ext)) return "📕";
    if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
    if (["md", "txt", "log"].includes(ext)) return "📄";
    if (["json", "yaml", "yml", "toml", "xml"].includes(ext)) return "📋";
    if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) return "🖼️";
    return "📎";
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1">
      {attachments.map((att, i) => {
        const a = att as Record<string, string>;
        const name = a?.name || a?.filename || `file_${i}`;
        return (
          <div
            key={i}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs"
            style={{
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.2)", transform: "translateY(-1px)" })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.08)", transform: "translateY(0)" })}
          >
            <span style={{ fontSize: "14px" }}>{fileIcon(name)}</span>
            <span className="truncate" style={{ maxWidth: "120px" }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sanitize raw XML tool blocks ────────────────────────────────────────────

function stripToolXml(text: string): string {
  return text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "")
    .replace(/<function_response>[\s\S]*?<\/function_response>/g, "")
    .trim();
}

// ─── Main ChatBubble ─────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingText?: string;
  onBookmark?: (id: string) => void;
  onCopy?: (content: string) => void;
  onCreateDirective?: (content: string) => void;
  onViewInPanel?: (content: string) => void;
  onEditResend?: (message: ChatMessage, newContent: string) => void;
  onCopyToInput?: (content: string) => void;
}

export default function ChatBubble({
  message,
  isStreaming,
  streamingText,
  onBookmark,
  onCopy,
  onCreateDirective,
  onViewInPanel,
  onEditResend,
  onCopyToInput,
}: ChatBubbleProps) {
  useInjectStyles();
  const [showActions, setShowActions] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" && target.closest("[data-lightbox-zone]")) {
      setLightboxSrc((target as HTMLImageElement).src);
    }
  }, []);

  const isUser = message.role === "user";
  const rawContent = isStreaming && streamingText !== undefined ? streamingText : message.content;
  const displayContent = isUser ? rawContent : stripToolXml(rawContent);
  const sources = message.sources || [];

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    });
    onCopy?.(displayContent);
  };

  const userDisplayContent = isUser
    ? displayContent.replace(/\n\n\[첨부파일:[^\]]+\]/g, "").trim()
    : displayContent;
  const userAttachments = (message.attachments || []) as unknown[];

  const isCrf = useMemo(
    () => !isUser && !isStreaming && displayContent.length > 200 && detectCrfSections(displayContent),
    [isUser, isStreaming, displayContent]
  );

  // ─── User Message ─────────────────────────────────────────────────
  if (isUser) {
    const startEdit = () => {
      setEditText(message.content.replace(/\n\n\[첨부파일:[^\]]+\]/g, "").trim());
      setIsEditing(true);
    };
    const cancelEdit = () => { setIsEditing(false); setEditText(""); };
    const submitEdit = () => {
      const trimmed = editText.trim();
      if (trimmed && trimmed !== userDisplayContent) {
        onEditResend?.(message, trimmed);
      }
      setIsEditing(false);
      setEditText("");
    };
    const handleEditKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
      if (e.key === "Escape") cancelEdit();
    };

    return (
      <div className="flex justify-end mb-3 group cb-enter">
        <div className="max-w-[75%]">
          {userAttachments.length > 0 && (
            <FileAttachmentCards attachments={userAttachments} />
          )}

          {isEditing ? (
            <div className="rounded-2xl overflow-hidden" style={{ border: "2px solid var(--accent)", borderBottomRightRadius: "6px" }}>
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKey}
                className="w-full p-3 text-sm resize-none outline-none"
                style={{ background: "rgba(109,40,217,0.15)", color: "#fff", minHeight: "60px", maxHeight: "200px", border: "none" }}
                rows={Math.min(editText.split("\n").length + 1, 8)}
              />
              <div className="flex justify-end gap-2 px-3 py-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                <button onClick={cancelEdit} className="text-xs px-3 py-1 rounded-lg"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-hover)" }}>
                  취소
                </button>
                <button onClick={submitEdit} className="text-xs px-3 py-1 rounded-lg font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  수정 후 재전송
                </button>
              </div>
            </div>
          ) : (
            <div
              className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed relative"
              style={{ background: "var(--accent)", color: "#fff", borderBottomRightRadius: "6px" }}
              onMouseEnter={() => setShowActions(true)}
              onMouseLeave={() => setShowActions(false)}
            >
              {userDisplayContent}

              {showActions && !isStreaming && (
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full flex gap-1 cb-hover-show"
                  style={{ opacity: 1, transition: "opacity 0.15s" }}>
                  {onEditResend && (
                    <button onClick={startEdit}
                      className="cb-action-btn"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", width: "28px", height: "28px" }}
                      title="수정 후 재전송">
                      ✏️
                    </button>
                  )}
                  {onCopyToInput && (
                    <button onClick={() => onCopyToInput(userDisplayContent)}
                      className="cb-action-btn"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", width: "28px", height: "28px" }}
                      title="입력창에 복사 (재지시)">
                      🔄
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {message.created_at && (
            <p className="text-right text-xs mt-1 mr-1" style={{ color: "var(--text-secondary)" }}>
              {message.edited_at && <span style={{ color: "#a78bfa" }}>(수정됨) </span>}
              {new Date(message.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Intent Badge ─────────────────────────────────────────────────
  const intent = (message as ChatMessage & { intent?: string | null }).intent;
  const intentBadge = (() => {
    if (!intent || intent === "casual" || intent === "status_check") return null;
    const map: Record<string, { icon: string; label: string; color: string; bg: string }> = {
      pipeline_c: { icon: "🤖", label: "Claude Bot", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
      agent_result: { icon: "⚡", label: "Agent", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
      system_recovery: { icon: "🔧", label: "System", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
      auto_reaction: { icon: "🔄", label: "Auto", color: "#06b6d4", bg: "rgba(6,182,212,0.15)" },
    };
    return map[intent] || null;
  })();

  // ─── Cost / Token Display ─────────────────────────────────────────
  const displayTokensIn = message.input_tokens || message.tokens_in || null;
  const displayTokensOut = message.output_tokens || message.tokens_out || null;
  const displayCost = message.cost_usd || message.cost || null;
  const costNum = displayCost ? Number(displayCost) : 0;
  const costColor = costNum > 0.1 ? "#ef4444" : costNum > 0.01 ? "#f59e0b" : "#22c55e";

  // ─── AI Message ───────────────────────────────────────────────────
  return (
    <div className="flex justify-start mb-3 group cb-enter">
      <div className="max-w-[80%] min-w-0">
        {intentBadge && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <span className="cb-pill"
              style={{ background: intentBadge.bg, color: intentBadge.color, border: `1px solid ${intentBadge.color}33`, fontWeight: 600 }}>
              {intentBadge.icon} {intentBadge.label}
            </span>
          </div>
        )}

        {message.thought_summary && <ThoughtSummary summary={message.thought_summary} />}

        <div
          className={`${isCrf ? "overflow-hidden" : "px-4 py-3"} rounded-2xl text-sm relative`}
          style={{
            background: intentBadge ? `linear-gradient(135deg, var(--bg-card), ${intentBadge.bg})` : "var(--bg-card)",
            border: intentBadge ? `1px solid ${intentBadge.color}44` : "1px solid var(--border)",
            borderBottomLeftRadius: "6px",
            color: "var(--text-primary)",
          }}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
          onClick={handleImageClick}
          data-lightbox-zone="true"
        >
          {isStreaming && !displayContent ? (
            <div className="flex flex-col gap-3 py-1" style={{ minWidth: "220px" }}>
              <div className="cb-shimmer" style={{ height: "12px", width: "82%" }} />
              <div className="cb-shimmer" style={{ height: "12px", width: "58%", animationDelay: "0.15s" }} />
              <div className="cb-shimmer" style={{ height: "12px", width: "40%", animationDelay: "0.3s" }} />
            </div>
          ) : intent === "auto_reaction" ? (
            autoExpanded ? (
              <>
                <button className="text-xs mb-2 cursor-pointer" style={{ color: "#06b6d4" }} onClick={() => setAutoExpanded(false)}>▼ 접기</button>
                <MarkdownContent content={displayContent} />
              </>
            ) : (
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoExpanded(true)}>
                <span className="text-xs truncate" style={{ color: "#06b6d4", maxWidth: "90%" }}>
                  {displayContent.slice(0, 120)}
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>▶ 펼치기</span>
              </div>
            )
          ) : isCrf ? (
            <SectionCardContent
              content={displayContent}
              MarkdownRenderer={MarkdownContent}
              modelUsed={message.model_used}
              createdAt={message.created_at}
            />
          ) : (
            <>
              {displayContent.length > 300 && <ResponseMiniMap content={displayContent} />}
              <MarkdownContent content={displayContent} />
            </>
          )}

          {showActions && !isStreaming && (
            <div className="absolute top-2 right-2 flex gap-0.5 cb-glass cb-hover-show" style={{ padding: "3px" }}>
              {onBookmark && (
                <button onClick={() => onBookmark(message.id)} className="cb-action-btn"
                  style={{ color: message.bookmarked ? "#eab308" : undefined, background: message.bookmarked ? "rgba(234,179,8,0.15)" : undefined }}
                  title="북마크">
                  {message.bookmarked ? "★" : "☆"}
                </button>
              )}
              <button onClick={handleCopy} className="cb-action-btn"
                style={{ color: copiedMsg ? "#22c55e" : undefined }}
                title="복사">
                {copiedMsg ? "✓" : "⎘"}
              </button>
              {onCreateDirective && (
                <button onClick={() => onCreateDirective(displayContent)} className="cb-action-btn" title="지시서 생성">📋</button>
              )}
              {onViewInPanel && (
                <button onClick={() => onViewInPanel(displayContent)} className="cb-action-btn" title="패널에서 보기">🗂</button>
              )}
            </div>
          )}
        </div>

        {sources.length > 0 && <SourceCard sources={sources} />}
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

        {!isStreaming && !isCrf && (
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5 ml-1">
            {message.model_used && (
              <span className="cb-pill" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                {message.requested_model && message.requested_model !== message.model_used ? (
                  <>
                    <span style={{ textDecoration: "line-through", opacity: 0.5, fontSize: "10px" }}>{message.requested_model}</span>
                    <span style={{ color: "#f59e0b" }}>{" → "}</span>
                    <span>{message.model_used}</span>
                  </>
                ) : message.model_used}
              </span>
            )}
            {(displayTokensIn || displayTokensOut) && (
              <span className="cb-pill" style={{ background: "rgba(148,163,184,0.08)", color: "var(--text-secondary)" }}>
                {displayTokensIn ? `${displayTokensIn.toLocaleString()}↓` : ""}
                {displayTokensIn && displayTokensOut ? " " : ""}
                {displayTokensOut ? `${displayTokensOut.toLocaleString()}↑` : ""}
              </span>
            )}
            {costNum > 0 && (
              <span className="cb-pill" style={{ background: `${costColor}15`, color: costColor, fontWeight: 600 }}>
                ${costNum.toFixed(4)}
              </span>
            )}
            {message.fallback_reason && (
              <span className="cb-pill" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                ⚠️ {message.fallback_reason}
              </span>
            )}
            {message.created_at && (
              <span style={{ color: "var(--text-secondary)", fontSize: "11px", marginLeft: "2px" }}>
                {new Date(message.created_at).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric",
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </span>
            )}
            {message.confidence_label && <ConfidenceBadge label={message.confidence_label} />}
          </div>
        )}
      </div>
    </div>
  );
}
