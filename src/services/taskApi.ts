/**
 * AADS-181: 전체 프로젝트 통합 작업 현황 API
 * 3서버(68/211/114) 디렉티브 통합 조회 + 서버 요약
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrossDirective {
  task_id: string;
  title: string;
  priority: string;
  size: string;
  model: string;
  project: string;
  status: string;
  server: string;     // "68" | "211" | "114"
  filename: string;
  started_at: string | null;
  completed_at: string | null;
  error?: string;
}

export interface ServerInfo {
  reachable: boolean;
  method: string;    // "local" | "ssh" | "http" | "ssh_failed"
  counts: Record<string, number>;
  total: number;
}

export interface AllDirectivesResponse {
  status: string;
  total_count: number;
  counts: Record<string, number>;         // {pending: N, running: N, done: N, archived: N}
  by_server: Record<string, ServerInfo>;  // {"68": ..., "211": ..., "114": ...}
  directives: CrossDirective[];
  cached: boolean;
  scanned_at: string | null;
}

export interface ServerSummaryItem {
  server_id: string;
  display_name: string;
  projects: string[];
  reachable: boolean;
  method: string;
  pending: number;
  running: number;
  done: number;
  active_claude_sessions: number | null;
}

export interface ServerSummaryResponse {
  servers: Record<string, ServerSummaryItem>;
  total_pending: number;
  total_running: number;
  total_done: number;
  scanned_at: string;
  cached: boolean;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * 3서버 통합 디렉티브 조회.
 * @param status "all" | "pending" | "running" | "done" | "archived"
 * @param project "all" | "AADS" | "KIS" | "GO100" | "SF" | "NTV2" | "NAS"
 * @param forceRefresh 캐시 무시
 */
export async function getAllDirectives(
  status: string = "all",
  project: string = "all",
  forceRefresh = false,
): Promise<AllDirectivesResponse> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (project && project !== "all") params.set("project", project);
  if (forceRefresh) params.set("force_refresh", "true");
  const qs = params.toString();
  return request<AllDirectivesResponse>(`/directives/all${qs ? `?${qs}` : ""}`);
}

/**
 * 3서버 요약 (pending/running/done 건수 + 프로세스 상태).
 */
export async function getServerSummary(): Promise<ServerSummaryResponse> {
  return request<ServerSummaryResponse>("/ops/server-summary");
}
