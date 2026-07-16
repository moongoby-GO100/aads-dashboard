"use client";
/**
 * AADS-PREVIEW-FE: HTML Preview 아티팩트 렌더링
 * - iframe sandbox로 안전한 HTML 미리보기
 * - 코드 보기 / 미리보기 토글
 * - 새 창 열기 (Blob URL)
 * - 복사 기능
 */
import { useState, useCallback } from "react";
import type { ArtifactContent } from "@/hooks/useArtifactPanel";

interface Props {
  artifact: ArtifactContent | null;
  workspaceId?: string;
}

export default function ArtifactHtmlPreview({ artifact }: Props) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const htmlContent = artifact?.html || artifact?.content || "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API 실패 무시 */
    }
  }, [htmlContent]);

  const handleOpenNewWindow = useCallback(() => {
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, [htmlContent]);

  if (!artifact || !htmlContent || htmlContent.length < 30) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{ color: "var(--ct-text-muted)" }}
      >
        <span style={{ fontSize: 48 }}>👁️</span>
        <p className="text-sm text-center px-4">
          미리보기할 HTML이 없습니다.
          <br />
          AI에게 HTML 생성을 요청해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 상단 툴바 */}
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ct-border)" }}
      >
        <span
          className="text-xs truncate"
          style={{ color: "var(--ct-text-muted)", maxWidth: 160 }}
          title={artifact.title || "HTML 미리보기"}
        >
          {artifact.title || "HTML 미리보기"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode(viewMode === "preview" ? "code" : "preview")}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs"
            style={{
              background: "var(--ct-hover)",
              border: "none",
              color: "var(--ct-text-muted)",
              cursor: "pointer",
            }}
            title={viewMode === "preview" ? "코드 보기" : "미리보기"}
          >
            {viewMode === "preview" ? "{ }" : "👁️"}
            <span>{viewMode === "preview" ? "코드" : "미리보기"}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center px-2 py-1 rounded text-xs"
            style={{
              background: "var(--ct-hover)",
              border: "none",
              color: copied ? "var(--ct-accent)" : "var(--ct-text-muted)",
              cursor: "pointer",
            }}
            title="HTML 복사"
          >
            {copied ? "✓" : "📋"}
          </button>
          <button
            onClick={handleOpenNewWindow}
            className="flex items-center px-2 py-1 rounded text-xs"
            style={{
              background: "var(--ct-hover)",
              border: "none",
              color: "var(--ct-text-muted)",
              cursor: "pointer",
            }}
            title="새 창에서 열기"
          >
            ↗
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "preview" ? (
          <iframe
            srcDoc={htmlContent}
            sandbox="allow-scripts"
            title={artifact.title || "HTML Preview"}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: 4,
              background: "#ffffff",
            }}
          />
        ) : (
          <div
            className="h-full overflow-auto p-3"
            style={{ background: "var(--ct-code-bg, #1e1e1e)" }}
          >
            <pre
              className="text-xs leading-relaxed"
              style={{
                color: "var(--ct-code-text, #d4d4d4)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
              }}
            >
              <code>{htmlContent}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
