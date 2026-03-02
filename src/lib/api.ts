const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const api = {
  getHealth: () => request<{ status: string; graph_ready: boolean; version: string }>("/health"),

  getProjects: (limit = 20, offset = 0) =>
    request<{ projects: import("@/types").Project[]; total: number }>(
      `/projects?limit=${limit}&offset=${offset}`
    ),

  getProjectStatus: (id: string) =>
    request<import("@/types").ProjectStatus>(`/projects/${id}/status`),

  getProjectCosts: (id: string) =>
    request<{ project_id: string; costs: import("@/types").CostInfo }>(`/projects/${id}/costs`),

  createProject: (description: string) =>
    request<{ project_id: string; status: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
};
