"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Edge, Node } from "@xyflow/react";
import { getSharedGraph, type BramingSession } from "../../api";

const BramingCanvas = dynamic(() => import("../../components/BramingCanvas"), { ssr: false });

export default function SharedBramingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [session, setSession] = useState<BramingSession | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSharedGraph(token)
      .then((data) => {
        if (cancelled) return;
        setSession(data.session);
        setNodes(data.nodes.map((node) => ({ ...node, type: "braming" })));
        setEdges(data.edges);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "공유 세션을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg, #0a0a1a)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ fontSize: "20px" }}>🧠</span>
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>공유 브레인스토밍</h1>
          {session && (
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.title || session.topic}
            </span>
          )}
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>읽기 전용</span>
      </div>

      {error ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: "14px" }}>
          {error}
        </div>
      ) : session ? (
        <BramingCanvas nodes={nodes} edges={edges} onNodeClick={() => undefined} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
          공유 세션을 불러오는 중...
        </div>
      )}
    </div>
  );
}
