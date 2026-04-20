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

export async function generatePerspectives(sessionId: string, count = 4): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/perspectives`, { method: "POST", body: JSON.stringify({ count }) });
}

export async function generateIdeas(sessionId: string, perspectiveNodeId: string, count = 3): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/ideas`, { method: "POST", body: JSON.stringify({ perspective_node_id: perspectiveNodeId, count }) });
}

export async function generateCounter(sessionId: string, targetNodeId: string): Promise<{ node: BramingNodeData }> {
  return req(`/sessions/${sessionId}/counter`, { method: "POST", body: JSON.stringify({ target_node_id: targetNodeId }) });
}

export async function expandNode(sessionId: string, nodeId: string): Promise<{ nodes: BramingNodeData[] }> {
  return req(`/sessions/${sessionId}/expand`, { method: "POST", body: JSON.stringify({ node_id: nodeId }) });
}

export async function synthesizeSession(sessionId: string): Promise<{ node: BramingNodeData; summary: string }> {
  return req(`/sessions/${sessionId}/synthesize`, { method: "POST" });
}
