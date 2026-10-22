"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { api, type GoalApprovalPolicy } from "@/lib/api";

export const supportsGoalApproval = (project?: string) => Boolean(project?.trim());

const FINANCIAL_PROJECTS = ["KIS", "GO100"];
const NEUTRAL_HIGH_LABEL = "다음 단계 자동 진행";
const NEUTRAL_CRITICAL_LABEL = "고위험 단계까지 자동 진행";
const GENERAL_CRITICAL_CONFIRM = "고위험 단계 제안까지 이 목표 동안 묻지 않고 통과시킵니다. 계속할까요?";

// 서버 profile 이 정본. 구서버(profile 없음)만 프로젝트명으로 실매매 여부를 추정한다.
export const isTradingApproval = (policy: { profile?: string } | null | undefined, project?: string) =>
  policy?.profile ? policy.profile === "trading" : FINANCIAL_PROJECTS.includes(project?.toUpperCase() || "");

export const approvalSummary = (policy: Policy | null | undefined, supported: boolean) =>
  policy?.auto_approve_critical ? (policy.options?.auto_approve_critical?.label ?? NEUTRAL_CRITICAL_LABEL)
    : policy?.auto_approve_high ? (policy.options?.auto_approve_high?.label ?? NEUTRAL_HIGH_LABEL)
    : (!supported ? "목표 프로젝트 확인 대기" : "목표 정책 자동승인 꺼짐");

type PolicyValues = { auto_approve_high: boolean; auto_approve_critical: boolean; max_executions: number };
type Policy = GoalApprovalPolicy;
export function useGoalApprovalPolicy(goalId: string | null, project?: string) {
  const [state, setState] = useState<{ id: string; epoch: number; policy: Policy } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // 조회는 목표 ID 만 있으면 된다. project 는 board 응답이 와야 알 수 있어서, 여기에
  // 묶으면 board → 승인정책이 직렬이 된다. project 는 편집 가능 여부·확인 문구에만 쓴다.
  const current = useRef(`${goalId}`);
  const generation = useRef(0);
  const identity = `${goalId}`;
  const lock = useRef(false);
  const [reload, setReload] = useState(0);
  const supported = supportsGoalApproval(project);
  const policy = state?.id === identity ? state.policy : null;
  useLayoutEffect(() => {
    current.current = identity;
    const epoch = ++generation.current;
    setState(null); setError(""); setSaving(false); lock.current = false;
    if (!goalId) return;
    const ctrl = new AbortController();
    api.getGoalApprovalPolicy(goalId, ctrl.signal).then(p => {
      if (generation.current === epoch) setState({ id: identity, epoch, policy: p });
    }).catch(e => {
      if (generation.current === epoch) setError(e instanceof Error ? e.message : "승인 설정 조회 실패");
    });
    return () => { generation.current = epoch + 1; ctrl.abort(); };
  }, [goalId, identity, reload]);
  const renderEpoch = state?.epoch;
  const savePolicy = useCallback(async (patch: Partial<PolicyValues>) => {
    if (!goalId || !policy || renderEpoch !== generation.current || lock.current || current.current !== identity) return;
    const next = {
      auto_approve_high: policy.auto_approve_high,
      auto_approve_critical: policy.auto_approve_critical,
      // Unconfigured GET policies report zero; first activation needs a positive limit.
      max_executions: supported ? policy.max_executions || 200 : policy.max_executions,
      ...patch,
    };
    if (patch.auto_approve_critical === true && !policy.auto_approve_critical &&
      !window.confirm(isTradingApproval(policy, project)
        ? `${project} 목표에 연결된 세션의 critical 다음 단계 제안을 미리 승인합니다.\n실행 게이트는 대상 프로젝트·위험도·횟수를 별도로 검사하며, 모든 도구 실행을 허용하지 않습니다.\n실매매 서비스·주문·자금 경로에도 적용될 수 있어 실제 금전 손실 위험이 있습니다. 계속할까요?`
        : GENERAL_CRITICAL_CONFIRM)) return;
    const epoch = generation.current;
    lock.current = true; setSaving(true); setError("");
    try {
      const saved = await api.setGoalApprovalPolicy(goalId, next);
      if (current.current === identity && generation.current === epoch)
        setState({ id: identity, epoch, policy: { ...policy, ...next, used: saved.used ?? ((next.auto_approve_high || next.auto_approve_critical) ? 0 : policy.used) } });
    } catch (e) {
      if (current.current === identity && generation.current === epoch)
        setError(e instanceof Error ? e.message : "승인 설정 저장 실패. 다시 시도하세요.");
    } finally {
      if (current.current === identity && generation.current === epoch) { lock.current = false; setSaving(false); }
    }
  }, [goalId, policy, project, renderEpoch, identity, supported]);
  return { policy, savePolicy, saving, supported, policyError: error, retryPolicy: () => setReload(n => n + 1) };
}

export function GoalApprovalControls({ policy, savePolicy, saving, policyError, retryPolicy, project, sessionProject }: ReturnType<typeof useGoalApprovalPolicy> & { project?: string; sessionProject?: string }) {
  const supported = supportsGoalApproval(project);
  const high = policy?.options?.auto_approve_high;
  const critical = policy?.options?.auto_approve_critical;
  const all = !!policy?.auto_approve_high && !!policy?.auto_approve_critical;
  const partial = !!policy && policy.auto_approve_high !== policy.auto_approve_critical;
  return <div style={{ color: "var(--text-primary)" }}>
    {project && sessionProject && project.toUpperCase() !== sessionProject.toUpperCase() && <p role="alert">현재 대화({sessionProject})와 목표 프로젝트({project})가 다릅니다. 실행 게이트는 대상 프로젝트 일치를 검사하지만, 다음 단계 제안은 목표·세션 연결을 기준으로 적용됩니다.</p>}
    <p>{!project ? "목표 프로젝트 조회 대기 중 — 승인 설정을 변경할 수 없습니다." : "연결된 세션의 다음 단계 제안에 위험도별로 적용됩니다. 실행 게이트는 대상 프로젝트·위험도·남은 횟수를 별도로 검사합니다. 모든 도구 실행을 허용하는 설정은 아닙니다."}</p>
    <p>다음 단계 제안은 활성 연결과 진행 중 목표(draft/active/blocked), 남은 횟수를 확인하며 제안 자체는 횟수를 차감하지 않습니다. critical 이외의 제안은 첫 번째 설정을 사용합니다. DB 쓰기처럼 대상 프로젝트를 확정하지 않는 실행은 이 정책으로 자동 통과하지 않습니다.</p>
    {isTradingApproval(policy, project) && <p role="alert">실매매 경로 및 서비스·주문·자금 변경에도 적용될 수 있습니다. 실제 금전 손실 위험이 있습니다.</p>}
    <fieldset disabled={!policy || saving} style={{ border: 0, padding: 0, marginTop: 6 }}>
    <legend>{project || "현재 목표"} 승인 범위</legend>
    <label><input type="checkbox" checked={all} disabled={!supported && !all && !partial} ref={el => { if (el) el.indeterminate = partial; }}
      onChange={e => void savePolicy({ auto_approve_high: supported && e.target.checked, auto_approve_critical: supported && e.target.checked })} /> 전체 선택 / 전체 해제</label>
    <label style={{ display: "block" }}><input type="checkbox" disabled={!supported && !policy?.auto_approve_high} checked={!!policy?.auto_approve_high}
      onChange={e => void savePolicy({ auto_approve_high: e.target.checked })} /> {high?.label ?? NEUTRAL_HIGH_LABEL}
      {high?.description && <span style={{ display: "block" }}>{high.description}</span>}</label>
    <label style={{ display: "block", color: "#dc2626" }}><input type="checkbox" disabled={!supported && !policy?.auto_approve_critical} checked={!!policy?.auto_approve_critical}
      onChange={e => void savePolicy({ auto_approve_critical: e.target.checked })} /> {critical?.label ?? NEUTRAL_CRITICAL_LABEL}
      {critical?.description && <span style={{ display: "block" }}>{critical.description}</span>}</label>
    {saving && <p role="status">저장 중…</p>}
  </fieldset>
    {policyError && <p role="alert">{policyError} <button type="button" disabled={saving} onClick={retryPolicy}>설정 다시 조회</button></p>}
  </div>;
}
