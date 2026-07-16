"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { Edge, Node } from "@xyflow/react";
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
  deleteNode,
  createShare,
  addCollaborator,
  exportSession,
  createPlan,
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [exportContent, setExportContent] = useState("");
  const [planResult, setPlanResult] = useState<{ id: number; title: string; markdown: string } | null>(null);

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
    const pageNode = nodesRef.current.find((n) => n.id === _nodeId);
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
      setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label, content } } : n));
    } catch (e) {
      console.error("노드 수정 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (!session) return;
    const target = nodesRef.current.find((n) => n.id === nodeId);
    const label = String(target?.data?.label || selectedNode?.label || "선택한 버블");
    if (!window.confirm(`"${label}" 버블과 하위 버블을 삭제할까요?`)) return;

    setLoading(true);
    try {
      await deleteNode(session.id, nodeId);
      setSelectedNode(null);
      await loadGraph(session.id);
    } catch (e) {
      console.error("노드 삭제 실패:", e);
      alert(e instanceof Error ? `버블 삭제 실패: ${e.message}` : "버블 삭제 실패");
    } finally {
      setLoading(false);
    }
  }, [session, selectedNode?.label, loadGraph]);

  const handleOpenShare = useCallback(async () => {
    if (!session) return;
    setShowShareModal(true);
    setShareLink("");
    setExportContent("");
    setPlanResult(null);
    setLoading(true);
    try {
      const { share } = await createShare(session.id, { role: "viewer", expires_in_days: 14 });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setShareLink(`${origin}/braming/shared/${share.token}`);
    } catch (e) {
      console.error("공유 링크 생성 실패:", e);
      alert(e instanceof Error ? `공유 링크 생성 실패: ${e.message}` : "공유 링크 생성 실패");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const handleAddCollaborator = useCallback(async () => {
    if (!session || !collaboratorEmail.trim()) return;
    setLoading(true);
    try {
      await addCollaborator(session.id, { email: collaboratorEmail.trim(), role: "editor" });
      setCollaboratorEmail("");
      alert("협업자가 추가되었습니다.");
    } catch (e) {
      console.error("협업자 추가 실패:", e);
      alert(e instanceof Error ? `협업자 추가 실패: ${e.message}` : "협업자 추가 실패");
    } finally {
      setLoading(false);
    }
  }, [session, collaboratorEmail]);

  const handleExport = useCallback(async () => {
    if (!session) return;
    setShowShareModal(true);
    setPlanResult(null);
    setLoading(true);
    try {
      const result = await exportSession(session.id, "markdown");
      setExportContent(result.export.content);
    } catch (e) {
      console.error("내보내기 실패:", e);
      alert(e instanceof Error ? `내보내기 실패: ${e.message}` : "내보내기 실패");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const handleCreatePlan = useCallback(async () => {
    if (!session) return;
    setShowShareModal(true);
    setExportContent("");
    setLoading(true);
    try {
      const result = await createPlan(session.id, { document_type: "prd", detail_level: "standard", audience: "product" });
      setPlanResult({
        id: result.artifact.id,
        title: result.artifact.content.title || result.artifact.artifact_name,
        markdown: result.artifact.content.markdown,
      });
    } catch (e) {
      console.error("기획서 생성 실패:", e);
      alert(e instanceof Error ? `기획서 생성 실패: ${e.message}` : "기획서 생성 실패");
    } finally {
      setLoading(false);
    }
  }, [session]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg, #0a0a1a)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ fontSize: "20px" }}>🧠</span>
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>브레인스토밍</h1>
          {session && (
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", padding: "2px 10px", borderRadius: "12px", background: "rgba(99,102,241,0.1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.title || session.topic}
            </span>
          )}
          {loading && <span style={{ fontSize: "12px", color: "var(--accent)" }}>처리 중...</span>}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {session && (
            <>
              <button onClick={handleGeneratePerspectives} disabled={loading} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #60a5fa", background: "transparent", color: "#60a5fa", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>🧠 관점 생성</button>
              <button onClick={handleSynthesize} disabled={loading} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #facc15", background: "transparent", color: "#facc15", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>⭐ 종합</button>
              <button onClick={handleOpenShare} disabled={loading} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #38bdf8", background: "transparent", color: "#38bdf8", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>공유</button>
              <button onClick={handleExport} disabled={loading} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #a78bfa", background: "transparent", color: "#a78bfa", fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>내보내기</button>
              <button onClick={handleCreatePlan} disabled={loading} style={{ padding: "8px 14px", borderRadius: "6px", border: "none", background: "#22c55e", color: "#06120a", fontWeight: 700, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>기획서로 확장</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <SessionSidebar activeSessionId={session?.id || null} onSelect={handleSelectSession} onNewSession={handleNewSession} refreshKey={refreshKey} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!session ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "48px" }}>🧠</div>
              <div style={{ fontSize: "16px", color: "var(--text-secondary)" }}>새 세션을 만들어 브레인스토밍을 시작하세요</div>
              <button onClick={handleNewSession} style={{ padding: "12px 24px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>+ 새 브레인스토밍 세션</button>
            </div>
          ) : (
            <>
              <BramingCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
              <NodeDetailPanel node={selectedNode} loading={loading} onGenerateIdeas={handleGenerateIdeas} onGenerateCounter={handleGenerateCounter} onExpandNode={handleExpandNode} onUpdateContent={handleUpdateContent} onDeleteNode={handleDeleteNode} />
            </>
          )}
        </div>
      </div>

      {showNewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowNewModal(false)}>
          <div style={{ background: "var(--bg-card, #1a1a2e)", borderRadius: "12px", padding: "24px", maxWidth: "500px", width: "100%", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>🧠 새 브레인스토밍 세션</h2>
            <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateSession()} placeholder="주제를 입력하세요" autoFocus style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg, #0f0f23)", color: "var(--text-primary)", fontSize: "14px", outline: "none", marginBottom: "16px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewModal(false)} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "13px" }}>취소</button>
              <button onClick={handleCreateSession} disabled={!newTopic.trim()} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "13px", opacity: newTopic.trim() ? 1 : 0.5 }}>생성</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowShareModal(false)}>
          <div style={{ background: "var(--bg-card, #1a1a2e)", borderRadius: "8px", padding: "20px", maxWidth: "760px", width: "100%", maxHeight: "86vh", overflow: "auto", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>세션 공유 및 확장</h2>
              <button onClick={() => setShowShareModal(false)} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", borderRadius: "6px", padding: "6px 10px", cursor: "pointer" }}>닫기</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
              <section style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>공유 링크</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input readOnly value={shareLink} placeholder={loading ? "공유 링크 생성 중..." : "공유 링크 없음"} style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg, #0f0f23)", color: "var(--text-primary)", fontSize: "13px" }} />
                  <button onClick={() => shareLink && navigator.clipboard?.writeText(shareLink)} disabled={!shareLink} style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #38bdf8", background: "transparent", color: "#38bdf8", fontWeight: 600, cursor: shareLink ? "pointer" : "not-allowed", opacity: shareLink ? 1 : 0.5 }}>복사</button>
                </div>
              </section>

              <section style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>내부 협업자 추가</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input value={collaboratorEmail} onChange={(e) => setCollaboratorEmail(e.target.value)} placeholder="이메일 입력" style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg, #0f0f23)", color: "var(--text-primary)", fontSize: "13px" }} />
                  <button onClick={handleAddCollaborator} disabled={loading || !collaboratorEmail.trim()} style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #22c55e", background: "transparent", color: "#22c55e", fontWeight: 600, cursor: loading || !collaboratorEmail.trim() ? "not-allowed" : "pointer", opacity: loading || !collaboratorEmail.trim() ? 0.5 : 1 }}>추가</button>
                </div>
              </section>

              {(exportContent || planResult) && (
                <section style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{planResult ? `기획서 산출물 #${planResult.id} · ${planResult.title}` : "Markdown 내보내기"}</div>
                    <button onClick={() => navigator.clipboard?.writeText(planResult?.markdown || exportContent)} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>내용 복사</button>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", maxHeight: "320px", overflow: "auto", padding: "12px", borderRadius: "6px", background: "var(--bg, #0f0f23)", color: "var(--text-primary)", fontSize: "12px", lineHeight: 1.5 }}>{planResult?.markdown || exportContent}</pre>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
