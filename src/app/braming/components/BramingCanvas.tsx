"use client";
import React, { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import BramingNodeComponent from "./BramingNode";

const nodeTypes = { braming: BramingNodeComponent };

const NODE_COLORS: Record<string, string> = {
  topic: "#7c3aed", perspective: "#2563eb", idea: "#16a34a",
  counter: "#dc2626", expansion: "#ea580c", synthesis: "#ca8a04", ceo_pick: "#7c3aed",
};

function getDescendantIds(nodeId: string, edges: Edge[]): Set<string> {
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    const list = childMap.get(e.source);
    if (list) list.push(e.target);
    else childMap.set(e.source, [e.target]);
  }
  const result = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childMap.get(current);
    if (!children) continue;
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        stack.push(child);
      }
    }
  }
  return result;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string, nodeData: Record<string, unknown>) => void;
}

export default function BramingCanvas({ nodes: initialNodes, edges: initialEdges, onNodeClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const prevNodesRef = useRef(initialNodes);

  useEffect(() => {
    if (initialNodes !== prevNodesRef.current) {
      prevNodesRef.current = initialNodes;
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const cid of collapsedIds) {
      const descendants = getDescendantIds(cid, initialEdges);
      for (const d of descendants) hidden.add(d);
    }
    return hidden;
  }, [collapsedIds, initialEdges]);

  const visibleNodes = useMemo(() =>
    nodes
      .filter((n) => !hiddenIds.has(n.id))
      .map((n) => ({
        ...n,
        data: {
          ...n.data,
          collapsed: collapsedIds.has(n.id),
          onToggleCollapse: toggleCollapse,
          nodeId: n.id,
        },
      })),
    [nodes, hiddenIds, collapsedIds, toggleCollapse],
  );

  const visibleEdges = useMemo(() =>
    edges.filter((e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)),
    [edges, hiddenIds],
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onNodeClick(node.id, node.data as Record<string, unknown>);
  }, [onNodeClick]);

  return (
    <div style={{ flex: 1, height: "100%" }}>
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
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
