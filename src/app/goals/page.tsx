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
import { buildGoalDocHref } from "@/lib/documentLinks";

// 통합지시가 보는 프로젝트와 맞춘다. 여기만 7개로 박혀 있으면 FOOD·LAW 같은
// 업무 워크스페이스의 목표가 화면에서 아예 안 보인다.
const PROJECTS = ["ALL", "AADS", "KIS", "GO100", "SF", "NTV2", "NAS",
                  "FOOD", "LAW", "COM", "DESIGN", "ACCT", "KAKAOBOT"];

type BoardOwner = {
  session_id: string; role_key: string; title: string; state: string;
  milestone: string | null; last_at: string | null;
  tool_calls: number; dispatch_count: number; note: string | null;
  milestone_id?: string | null; variant?: string | null;
  paused?: boolean; paused_reason?: string | null; open_notes?: number;
  is_lead?: boolean;
};
type Candidate = {
  session_id: string; title: string; role_key: string;
  message_count: number; has_prompt: boolean;
};
type GoalDoc = { kind: string; doc_path: string; title: string | null };
type Board = {
  halted: boolean; owners: BoardOwner[]; has_lead?: boolean;
  documents?: GoalDoc[]; has_design?: boolean; missing_design?: string[];
};

const docLabel: Record<string, string> = {
  plan: "📋 기획서", prd: "📐 PRD", report: "📊 리포트", reference: "🔗 참고",
};
const docMissingLabel: Record<string, string> = { plan: "기획서", prd: "PRD" };

const stateColor: Record<string, string> = {
  "확인 대기": "#7c3aed",
  "멈춤": "#64748b",
  "작업 중": "#2563eb",
  "진행 중": "#2563eb",
  "응답 대기": "#d97706",
  "응답 끊김": "#dc2626",
  "막힘": "#dc2626",
  "지시 없음": "#64748b",
};

function sinceText(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

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

  const [board, setBoard] = useState<Board | null>(null);
  const [ownerBusy, setOwnerBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState<Candidate | null>(null);
  const [roleKey, setRoleKey] = useState("");
  const [asLead, setAsLead] = useState(false);
  // 목록에 없는 창은 주소를 그대로 붙여넣어 붙인다. 실패는 그 자리에 남긴다 —
  // 조용히 닫히면 붙은 줄 아신다 (2026-09-17 대표님 지시).
  const [linkDraft, setLinkDraft] = useState("");
  const [addErr, setAddErr] = useState("");

  const reloadBoard = useCallback(async (gid: string) => {
    try { setBoard(await api.getGoalBoard(gid)); } catch { /* 조회 실패가 화면을 막지 않는다 */ }
  }, []);

  const [policy, setPolicy] = useState<{
    auto_approve_high: boolean; auto_approve_critical: boolean;
    max_executions: number; used: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedId) { setPolicy(null); return; }
    let alive = true;
    api.getGoalApprovalPolicy(selectedId)
      .then((p) => { if (alive) setPolicy(p); })
      .catch(() => { if (alive) setPolicy(null); });
    return () => { alive = false; };
  }, [selectedId]);

  // 허용 횟수는 다 치고 나서 저장한다.
  const [countDraft, setCountDraft] = useState("200");
  useEffect(() => {
    setCountDraft(String(policy?.max_executions ?? 200));
  }, [policy?.max_executions]);

  // 설정 저장. 주문·자금을 켤 때는 한 번 묻는다 — 돈이 직접 걸린다.
  const savePolicy = useCallback(async (patch: Partial<{
    auto_approve_high: boolean; auto_approve_critical: boolean; max_executions: number;
  }>) => {
    if (!selectedId) return;
    const next = {
      auto_approve_high: policy?.auto_approve_high ?? false,
      auto_approve_critical: policy?.auto_approve_critical ?? false,
      max_executions: policy?.max_executions || 200,
      ...patch,
    };
    if (patch.auto_approve_critical === true &&
        !window.confirm("주문·자금·서비스 재기동까지 이 목표 동안 묻지 않고 통과시킵니다.\n돈이 직접 걸립니다. 계속할까요?")) {
      return;
    }
    try {
      const saved = await api.setGoalApprovalPolicy(selectedId, next);
      setPolicy({ ...next, used: saved.used ?? 0 });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "승인 설정을 저장하지 못했습니다");
    }
  }, [selectedId, policy]);

  const commitCount = useCallback(async () => {
    const n = Math.min(5000, Math.max(1, Number(countDraft) || 1));
    setCountDraft(String(n));
    if (n !== policy?.max_executions) await savePolicy({ max_executions: n });
  }, [countDraft, policy, savePolicy]);

  // 주도 바꾸기. 목표에 적힌 주도가 정본이라, 이걸 바꾸면 화면·지시·보고
  // 경로가 모두 따라온다.
  const makeLead = useCallback(async (o: BoardOwner) => {
    if (!selectedId) return;
    if (!window.confirm(`${o.title} 을(를) 이 목표의 주도로 세웁니다.\n기존 주도는 담당으로 내려갑니다.`)) return;
    setOwnerBusy(o.session_id);
    try {
      await api.setGoalLead(selectedId, o.session_id);
      await reloadBoard(selectedId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "주도 변경에 실패했습니다");
    } finally {
      setOwnerBusy(null);
    }
  }, [selectedId, reloadBoard]);

  const ownerAction = useCallback(async (
    kind: "pause" | "resume" | "restart" | "stop", o: BoardOwner,
  ) => {
    if (!selectedId) return;
    if (kind === "pause") {
      // 이유 없이 멈춘 카드는 사흘 뒤에 왜 멈췄는지 아무도 모른다.
      const reason = window.prompt(`${o.title} 을(를) 멈춥니다.\n왜 멈추는지 적어 주십시오.`)?.trim();
      if (!reason) return;
      setOwnerBusy(o.session_id);
      try { await api.pauseOwner(selectedId, o.session_id, reason); } finally { setOwnerBusy(null); }
    } else if (kind === "resume") {
      setOwnerBusy(o.session_id);
      try { await api.resumeOwner(selectedId, o.session_id); } finally { setOwnerBusy(null); }
    } else if (kind === "restart") {
      if (!window.confirm(`${o.title} 에게 처음부터 다시 지시합니다.\n지금까지의 대화는 남지만 발송 기록은 지워집니다.`)) return;
      setOwnerBusy(o.session_id);
      try { await api.restartOwner(selectedId, o.session_id); } finally { setOwnerBusy(null); }
    } else {
      if (!window.confirm(`${o.title} 의 진행 중인 응답을 지금 중단합니다.\n지금까지 생성된 내용은 남습니다.`)) return;
      setOwnerBusy(o.session_id);
      try { await api.stopOwnerStream(o.session_id); } finally { setOwnerBusy(null); }
    }
    await reloadBoard(selectedId);
  }, [selectedId, reloadBoard]);
  useEffect(() => {
    if (!selectedId) { setBoard(null); return; }
    let alive = true;
    const load = () => {
      api.getGoalBoard(selectedId)
        .then((b) => { if (alive) setBoard(b); })
        .catch(() => { if (alive) setBoard(null); });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [selectedId]);

  const openAdd = useCallback(async (lead: boolean) => {
    if (!selectedId) return;
    setAsLead(lead); setPick(null); setRoleKey(""); setLinkDraft(""); setAddErr(""); setAddOpen(true);
    try { setCandidates((await api.getGoalCandidates(selectedId)).candidates || []); }
    catch { setCandidates([]); }
  }, [selectedId]);

  const submitAdd = useCallback(async () => {
    const link = linkDraft.trim();
    if (!selectedId || (!pick && !link)) return;
    setAddErr("");
    setOwnerBusy(pick?.session_id || "link");
    try {
      const r = await api.addGoalOwner(selectedId, {
        ...(pick ? { session_id: pick.session_id } : { session_ref: link }),
        role_key: roleKey.trim() || undefined,
        as_lead: asLead,
      });
      if (r?.warning) window.alert(r.warning);
      setAddOpen(false);
      await reloadBoard(selectedId);
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "붙이지 못했습니다");
    } finally { setOwnerBusy(null); }
  }, [selectedId, pick, linkDraft, roleKey, asLead, reloadBoard]);

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

          <section style={{ minHeight: 880, borderRadius: 14, background: "var(--bg-card)", border: "1px solid var(--border)", overflow: "hidden" }}>
            {!detail ? <div style={{ padding: 28, color: "var(--text-secondary)" }}>왼쪽에서 목표를 선택하십시오.</div> : <>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong style={{ color: "var(--text-primary)" }}>{detail.title}</strong><span style={{ color: statusColor[detail.status] || "#64748b", fontWeight: 800 }}>{detail.status}</span></div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>마일스톤 {detail.milestones_completed}/{detail.milestones_total} · 자동 진행은 각 완료기준과 연결 작업 상태가 모두 충족될 때만 실행됩니다.</div>
              </div>
              {/* 승인 설정 — 이 목표 동안 미리 허락해 둘 범위.
                  담당 목록 안에 두었더니 스크롤 아래로 묻혔다(2026-09-15 대표님
                  지적 "안 나온다"). 목표 제목 바로 아래로 올리고, 담당이 없는
                  목표에서도 보이게 한다. */}
              <div style={{ margin: "12px 18px 10px", padding: "10px 12px", borderRadius: 9,
                              border: `1px solid ${policy?.auto_approve_critical ? "#dc2626" : policy?.auto_approve_high ? "#d97706" : "var(--border)"}`,
                              background: "var(--bg-primary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 12.5, color: "var(--text-primary)" }}>승인 설정</strong>
                    <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                      {policy && (policy.auto_approve_high || policy.auto_approve_critical)
                        ? `사용 ${policy.used}/${policy.max_executions}회 · 목표가 끝나면 함께 끝납니다`
                        : "지금은 변경마다 대표님께 묻습니다"}
                    </span>
                  </div>
                  <label style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 8, fontSize: 11.5, color: "var(--text-primary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!policy?.auto_approve_high}
                           onChange={(e) => void savePolicy({ auto_approve_high: e.target.checked })} />
                    실매매 <b>코드 수정</b>을 이 목표 달성까지 미리 승인
                  </label>
                  <label style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 5, fontSize: 11.5, color: "#dc2626", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!policy?.auto_approve_critical}
                           onChange={(e) => void savePolicy({ auto_approve_critical: e.target.checked })} />
                    <b>주문·자금·서비스 재기동</b>까지 미리 승인 (돈이 직접 걸립니다)
                  </label>
                  <div style={{ marginTop: 7, fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    허용 횟수
                    {/* 글자마다 저장하면 "200" 을 칠 때 2 → 20 → 200 으로
                        세 번 저장된다. 다 치고 빠져나갈 때(또는 Enter) 저장한다. */}
                    <input type="number" min={1} max={5000}
                           value={countDraft}
                           onChange={(e) => setCountDraft(e.target.value)}
                           onBlur={() => void commitCount()}
                           onKeyDown={(e) => { if (e.key === "Enter") void commitCount(); }}
                           style={{ width: 78, padding: "3px 6px", fontSize: 11.5, borderRadius: 6,
                                    border: "1px solid var(--border)", background: "var(--bg-card)",
                                    color: "var(--text-primary)" }} />
                    회 — 넘으면 다시 묻습니다
                  </div>
                </div>

              {board && (
                <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)" }} aria-label="목표 설계 문서">
                  {board.documents && board.documents.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {board.documents.map((d) => (
                        <a key={d.doc_path} href={buildGoalDocHref(d.doc_path) || undefined}
                           target="_blank" rel="noopener noreferrer"
                           title={d.doc_path}
                           style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", textDecoration: "none" }}>
                          <span style={{ fontWeight: 700 }}>{docLabel[d.kind] || "🔗 문서"}</span>
                          <span style={{ marginLeft: 6, color: "var(--text-secondary)" }}>
                            {d.title || d.doc_path.split("/").pop()}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {board.missing_design && board.missing_design.length > 0 && (
                    <div style={{ marginTop: board.documents?.length ? 7 : 0, fontSize: 11.5, color: "#d97706" }}>
                      ⚠ {board.missing_design.map((k) => docMissingLabel[k] || k).join("와 ")} 없음 — 먼저 쓰십시오
                    </div>
                  )}
                </div>
              )}

              {/* 담당이 0명이면 이 칸 전체가 사라져서 "+ 주도 지정" 도 같이
                  사라졌다. 주도를 세우려면 담당이 먼저 있어야 하는 역설
                  (2026-09-17 실측: 활성 목표 11개 중 7개가 담당 0명). 항상 낸다. */}
              {board && (
                <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }} aria-label="담당별 현재 상태">
                  {/* 주도는 위로 뺀다. 나란히 두면 동급으로 읽히는데,
                      주도는 목표 전체를 지고 담당의 신고를 판정한다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>주도</strong>
                    {board.halted && <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", padding: "3px 9px", borderRadius: 999, border: "1px solid #dc2626" }}>전체 정지 중</span>}
                  </div>
                  {!board.has_lead && (
                    <div style={{ padding: "11px 13px", marginBottom: 12, borderRadius: 9, border: "1px solid #d97706", background: "rgba(217,119,6,.07)" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#d97706" }}>⚠ 주도 미지정 — 취합하고 판정할 사람이 없습니다</div>
                      <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--text-secondary)" }}>담당이 신고해도 완료 판정이 되지 않습니다.</div>
                      <button type="button" onClick={() => void openAdd(true)}
                        style={{ marginTop: 8, minHeight: 30, padding: "0 11px", fontSize: 11.5, borderRadius: 7, border: "1px solid #d97706", background: "var(--bg-card)", color: "#d97706", fontWeight: 700, cursor: "pointer" }}>
                        + 주도 지정
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 8px" }}>
                    <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>담당 {board.owners.filter((o) => !o.is_lead).length}명</strong>
                    <button type="button" onClick={() => void openAdd(false)}
                      style={{ minHeight: 30, padding: "0 11px", fontSize: 11.5, borderRadius: 7, border: "1px solid var(--accent)", background: "var(--bg-card)", color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>
                      + 담당 추가
                    </button>
                  </div>
                  {board.owners.length === 0 && (
                    <div style={{ padding: "12px 13px", borderRadius: 9, border: "1px dashed var(--border)", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      붙어 있는 채팅창이 없습니다. 위 <b>+ 주도 지정</b> 에서 담당 채팅창 주소를
                      그대로 붙여넣으시면 그 창이 이 목표의 주도가 됩니다.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))", gap: 8 }}>
                    {board.owners.map((o) => {
                      const c = stateColor[o.state] || "#64748b";
                      return (
                        <a key={o.session_id} href={`/chat#${o.session_id}`}
                           style={{ display: "block", padding: o.is_lead ? "11px 13px" : "9px 11px", borderRadius: 9,
                                    border: o.is_lead ? "2px solid var(--accent)" : "1px solid var(--border)",
                                    borderLeft: `3px solid ${c}`, background: "var(--bg-primary)", textDecoration: "none",
                                    gridColumn: o.is_lead ? "1 / -1" : undefined, order: o.is_lead ? -1 : 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                            <span style={{ fontSize: o.is_lead ? 13.5 : 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                              {o.is_lead ? "👑 " : ""}{o.title}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: c, whiteSpace: "nowrap" }}>{o.state}</span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-secondary)" }}>
                            {o.milestone ? o.milestone : "맡은 마일스톤 없음"}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--text-secondary)" }}>
                            {sinceText(o.last_at)} · 도구 {o.tool_calls}회
                            {o.dispatch_count > 1 ? ` · 재알림 ${o.dispatch_count}회` : ""}
                          </div>
                          {o.note && <div style={{ marginTop: 4, fontSize: 10.5, color: "#dc2626" }}>{o.note}</div>}
                          {o.paused && o.paused_reason && (
                            <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-secondary)" }}>
                              대표님이 멈춤 — {o.paused_reason}
                            </div>
                          )}
                          {(o.open_notes || 0) > 0 && (
                            <div style={{ marginTop: 4, fontSize: 10.5, color: "#d97706" }}>
                              ✏ 의견·수정 요청 {o.open_notes}건 — 응답 대기
                            </div>
                          )}
                          <div style={{ marginTop: 7, display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {!o.is_lead && (
                              <button type="button" disabled={ownerBusy === o.session_id}
                                onClick={(e) => { e.preventDefault(); void makeLead(o); }}
                                style={{ minHeight: 28, padding: "0 9px", fontSize: 11, borderRadius: 6,
                                         border: "1px solid var(--accent)", background: "transparent",
                                         color: "var(--accent)",
                                         cursor: ownerBusy === o.session_id ? "wait" : "pointer" }}>
                                👑 주도로
                              </button>
                            )}
                            {(["pause", "resume", "restart", "stop"] as const)
                              .filter((k) => (k === "resume" ? o.paused : k === "pause" ? !o.paused : true))
                              .map((k) => (
                                <button key={k} type="button" disabled={ownerBusy === o.session_id}
                                  onClick={(e) => { e.preventDefault(); void ownerAction(k, o); }}
                                  style={{ minHeight: 28, padding: "0 9px", fontSize: 11, borderRadius: 6,
                                           border: "1px solid var(--border)", background: "var(--bg-card)",
                                           color: k === "stop" ? "#dc2626" : "var(--text-primary)",
                                           cursor: ownerBusy === o.session_id ? "wait" : "pointer" }}>
                                  {{ pause: "⏸ 멈춤", resume: "▶ 계속하기", restart: "↻ 재시작", stop: "■ 지금 중단" }[k]}
                                </button>
                              ))}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 트리는 화면 높이를 따라간다. 고정 높이면 노드가 늘수록
                  fitView 가 계속 축소해 카드 글씨를 읽을 수 없다
                  (2026-09-15 대표님 지적). 58vh 로도 "너무 작게 나온다" 는
                  말씀이 다시 나와(2026-09-17) 최소 640, 화면의 82%까지 쓴다. */}
              <div style={{ height: "clamp(640px, 82vh, 1280px)" }} aria-label="목표 실행 상태 그래프">
                <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView
                  fitViewOptions={{ padding: 0.12, minZoom: 0.55, maxZoom: 1.1 }}
                  minZoom={0.4} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} elementsSelectable>
                  <Background gap={22} size={1} /><Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </>}
          </section>
        </div>
      </main>
      {addOpen && (
        <div role="dialog" aria-modal="true" onClick={() => setAddOpen(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{ width: "min(560px,100%)", maxHeight: "86vh", overflow: "auto", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              {asLead ? "주도 지정" : "담당 추가"}
            </h2>
            <p style={{ marginTop: 5, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              이미 있는 채팅창을 이 목표에 붙입니다. 새 채팅창은 직접 만드십시오.
              같은 워크스페이스의 창만 고를 수 있습니다.
            </p>

            <div style={{ marginTop: 13, maxHeight: 260, overflow: "auto", border: "1px solid var(--border)", borderRadius: 9 }}>
              {candidates.length === 0 && (
                <div style={{ padding: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  고를 수 있는 채팅창이 목록에 없습니다. 아래에 <b>채팅창 주소</b>를
                  그대로 붙여넣으시면 그 창을 붙입니다.
                </div>
              )}
              {candidates.map((cd) => (
                <button key={cd.session_id} type="button" onClick={() => { setPick(cd); setRoleKey(cd.role_key || ""); setLinkDraft(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: 0,
                           borderBottom: "1px solid var(--border)", cursor: "pointer",
                           background: pick?.session_id === cd.session_id ? "rgba(37,99,235,.10)" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>{cd.title}</span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>메시지 {cd.message_count}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-secondary)" }}>
                    역할 {cd.role_key || "없음"}{cd.role_key && !cd.has_prompt ? " · 프롬프트 없음" : ""}
                  </div>
                </button>
              ))}
            </div>

            {/* 2026-09-17 대표님 지시 — "주도가 등록 안 되어 있으면 내가 직접
                세션링크를 등록할 수 있게 해줘". 주소창을 그대로 받는다. */}
            <label style={{ display: "block", marginTop: 13, fontSize: 12, color: "var(--text-secondary)" }}>
              세션 링크 직접 입력 <span style={{ opacity: .75 }}>(목록에 없을 때 — 채팅창 주소를 그대로)</span>
              <input value={linkDraft}
                onChange={(e) => { setLinkDraft(e.target.value); if (e.target.value.trim()) setPick(null); }}
                placeholder="https://aads.newtalk.kr/chat#0a1b2c3d-...."
                style={{ display: "block", width: "100%", marginTop: 5, minHeight: 38, padding: "0 11px", borderRadius: 8, border: `1px solid ${linkDraft.trim() ? "var(--accent)" : "var(--border)"}`, background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 12.5 }} />
            </label>

            <label style={{ display: "block", marginTop: 13, fontSize: 12, color: "var(--text-secondary)" }}>
              역할 키 <span style={{ opacity: .75 }}>(비우면 그 창의 기존 역할을 씁니다)</span>
              <input value={roleKey} onChange={(e) => setRoleKey(e.target.value)} placeholder="예: RiskOwner"
                style={{ display: "block", width: "100%", marginTop: 5, minHeight: 38, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }} />
            </label>

            <label style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 11, fontSize: 12.5, color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} />
              이 담당을 <strong>주도</strong>로 지정
            </label>

            {addErr && (
              <div role="alert" style={{ marginTop: 11, padding: "8px 11px", borderRadius: 8, border: "1px solid #dc2626", background: "rgba(239,68,68,.07)", color: "#dc2626", fontSize: 11.5, lineHeight: 1.5 }}>
                {addErr}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 17 }}>
              <button type="button" onClick={() => setAddOpen(false)}
                style={{ minHeight: 38, padding: "0 15px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", cursor: "pointer" }}>취소</button>
              <button type="button" disabled={(!pick && !linkDraft.trim()) || ownerBusy !== null} onClick={() => void submitAdd()}
                style={{ minHeight: 38, padding: "0 17px", borderRadius: 8, border: 0, background: (pick || linkDraft.trim()) ? "var(--accent)" : "var(--border)", color: "white", fontWeight: 700, cursor: (pick || linkDraft.trim()) ? "pointer" : "not-allowed" }}>
                붙이기
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`@media (max-width: 850px){.goal-layout{grid-template-columns:1fr!important}.goal-layout>section:last-child{min-height:660px!important}}`}</style>
    </div>
  );
}
