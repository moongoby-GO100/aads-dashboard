"use client";
/**
 * AADS-172-B: SourceCard
 * 검색 결과 출처 링크 카드
 * - 파비콘 + 제목 + URL
 * - 최대 5개 표시 + "더 보기" 확장
 */
import { useState } from "react";
import type { SourceItem } from "@/services/chatApi";

interface SourceCardProps {
  sources: SourceItem[];
  maxVisible?: number;
}

function SingleSource({ src }: { src: SourceItem }) {
  const domain = (() => {
    try { return new URL(src.url).hostname; } catch { return src.url; }
  })();

  return (
    <a
      href={src.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
      style={{
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"; }}
    >
      {/* 파비콘 */}
      {src.favicon ? (
        <img src={src.favicon} alt="" className="w-3.5 h-3.5 mt-0.5 rounded-sm flex-shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 flex items-center justify-center rounded-sm text-[10px]"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {domain.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {src.title || domain}
        </p>
        <p className="truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {domain}
        </p>
      </div>
    </a>
  );
}

export default function SourceCard({ sources, maxVisible = 5 }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  const visible = expanded ? sources : sources.slice(0, maxVisible);
  const hasMore = sources.length > maxVisible;

  return (
    <div className="mt-2">
      <p className="text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
        출처 {sources.length}개
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        {visible.map((src, i) => (
          <SingleSource key={i} src={src} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-xs px-2 py-1 rounded transition-colors"
          style={{ color: "var(--accent)", background: "transparent" }}
        >
          {expanded ? "접기 ▲" : `+ ${sources.length - maxVisible}개 더 보기 ▼`}
        </button>
      )}
    </div>
  );
}
