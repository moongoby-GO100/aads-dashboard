// 목업 검토 API. 로그인한 사용자 본인 토큰(getAuthHeaders)만 보낸다 — 시스템 토큰 없음.
import { getAuthHeaders } from "@/lib/api";
import {
  describeMockupError, type ApproveBody, type ChangeBody, type MockupErrorView, type MockupNotification,
  type MockupReview, type MockupReviewListResponse, type MockupRevision,
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

export const mockupApi = {
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
  approve: (project: string, reviewId: string, body: ApproveBody) =>
    json<Record<string, unknown>>(`${base(project)}/${reviewId}/approve`, { method: "POST", body: JSON.stringify(body) }),
  requestChanges: (project: string, reviewId: string, body: ChangeBody) =>
    json<Record<string, unknown>>(`${base(project)}/${reviewId}/changes`, { method: "POST", body: JSON.stringify(body) }),
  listNotifications: (project: string, unreadOnly = true) =>
    json<{ items: MockupNotification[]; unread: number }>(`${base(project)}/notifications?unread_only=${unreadOnly}&limit=50`),
  markRead: (project: string, notificationId: number) =>
    json<{ id: number; read: boolean }>(`${base(project)}/notifications/${notificationId}/read`, { method: "POST" }),
};
