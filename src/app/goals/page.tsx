"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  Handle,
  Node,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import type { GoalDetail, GoalSummary } from "@/lib/api";

const PROJECTS = ["ALL", "AADS", "KIS", "GO100", "SF", "NTV2", "NAS"];

const statusColor: Record<string, string> = {
  completed: "#16a34a",
  done: "#16a34a",
  active: "#2563eb",
  in_progress: "#2563eb",
  running: "#2563eb",
  blocked: "#dc2626",
  error: "#dc2626",
  failed: "#dc2626",
  draft: "#64748b",
  pending: "#64748b",
  queued: "#d97706",
};

function normalizeProgress(value?: number) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function StateNode({ data }: { data: { title: string; subtitle: string; status: string; kind: string } }) {
  const color = statusColor[data.status] || "#64748b";
  return (
    <div style={{ width: 220, border: `2px solid ${color}`, borderRadius: 12, background: "var(--bg-card)", padding: 12, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }}>
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div style={{ color, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{data.kind} · {data.status}</div>
      <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>{data.title}</div>
      <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.subtitle}</div>
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  );
}

const nodeTypes = { state: StateNode };

function buildGraph(goal: GoalDetail): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{
    id: `goal-${goal.goal_id}`,
    type: "state",
    position: { x: 0, y: Math.max(0, (goal.milestones.length - 1) * 95) },
    data: { title: goal.title, subtitle: goal.success_criteria || `${goal.project} 최종 목표`, status: goal.status, kind: "Goal" },
  }];
  const edges: Edge[] = [];
  goal.milestones.forEach((milestone, mi) => {
    const milestoneId = `milestone-${milestone.id}`;
    const baseY = mi * 190;
    nodes.push({
      id: milestoneId,
      type: "state",
      position: { x: 310, y: baseY },
      data: { title: milestone.title, subtitle: milestone.completion_criteria || `순서 ${milestone.sequence}`, status: milestone.status, kind: "Milestone" },
    });
    edges.push({ id: `g-${milestoneId}`, source: `goal-${goal.goal_id}`, target: milestoneId, animated: milestone.status === "in_progress", style: { stroke: statusColor[milestone.status] || "#64748b" } });
    (milestone.tasks || []).slice(0, 4).forEach((task, ti) => {
      const taskId = `task-${milestone.id}-${ti}`;
      nodes.push({
        id: taskId,
        type: "state",
        position: { x: 620, y: baseY + ti * 100 - Math.max(0, ((milestone.tasks?.length || 1) - 1) * 35) },
        data: { title: task.task_id, subtitle: task.task_type, status: task.status, kind: "Task" },
      });
      edges.push({ id: `${milestoneId}-${taskId}`, source: milestoneId, target: taskId, animated: ["running", "in_progress"].includes(task.status), style: { stroke: statusColor[task.status] || "#64748b" } });
    });
  });
  return { nodes, edges };
}

export default function GoalsPage() {
  const [project, setProject] = useState("ALL");
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.getGoals(project === "ALL" ? undefined : project);
      const next = Array.isArray(rows) ? rows : [];
      setGoals(next);
      const currentStillExists = next.some((goal) => (goal.goal_id || goal.id) === selectedId);
      if (!currentStillExists) setSelectedId(next[0]?.goal_id || next[0]?.id || "");
      setError("");
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "목표 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [project, selectedId]);

  useEffect(() => { void loadGoals(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setInterval(() => void loadGoals(), 15000);
    return () => window.clearInterval(timer);
  }, [loadGoals]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.getGoalStatus(selectedId).then(setDetail).catch((cause) => setError(cause instanceof Error ? cause.message : "목표 상세를 불러오지 못했습니다."));
  }, [selectedId, updatedAt]);

  const graph = useMemo(() => detail ? buildGraph(detail) : { nodes: [], edges: [] }, [detail]);
  const counts = useMemo(() => ({
    active: goals.filter((g) => g.status === "active").length,
    blocked: goals.filter((g) => ["blocked", "failed", "error"].includes(g.status)).length,
    completed: goals.filter((g) => g.status === "completed").length,
  }), [goals]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="Goal Control" />
      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 16px 48px" }}>
        <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>목표 자율 진행 감독</h1>
            <p style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13 }}>목표 → 마일스톤 → 실행 작업의 현재 위치, 차단 원인, 다음 자동 진행을 한 화면에서 확인합니다.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{updatedAt ? `${updatedAt.toLocaleTimeString("ko-KR")} 갱신` : "미갱신"}</span>
            <button onClick={() => void loadGoals()} style={{ minHeight: 40, padding: "0 16px", borderRadius: 8, border: 0, background: "var(--accent)", color: "white", fontWeight: 700, cursor: "pointer" }}>새로고침</button>
          </div>
        </section>

        {error && <div role="alert" style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: "1px solid #ef4444", background: "rgba(239,68,68,.08)", color: "#dc2626" }}>{error} <button onClick={() => void loadGoals()} style={{ marginLeft: 12, textDecoration: "underline", border: 0, background: "none", color: "inherit", cursor: "pointer" }}>다시 시도</button></div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
          {[["전체 목표", goals.length, "#475569"], ["진행 중", counts.active, "#2563eb"], ["차단", counts.blocked, "#dc2626"], ["완료", counts.completed, "#16a34a"]].map(([label, value, color]) => (
            <div key={String(label)} style={{ padding: 16, borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div><div style={{ marginTop: 4, fontSize: 26, fontWeight: 800, color: String(color) }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }} aria-label="프로젝트 필터">
          {PROJECTS.map((item) => <button key={item} onClick={() => setProject(item)} style={{ minHeight: 40, padding: "0 14px", whiteSpace: "nowrap", borderRadius: 20, border: `1px solid ${project === item ? "var(--accent)" : "var(--border)"}`, background: project === item ? "var(--accent)" : "var(--bg-card)", color: project === item ? "white" : "var(--text-primary)", fontWeight: 700, cursor: "pointer" }}>{item}</button>)}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,360px) minmax(0,1fr)", gap: 16 }} className="goal-layout">
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading && <div style={{ padding: 24, color: "var(--text-secondary)" }}>목표 상태를 불러오는 중입니다.</div>}
            {!loading && goals.length === 0 && <div style={{ padding: 24, borderRadius: 12, border: "1px dashed var(--border)", color: "var(--text-secondary)" }}>등록된 목표가 없습니다.</div>}
            {goals.map((goal) => {
              const id = goal.goal_id || goal.id || "";
              const pct = normalizeProgress(goal.progress);
              const color = statusColor[goal.status] || "#64748b";
              return <button key={id} onClick={() => setSelectedId(id)} style={{ padding: 14, textAlign: "left", borderRadius: 12, border: `2px solid ${selectedId === id ? color : "var(--border)"}`, background: "var(--bg-card)", cursor: "pointer", minHeight: 112 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 800, color }}>{goal.project} · {goal.priority}</span><span style={{ fontSize: 11, color }}>{goal.status}</span></div>
                <div style={{ marginTop: 7, fontSize: 14, fontWeight: 750, color: "var(--text-primary)", lineHeight: 1.35 }}>{goal.title}</div>
                <div style={{ marginTop: 10, height: 7, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color }} /></div>
                <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>{pct.toFixed(0)}%</div>
              </button>;
            })}
          </section>

          <section style={{ minHeight: 620, borderRadius: 14, background: "var(--bg-card)", border: "1px solid var(--border)", overflow: "hidden" }}>
            {!detail ? <div style={{ padding: 28, color: "var(--text-secondary)" }}>왼쪽에서 목표를 선택하십시오.</div> : <>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong style={{ color: "var(--text-primary)" }}>{detail.title}</strong><span style={{ color: statusColor[detail.status] || "#64748b", fontWeight: 800 }}>{detail.status}</span></div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>마일스톤 {detail.milestones_completed}/{detail.milestones_total} · 자동 진행은 각 완료기준과 연결 작업 상태가 모두 충족될 때만 실행됩니다.</div>
              </div>
              <div style={{ height: 540 }} aria-label="목표 실행 상태 그래프">
                <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView minZoom={0.25} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable>
                  <Background gap={22} size={1} /><Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </>}
          </section>
        </div>
      </main>
      <style jsx global>{`@media (max-width: 850px){.goal-layout{grid-template-columns:1fr!important}.goal-layout>section:last-child{min-height:520px!important}}`}</style>
    </div>
  );
}
