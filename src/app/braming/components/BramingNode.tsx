"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const TYPE_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  topic:       { bg: "#7c3aed", border: "#a78bfa", icon: "🎯" },
  perspective: { bg: "#2563eb", border: "#60a5fa", icon: "🧠" },
  idea:        { bg: "#16a34a", border: "#4ade80", icon: "💡" },
  counter:     { bg: "#dc2626", border: "#f87171", icon: "🔥" },
  expansion:   { bg: "#ea580c", border: "#fb923c", icon: "🔄" },
  synthesis:   { bg: "#ca8a04", border: "#facc15", icon: "⭐" },
  ceo_pick:    { bg: "#7c3aed", border: "#facc15", icon: "👑" },
};

function BramingNodeComponent({ data, selected }: NodeProps) {
  const nodeType = (data.nodeType as string) || "idea";
  const style = TYPE_STYLES[nodeType] || TYPE_STYLES.idea;
  const isCeoPick = nodeType === "ceo_pick";
  const isTopic = nodeType === "topic";
  const childCount = (data.childCount as number) || 0;
  const collapsed = data.collapsed as boolean;
  const onToggleCollapse = data.onToggleCollapse as ((nodeId: string) => void) | undefined;
  const nodeId = data.nodeId as string;

  return (
    <div
      style={{
        background: style.bg + "dd",
        border: "2px solid " + (selected ? "#fff" : style.border),
        borderRadius: isTopic ? "50%" : "12px",
        padding: isTopic ? "16px" : "10px 14px",
        minWidth: isTopic ? "100px" : "160px",
        maxWidth: "220px",
        textAlign: "center",
        cursor: "pointer",
        boxShadow: isCeoPick
          ? "0 0 16px " + style.border + "88, 0 0 32px " + style.border + "44"
          : selected
          ? "0 0 12px rgba(255,255,255,0.3)"
          : "0 2px 8px rgba(0,0,0,0.3)",
        transition: "all 0.2s ease",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: style.border, width: 8, height: 8 }} />
      <div style={{ fontSize: isTopic ? "20px" : "14px", marginBottom: "2px" }}>{style.icon}</div>
      <div
        style={{
          fontSize: isTopic ? "14px" : "12px",
          fontWeight: 600,
          color: "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {data.label as string}
      </div>
      {typeof data.agentRole === "string" && data.agentRole !== "" && (
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>
          {data.agentRole}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: style.border, width: 8, height: 8 }} />
      {childCount > 0 && onToggleCollapse && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(nodeId);
          }}
          style={{
            position: "absolute",
            bottom: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            border: "2px solid " + style.border,
            background: style.bg,
            color: "#fff",
            fontSize: "12px",
            lineHeight: "18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            padding: 0,
          }}
          title={collapsed ? `펼치기 (${childCount}개)` : `접기 (${childCount}개)`}
        >
          {collapsed ? `+${childCount}` : "−"}
        </button>
      )}
    </div>
  );
}

export default memo(BramingNodeComponent);
