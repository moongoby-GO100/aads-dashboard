// 정본 역할 배정 API 호출. 사용자 JWT 를 그대로 보낸다(서비스키·하드코딩 토큰 없음).
// src/lib/api.ts 는 건드리지 않고, 인증 헤더 헬퍼와 기존 읽기 API 만 import 해서 쓴다.
import { api, getAuthHeaders } from "@/lib/api";
import type { GoalGovernance, GoalWorkTree } from "@/lib/api";
import {
  friendlyError, parseErrorBody, type AssignRole, type ExecuteResult, type FriendlyError,
  type PreviewResult, type ProposalResult, type RollbackResult, type SessionLike,
} from "@/lib/canonicalAssignmentModel";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export class AssignmentApiError extends Error {
  status: number;
  code: string | null;
  serverMessage: string | null;
  friendly: FriendlyError;
  constructor(status: number, code: string | null, serverMessage: string | null) {
    const friendly = friendlyError(status, code, serverMessage);
    super(friendly.message);
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
    this.friendly = friendly;
  }
  /** 접힘 영역에 보여 줄 원문. */
  raw(): string {
    return JSON.stringify({ http: this.status, code: this.code, message: this.serverMessage }, null, 2);
  }
}

// api.ts 의 401 처리(토큰 정리 후 /login?next=현재주소&reason=session_expired)와 같은 방식. 로그인 후 /goals 로 복귀한다.
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("aads_token");
    document.cookie = "aads_token=; path=/; max-age=0";
  } catch { /* 저장소 접근 불가여도 이동은 한다 */ }
  const cur = window.location.pathname + window.location.search + window.location.hash;
  if (!cur.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(cur)}&reason=session_expired`;
  }
}

async function postJson<T>(path: string, body: unknown, actorSessionId: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...getAuthHeaders(), "X-Chat-Session-ID": actorSessionId },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AssignmentApiError(0, "network", "network error");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (res.status === 401) {
    redirectToLogin();
    throw new AssignmentApiError(401, "unauthenticated", null);
  }
  if (!res.ok) {
    const { code, message } = parseErrorBody(parsed);
    throw new AssignmentApiError(res.status, code, message ?? (text ? text.slice(0, 300) : null));
  }
  return parsed as T;
}

export type HolderIds = Record<AssignRole, string>;

export function previewAssignment(goalId: string, actorSessionId: string, refs: { decisionRef: string; messageId: string }, holders: HolderIds) {
  return postJson<PreviewResult>(`/goals/${encodeURIComponent(goalId)}/canonical-assignment/preview`,
    { decision_ref: refs.decisionRef, approval_message_id: refs.messageId, holders }, actorSessionId);
}

export function proposeAssignment(goalId: string, actorSessionId: string, refs: { decisionRef: string; messageId: string }, holders: HolderIds) {
  return postJson<ProposalResult>(`/goals/${encodeURIComponent(goalId)}/canonical-assignment/proposals`,
    { decision_ref: refs.decisionRef, approval_message_id: refs.messageId, holders }, actorSessionId);
}

export function decideAssignment(changeSetId: string, actorSessionId: string, approve: boolean, reason: string) {
  return postJson<Record<string, unknown>>(`/work-item-change-sets/${encodeURIComponent(changeSetId)}/assignment/decision`,
    { approve, reason }, actorSessionId);
}

export function executeAssignment(changeSetId: string, actorSessionId: string, refs: { decisionRef: string; messageId: string }, executionKey: string) {
  return postJson<ExecuteResult>(`/work-item-change-sets/${encodeURIComponent(changeSetId)}/assignment/execute`,
    { decision_ref: refs.decisionRef, approval_message_id: refs.messageId, execution_key: executionKey }, actorSessionId);
}

export function rollbackAssignment(changeSetId: string, actorSessionId: string, rollbackKey: string, reason: string) {
  return postJson<RollbackResult>(`/work-item-change-sets/${encodeURIComponent(changeSetId)}/assignment/rollback`,
    { rollback_key: rollbackKey, reason }, actorSessionId);
}

// ── 읽기·세션 생성: 기존 api.ts 헬퍼 재사용(401 처리·인증 헤더 동일) ─────────────────────
export function loadGoalSnapshot(goalId: string): Promise<[GoalWorkTree, GoalGovernance]> {
  return Promise.all([api.getGoalWorkTree(goalId), api.getGoalGovernance(goalId)]);
}

type WorkspaceLike = { id: string; name?: string; display_name?: string; project_key?: string };

/** 목표 프로젝트(AADS 등)의 워크스페이스 후보. [CEO] 통합지시 창은 서버가 보유 세션으로 거부하므로 제외한다. */
export async function listProjectWorkspaces(project: string): Promise<WorkspaceLike[]> {
  const data = await api.getChatWorkspaces();
  const all: WorkspaceLike[] = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
  const want = project.trim().toUpperCase();
  return all.filter((w) => {
    const key = String(w.project_key || "").trim().toUpperCase();
    const label = `${w.name || ""} ${w.display_name || ""}`;
    return key === want && !label.includes("[CEO] 통합지시");
  });
}

export async function listWorkspaceSessions(workspaceId: string): Promise<SessionLike[]> {
  const data = await api.getChatSessions(workspaceId);
  const rows: SessionLike[] = Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data) ? data : [];
  return rows.filter((s) => s && s.id);
}

export async function createHolderSession(workspaceId: string, role: AssignRole, title: string): Promise<SessionLike> {
  const created = await api.createChatSession({ workspace_id: workspaceId, title, role_key: role });
  return { id: String(created.id), title: created.title ?? title, role_key: created.role_key ?? role };
}
