export const BASE_URL = "https://aads.newtalk.kr";
export const API_PREFIX = "/api/v1/browser-tasks";
export const LOGIN_URL = `${BASE_URL}/login`;
export const CHAT_URL = `${BASE_URL}/chat`;
export const COOKIE_NAME = "aads_token";

export class ApiError extends Error {
  constructor(kind, status, message) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function kindForStatus(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "client";
}

export async function readTokenFromCookies(cookiesApi) {
  const cookie = await cookiesApi.get({ url: BASE_URL, name: COOKIE_NAME });
  return cookie && cookie.value ? cookie.value : "";
}

export function createApi({ fetchImpl, getToken, baseUrl = BASE_URL }) {
  async function request(method, path, { query, body } = {}) {
    const token = await getToken();
    if (!token) throw new ApiError("auth", 401, "not_logged_in");

    let url = `${baseUrl}${API_PREFIX}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const init = { method, headers, credentials: "omit" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new ApiError("network", 0, "network_error");
    }

    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = typeof data?.detail === "string" ? data.detail : "";
      } catch {
        // 본문이 JSON 이 아니어도 상태 코드로 판단한다.
      }
      throw new ApiError(kindForStatus(response.status), response.status, detail || `http_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError("server", response.status, "invalid_json");
    }
  }

  return {
    async listPending() {
      const data = await request("GET", "/permissions/pending", { query: { decision: "pending", limit: 50 } });
      return Array.isArray(data?.requests) ? data.requests : [];
    },
    approve(requestId) {
      return request("POST", `/permissions/${encodeURIComponent(requestId)}/approve`, { body: {} });
    },
    reject(requestId, reason = "") {
      return request("POST", `/permissions/${encodeURIComponent(requestId)}/reject`, { body: { reason } });
    },
    async listTasks(limit = 10) {
      const data = await request("GET", "", { query: { limit } });
      return Array.isArray(data?.tasks) ? data.tasks : [];
    },
    async getTaskDetail(taskId) {
      const id = encodeURIComponent(taskId);
      const [events, steps, liveFrame] = await Promise.all([
        request("GET", `/${id}/events`, { query: { limit: 30 } }),
        request("GET", `/${id}/steps`, { query: { limit: 50 } }),
        request("GET", `/${id}/live-frame`, { query: { event_limit: 0 } }).catch((err) => {
          if (err.kind === "auth") throw err;
          return null;
        }),
      ]);
      return {
        events: Array.isArray(events?.events) ? events.events : [],
        steps: Array.isArray(steps?.steps) ? steps.steps : [],
        frame: liveFrame?.frame || null,
      };
    },
    retryTask(taskId) {
      return request("POST", `/${encodeURIComponent(taskId)}/retry`);
    },
  };
}
