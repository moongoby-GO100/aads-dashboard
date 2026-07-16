/**
 * AADS-190: Frontend Error Reporter
 * SSE 끊김, API 오류, 세션 전환 실패 등을 백엔드로 전송.
 * AI가 다음 턴에서 에러를 인지할 수 있도록 ai_observations에 저장.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export type ErrorType =
  | "SSE_DISCONNECT"
  | "API_ERROR"
  | "STREAM_TIMEOUT"
  | "SESSION_SWITCH"
  | "TOOL_FAILURE"
  | "UNHANDLED";

interface ErrorReport {
  error_type: ErrorType;
  message: string;
  session_id?: string;
  url?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

// 디바운스: 같은 에러 60초 내 중복 전송 방지
const _recentErrors = new Map<string, number>();
const DEDUP_MS = 60_000;

function _dedup(key: string): boolean {
  const now = Date.now();
  const last = _recentErrors.get(key);
  if (last && now - last < DEDUP_MS) return true;
  _recentErrors.set(key, now);
  // 오래된 항목 정리 (100개 초과 시)
  if (_recentErrors.size > 100) {
    for (const [k, v] of _recentErrors) {
      if (now - v > DEDUP_MS) _recentErrors.delete(k);
    }
  }
  return false;
}

function _getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aads_token");
}

/**
 * 에러를 백엔드에 전송. fire-and-forget (실패 시 무시).
 */
export async function reportError(report: ErrorReport): Promise<void> {
  const dedupKey = `${report.error_type}:${report.message.slice(0, 100)}`;
  if (_dedup(dedupKey)) return;

  try {
    const token = _getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    await fetch(`${BASE_URL}/chat/errors/report`, {
      method: "POST",
      headers,
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // fire-and-forget: 에러 리포팅 실패는 무시
    console.debug("[errorReporter] report failed (ignored)");
  }
}

/**
 * 글로벌 에러 핸들러 초기화. layout.tsx에서 1회 호출.
 */
export function initGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    reportError({
      error_type: "UNHANDLED",
      message: event.message || "Unknown error",
      url: event.filename,
      stack: event.error?.stack?.slice(0, 3000),
      context: { lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    reportError({
      error_type: "UNHANDLED",
      message: `Unhandled Promise: ${message}`,
      stack: reason instanceof Error ? reason.stack?.slice(0, 3000) : undefined,
    });
  });
}
