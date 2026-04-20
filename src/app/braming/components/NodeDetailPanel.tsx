"use client";

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
}

const TYPE_LABEL: Record<string, string> = {
  topic: "🎯 주제", perspective: "🧠 관점", idea: "💡 아이디어",
  counter: "🔥 반박", expansion: "🔄 확장", synthesis: "⭐ 종합", ceo_pick: "👑 CEO 선택",
};

export default function NodeDetailPanel({ node, loading, onGenerateIdeas, onGenerateCounter, onExpandNode }: Props) {
  if (!node) {
    return (
      <div style={{ height: "160px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "14px", background: "var(--bg-card)" }}>
        노드를 클릭하면 상세 내용이 표시됩니다
      </div>
    );
  }

  const btnBase: React.CSSProperties = {
    padding: "8px 16px", borderRadius: "6px", background: "transparent",
    fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.5 : 1,
  };

  return (
    <div style={{ height: "180px", borderTop: "1px solid var(--border)", display: "flex", background: "var(--bg-card)", overflow: "hidden" }}>
      <div style={{ flex: 1, padding: "14px 20px", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{TYPE_LABEL[node.nodeType] || node.nodeType}</span>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>— {node.label}</span>
          {node.agentRole && <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>{node.agentRole}</span>}
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{node.content}</div>
        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "8px", display: "flex", gap: "16px" }}>
          <span>비용: ${node.cost?.toFixed(4) || "0"}</span>
          <span>{node.createdAt ? new Date(node.createdAt).toLocaleTimeString("ko-KR") : ""}</span>
        </div>
      </div>
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
    </div>
  );
}
