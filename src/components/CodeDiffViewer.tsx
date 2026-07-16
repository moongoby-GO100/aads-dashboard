/**
 * AADS-188D: Monaco DiffEditor 래퍼 — 원본/수정 비교 + Accept/Reject/Edit
 */
"use client";

import { useCallback, useMemo, useState } from "react";

const LANG_MAP: Record<string, string> = {
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  sql: "sql",
};

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return LANG_MAP[ext] || "plaintext";
}

export interface CodeDiffViewerProps {
  original: string;
  modified: string;
  filename: string;
  taskId?: string;
  toolUseId: string;
  sessionId: string;
  theme?: "dark" | "light";
  onAccept: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  onEdit?: (edited: string) => void | Promise<void>;
  readOnly?: boolean;
}

export function CodeDiffViewer({
  original,
  modified,
  filename,
  toolUseId,
  sessionId,
  theme = "dark",
  onAccept,
  onReject,
  onEdit,
  readOnly = true,
}: CodeDiffViewerProps) {
  const [mode, setMode] = useState<"side-by-side" | "inline">("side-by-side");
  const [editModal, setEditModal] = useState(false);
  const [editedContent, setEditedContent] = useState(modified);
  const lang = useMemo(() => getLanguage(filename), [filename]);

  const handleAccept = useCallback(async () => {
    await onAccept();
  }, [onAccept]);

  const handleReject = useCallback(async () => {
    await onReject();
  }, [onReject]);

  const handleEditSubmit = useCallback(async () => {
    if (onEdit) await onEdit(editedContent);
    setEditModal(false);
  }, [onEdit, editedContent]);

  // Monaco is heavy; use a simple diff view when @monaco-editor/react not loaded
  const [MonacoDiff, setMonacoDiff] = useState<React.ComponentType<any> | null>(null);
  const [fallback, setFallback] = useState(true);

  if (typeof window !== "undefined" && fallback) {
    import("@monaco-editor/react")
      .then((mod) => {
        setMonacoDiff(() => mod.DiffEditor);
        setFallback(false);
      })
      .catch(() => setFallback(true));
  }

  return (
    <div className="code-diff-viewer" data-theme={theme}>
      <div className="code-diff-header">
        <span className="code-diff-filename">{filename}</span>
        <div className="code-diff-toolbar">
          <button
            type="button"
            className={mode === "side-by-side" ? "active" : ""}
            onClick={() => setMode("side-by-side")}
          >
            Side-by-side
          </button>
          <button
            type="button"
            className={mode === "inline" ? "active" : ""}
            onClick={() => setMode("inline")}
          >
            Inline
          </button>
        </div>
      </div>
      <div className="code-diff-body">
        {MonacoDiff && !fallback ? (
          <MonacoDiff
            original={original}
            modified={modified}
            language={lang}
            theme={theme === "dark" ? "vs-dark" : "light"}
            options={{
              readOnly,
              renderSideBySide: mode === "side-by-side",
              fontSize: 12,
              wordWrap: "on",
            }}
          />
        ) : (
          <div className="code-diff-fallback">
            <div className="code-diff-original">
              <div className="code-diff-label">Original</div>
              <pre>{original || "(empty)"}</pre>
            </div>
            <div className="code-diff-modified">
              <div className="code-diff-label">Modified</div>
              <pre>{modified || "(empty)"}</pre>
            </div>
          </div>
        )}
      </div>
      <div className="code-diff-actions">
        <button type="button" className="code-diff-accept" onClick={handleAccept}>
          ✅ Accept
        </button>
        <button type="button" className="code-diff-reject" onClick={handleReject}>
          ❌ Reject
        </button>
        {onEdit && (
          <button type="button" className="code-diff-edit" onClick={() => setEditModal(true)}>
            ✏️ Edit
          </button>
        )}
      </div>
      {editModal && onEdit && (
        <div className="code-diff-modal">
          <div className="code-diff-modal-inner">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={20}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
            />
            <div className="code-diff-modal-actions">
              <button type="button" onClick={handleEditSubmit}>Apply</button>
              <button type="button" onClick={() => setEditModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
