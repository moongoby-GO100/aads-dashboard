"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { GoalApprovalGrant, GoalGovernance, GoalWorkItem, GoalWorkTree, WorkItemApprovalPreview } from "@/lib/api";
import {
  LOADING_SECTION, IDLE_SECTION, createLatestController, createLazyLoader, loadSectionsParallel,
  type LazyState, type ParallelSection, type SectionState,
} from "@/lib/goalPanelLoad";
import { itemActivityText, itemProgressText, itemTaskCounts, ownerDisplay, percentOf, workStatusLabel } from "@/lib/goalWorkStatus";

export type PreviewState = LazyState<WorkItemApprovalPreview>;
export interface PreviewLoader {
  states: Record<string, PreviewState>;
  request: (itemId: string) => void;
}
export const NO_PREVIEWS: PreviewLoader = { states: {}, request: () => {} };

const TYPE_LABEL = { epic: "Epic", story: "Story", task: "Task" } as const;
export const STATUS_COLOR: Record<string, string> = {
  completed: "#16a34a", in_review: "#7c3aed", changes_requested: "#d97706",
  in_progress: "#2563eb", ready: "#0284c7", blocked: "#dc2626",
  cancelled: "#64748b", draft: "#64748b",
};

export function ItemBody({ item, previews, actorSessionId, onChanged, depth = 0, tree }: {
  item: GoalWorkItem;
  previews: PreviewLoader;
  actorSessionId?: string | null;
  onChanged: () => Promise<void>;
  depth?: number;
  tree?: {
    expanded: boolean; childCount: number; onToggle: () => void;
    assigneeLabel?: string; warning?: string; dependencyLabels?: string[]; children?: ReactNode;
  };
}) {
  const color = STATUS_COLOR[item.status] || "#64748b";
  const taskCounts = item.type !== "task" ? itemTaskCounts(item) : null;
  const owner = tree ? ownerDisplay(item.effective_owner, tree.assigneeLabel) : null;
  const evidence = item.evidence;
  const previewState = previews.states[item.id];
  const approval = previewState?.status === "ok" ? previewState.data.approval : undefined;
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = item.pending_approval_count > 0 && !!actorSessionId;
  const requestPreview = previews.request;
  useEffect(() => {
    if (previewOpen && canPreview && !previewState) requestPreview(item.id);
  }, [previewOpen, canPreview, previewState, requestPreview, item.id]);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const retryDelivery = useCallback(async () => {
    if (!actorSessionId || !item.recovery?.can_retry || retrying) return;
    const reason = window.prompt("실패한 전달을 다시 시도하는 이유를 적어 주십시오.")?.trim();
    if (!reason) return;
    setRetrying(true); setRetryError("");
    try {
      await api.retryWorkItemDelivery(item.id, reason, actorSessionId);
      await onChanged();
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : "재시도 요청에 실패했습니다.");
    } finally { setRetrying(false); }
  }, [actorSessionId, item.id, item.recovery?.can_retry, onChanged, retrying]);
  return (
    <div style={{ marginLeft: depth ? 18 : 0, marginTop: 8 }}>
      <div style={{ border: "1px solid var(--border)", borderLeft: `4px solid ${color}`, borderRadius: 10,
                    padding: "10px 12px", background: "var(--bg-primary)" }}>
        {tree ? (
          <button type="button" onClick={tree.onToggle} aria-expanded={tree.expanded}
            aria-label={`${TYPE_LABEL[item.type]} ${item.title} ${tree.expanded ? "접기" : "펼치기"}`}
            style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: "100%", minHeight: 36,
                     padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
            <span aria-hidden style={{ width: 12, color: "var(--text-secondary)", fontSize: 10 }}>{tree.expanded ? "▼" : "▶"}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase" }}>{TYPE_LABEL[item.type]}</span>
            <strong style={{ flex: 1, minWidth: 120, color: "var(--text-primary)", fontSize: 12.5, overflowWrap: "anywhere" }}>{item.title}</strong>
            <span style={{ color, fontSize: 10.5, fontWeight: 800 }}>{workStatusLabel(item.status)}</span>
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase" }}>{TYPE_LABEL[item.type]}</span>
            <strong style={{ flex: 1, minWidth: 140, color: "var(--text-primary)", fontSize: 12.5 }}>{item.title}</strong>
            <span style={{ color, fontSize: 10.5, fontWeight: 800 }}>{workStatusLabel(item.status)}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, color: "var(--text-secondary)", fontSize: 10.5 }}>
          {!tree && item.milestone_title && <span>마일스톤 {item.milestone_sequence ?? "—"} · {item.milestone_title}</span>}
          {tree && <span>우선순위 {item.priority || "—"}</span>}
          {owner && <span style={owner.warn ? { color: "#d97706", fontWeight: 800 } : undefined}>{owner.text}</span>}
          <span>진행 {Number(item.progress || 0).toFixed(0)}%</span>
          <span>버전 {item.version}</span>
          {tree && tree.childCount > 0 && <span>하위 {tree.childCount}</span>}
          {evidence && <span>근거 {evidence.verified_count}/{evidence.count}</span>}
          {item.pending_approval_count > 0 && <span style={{ color: "#d97706", fontWeight: 800 }}>승인 대기 {item.pending_approval_count}</span>}
          {(item.dependencies?.length || 0) > 0 && <span>의존 {item.dependencies?.length}</span>}
          {item.status === "blocked" && <span style={{ color: "#dc2626", fontWeight: 800 }}>차단됨</span>}
        </div>
        {taskCounts && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6, color: "var(--text-secondary)", fontSize: 10.5 }}>
          <span>{itemProgressText(taskCounts)}</span>
          {taskCounts.total > 0 && <span aria-hidden style={{ width: 64, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${percentOf(taskCounts.completed, taskCounts.total)}%`, background: STATUS_COLOR.completed }} />
          </span>}
          <span style={taskCounts.blocked > 0 ? { color: "#dc2626", fontWeight: 800 } : undefined}>{itemActivityText(taskCounts)}</span>
        </div>}
        {tree?.warning && <div role="alert" style={{ marginTop: 7, color: "#d97706", fontSize: 11 }}>⚠ {tree.warning}</div>}
        {item.last_error && <div role="alert" style={{ marginTop: 7, color: "#dc2626", fontSize: 11 }}>마지막 오류 · {item.last_error}</div>}
        {tree?.expanded && tree.dependencyLabels?.length ? <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 10.5, overflowWrap: "anywhere" }}>
          의존 · {tree.dependencyLabels.join(" / ")}
        </div> : null}
        {(!tree || tree.expanded) && evidence?.items?.length ? <details style={{ marginTop: 7 }}>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--text-secondary)", fontSize: 10.5, fontWeight: 800 }}>
            최근 검증 근거 {evidence.items.length}건 보기
          </summary>
          <div style={{ display: "grid", gap: 5 }}>
            {evidence.items.map((entry) => <a key={entry.id} href={entry.uri} target="_blank" rel="noreferrer"
              style={{ color: entry.verified ? "#16a34a" : "#d97706", fontSize: 10.5, overflowWrap: "anywhere" }}>
              {entry.verified ? "검증됨" : "미검증"} · {entry.criterion_key || entry.evidence_type} · {entry.uri}
            </a>)}
          </div>
        </details> : null}
        {canPreview && <details style={{ marginTop: 8 }} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
          <summary style={{ minHeight: 36, display: "flex", alignItems: "center", cursor: "pointer", color: "#d97706", fontSize: 11, fontWeight: 800 }}>
            승인 검토 내용 보기 · 대기 {item.pending_approval_count}건
          </summary>
          {previewState?.status === "loading" && <div role="status" style={{ padding: "6px 0", color: "var(--text-secondary)", fontSize: 10.5 }}>승인 검토 내용을 불러오는 중…</div>}
          {previewState?.status === "error" && <div role="alert" style={{ padding: "6px 0", color: "#dc2626", fontSize: 10.5 }}>
            승인 검토 내용을 불러오지 못했습니다 · {previewState.error}
            <button type="button" onClick={() => requestPreview(item.id)}
              style={{ marginLeft: 8, minHeight: 32, padding: "0 10px", borderRadius: 7, border: 0, background: "#dc2626", color: "white", fontWeight: 800, fontSize: 10.5, cursor: "pointer" }}>재시도</button>
          </div>}
          {previewState?.status === "ok" && !approval && <div style={{ padding: "6px 0", color: "var(--text-secondary)", fontSize: 10.5 }}>표시할 승인 검토 내용이 없습니다.</div>}
          {approval && <div style={{ padding: "8px 9px", borderRadius: 8, border: "1px solid #d97706", background: "rgba(217,119,6,.07)" }}>
          <div style={{ color: "#d97706", fontSize: 11, fontWeight: 800 }}>승인 검토 · 위험 {approval.risk_tier || "미분류"}</div>
          <div style={{ marginTop: 3, color: "var(--text-secondary)", fontSize: 10.5, lineHeight: 1.5 }}>
            상태 {approval.state || "pending"} · 기준 {approval.base_version ?? "—"} → 목표 {approval.target_version ?? "—"}<br />
            환경 {approval.environment || "미지정"} · 변경 해시 {approval.patch_hash || "미제공"}<br />
            사유 {approval.rationale || "미기재"}<br />
            예상 영향 {approval.expected_effect || "미기재"}<br />
            롤백 {approval.rollback_plan || "미기재"}
          </div>
          {approval.patch?.length ? <pre style={{ margin: "7px 0 0", padding: 7, borderRadius: 6, overflowX: "auto", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 9.5 }}>
            {JSON.stringify(approval.patch, null, 2)}
          </pre> : null}
        </div>}
        </details>}
        {item.recovery && <div style={{ marginTop: 8, padding: "8px 9px", borderRadius: 8, border: "1px solid #dc2626", background: "rgba(220,38,38,.06)" }}>
          <div style={{ color: "#dc2626", fontSize: 11, fontWeight: 800 }}>전달 복구 필요 · {item.recovery.delivery_state || item.recovery.change_set_state}</div>
          <div style={{ marginTop: 3, color: "var(--text-secondary)", fontSize: 10.5, lineHeight: 1.5 }}>
            시도 {item.recovery.attempts ?? 0}회 · {item.recovery.last_error || "오류 내용 없음"}
          </div>
          {item.recovery.can_retry && <button type="button" onClick={() => void retryDelivery()}
            disabled={!actorSessionId || retrying}
            title={!actorSessionId ? "담당 세션을 선택해야 재시도할 수 있습니다." : undefined}
            style={{ marginTop: 7, minHeight: 44, padding: "0 13px", borderRadius: 8, border: 0,
                     background: actorSessionId ? "#dc2626" : "#94a3b8", color: "white", fontWeight: 800,
                     cursor: actorSessionId && !retrying ? "pointer" : "not-allowed" }}>
            {retrying ? "재시도 요청 중" : "실패한 전달 재시도"}
          </button>}
          {retryError && <div role="alert" style={{ marginTop: 6, color: "#dc2626", fontSize: 10.5 }}>{retryError}</div>}
        </div>}
      </div>
      {tree ? (tree.expanded ? tree.children : null)
        : item.children?.map((child) => <ItemCard key={child.id} item={child} previews={previews}
            actorSessionId={actorSessionId} onChanged={onChanged} depth={depth + 1} />)}
    </div>
  );
}

function ItemCard(props: {
  item: GoalWorkItem;
  previews: PreviewLoader;
  actorSessionId?: string | null;
  onChanged: () => Promise<void>;
  depth?: number;
}) {
  return <ItemBody {...props} />;
}

export function GrantCard({ grant, actorSessionId, onChanged }: {
  grant: GoalApprovalGrant; actorSessionId?: string | null; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const revoke = useCallback(async () => {
    if (!actorSessionId || busy) return;
    const reason = window.prompt("이 자동승인 권한을 즉시 회수하는 이유를 적어 주십시오.")?.trim();
    if (!reason) return;
    setBusy(true);
    try {
      await api.revokeGoalApprovalGrant(grant.id, reason, actorSessionId);
      await onChanged();
    } finally { setBusy(false); }
  }, [actorSessionId, busy, grant.id, onChanged]);
  const active = grant.status === "active";
  return (
    <div style={{ padding: 11, border: `1px solid ${active ? "#2563eb" : "var(--border)"}`, borderRadius: 10, background: "var(--bg-primary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>{grant.max_risk_tier} · {grant.actions.join(", ")}</strong>
        <span style={{ color: active ? "#2563eb" : "#64748b", fontSize: 10.5, fontWeight: 800 }}>{grant.status}</span>
      </div>
      <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 10.5, lineHeight: 1.55 }}>
        환경 {grant.environments.join(", ")} · 사용 {grant.used_executions}/{grant.max_executions} · 남음 {grant.remaining_uses}<br />
        만료 {new Date(grant.expires_at).toLocaleString("ko-KR")} · 정책 {grant.policy_version?.slice(0, 8) || "미지정"}
      </div>
      {active && (
        <button type="button" disabled={!actorSessionId || busy} onClick={() => void revoke()}
          title={!actorSessionId ? "목표의 주도 세션을 먼저 지정해야 회수할 수 있습니다." : undefined}
          style={{ marginTop: 8, minHeight: 44, padding: "0 13px", borderRadius: 8, border: "1px solid #dc2626",
                   background: "transparent", color: "#dc2626", fontWeight: 800,
                   cursor: actorSessionId && !busy ? "pointer" : "not-allowed", opacity: actorSessionId ? 1 : .55 }}>
          {busy ? "회수 중" : "권한 회수"}
        </button>
      )}
    </div>
  );
}

type WorkKey = "tree" | "governance" | "grants";

// 식별자가 바뀌면 이전 목표의 값은 보이지 않는다(로딩으로 초기화).
function useScopedSection<T>(identity: string) {
  const [held, setHeld] = useState<{ identity: string; value: SectionState<T> }>({ identity, value: LOADING_SECTION });
  const view = held.identity === identity ? held.value : (LOADING_SECTION as SectionState<T>);
  const update = useCallback((next: (prev: SectionState<T>) => SectionState<T>) => {
    setHeld((prev) => ({ identity, value: next(prev.identity === identity ? prev.value : (LOADING_SECTION as SectionState<T>)) }));
  }, [identity]);
  return [view, update] as const;
}

export type WorkSectionStatus = { loading: boolean; error: string; retry: () => void };

export function useGoalWorkData(goalId: string, actorSessionId?: string | null) {
  const [selectedActor, setSelectedActor] = useState(actorSessionId || "");
  const [treeState, setTree] = useScopedSection<GoalWorkTree>(`tree:${goalId}`);
  const [governanceState, setGovernance] = useScopedSection<GoalGovernance>(`gov:${goalId}`);
  const [grantsState, setGrants] = useScopedSection<GoalApprovalGrant[]>(`grants:${goalId}:${selectedActor}`);
  const controllers = useRef({ tree: createLatestController(), governance: createLatestController(), grants: createLatestController() });
  const [previewVersion, bump] = useReducer((n: number) => n + 1, 0);

  const previewStore = useMemo(
    () => createLazyLoader<WorkItemApprovalPreview>(
      (itemId, signal) => api.getWorkItemApprovalPreview(itemId, selectedActor, signal), bump),
    [selectedActor],
  );
  useEffect(() => { previewStore.reset(); return () => previewStore.abort(); }, [previewStore, goalId]);
  const previewStates = useMemo(() => previewStore.snapshot(), [previewStore, previewVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const previews = useMemo<PreviewLoader>(
    () => ({ states: previewStates, request: selectedActor ? previewStore.request : NO_PREVIEWS.request }),
    [previewStates, previewStore, selectedActor],
  );

  const sectionFor = useCallback((key: WorkKey): ParallelSection<any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const signal = controllers.current[key].begin();
    if (key === "tree") return {
      task: (s) => api.getGoalWorkTree(goalId, s), signal,
      onOutcome: (o) => setTree((prev) => o.ok ? { data: o.value, error: "", loading: false }
        : { data: prev.data, error: o.error.includes("404") ? "업무 계층 기능이 아직 운영 슬롯에서 활성화되지 않았습니다." : o.error, loading: false }),
    };
    if (key === "governance") return {
      task: (s) => api.getGoalGovernance(goalId, s), signal,
      onOutcome: (o) => setGovernance((prev) => o.ok ? { data: o.value, error: "", loading: false }
        : { data: prev.data, error: o.error, loading: false }),
    };
    return {
      task: (s) => api.getGoalApprovalGrants(goalId, selectedActor, s), signal,
      onOutcome: (o) => setGrants((prev) => o.ok ? { data: o.value, error: "", loading: false }
        : { data: prev.data, error: o.error, loading: false }),
    };
  }, [goalId, selectedActor, setTree, setGovernance, setGrants]);

  const start = useCallback((keys: WorkKey[]) => {
    const active = keys.filter((key) => key !== "grants" || !!selectedActor);
    if (active.includes("tree")) setTree((prev) => ({ ...prev, error: "", loading: true }));
    if (active.includes("governance")) setGovernance((prev) => ({ ...prev, error: "", loading: true }));
    if (active.includes("grants")) setGrants((prev) => ({ ...prev, error: "", loading: true }));
    else if (keys.includes("grants")) setGrants(() => IDLE_SECTION as SectionState<GoalApprovalGrant[]>);
    // tree · governance · grants 를 같은 틱에 시작한다. 하나가 실패해도 나머지는 그대로 채워진다.
    return loadSectionsParallel(active.map(sectionFor));
  }, [selectedActor, sectionFor, setTree, setGovernance, setGrants]);

  useEffect(() => {
    void start(["tree", "governance"]);
    const c = controllers.current;
    return () => { c.tree.abort(); c.governance.abort(); };
  }, [goalId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void start(["grants"]);
    const c = controllers.current;
    return () => c.grants.abort();
  }, [goalId, selectedActor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedActor(actorSessionId || ""); }, [actorSessionId, goalId]);

  const load = useCallback(async () => {
    previewStore.reset();
    await start(["tree", "governance", "grants"]);
  }, [previewStore, start]);

  const grants = useMemo(() => grantsState.data ?? [], [grantsState.data]);
  const activeGrants = useMemo(() => grants.filter((grant) => grant.status === "active").length, [grants]);
  const status = (state: SectionState<unknown>, keys: WorkKey[]): WorkSectionStatus =>
    ({ loading: state.loading, error: state.error, retry: () => void start(keys) });

  return {
    tree: treeState.data, governance: governanceState.data, grants, previews, selectedActor, setSelectedActor,
    loading: treeState.loading || governanceState.loading || grantsState.loading,
    error: treeState.error, load, activeGrants,
    treeStatus: status(treeState, ["tree"]),
    governanceStatus: status(governanceState, ["governance"]),
    grantsStatus: status(grantsState, ["grants"]),
  };
}

export function SectionError({ label, status }: { label: string; status: WorkSectionStatus }) {
  if (!status.error) return null;
  return (
    <div role="alert" style={{ marginTop: 9, padding: 9, borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 11.5, lineHeight: 1.5 }}>
      {label}을(를) 표시하지 못했습니다 · {status.error}
      <div style={{ marginTop: 6 }}>
        <button type="button" onClick={status.retry} disabled={status.loading}
          style={{ minHeight: 36, padding: "0 12px", borderRadius: 8, border: 0, background: "#dc2626", color: "white", fontWeight: 800, fontSize: 11.5, cursor: status.loading ? "wait" : "pointer" }}>
          재시도
        </button>
      </div>
    </div>
  );
}

export function GrantsSection({ grants, governance, actorSessionId, selectedActor, setSelectedActor, onChanged, status }: {
  grants: GoalApprovalGrant[];
  governance: GoalGovernance | null;
  actorSessionId?: string | null;
  selectedActor: string;
  setSelectedActor: (value: string) => void;
  onChanged: () => Promise<void>;
  status?: WorkSectionStatus;
}) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--text-primary)", fontSize: 12, fontWeight: 800 }}>
        단계별 자동승인 권한 {status?.loading && !grants.length ? "불러오는 중" : `${grants.length}건`}
      </summary>
      {status && <SectionError label="자동승인 권한" status={status} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 8 }}>
        {!actorSessionId && governance?.assignments.length ? <label style={{ gridColumn: "1 / -1", color: "var(--text-secondary)", fontSize: 11 }}>
          회수 권한을 확인할 담당 세션
          <select value={selectedActor} onChange={(event) => setSelectedActor(event.target.value)}
            style={{ display: "block", width: "100%", minHeight: 44, marginTop: 4, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)", padding: "0 9px" }}>
            <option value="">세션을 선택하십시오</option>
            {governance.assignments.map((assignment) => <option key={assignment.id} value={assignment.session_id}>
              {assignment.role_key} · {assignment.session_title || assignment.session_id}
            </option>)}
          </select>
        </label> : null}
        {status?.error ? null : grants.length ? grants.map((grant) => <GrantCard key={grant.id} grant={grant} actorSessionId={selectedActor} onChanged={onChanged} />)
          : <div style={{ color: "var(--text-secondary)", fontSize: 11.5 }}>발급된 자동승인 권한이 없습니다. 자동승인 불가 작업은 기존 수동 승인으로 전환됩니다.</div>}
      </div>
    </details>
  );
}

export function GoalWorkHierarchy({ goalId, actorSessionId }: { goalId: string; actorSessionId?: string | null }) {
  const { tree, governance, grants, previews, selectedActor, setSelectedActor, loading, error, load, activeGrants, governanceStatus, grantsStatus } =
    useGoalWorkData(goalId, actorSessionId);

  return (
    <section aria-label="업무 계층과 자동승인 권한" style={{ margin: "12px 18px", padding: 13, borderRadius: 12,
      border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong style={{ color: "var(--text-primary)", fontSize: 13.5 }}>업무 계층 · Epic → Story → Task</strong>
          <div style={{ marginTop: 3, color: "var(--text-secondary)", fontSize: 10.5 }}>
            승인 대기 {tree?.pending_approval_count || 0} · 활성 자동승인 {activeGrants} · 정책 {governance?.policy?.mode || "미설정"}
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "transparent",
                   color: "var(--accent)", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "불러오는 중" : "다시 불러오기"}
        </button>
      </div>
      {error && <div role="alert" style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 11.5 }}>
        {error} 로그인 만료 시 로그인 후 이 목표 화면으로 자동 복귀합니다.
      </div>}
      {!error && tree && tree.items.length === 0 && <div style={{ marginTop: 10, padding: 12, border: "1px dashed var(--border)", borderRadius: 9, color: "var(--text-secondary)", fontSize: 11.5 }}>
        등록된 Epic이 없습니다. 업무 계층 API에서 Epic을 생성하면 Story와 Task가 이곳에 이어집니다.
      </div>}
      <SectionError label="거버넌스 정책" status={governanceStatus} />
      {!error && tree?.items.map((item) => <ItemCard key={item.id} item={item} previews={previews}
        actorSessionId={selectedActor} onChanged={load} />)}
      {!error && (
        <GrantsSection grants={grants} governance={governance} actorSessionId={actorSessionId}
          selectedActor={selectedActor} setSelectedActor={setSelectedActor} onChanged={load} status={grantsStatus} />
      )}
    </section>
  );
}
