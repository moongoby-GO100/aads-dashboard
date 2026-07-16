/**
 * AADS-172-C: AI Drive API Service
 * /api/v1/chat/drive/* 엔드포인트 연결
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  size: number;        // bytes
  mime_type: string;
  folder: string;      // "AADS", "SF", "KIS", "" (root)
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface DriveStats {
  used_bytes: number;
  quota_bytes: number;
  file_count: number;
}

export interface DriveFolder {
  name: string;
  file_count: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const driveApi = {
  /** 파일 목록 조회 */
  getFiles: (workspaceId?: string, folder?: string): Promise<DriveFile[]> =>
    req<DriveFile[]>(
      `/chat/drive?${workspaceId ? `workspace_id=${workspaceId}` : ""}${folder ? `&folder=${encodeURIComponent(folder)}` : ""}`
    ),

  /** 저장 통계 (사용량/할당량) */
  getStats: (workspaceId?: string): Promise<DriveStats> =>
    req<DriveStats>(`/chat/drive/stats${workspaceId ? `?workspace_id=${workspaceId}` : ""}`),

  /** 폴더 목록 */
  getFolders: (workspaceId?: string): Promise<DriveFolder[]> =>
    req<DriveFolder[]>(`/chat/drive/folders${workspaceId ? `?workspace_id=${workspaceId}` : ""}`),

  /** 파일 업로드 (multipart) */
  uploadFile: async (file: File, workspaceId?: string, folder?: string): Promise<DriveFile> => {
    const formData = new FormData();
    formData.append("file", file);
    if (workspaceId) formData.append("workspace_id", workspaceId);
    if (folder) formData.append("folder", folder);
    const res = await fetch(`${BASE_URL}/chat/drive/upload`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error ${res.status}: ${await res.text()}`);
    return res.json();
  },

  /** 텍스트/코드/보고서를 Drive에 저장 (AI 자동 저장) */
  saveText: (
    name: string,
    content: string,
    workspaceId?: string,
    folder?: string
  ): Promise<DriveFile> =>
    req<DriveFile>("/chat/drive/save", {
      method: "POST",
      body: JSON.stringify({ name, content, workspace_id: workspaceId, folder }),
    }),

  /** 파일 이름 변경 */
  renameFile: (fileId: string, name: string): Promise<DriveFile> =>
    req<DriveFile>(`/chat/drive/${fileId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  /** 파일 삭제 */
  deleteFile: (fileId: string): Promise<void> =>
    req<void>(`/chat/drive/${fileId}`, { method: "DELETE" }),

  /** 다운로드 URL */
  getDownloadUrl: (fileId: string): string =>
    `${BASE_URL}/chat/drive/${fileId}/download`,
};
