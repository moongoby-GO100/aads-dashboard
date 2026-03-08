"use client";
/**
 * AADS-172-B: ChatBubble
 * 메시지 버블 컴포넌트
 * - 사용자: 우측 보라 배경
 * - AI: 좌측 다크그레이 배경 + 마크다운 렌더링
 * - 코드 블록 복사 버튼
 * - 사고 과정 (thought_summary) 접이식
 * - 출처 카드 (sources)
 * - 북마크 / 복사 / 지시서 생성 액션
 */
import React, { useState } from "react";
import type { ChatMessage } from "@/services/chatApi";
import SourceCard from "./SourceCard";

// ─── Inline Markdown Renderer ────────────────────────────────────────────────

function renderInline(text: string, key?: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0, m: RegExpExecArray | null, idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last, m.index)}</span>);
    if (m[2]) parts.push(<strong key={`b${key}-${idx++}`} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={`i${key}-${idx++}`} className="italic">{m[3]}</em>);
    else if (m[4])
      parts.push(
        <code key={`c${key}-${idx++}`} className="px-1 py-0.5 rounded text-xs font-mono"
          style={{ background: "rgba(255,255,255,0.1)", color: "#f9c74f" }}>{m[4]}</code>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="my-2 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
      <div className="flex items-center justify-between px-3 py-1"
        style={{ background: "rgba(0,0,0,0.4)" }}>
        <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{lang || "code"}</span>
        <button
          onClick={copy}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ background: copied ? "#22c55e22" : "rgba(255,255,255,0.08)", color: copied ? "#22c55e" : "#94a3b8" }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre"
        style={{ background: "rgba(0,0,0,0.35)", color: "#e2e8f0" }}>
        {code}
      </pre>
    </div>
  );
}

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
      elements.push(<CodeBlock key={`cb${i}`} lang={lang} code={codeLines.join("\n")} />);
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
        <div key={`tbl${i}`} className="my-2 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.07)" }}>
                {rows[0]?.map((cell, ci) => (
                  <th key={ci} className="px-2 py-1 text-left font-semibold"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}>{renderInline(cell, ci)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1"
                      style={{ border: "1px solid rgba(255,255,255,0.08)", color: "#cbd5e1" }}>{renderInline(cell)}</td>
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
      elements.push(
        <p key={`h${i}`} className={`font-bold my-2 ${sizeMap[level]}`}>{renderInline(hMatch[2], i)}</p>
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
        const m = lines[i].trim().match(/^(-|\*|\d+\.)\s+(.+)/);
        if (m) items.push(<li key={i}>{renderInline(m[2], i)}</li>);
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

// ─── ThoughtSummary ────────────────────────────────────────────────────────

function ThoughtSummary({ summary }: { summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(167,139,250,0.3)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left"
        style={{ background: "rgba(139,92,246,0.1)", color: "#a78bfa" }}
      >
        <span>{open ? "▼" : "▶"}</span>
        <span className="font-medium">사고 과정</span>
      </button>
      {open && (
        <div className="px-3 py-2 text-xs" style={{ background: "rgba(0,0,0,0.2)", color: "#94a3b8" }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── Main ChatBubble ──────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingText?: string;
  onBookmark?: (id: string) => void;
  onCopy?: (content: string) => void;
  onCreateDirective?: (content: string) => void;
}

export default function ChatBubble({
  message,
  isStreaming,
  streamingText,
  onBookmark,
  onCopy,
  onCreateDirective,
}: ChatBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const isUser = message.role === "user";
  const displayContent = isStreaming && streamingText !== undefined ? streamingText : message.content;
  const sources = message.sources || [];

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    });
    onCopy?.(displayContent);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%]">
          <div
            className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
            style={{ background: "var(--accent)", color: "#fff", borderBottomRightRadius: "6px" }}
          >
            {displayContent}
          </div>
          {message.created_at && (
            <p className="text-right text-xs mt-1 mr-1" style={{ color: "var(--text-secondary)" }}>
              {new Date(message.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // AI 메시지
  return (
    <div className="flex justify-start mb-3 group">
      <div className="max-w-[80%] min-w-0">
        {/* 사고 과정 */}
        {message.thought_summary && <ThoughtSummary summary={message.thought_summary} />}

        {/* 메시지 버블 */}
        <div
          className="px-4 py-3 rounded-2xl text-sm relative"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderBottomLeftRadius: "6px",
            color: "var(--text-primary)",
          }}
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
        >
          {isStreaming && !displayContent ? (
            <span className="animate-pulse" style={{ color: "var(--text-secondary)" }}>···</span>
          ) : (
            <MarkdownContent content={displayContent} />
          )}

          {/* 호버 액션 버튼 */}
          {showActions && !isStreaming && (
            <div
              className="absolute top-2 right-2 flex gap-1"
              style={{ opacity: showActions ? 1 : 0, transition: "opacity 0.15s" }}
            >
              {onBookmark && (
                <button
                  onClick={() => onBookmark(message.id)}
                  className="text-xs px-1.5 py-1 rounded transition-colors"
                  style={{
                    background: message.bookmarked ? "rgba(234,179,8,0.2)" : "var(--bg-hover)",
                    color: message.bookmarked ? "#eab308" : "var(--text-secondary)",
                  }}
                  title="북마크"
                >
                  {message.bookmarked ? "★" : "☆"}
                </button>
              )}
              <button
                onClick={handleCopy}
                className="text-xs px-1.5 py-1 rounded transition-colors"
                style={{ background: "var(--bg-hover)", color: copiedMsg ? "#22c55e" : "var(--text-secondary)" }}
                title="복사"
              >
                {copiedMsg ? "✓" : "⎘"}
              </button>
              {onCreateDirective && (
                <button
                  onClick={() => onCreateDirective(displayContent)}
                  className="text-xs px-1.5 py-1 rounded transition-colors"
                  style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                  title="지시서 생성"
                >
                  📋
                </button>
              )}
            </div>
          )}
        </div>

        {/* 출처 카드 */}
        {sources.length > 0 && <SourceCard sources={sources} />}

        {/* 메타 정보 */}
        {!isStreaming && message.model_used && (
          <p className="text-xs mt-1 ml-1" style={{ color: "var(--text-secondary)" }}>
            [{message.model_used.includes("opus") ? "Opus" : message.model_used.includes("sonnet") ? "Sonnet" : message.model_used}
            {message.input_tokens ? ` · ${message.input_tokens.toLocaleString()}in` : ""}
            {message.output_tokens ? ` · ${message.output_tokens.toLocaleString()}out` : ""}
            {message.cost_usd ? ` · $${Number(message.cost_usd).toFixed(4)}` : ""}]
          </p>
        )}
      </div>
    </div>
  );
}
