"use client";

/**
 * AADS-FILES(2026-08-18)
 * 채팅에서 만든 산출물(xlsx/pdf/zip 등)을 인증을 유지한 채 열거나 내려받는다.
 *
 * 배경: 모델이 `/root/aads/aads-server/보고서.xlsx` 같은 파일시스템 경로를 링크로 주면
 *       브라우저가 `https://aads.newtalk.kr/root/...` 로 해석해 404가 났다.
 *       documentLinks.normalizeDocumentHref 가 이를 `/api/v1/files/download?path=...` 로 바꾸고,
 *       이 모듈이 Bearer 토큰을 실어 실제 파일을 가져온다(파일 API는 인증 필수 유지).
 */

const TOKEN_KEY = "aads_token";

function getToken(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_KEY}=`))
    ?.split("=")[1];
  return raw ? decodeURIComponent(raw) : "";
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return "";
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || "";
}

function fallbackName(url: URL): string {
  const path = url.searchParams.get("path") || "";
  const name = path.split("/").pop() || "download";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export type OpenFileResult = { ok: boolean; error?: string; filename?: string };

function triggerDownload(objectUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 파일 다운로드 API 링크를 토큰 인증으로 가져와 저장(또는 새 탭 열람)한다.
 * inline=1 이면 브라우저에서 바로 보이도록 새 탭에 띄운다.
 */
export async function openManagedFile(href: string): Promise<OpenFileResult> {
  if (typeof window === "undefined") return { ok: false, error: "브라우저 환경이 아닙니다" };

  const url = new URL(href, window.location.origin);
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (e) {
    return { ok: false, error: `네트워크 오류: ${(e as Error).message}` };
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = `${res.status} — ${body.detail}`;
    } catch {
      /* JSON 본문이 아니면 상태코드만 표시 */
    }
    if (res.status === 401) detail = "401 — 로그인이 만료되었습니다. 새로고침 후 다시 시도하세요.";
    if (res.status === 404) detail = "404 — 파일을 찾을 수 없습니다(삭제되었거나 경로가 바뀜).";
    return { ok: false, error: detail };
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("content-disposition")) || fallbackName(url);
  const objectUrl = URL.createObjectURL(blob);
  const inline = url.searchParams.get("inline") === "1";

  if (inline) {
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) triggerDownload(objectUrl, filename);
  } else {
    triggerDownload(objectUrl, filename);
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  return { ok: true, filename };
}
