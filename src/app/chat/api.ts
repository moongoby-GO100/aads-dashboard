// AADS Chat API helpers — extracted from page.tsx (Phase 1)
import type { Artifact } from "./types";

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("aads_token");
  if (token) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `aads_token=${token}; path=/; max-age=${24 * 7 * 3600}; SameSite=Lax${secure}`;
    return token;
  }
  const cookieToken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("aads_token="))
    ?.split("=")[1];
  if (cookieToken) {
    const decoded = decodeURIComponent(cookieToken);
    localStorage.setItem("aads_token", decoded);
    return decoded;
  }
  return null;
}

export function authHdrs(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// AADS-AUTH-401: 401 처리 (중복 리다이렉트 방지)
let _chatRedirecting401 = false;
function handleChat401(): void {
  if (typeof window === "undefined") return;
  if (_chatRedirecting401) return;
  _chatRedirecting401 = true;
  try {
    localStorage.removeItem("aads_token");
    document.cookie = "aads_token=; path=/; max-age=0";
  } catch {}
  const cur = window.location.pathname + window.location.search;
  if (!cur.startsWith("/login")) {
    const next = encodeURIComponent(cur);
    window.location.href = `/login?next=${next}&reason=session_expired`;
  }
}

/**
 * 같은 GET 이 이미 날아가 있으면 그 약속을 함께 쓴다(in-flight coalescing).
 *
 * /chat 진입 시 같은 요청이 여러 effect 에서 겹쳐 나간다. 2026-09-14 실측:
 *
 *   /chat/messages?...&limit=120&fields=render   357KB 를 325ms 간격으로 2회
 *   /ops/deploy/status                            94KB 를 1.3초 간격으로 2회
 *   /auth/me, /health/relay-capacity              각 2회 이상
 *
 * 호출부가 세 군데 흩어져 있어 하나씩 고치면 다음에 또 생긴다. 여기서 합친다.
 *
 * 캐시가 아니라 **진행 중인 요청만** 공유한다. 응답이 끝나면 즉시 버리므로
 * 폴링이나 갱신 의도를 막지 않는다. GET 이 아니거나 본문/AbortSignal 이 있는
 * 요청은 손대지 않는다 — 부수효과가 있는 요청을 합치면 안 된다.
 */
const _inflight = new Map<string, Promise<unknown>>();

function _coalesceKey(path: string, opts?: RequestInit): string | null {
  const method = (opts?.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (opts?.body != null || opts?.signal != null) return null;
  return path;
}

export async function chatApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const key = _coalesceKey(path, opts);
  if (key) {
    const pending = _inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const run = (async (): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...opts,
      credentials: opts?.credentials ?? "include",
      headers: {
        "Content-Type": "application/json",
        ...authHdrs(),
        ...((opts?.headers as Record<string, string>) || {}),
      },
    });
    if (res.status === 401) {
      handleChat401();
      throw new Error("401: 세션이 만료되었습니다. 다시 로그인해주세요.");
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  })();

  if (!key) return run;
  _inflight.set(key, run);
  try {
    return await run;
  } finally {
    // 성공이든 실패든 즉시 비운다. 실패를 남겨두면 다음 재시도까지 같이 실패한다.
    _inflight.delete(key);
  }
}

export async function updateArtifact(
  artifactId: string,
  data: { title?: string; content?: string }
): Promise<Artifact> {
  return chatApi<Artifact>(`/chat/artifacts/${artifactId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function uploadChatFile(file: File, sessionId: string): Promise<{
  file_id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  thumbnail_url?: string;
  file_url?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/chat/files/upload?session_id=${sessionId}&uploaded_by=user`, {
    method: "POST",
    credentials: "include",
    headers: { ...authHdrs() },
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}
