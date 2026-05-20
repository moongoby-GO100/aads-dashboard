"use client";
import { useState, useEffect } from "react";

interface NodeData {
  id: string;
  label: string;
  content: string;
  nodeType: string;
  agentRole: string | null;
  cost: number;
  createdAt: string;
}

interface Props {
  node: NodeData | null;
  loading: boolean;
  onGenerateIdeas: (nodeId: string) => void;
  onGenerateCounter: (nodeId: string) => void;
  onExpandNode: (nodeId: string) => void;
  onUpdateContent?: (nodeId: string, label: string, content: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  topic: "🎯 주제", perspective: "🧠 관점", idea: "💡 아이디어",
  counter: "🔥 반박", expansion: "🔄 확장", synthesis: "⭐ 종합", ceo_pick: "👑 CEO 선택",
};

export default function NodeDetailPanel({ node, loading, onGenerateIdeas, onGenerateCounter, onExpandNode, onUpdateContent }: Props) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    setEditing(false);
    if (node) {
      setEditLabel(node.label);
      setEditContent(node.content);
    }
  }, [node?.id, node?.label, node?.content]);

  if (!node) {
    return (
      <div style={{ height: "160px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "14px", background: "var(--bg-card)" }}>
        노드를 클릭하면 상세 내용이 표시됩니다
      </div>
    );
  }

  const handleSave = () => {
    if (!onUpdateContent) return;
    const labelChanged = editLabel.trim() !== node.label;
    const contentChanged = editContent.trim() !== node.content;
    if (labelChanged || contentChanged) {
      onUpdateContent(node.id, editLabel.trim(), editContent.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditLabel(node.label);
    setEditContent(node.content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
  };

  const btnBase: React.CSSProperties = {
    padding: "8px 16px", borderRadius: "6px", background: "transparent",
    fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.5 : 1,
  };

  return (
    <div style={{ height: editing ? "260px" : "180px", borderTop: "1px solid var(--border)", display: "flex", background: "var(--bg-card)", overflow: "hidden", transition: "height 0.2s ease" }}>
      <div style={{ flex: 1, padding: "14px 20px", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{TYPE_LABEL[node.nodeType] || node.nodeType}</span>
          {!editing && (
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>— {node.label}</span>
          )}
          {node.agentRole && <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>{node.agentRole}</span>}
          {!editing && onUpdateContent && (
            <button
              onClick={() => setEditing(true)}
              style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "11px", cursor: "pointer" }}
            >
              ✏️ 수정
            </button>
          )}
        </div>

        {editing ? (
          <div onKeyDown={handleKeyDown}>
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              placeholder="제목"
              autoFocus
              style={{
                width: "100%", padding: "8px 10px", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--bg, #0f0f23)",
                color: "var(--text-primary)", fontSize: "13px", fontWeight: 600,
                outline: "none", marginBottom: "8px", boxSizing: "border-box",
              }}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="내용"
              style={{
                width: "100%", height: "100px", padding: "8px 10px", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--bg, #0f0f23)",
                color: "var(--text-primary)", fontSize: "13px", lineHeight: "1.5",
                outline: "none", resize: "vertical", boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "var(--accent, #6366f1)", color: "#fff", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
              >
                저장 (Ctrl+Enter)
              </button>
              <button
                onClick={handleCancel}
                style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer" }}
              >
                취소 (Esc)
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{node.content}</div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "8px", display: "flex", gap: "16px" }}>
              <span>비용: ${node.cost?.toFixed(4) || "0"}</span>
              <span>{node.createdAt ? new Date(node.createdAt).toLocaleTimeString("ko-KR") : ""}</span>
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div style={{ width: "180px", padding: "14px", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center", flexShrink: 0 }}>
          {loading && <div style={{ textAlign: "center", color: "var(--accent)", fontSize: "13px" }}>처리 중...</div>}
          {node.nodeType === "perspective" && (
            <button style={{ ...btnBase, border: "1px solid #4ade80", color: "#4ade80" }} onClick={() => onGenerateIdeas(node.id)} disabled={loading}>💡 아이디어 생성</button>
          )}
          {(node.nodeType === "idea" || node.nodeType === "expansion") && (
            <>
              <button style={{ ...btnBase, border: "1px solid #f87171", color: "#f87171" }} onClick={() => onGenerateCounter(node.id)} disabled={loading}>🔥 반박</button>
              <button style={{ ...btnBase, border: "1px solid #fb923c", color: "#fb923c" }} onClick={() => onExpandNode(node.id)} disabled={loading}>🔄 확장</button>
            </>
          )}
          {node.nodeType === "counter" && (
            <button style={{ ...btnBase, border: "1px solid #fb923c", color: "#fb923c" }} onClick={() => onExpandNode(node.id)} disabled={loading}>🔄 확장</button>
          )}
          {node.nodeType === "topic" && <div style={{ fontSize: "12px", color: "var(--text-secondary)", textAlign: "center" }}>관점 생성은 상단 버튼 사용</div>}
        </div>
      )}
    </div>
  );
}
