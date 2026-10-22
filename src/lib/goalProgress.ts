export const GOAL_STATUS_LABEL: Record<string, string> = {
  active: "진행 중",
  blocked: "막힘",
  draft: "초안",
  completed: "완료",
  cancelled: "취소",
  archived: "보관",
  failed: "실패",
  error: "오류",
};

export const GOAL_STATUS_COLOR: Record<string, string> = {
  active: "#2563eb",
  blocked: "#dc2626",
  failed: "#dc2626",
  error: "#dc2626",
  completed: "#16a34a",
  draft: "#64748b",
  cancelled: "#64748b",
  archived: "#64748b",
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "archived"]);

export const FORBIDDEN_MESSAGE = "대표님 권한이 필요합니다";
export const REASON_REQUIRED_MESSAGE = "멈추는 사유를 입력해 주십시오";

export const goalStatusLabel = (status?: string | null) =>
  (status && GOAL_STATUS_LABEL[status]) || status || "상태 미확인";

export const isGoalTerminal = (status?: string | null) => !!status && TERMINAL_STATUSES.has(status);

// goals.progress 는 0~1 비율이 정본이지만 0~100 을 쓰는 경로도 있어 둘 다 받는다.
export function normalizeProgress(value?: number | null): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

export const progressPercent = (value?: number | null): number => Math.round(normalizeProgress(value));

export function formatPausedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export const isForbiddenError = (cause: unknown): boolean =>
  cause instanceof Error && (/\b403\b/.test(cause.message) || cause.message.includes("internal_admin_required"));

export type GoalPauseOutcome =
  | { ok: true }
  | { ok: false; kind: "reason" | "forbidden" | "error"; message: string };

export type GoalPauseApi = {
  pauseGoal: (goalId: string, reason: string) => Promise<unknown>;
  resumeGoal: (goalId: string) => Promise<unknown>;
};

// 멈춤은 사유가 비면 서버에 보내지 않는다. 서버도 400 으로 막지만 왕복 전에 알린다.
export async function runGoalPauseAction(
  client: GoalPauseApi,
  goalId: string,
  action: { type: "pause"; reason: string } | { type: "resume" },
): Promise<GoalPauseOutcome> {
  try {
    if (action.type === "pause") {
      const reason = action.reason.trim();
      if (!reason) return { ok: false, kind: "reason", message: REASON_REQUIRED_MESSAGE };
      await client.pauseGoal(goalId, reason);
    } else {
      await client.resumeGoal(goalId);
    }
    return { ok: true };
  } catch (cause) {
    if (isForbiddenError(cause)) return { ok: false, kind: "forbidden", message: FORBIDDEN_MESSAGE };
    return {
      ok: false, kind: "error",
      message: cause instanceof Error && cause.message ? cause.message : "처리하지 못했습니다.",
    };
  }
}

// 처리 중에 들어온 같은 요청은 버린다(이중 클릭 방지). 끝나면 다시 받는다.
export function createSingleFlight() {
  let pending = false;
  return {
    get pending() { return pending; },
    async run<T>(task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      if (pending) return { ran: false };
      pending = true;
      try { return { ran: true, value: await task() }; } finally { pending = false; }
    },
  };
}
