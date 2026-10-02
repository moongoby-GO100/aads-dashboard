// AI 응답 오류 탭(/ops/ai-errors)의 순수 로직.
// 서버 계약: GET /api/v1/ops/ai-response-errors (aads-server app/api/ops.py, VIEW ai_response_errors).
// 서버의 kind 목록(AI_RESPONSE_ERROR_KINDS)과 짝이다 — 한쪽을 고치면 다른 쪽도 고쳐라.

export type ErrorKind =
  | "llm_outage"
  | "fallback_exhausted"
  | "low_quality"
  | "error_book_chat"
  | "interrupted";

export const KIND_ORDER: ErrorKind[] = [
  "llm_outage",
  "fallback_exhausted",
  "low_quality",
  "error_book_chat",
  "interrupted",
];

// 화면에는 업무명만 쓴다. 내부 kind 문자열은 노출하지 않는다.
export const KIND_LABEL: Record<ErrorKind, string> = {
  llm_outage: "장애 응답",
  fallback_exhausted: "폴백 소진",
  low_quality: "저품질",
  error_book_chat: "오류 사전",
  interrupted: "중단(장애 아님)",
};

export const KIND_HELP: Record<ErrorKind, string> = {
  llm_outage: "모든 LLM 계정이 실패해 '전체 LLM 장애' 안내가 나간 답변",
  fallback_exhausted: "계정 교차 폴백이 모두 실패해 기록된 오류",
  low_quality: "품질 점수가 0.4 미만인 답변",
  error_book_chat: "오류 사전에 chat 계열로 등록된 항목",
  interrupted: "사용자 중단 등으로 끊긴 턴. 장애가 아니라 참고용",
};

export const KIND_COLOR: Record<ErrorKind, string> = {
  llm_outage: "#dc2626",
  fallback_exhausted: "#ea580c",
  low_quality: "#ca8a04",
  error_book_chat: "#2563eb",
  interrupted: "#6b7280",
};

export const UNKNOWN_KIND_LABEL = "기타 응답 오류";

export function isErrorKind(value: unknown): value is ErrorKind {
  return typeof value === "string" && (KIND_ORDER as string[]).includes(value);
}

export function kindLabel(kind: string): string {
  return isErrorKind(kind) ? KIND_LABEL[kind] : UNKNOWN_KIND_LABEL;
}

export interface AiResponseErrorItem {
  kind: string;
  occurred_at: string | null;
  source_table: string;
  source_id: string;
  session_id: string | null;
  model_used: string | null;
  summary: string | null;
  detail: Record<string, unknown> | null;
  error_book_key: string | null;
}

export interface AiResponseErrorsResponse {
  summary: {
    total: number;
    by_kind: Record<string, { count: number; first_at: string | null; last_at: string | null }>;
  };
  items: AiResponseErrorItem[];
  count: number;
  limit: number;
  filters: { since: string; kind: string | null };
  generated_at: string;
}

// ── 시간 ─────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const kstDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const kstTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** KST 기준 YYYY-MM-DD. 파싱 불가면 빈 문자열. */
export function kstDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return kstDayFormat.format(new Date(t));
}

/** KST 기준 YYYY-MM-DD HH:mm. */
export function formatKst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "-";
  const parts = Object.fromEntries(
    kstTimeFormat.formatToParts(new Date(t)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// ── 일별 집계 ────────────────────────────────────────────────────────────────

export interface DailyBucket {
  day: string; // KST YYYY-MM-DD
  total: number;
  byKind: Record<string, number>;
}

/** 오늘(KST)을 포함해 최근 days 일. 항목이 없는 날도 0 으로 채운다. */
export function dailyBuckets(
  items: AiResponseErrorItem[],
  days: number,
  now: Date = new Date(),
): DailyBucket[] {
  const buckets: DailyBucket[] = [];
  const index = new Map<string, DailyBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const day = kstDay(new Date(now.getTime() - i * DAY_MS).toISOString());
    const bucket: DailyBucket = { day, total: 0, byKind: {} };
    buckets.push(bucket);
    index.set(day, bucket);
  }
  for (const item of items) {
    const bucket = index.get(kstDay(item.occurred_at));
    if (!bucket) continue;
    const kind = isErrorKind(item.kind) ? item.kind : "unknown";
    bucket.byKind[kind] = (bucket.byKind[kind] || 0) + 1;
    bucket.total += 1;
  }
  return buckets;
}

// ── 재발 판정 ────────────────────────────────────────────────────────────────

export type RecurrenceState = "prior" | "new" | "na";

export interface Recurrence {
  state: RecurrenceState;
  label: string;
  reason: string;
}

export interface RecurrenceContext {
  /** 현재 조회 기간의 시작 시각(ms). 이보다 앞이 '이전 기간'이다. */
  periodStartMs: number;
  /** 이전 기간까지 포함해 조회한 항목들(현재 기간 항목도 섞여 있어도 된다). */
  widerItems: AiResponseErrorItem[];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * 재발 여부. 판정 근거가 있는 것만 판정하고, 없으면 추측하지 않고 '판정 불가'로 둔다.
 * 근거는 셋뿐이다.
 *  1) 폴백 행의 first_seen 이 현재 기간 시작보다 앞선다
 *  2) 같은 오류 사전 키가 이전 기간 항목에도 있다
 *  3) 오류 사전 항목 자체의 recurrence_count 가 0 보다 크다
 */
export function judgeRecurrence(item: AiResponseErrorItem, ctx: RecurrenceContext): Recurrence {
  const detail = item.detail || {};
  const reasons: string[] = [];

  const firstSeen = str(detail.first_seen);
  const occurrenceCount = num(detail.occurrence_count);
  if (item.kind === "fallback_exhausted" && firstSeen) {
    const firstMs = Date.parse(firstSeen);
    if (!Number.isNaN(firstMs) && firstMs < ctx.periodStartMs) {
      const count = occurrenceCount != null ? ` (누적 ${occurrenceCount}회)` : "";
      reasons.push(`최초 발생 ${kstDay(firstSeen)} 로 조회 기간 이전부터 있던 오류${count}`);
    }
  }

  const key = item.error_book_key;
  if (key) {
    const earlier = ctx.widerItems.filter(
      (other) =>
        other.error_book_key === key &&
        other.source_id !== item.source_id &&
        Date.parse(other.occurred_at || "") < ctx.periodStartMs,
    );
    if (earlier.length > 0) {
      reasons.push(`같은 오류 사전 키가 이전 기간에도 ${earlier.length}건 있음`);
    }
  }

  const recurrenceCount = num(detail.recurrence_count);
  if (item.kind === "error_book_chat" && recurrenceCount != null && recurrenceCount > 0) {
    reasons.push(`오류 사전에 재발 ${recurrenceCount}회 기록됨`);
  }

  if (reasons.length > 0) {
    return { state: "prior", label: "재발", reason: reasons.join(" / ") };
  }

  const hasIdentity = Boolean(key) || (item.kind === "fallback_exhausted" && Boolean(firstSeen));
  if (hasIdentity || item.kind === "error_book_chat") {
    const repeat =
      occurrenceCount != null && occurrenceCount > 1
        ? ` 기간 안에서는 ${occurrenceCount}회 반복.`
        : "";
    return {
      state: "new",
      label: "신규",
      reason: `이전 기간에 같은 오류 기록이 없음.${repeat}`,
    };
  }

  return {
    state: "na",
    label: "판정 안 함",
    reason: "같은 원인을 묶을 식별자(오류 사전 키·폴백 해시)가 없어 재발 여부를 판정하지 않음",
  };
}

// ── 상세 문구 ────────────────────────────────────────────────────────────────

/** detail JSON 을 업무 문구로. 내부 키 이름은 노출하지 않는다. */
export function describeDetail(item: AiResponseErrorItem): string {
  const d = item.detail || {};
  const parts: string[] = [];
  const quality = num(d.quality_score);
  if (quality != null) parts.push(`품질 ${quality.toFixed(2)}`);
  const intent = str(d.intent);
  if (intent) parts.push(`의도 ${intent}`);
  const source = str(d.source);
  if (source) parts.push(`발생 위치 ${source}`);
  const count = num(d.occurrence_count);
  if (count != null) parts.push(`누적 ${count}회`);
  const recurrence = num(d.recurrence_count);
  if (recurrence != null) parts.push(`재발 ${recurrence}회`);
  const project = str(d.project);
  if (project) parts.push(`프로젝트 ${project}`);
  const status = str(d.status);
  if (status) parts.push(`상태 ${status}`);
  return parts.join(" · ");
}

// ── 실패 분류 ────────────────────────────────────────────────────────────────

export type FailureReason =
  | "view_missing"
  | "unauthorized"
  | "forbidden"
  | "network"
  | "server"
  | "bad_response";

export interface FailureNotice {
  reason: FailureReason;
  title: string;
  guide: string;
  action: "retry" | "login";
}

/** status 가 null 이면 응답 자체를 못 받은 것(네트워크). */
export function classifyFailure(status: number | null, body?: unknown): FailureNotice {
  if (status === null) {
    return {
      reason: "network",
      title: "서버에 연결하지 못했습니다",
      guide: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      action: "retry",
    };
  }
  if (status === 401) {
    return {
      reason: "unauthorized",
      title: "로그인이 만료되었습니다",
      guide: "다시 로그인한 뒤 이 화면으로 돌아오세요.",
      action: "login",
    };
  }
  if (status === 403) {
    return {
      reason: "forbidden",
      title: "이 화면을 볼 권한이 없습니다",
      guide: "내부 관리자 계정으로 로그인했는지 확인해 주세요.",
      action: "login",
    };
  }
  if (status === 503) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : "";
    if (/view not installed/i.test(detail)) {
      return {
        reason: "view_missing",
        title: "조회 뷰가 아직 운영 DB에 적용되지 않았습니다",
        guide: "서버 쪽 조회 뷰 적용과 API 릴리스가 끝나면 데이터가 표시됩니다. 적용 후 다시 시도해 주세요.",
        action: "retry",
      };
    }
  }
  if (status >= 500) {
    return {
      reason: "server",
      title: "서버에서 조회에 실패했습니다",
      guide: "잠시 뒤 다시 시도해 주세요. 계속되면 서버 로그를 확인해야 합니다.",
      action: "retry",
    };
  }
  return {
    reason: "bad_response",
    title: "예상하지 못한 응답을 받았습니다",
    guide: "다시 시도해 주세요. 계속되면 화면과 서버 API 계약이 어긋났을 수 있습니다.",
    action: "retry",
  };
}

/** 200 응답이 계약대로인지. 아니면 화면을 깨뜨리지 않고 bad_response 로 처리한다. */
export function isAiResponseErrorsResponse(value: unknown): value is AiResponseErrorsResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AiResponseErrorsResponse>;
  return (
    Array.isArray(v.items) &&
    !!v.summary &&
    typeof v.summary === "object" &&
    !!v.summary.by_kind &&
    typeof v.summary.by_kind === "object"
  );
}
