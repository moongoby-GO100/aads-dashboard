"use client";
import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { Node, Edge } from "@xyflow/react";
import SessionSidebar from "./components/SessionSidebar";
import NodeDetailPanel from "./components/NodeDetailPanel";
import {
  createSession,
  getSessionGraph,
  generatePerspectives,
  generateIdeas,
  generateCounter,
  expandNode,
  synthesizeSession,
  updateNodeContent,
  type BramingSession,
} from "./api";

const BramingCanvas = dynamic(() => import("./components/BramingCanvas"), { ssr: false });

interface SelectedNode {
  id: string;
  label: string;
  content: string;
  nodeType: string;
  agentRole: string | null;
  cost: number;
  createdAt: string;
}

export default function BramingPage() {
  const [session, setSession] = useState<BramingSession | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTopic, setNewTopic] = useState("");

  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  const loadGraph = useCallback(async (sessionId: string) => {
    try {
      const data = await getSessionGraph(sessionId);
      setSession(data.session);
      setNodes(data.nodes.map((n) => ({ ...n, type: "braming" })));
      setEdges(data.edges);
      setSelectedNode(null);
    } catch (e) {
      console.error("그래프 로드 실패:", e);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    setShowNewModal(true);
    setNewTopic("");
  }, []);

  const handleCreateSession = useCallback(async () => {
    if (!newTopic.trim()) return;
    setLoading(true);
    setShowNewModal(false);
    try {
      const { session: s } = await createSession(newTopic.trim());
      setSession(s);
      setRefreshKey((k) => k + 1);
      await loadGraph(s.id);
    } catch (e) {
      console.error("세션 생성 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [newTopic, loadGraph]);

  const handleSelectSession = useCallback((s: BramingSession) => {
    loadGraph(s.id);
  }, [loadGraph]);

  const handleNodeClick = useCallback((_nodeId: string, data: Record<string, unknown>) => {
    const pageNode = nodesRef.current.find(n => n.id === _nodeId);
    const src = (pageNode?.data ?? data) as Record<string, unknown>;
    setSelectedNode({
      id: _nodeId,
      label: (src.label as string) || "",
      content: (src.content as string) || "",
      nodeType: (src.nodeType as string) || "idea",
      agentRole: (src.agentRole as string) || null,
      cost: (src.cost as number) || 0,
      createdAt: (src.createdAt as string) || "",
    });
  }, []);

  const handleGeneratePerspectives = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await generatePerspectives(session.id);
      await loadGraph(session.id);
    } catch (e) {
      console.error("관점 생성 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session, loadGraph]);

  const handleGenerateIdeas = useCallback(async (nodeId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      await generateIdeas(session.id, nodeId);
      await loadGraph(session.id);
    } catch (e) {
      console.error("아이디어 생성 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session, loadGraph]);

  const handleGenerateCounter = useCallback(async (nodeId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      await generateCounter(session.id, nodeId);
      await loadGraph(session.id);
    } catch (e) {
      console.error("반박 생성 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session, loadGraph]);

  const handleExpandNode = useCallback(async (nodeId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      await expandNode(session.id, nodeId);
      await loadGraph(session.id);
    } catch (e) {
      console.error("확장 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session, loadGraph]);

  const handleSynthesize = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await synthesizeSession(session.id);
      await loadGraph(session.id);
    } catch (e) {
      console.error("종합 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session, loadGraph]);

  const handleUpdateContent = useCallback(async (nodeId: string, label: string, content: string) => {
    if (!session) return;
    setLoading(true);
    try {
      await updateNodeContent(session.id, nodeId, { label, content });
      setSelectedNode((prev) => prev ? { ...prev, label, content } : null);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label, content } } : n,
        ),
      );
    } catch (e) {
      console.error("노드 수정 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg, #0a0a1a)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "20px" }}>🧠</span>
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>브레인스토밍</h1>
          {session && (
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", padding: "2px 10px", borderRadius: "12px", background: "rgba(99,102,241,0.1)" }}>
              {session.title || session.topic}
            </span>
          )}
          {loading && <span style={{ fontSize: "12px", color: "var(--accent)" }}>⏳ 처리 중...</span>}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {session && (
            <>
              <button
                onClick={handleGeneratePerspectives}
                disabled={loading}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #60a5fa", background: "transparent", color: "#60a5fa", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
              >
                🧠 관점 생성
              </button>
              <button
                onClick={handleSynthesize}
                disabled={loading}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #facc15", background: "transparent", color: "#facc15", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
              >
                ⭐ 종합
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <SessionSidebar
          activeSessionId={session?.id || null}
          onSelect={handleSelectSession}
          onNewSession={handleNewSession}
          refreshKey={refreshKey}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!session ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "48px" }}>🧠</div>
              <div style={{ fontSize: "16px", color: "var(--text-secondary)" }}>새 세션을 만들어 브레인스토밍을 시작하세요</div>
              <button
                onClick={handleNewSession}
                style={{ padding: "12px 24px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
              >
                + 새 브레인스토밍 세션
              </button>
            </div>
          ) : (
            <>
              <BramingCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
              <NodeDetailPanel
                node={selectedNode}
                loading={loading}
                onGenerateIdeas={handleGenerateIdeas}
                onGenerateCounter={handleGenerateCounter}
                onExpandNode={handleExpandNode}
                onUpdateContent={handleUpdateContent}
              />
            </>
          )}
        </div>
      </div>

      {/* New Session Modal */}
      {showNewModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            style={{ background: "var(--bg-card, #1a1a2e)", borderRadius: "12px", padding: "24px", maxWidth: "500px", width: "100%", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>🧠 새 브레인스토밍 세션</h2>
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
              placeholder="주제를 입력하세요 (예: GO100 야간시장 진출 전략)"
              autoFocus
              style={{
                width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)",
                background: "var(--bg, #0f0f23)", color: "var(--text-primary)", fontSize: "14px",
                outline: "none", marginBottom: "16px", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "13px" }}
              >
                취소
              </button>
              <button
                onClick={handleCreateSession}
                disabled={!newTopic.trim()}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "13px", opacity: newTopic.trim() ? 1 : 0.5 }}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
