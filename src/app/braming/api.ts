const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("aads_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/braming${path}`, { ...opts, headers: { ...headers(), ...opts?.headers } });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = await res.json();
      detail = typeof payload?.detail === "string" ? `: ${payload.detail}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`API error: ${res.status}${detail}`);
  }
  return res.json();
}

async function publicReq<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/braming${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface BramingSession {
  id: string;
  title: string;
  topic: string;
  status: string;
  config: Record<string, unknown>;
  summary: string | null;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface BramingNodeData {
  id: string;
  session_id: string;
  parent_id: string | null;
  node_type: "topic" | "perspective" | "idea" | "counter" | "expansion" | "synthesis" | "ceo_pick";
  label: string;
  content: string;
  agent_role: string | null;
  cost: number;
  metadata: Record<string, unknown>;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface GraphData {
  session: BramingSession;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      label: string;
      content: string;
      nodeType: string;
      agentRole: string | null;
      cost: number;
      createdAt: string;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    animated: boolean;
  }>;
}

export async function createSession(topic: string): Promise<{ session: BramingSession }> {
  return req("/sessions", { method: "POST", body: JSON.stringify({ topic }) });
}

export async function listSessions(limit = 20): Promise<{ items?: BramingSession[]; sessions?: BramingSession[] }> {
  return req(`/sessions?limit=${limit}`);
}

export async function getSessionGraph(sessionId: string): Promise<GraphData> {
  return req(`/sessions/${sessionId}`);
}

export async function getSharedGraph(token: string): Promise<GraphData & { share?: { role: string; expiresAt: string | null } }> {
  return publicReq(`/shared/${token}`);
}

export async function generatePerspectives(sessionId: string, count = 4): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/perspectives`, { method: "POST", body: JSON.stringify({ count }) });
}

export async function generateIdeas(sessionId: string, perspectiveNodeId: string, count = 6): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/ideas`, { method: "POST", body: JSON.stringify({ perspective_node_id: perspectiveNodeId, count }) });
}

export async function generateCounter(sessionId: string, targetNodeId: string): Promise<{ node: BramingNodeData }> {
  return req(`/sessions/${sessionId}/counter`, { method: "POST", body: JSON.stringify({ target_node_id: targetNodeId }) });
}

export async function expandNode(sessionId: string, nodeId: string, count = 6): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/expand`, { method: "POST", body: JSON.stringify({ node_id: nodeId, count }) });
}

export async function synthesizeSession(sessionId: string): Promise<{ node: BramingNodeData; summary: string }> {
  return req(`/sessions/${sessionId}/synthesize`, { method: "POST" });
}

export async function updateNodeContent(
  sessionId: string,
  nodeId: string,
  data: { label?: string; content?: string },
): Promise<{ node: BramingNodeData }> {
  return req(`/sessions/${sessionId}/nodes/${nodeId}/content`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteNode(
  sessionId: string,
  nodeId: string,
): Promise<{ deleted: boolean; deletedCount: number; nodeId: string }> {
  return req(`/sessions/${sessionId}/nodes/${nodeId}`, { method: "DELETE" });
}

export interface BramingShare {
  id: string;
  sessionId: string;
  role: "viewer" | "commenter" | "editor";
  token?: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export async function createShare(
  sessionId: string,
  data: { role?: "viewer" | "commenter" | "editor"; expires_in_days?: number },
): Promise<{ share: BramingShare }> {
  return req(`/sessions/${sessionId}/shares`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listShares(sessionId: string): Promise<{ items: BramingShare[] }> {
  return req(`/sessions/${sessionId}/shares`);
}

export async function revokeShare(sessionId: string, shareId: string): Promise<{ revoked: boolean; shareId: string }> {
  return req(`/sessions/${sessionId}/shares/${shareId}`, { method: "DELETE" });
}

export async function addCollaborator(
  sessionId: string,
  data: { email?: string; user_id?: string; role?: "viewer" | "commenter" | "editor" },
): Promise<{ collaborator: { id: string; email: string | null; userId: string | null; role: string } }> {
  return req(`/sessions/${sessionId}/collaborators`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function exportSession(
  sessionId: string,
  exportType: "markdown" | "snapshot" = "markdown",
): Promise<{ export: { id: string; type: string; status: string; content: string; createdAt: string } }> {
  return req(`/sessions/${sessionId}/export`, {
    method: "POST",
    body: JSON.stringify({ export_type: exportType }),
  });
}

export async function createPlan(
  sessionId: string,
  data: { document_type?: "prd" | "service_plan" | "proposal" | "mvp_plan"; detail_level?: "brief" | "standard" | "detailed"; audience?: "product" | "executive" | "engineering" | "client" },
): Promise<{ artifact: { id: number; artifact_name: string; content: { title: string; markdown: string } } }> {
  return req(`/sessions/${sessionId}/plan`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
