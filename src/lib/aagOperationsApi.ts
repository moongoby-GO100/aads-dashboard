// 아키텍처 상태 API. 로그인한 사용자 본인 토큰(getAuthHeaders)만 보낸다 — 읽기 전용, 쓰기/재스캔 호출 없음.
import { getAuthHeaders } from "@/lib/api";
import {
  classifyApiError, isImpact, type ImpactQuery, type ImpactResponse, isMermaid, isOperations, type AagErrorView, type AagFilters, type FindingsPage, type MermaidResponse, type OperationsResponse,
} from "@/lib/aagOperations";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const CONSUMER = "dashboard-aag-operations";

export class AagApiError extends Error {
  view: AagErrorView;
  constructor(view: AagErrorView) {
    super(view.title);
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

async function getJson<T>(url: string, endpoint: "operations" | "findings" | "mermaid" | "impact", signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal,
      headers: { "X-AAG-Consumer": CONSUMER, ...getAuthHeaders() },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AagApiError(classifyApiError(0, null, endpoint));
  }
  if (res.status === 401) redirectToLogin();
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    throw new AagApiError(classifyApiError(res.status, body, endpoint));
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new AagApiError(classifyApiError(502, null, endpoint));
  }
}

export function operationsUrl(f: AagFilters): string {
  const q = new URLSearchParams({ project: f.project, repository_id: f.repositoryId, target_ref: f.targetRef });
  return `${BASE_URL}/aag/v2/operations?${q.toString()}`;
}

export function mermaidUrl(f: AagFilters): string {
  const q = new URLSearchParams({ project: f.project, repository_id: f.repositoryId, target_ref: f.targetRef });
  return `${BASE_URL}/aag/v2/mermaid?${q.toString()}`;
}

export type FindingsOpts = { cursor?: string | null; pageSize?: number; stableKey?: string | null };

export function findingsUrl(f: AagFilters, snapshotId: string, opts: FindingsOpts = {}): string {
  const q = new URLSearchParams({ project: f.project, repository_id: f.repositoryId, target_ref: f.targetRef, snapshot_id: snapshotId });
  if (opts.stableKey) q.set("stable_finding_key", opts.stableKey);
  else if (f.severity) q.set("severity", f.severity);
  if (opts.cursor) q.set("cursor", opts.cursor);
  q.set("page_size", String(opts.pageSize ?? 50));
  return `${BASE_URL}/aag/v2/findings?${q.toString()}`;
}

export function impactUrl(f: AagFilters, query: ImpactQuery): string {
  const depth = query.depth ?? 2;
  if (!Number.isInteger(depth) || depth < 1 || depth > 5 || !query.path.trim()) throw new Error("파일 경로와 탐색 단계(1~5)를 확인하세요.");
  const q = new URLSearchParams({ project: f.project, repository_id: f.repositoryId, target_ref: f.targetRef, path: query.path.trim(), depth: String(depth) });
  if (query.governanceScope?.trim()) q.set("governance_scope", query.governanceScope.trim());
  return `${BASE_URL}/aag/v2/impact?${q.toString()}`;
}

export const aagApi = {
  getImpact: async (f: AagFilters, query: ImpactQuery, signal?: AbortSignal): Promise<ImpactResponse> => {
    const data = await getJson<unknown>(impactUrl(f, query), "impact", signal);
    if (!isImpact(data) || data.repository_id !== f.repositoryId || data.target_ref !== f.targetRef) {
      throw new AagApiError(classifyApiError(502, null, "impact"));
    }
    return data;
  },
  getOperations: async (f: AagFilters, signal?: AbortSignal): Promise<OperationsResponse> => {
    const data = await getJson<unknown>(operationsUrl(f), "operations", signal);
    if (!isOperations(data)) throw new AagApiError(classifyApiError(502, null, "operations"));
    return data;
  },
  getMermaid: async (f: AagFilters, signal?: AbortSignal): Promise<MermaidResponse> => {
    const data = await getJson<unknown>(mermaidUrl(f), "mermaid", signal);
    if (!isMermaid(data)) throw new AagApiError(classifyApiError(502, null, "mermaid"));
    return data;
  },
  getFindings: (f: AagFilters, snapshotId: string, opts: FindingsOpts = {}, signal?: AbortSignal) =>
    getJson<FindingsPage>(findingsUrl(f, snapshotId, opts), "findings", signal),
};
