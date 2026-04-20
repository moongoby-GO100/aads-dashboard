"use client";
import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodeClick,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import BramingNodeComponent from "./BramingNode";

const nodeTypes = { braming: BramingNodeComponent };

const NODE_COLORS: Record<string, string> = {
  topic: "#7c3aed", perspective: "#2563eb", idea: "#16a34a",
  counter: "#dc2626", expansion: "#ea580c", synthesis: "#ca8a04", ceo_pick: "#7c3aed",
};

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string, nodeData: Record<string, unknown>) => void;
}

export default function BramingCanvas({ nodes: initialNodes, edges: initialEdges, onNodeClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when props change
  if (initialNodes !== nodes && initialNodes.length !== nodes.length) {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }

  const handleNodeClick: OnNodeClick = useCallback((_event, node) => {
    onNodeClick(node.id, node.data as Record<string, unknown>);
  }, [onNodeClick]);

  return (
    <div style={{ flex: 1, height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0f0f23" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e1e3a" />
        <Controls
          style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: "8px" }}
        />
        <MiniMap
          nodeColor={(n) => NODE_COLORS[(n.data as Record<string, string>)?.nodeType] || "#666"}
          style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: "8px" }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
