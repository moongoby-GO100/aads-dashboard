// AADS Chat API helpers — extracted from page.tsx (Phase 1)

import { isAuthSessionStillValid, refreshAuthToken } from "@/lib/auth";

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("aads_token");
  if (token) {
    document.cookie = `aads_token=${token}; path=/; max-age=${24 * 7 * 3600}; SameSite=Lax`;
    return token;
  }
  const cookieToken = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("aads_token="))
    ?.slice("aads_token=".length);
  return cookieToken ? decodeURIComponent(cookieToken) : null;
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
  const cur = window.location.pathname + window.location.search + window.location.hash;
  if (!cur.startsWith("/login")) {
    const next = encodeURIComponent(cur);
    window.location.href = `/login?next=${next}&reason=session_expired`;
  }
}

export async function chatApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHdrs(),
      ...((opts?.headers as Record<string, string>) || {}),
    },
  });
  if (res.status === 401) {
    const curToken = getToken();
    if (curToken) {
      try {
        const refreshedToken = await refreshAuthToken(curToken);
        if (refreshedToken) {
          const retry = await fetch(`${BASE_URL}${path}`, {
            ...opts,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshedToken}`,
              ...((opts?.headers as Record<string, string>) || {}),
            },
          });
          if (retry.ok) {
            if (retry.status === 204) return undefined as unknown as T;
            return retry.json() as Promise<T>;
          }
        }
      } catch {}
    }
    const confirmedExpired = !(await isAuthSessionStillValid());
    if (confirmedExpired) handleChat401();
    throw new Error("401: 세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    const body = await res.text();
    const looksLikeHtmlError = /^\s*<!doctype html|^\s*<html/i.test(body);
    const gatewayMessage: Record<number, string> = {
      502: "서버 응답이 없습니다. 잠시 후 다시 시도하거나 채팅 화면에서 문서 링크를 다시 클릭해주세요.",
      503: "서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.",
      504: "문서 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
    };
    const detail = gatewayMessage[res.status] || (looksLikeHtmlError ? "서버 응답을 불러오지 못했습니다. 잠시 후 다시 열어주세요." : body);
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function chatApiWithRetry<T>(
  path: string,
  opts?: RequestInit,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chatApi<T>(path, opts);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes('401')) throw lastError;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError!;
}

export async function updateArtifact(
  artifactId: string,
  data: { title?: string; content?: string }
): Promise<void> {
  await chatApi(`/chat/artifacts/${artifactId}`, {
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
  const upload = (authorization?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`${BASE_URL}/chat/files/upload?session_id=${sessionId}&uploaded_by=user`, {
      method: "POST",
      headers: authorization ? { Authorization: `Bearer ${authorization}` } : { ...authHdrs() },
      body: formData,
    });
  };

  let res = await upload();
  if (res.status === 401) {
    const currentToken = getToken();
    if (currentToken) {
      const refreshedToken = await refreshAuthToken(currentToken).catch(() => null);
      if (refreshedToken) res = await upload(refreshedToken);
    }
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}
