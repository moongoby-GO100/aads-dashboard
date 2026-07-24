// AADS Chat API helpers — extracted from page.tsx (Phase 1)

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("aads_token");
  if (token) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `aads_token=${token}; path=/; max-age=${24 * 7 * 3600}; SameSite=Lax${secure}`;
  }
  return token;
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
    handleChat401();
    throw new Error("401: 세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
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
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/chat/files/upload?session_id=${sessionId}&uploaded_by=user`, {
    method: "POST",
    headers: { ...authHdrs() },
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}
