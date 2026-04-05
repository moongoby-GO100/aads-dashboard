// AADS Chat API helpers — extracted from page.tsx (Phase 1)

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aads_token");
}

export function authHdrs(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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
