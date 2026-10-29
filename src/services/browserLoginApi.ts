import { getAuthHeaders, handle401Redirect } from "@/lib/api";

export type AuthScope = {
  tenant_id: string; business_ref: string; account_ref: string; session_id: string;
  work_key: string; lane: "server" | "pc"; target: string; recipe_name: string;
  recipe_version: number; checkpoint: number; expires_at: string;
};
export type AuthEvidence = {
  artifact_id: string; captured_at: string; origin: "server_observation"; verified: true;
};
export type LoginTask = {
  id: string; status: string; target_url?: string; error?: string;
  result?: { auth_scope?: AuthScope; reason?: string };
};
const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const messages: Record<string, string> = {
  auth_scope_expired: "인증 시간이 만료되었습니다. 새 접속 확인을 요청하세요.",
  auth_evidence_rate_limited: "요청이 너무 잦습니다. 10초 후 다시 시도하세요.",
  auth_scope_mismatch: "사업자 또는 계정 정보가 변경되었습니다. 상태를 다시 확인하세요.",
  auth_wait_already_consumed: "이미 처리한 인증 요청입니다. 상태를 다시 확인하세요.",
  auth_task_not_found: "인증 작업을 찾을 수 없습니다. 현재 계정과 채팅을 확인하세요.",
  auth_evidence_lane_mismatch: "인증한 기기가 다릅니다. 원래 기기에서 인증하세요.",
  auth_evidence_predates_wait: "인증 전 화면입니다. 인증 완료 후 최신 화면 증거를 요청하세요.",
  auth_resume_verification_required: "인증 완료 확인이 필요합니다. 최신 화면 증거를 요청하세요.",
  auth_session_user_mismatch: "이 채팅의 사용자와 다릅니다. 현재 계정을 확인하세요.",
  auth_evidence_binding_changed: "인증 정보가 변경되었습니다. 최신 화면 증거를 다시 요청하세요.",
  auth_evidence_browser_scope_mismatch: "인증한 PC 탭이 다릅니다. 원래 채팅의 PC 탭을 확인하세요.",
  auth_transition_endpoint_required: "인증 상태 카드에서 계속 또는 중단을 선택하세요.",
};
export function loginError(detail: string): string {
  if (detail.includes("expired")) return "인증 시간이 만료되었습니다. 새 접속 확인을 요청하세요.";
  return messages[detail] || "처리하지 못했습니다. 연결과 인증 화면을 확인한 뒤 상태를 다시 확인하세요.";
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401) handle401Redirect();
  if (response.status === 429) throw new Error(loginError("auth_evidence_rate_limited"));
  const data = await response.json();
  if (!response.ok) throw new Error(loginError(typeof data.detail === "string" ? data.detail : ""));
  return data as T;
}
const taskPath = (id: string) => `/browser-tasks/${encodeURIComponent(id)}`;
export const browserLoginApi = {
  get: (id: string) => request<LoginTask>(taskPath(id)),
  evidence: (id: string, scope: AuthScope) => request<AuthEvidence>(`${taskPath(id)}/auth-evidence`, { scope }),
  resume: (id: string, scope: AuthScope, artifact_id: string) => request<LoginTask>(`${taskPath(id)}/auth-resume`, { scope, artifact_id }),
  cancel: (id: string, scope: AuthScope) => request<LoginTask>(`${taskPath(id)}/auth-cancel`, { scope }),
};
// The synchronous gate also protects clicks before React commits its busy state.
export function singleLoginRequest() {
  let pending = false;
  return async (action: () => Promise<void>) => {
    if (pending) return;
    pending = true;
    try { await action(); } finally { pending = false; }
  };
}
