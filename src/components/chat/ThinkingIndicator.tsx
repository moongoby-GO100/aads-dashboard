"use client";
/**
 * AADS-185-C3: ThinkingIndicator — Claude Extended Thinking 표시
 * 접이식 표시, 타이핑 애니메이션
 */
import { useState } from "react";

interface ThinkingIndicatorProps {
  thinkingText: string | null;
  isActive?: boolean;
}

export default function ThinkingIndicator({ thinkingText, isActive }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  if (!thinkingText && !isActive) return null;

  return (
    <div
      className="mb-2 rounded-xl overflow-hidden text-xs"
      style={{
        background: "var(--bg-secondary, #1e1e2e)",
        border: "1px solid var(--border, #3a3a4a)",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ color: "var(--text-secondary, #888)" }}
      >
        {isActive && !thinkingText ? (
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full animate-bounce"
                style={{
                  background: "var(--accent, #6366f1)",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </span>
        ) : (
          <span style={{ color: "var(--accent, #6366f1)" }}>🧠</span>
        )}
        <span className="font-medium">
          {isActive && !thinkingText ? "AI가 생각 중..." : "Extended Thinking"}
        </span>
        {thinkingText && (
          <span className="ml-auto text-xs opacity-60">
            {expanded ? "▲ 접기" : "▼ 펼치기"}
          </span>
        )}
      </button>

      {expanded && thinkingText && (
        <div
          className="px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap"
          style={{
            color: "var(--text-secondary, #aaa)",
            borderTop: "1px solid var(--border, #3a3a4a)",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {thinkingText}
        </div>
      )}
    </div>
  );
}
