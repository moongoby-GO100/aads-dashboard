// 목업 검토 API. 로그인한 사용자 본인 토큰(getAuthHeaders)만 보낸다 — 시스템 토큰 없음.
import { getAuthHeaders } from "@/lib/api";
import { KEY_RE, PROJECT_RE, type CanonicalContentResponse } from "@/lib/canonicalDocLinks";
import {
  describeMockupError, type ApproveBody, type ChangeBody, type IntakeBody, type MockupChangeReport, type MockupErrorView,
  asUuid, type MockupDocRef, type MockupNotification, type MockupReview, type MockupReviewListResponse, type MockupRevision,
} from "@/lib/mockupReviewModel";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export class MockupApiError extends Error {
  view: MockupErrorView;
  constructor(view: MockupErrorView) {
    super(view.message);
    this.view = view;
  }
}

let redirecting401 = false;
function redirectToLogin(): void {
  if (typeof window === "undefined" || redirecting401) return;
  redirecting401 = true;
  try {
    localStorage.removeItem("aads_token");
    document.cookie = "aads_token=; path=/; max-age=0";
  } catch { /* 저장소 접근 불가여도 이동은 한다 */ }
  const cur = window.location.pathname + window.location.search + window.location.hash;
  if (!cur.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(cur)}&reason=session_expired`;
  }
}

function base(project: string): string {
  return `${BASE_URL}/projects/${encodeURIComponent(project)}/mockup-reviews`;
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...getAuthHeaders() },
    });
  } catch {
    throw new MockupApiError(describeMockupError(0, null));
  }
  if (res.status === 401) redirectToLogin();
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    throw new MockupApiError(describeMockupError(res.status, body));
  }
  return res;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  return (await send(url, init)).json() as Promise<T>;
}

// The existing content API accepts a numeric revision, not a UUID. Resolve the
// pinned UUID through authorized history and verify it again on the content.
// History is capped at 100: absence must never fall back to the latest revision.
export async function loadPinnedMockupDocument(project: string, ref: MockupDocRef, signal?: AbortSignal): Promise<CanonicalContentResponse> {
  if (!PROJECT_RE.test(project) || !ref.document_key || !KEY_RE.test(ref.document_key) || !asUuid(ref.revision_id)) {
    throw new Error("고정 문서판본 정보가 없어 열 수 없습니다.");
  }
  const path = `${BASE_URL}/projects/${encodeURIComponent(project)}/documents/${encodeURIComponent(ref.document_key)}`;
  const history = await json<{ revisions: { id: string; revision: number }[] }>(`${path}/history`, { signal });
  const row = history.revisions.find((r) => r.id.toLowerCase() === ref.revision_id!.toLowerCase());
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("고정 판본을 조회 가능한 이력에서 찾지 못했습니다. 삭제 또는 이력 조회 범위를 확인해 주세요.");
  }
  const content = await json<CanonicalContentResponse>(`${path}/content?revision=${row.revision}`, { signal });
  if (content.project !== project || content.document_key !== ref.document_key
    || content.canonical?.revision_id?.toLowerCase() !== ref.revision_id!.toLowerCase()
    || content.canonical?.revision !== row.revision || typeof content.content !== "string") {
    throw new Error("요청한 고정 판본과 응답이 달라 본문을 표시하지 않습니다.");
  }
  return content;
}

export const mockupApi = {
  uploadHtml: (project: string, body: {title: string; filename: string; html: string; session_id?: string; idempotency_key: string}) =>
    json<{review_id: string; revision_id: string; asset_id: string}>(`${base(project)}/html`, {method: "POST", body: JSON.stringify(body)}),
  listReviews: (project: string, opts: { status?: string; sessionId?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.sessionId) q.set("session_id", opts.sessionId);
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    if (opts.offset !== undefined) q.set("offset", String(opts.offset));
    const qs = q.toString();
    return json<MockupReviewListResponse>(`${base(project)}${qs ? `?${qs}` : ""}`, { signal });
  },
  getReview: (project: string, reviewId: string, signal?: AbortSignal) =>
    json<MockupReview>(`${base(project)}/${reviewId}`, { signal }),
  getRevision: (project: string, reviewId: string, revisionId: string, signal?: AbortSignal) =>
    json<MockupRevision>(`${base(project)}/${reviewId}/revisions/${revisionId}`, { signal }),
  // img src 에 URL 을 직접 걸 수 없다(토큰 필요) — blob 으로 받아 object URL 을 만든다.
  getAssetBlob: async (project: string, reviewId: string, revisionId: string, assetId: string): Promise<Blob> =>
    (await send(`${base(project)}/${reviewId}/revisions/${revisionId}/assets/${encodeURIComponent(assetId)}`)).blob(),
  changeReport: (project: string, reviewId: string, signal?: AbortSignal) =>
    json<MockupChangeReport>(`${base(project)}/${reviewId}/change-report`, { signal }),
  // 채팅 메시지를 수정 요청으로 접수한다. 승인도 구현 명령도 아니다.
  intakeChange: (project: string, body: IntakeBody) =>
    json<Record<string, unknown>>(`${base(project)}/change-intake`, { method: "POST", body: JSON.stringify(body) }),
  approve: (project: string, reviewId: string, body: ApproveBody) =>
    json<Record<string, unknown>>(`${base(project)}/${reviewId}/approve`, { method: "POST", body: JSON.stringify(body) }),
  requestChanges: (project: string, reviewId: string, body: ChangeBody) =>
    json<Record<string, unknown>>(`${base(project)}/${reviewId}/changes`, { method: "POST", body: JSON.stringify(body) }),
  listNotifications: (project: string, unreadOnly = true) =>
    json<{ items: MockupNotification[]; unread: number }>(`${base(project)}/notifications?unread_only=${unreadOnly}&limit=50`),
  markRead: (project: string, notificationId: number) =>
    json<{ id: number; read: boolean }>(`${base(project)}/notifications/${notificationId}/read`, { method: "POST" }),
};
