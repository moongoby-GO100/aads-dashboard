/**
 * AADS-172-B: Chat-First API Service
 * AADS-170 백엔드 /api/v1/chat/* 엔드포인트 연결
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  system_prompt: string | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  workspace_id: string;
  title: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  bookmarked: boolean;
  attachments: unknown[];
  sources: SourceItem[] | null;
  thought_summary: string | null;
  created_at: string;
}

export interface SourceItem {
  url: string;
  title: string;
  favicon?: string;
}

export interface SSEChunk {
  type: "delta" | "done" | "error" | "thought_summary" | "sources";
  content?: string;
  summary?: string;
  sources?: SourceItem[];
  message_id?: string;
  // frontend-style names
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: string;
  // backend sends these names (AADS-182 fix)
  model?: string;
  cost?: string;
  intent?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const chatApi = {
  // Workspaces
  getWorkspaces: () => req<ChatWorkspace[]>("/chat/workspaces"),
  createWorkspace: (data: { name: string; slug: string; description?: string; icon?: string; color?: string }) =>
    req<ChatWorkspace>("/chat/workspaces", { method: "POST", body: JSON.stringify(data) }),

  // Sessions
  getSessions: (workspaceId: string) =>
    req<ChatSession[]>(`/chat/sessions?workspace_id=${workspaceId}`),
  createSession: (workspaceId: string, title?: string) =>
    req<ChatSession>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId, title: title || null }),
    }),
  updateSession: (sessionId: string, data: { title?: string; pinned?: boolean }) =>
    req<ChatSession>(`/chat/sessions/${sessionId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSession: (sessionId: string) =>
    req<void>(`/chat/sessions/${sessionId}`, { method: "DELETE" }),

  // Messages
  getMessages: (sessionId: string, limit = 50, offset = 0) =>
    req<ChatMessage[]>(`/chat/messages?session_id=${sessionId}&limit=${limit}&offset=${offset}`),
  toggleBookmark: (messageId: string) =>
    req<ChatMessage>(`/chat/messages/${messageId}/bookmark`, { method: "PUT" }),
  searchMessages: (q: string, workspaceId?: string, limit = 20) =>
    req<{ messages: ChatMessage[]; total: number }>(
      `/chat/messages/search?q=${encodeURIComponent(q)}${workspaceId ? `&workspace_id=${workspaceId}` : ""}&limit=${limit}`
    ),

  /**
   * SSE 스트리밍 메시지 전송
   * Returns ReadableStream — caller parses SSE chunks
   */
  sendMessageStream: async (
    sessionId: string,
    content: string,
    modelOverride?: string,
    signal?: AbortSignal,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
    const res = await fetch(`${BASE_URL}/chat/messages/send`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        session_id: sessionId,
        content,
        model_override: modelOverride || null,
        attachments: [],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Stream error ${res.status}`);
    return res.body.getReader();
  },

  // Drive
  getDriveFiles: (workspaceId: string) =>
    req<unknown[]>(`/chat/drive?workspace_id=${workspaceId}`),
  deleteDriveFile: (fileId: string) =>
    req<void>(`/chat/drive/${fileId}`, { method: "DELETE" }),

  // Artifacts
  getArtifacts: (sessionId: string) =>
    req<unknown[]>(`/chat/artifacts?session_id=${sessionId}`),

  // Research
  getResearchHistory: (limit = 20) =>
    req<unknown[]>(`/chat/research/history?limit=${limit}`),
};
