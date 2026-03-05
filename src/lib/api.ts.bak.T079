// T-072: Flat API response types
export interface DirectiveItem { task_id: string; title: string; project: string; status: string; error_type: string | null; started_at: string; completed_at: string | null; duration_seconds: number | null; created_at: string; file_path: string; }
export interface DirectivesResponse { status: string; total: number; running: number; completed: number; error: number; error_breakdown: Record<string, number>; project_breakdown: Record<string, number>; summary: Record<string, number>; items: DirectiveItem[]; directives: DirectiveItem[]; }

import type {
  HealthResponse,
  ProjectListResponse,
  ProjectStatusResponse,
  CreateProjectResponse,
  AutoRunResponse,
  LoginResponse,
  MeResponse,
  ConversationsResponse,
  ConversationStatsResponse,
  PublicSummaryResponse,
  MemorySearchResponse,
  MemoryInboxResponse,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getHealth: () => request<HealthResponse>("/health"),

  getProjects: (limit = 20, offset = 0) =>
    request<ProjectListResponse>(`/projects?limit=${limit}&offset=${offset}`),

  getProjectStatus: (id: string) =>
    request<ProjectStatusResponse>(`/projects/${id}/status`),

  createProject: (description: string) =>
    request<CreateProjectResponse>("/projects", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  autoRunProject: (id: string) =>
    request<AutoRunResponse>(`/projects/${id}/auto_run`, { method: "POST" }),

  getProjectCosts: (id: string) =>
    request<{ project_id: string; costs: import("@/types").CostInfo }>(`/projects/${id}/costs`),

  resumeProject: (id: string, approved: boolean = true, feedback: string = "승인") =>
    request<{ project_id: string; status: string; checkpoint_stage: string }>(
      `/projects/${id}/resume?approved=${approved}&feedback=${encodeURIComponent(feedback)}`,
      { method: "POST" }
    ),

  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMe: (token: string) =>
    fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => (r.ok ? r.json() as Promise<MeResponse> : null)),

  getConversations: (project?: string, keyword?: string, limit = 50, offset = 0) =>
    request<ConversationsResponse>(
      `/conversations?${project ? `project=${project}&` : ''}${keyword ? `keyword=${encodeURIComponent(keyword)}&` : ''}limit=${limit}&offset=${offset}`
    ),
  getConversationStats: () => request<ConversationStatsResponse>('/conversations/stats'),
  // T-077: Channel-based conversation API
  getConversationChannels: () => request<any>('/conversations/channels'),
  getConversationMessages: (channel: string, limit = 50, offset = 0) =>
    request<any>(`/conversations/messages?channel=${encodeURIComponent(channel)}&limit=${limit}&offset=${offset}`),
  searchConversations: (q: string, channel = 'ALL', limit = 20) =>
    request<any>(`/conversations/search?q=${encodeURIComponent(q)}&channel=${encodeURIComponent(channel)}&limit=${limit}`),
  getPublicSummary: () => request<PublicSummaryResponse>('/context/public-summary'),
  getMemorySearch: (params?: { agent_id?: string; memory_type?: string; keyword?: string }) => {
    const q = new URLSearchParams();
    if (params?.agent_id) q.set('agent_id', params.agent_id);
    if (params?.memory_type) q.set('memory_type', params.memory_type);
    if (params?.keyword) q.set('keyword', params.keyword);
    return request<MemorySearchResponse>(`/memory/search?${q.toString()}`);
  },
  getManagerInbox: (agentId: string) => request<MemoryInboxResponse>(`/memory/inbox/${agentId}`),

  // T-049: CEO Dashboard extensions
  getProjectDashboard: () => request<any>("/projects/dashboard"),
  getProjectDetail: (id: string) => request<any>(`/projects/dashboard/${id}`),
  getTimeline: () => request<any>("/projects/dashboard/timeline"),
  getAlerts: () => request<any>("/projects/dashboard/alerts"),
  getCeoDecisions: (days?: number) => request<any>(`/memory/ceo-decisions?days=${days || 30}`),

  // T-072: Directives + Reports + Task-History (flat response)
  getDirectives: (project?: string) => request<any>(`/dashboard/directives${project && project !== "all" ? `?project=${encodeURIComponent(project)}` : ""}`),
  getReports: (project?: string) => request<any>(`/dashboard/reports${project && project !== "all" ? `?project=${encodeURIComponent(project)}` : ""}`),
  getReportDetail: (filename: string) => request<any>(`/dashboard/reports/${encodeURIComponent(filename)}`),
  getTaskHistory: () => request<any>("/dashboard/task-history"),

  // T-067: Analytics
  getAnalytics: () => request<any>("/dashboard/analytics"),

  // T-073: CEO Chat v2
  sendCeoMessage: (sessionId: string, message: string) =>
    request<any>("/ceo-chat/message", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, message }),
    }),
  getCeoSessions: () => request<any>("/ceo-chat/sessions"),
  getCeoSession: (sessionId: string) => request<any>(`/ceo-chat/sessions/${sessionId}`),
  endCeoSession: (sessionId: string) =>
    request<any>("/ceo-chat/end-session", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    }),
  getCeoCostSummary: () => request<any>("/ceo-chat/cost-summary"),
};
