// 승인 결정 호출의 실패를 사용자가 이해할 메시지와 후속 동작으로 나눈다.
//
// 서버는 레시피 등록 카드를 WRITE_EXTERNAL 이상으로 승인할 때 확인 없이 들어오면
// 정확히 HTTP 409 + detail "high_risk_confirmation_required" 로 거절한다. 이것만
// 재확인 대상이다. 같은 409 라도 다른 detail 이면 재시도하지 않는다.

export type ApprovalFailureKind =
  | "high_risk_confirmation"
  | "unauthenticated"
  | "human_required"
  | "self_approval"
  | "forbidden"
  | "not_found"
  | "already_decided"
  | "conflict"
  | "unavailable"
  | "unknown";

export interface ApprovalFailure {
  kind: ApprovalFailureKind;
  status: number;
  message: string;
  /** 서버 상태가 바뀌었을 가능성이 있어 목록을 다시 읽어야 한다 */
  refresh: boolean;
  /** 같은 원인으로 나머지 항목도 모두 실패한다 — 일괄 처리를 멈춘다 */
  stopBatch: boolean;
}

export const HIGH_RISK_DETAIL = "high_risk_confirmation_required";

function statusAndBody(reason: unknown): { status: number; body: string } {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  const matched = raw.match(/^(?:API error )?(\d{3}):\s*([\s\S]*)$/);
  const carried = (reason as { status?: unknown } | null)?.status;
  const status = typeof carried === "number" ? carried : matched ? Number(matched[1]) : 0;
  return { status, body: matched ? matched[2].trim() : raw.trim() };
}

function detailOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (parsed?.detail != null) return "";
  } catch {
    /* JSON 이 아니면 본문 그대로 */
  }
  return body;
}

export function classifyApprovalError(reason: unknown): ApprovalFailure {
  const { status, body } = statusAndBody(reason);
  const detail = detailOf(body);
  const make = (
    kind: ApprovalFailureKind, message: string, refresh = false, stopBatch = false,
  ): ApprovalFailure => ({
    kind, status, refresh, stopBatch,
    message: status > 0 && kind !== "high_risk_confirmation" ? `${message} (HTTP ${status})` : message,
  });

  if (status === 401) {
    return make("unauthenticated", "로그인이 만료되었습니다. 다시 로그인한 뒤 같은 버튼을 눌러 주세요.", false, true);
  }
  if (status === 403) {
    if (detail === "human_decider_required") {
      return make("human_required", "사람 계정으로 로그인해야 결정할 수 있습니다. 자동화·서비스 키로는 승인할 수 없습니다. 대표님 계정으로 다시 로그인해 주세요.", false, true);
    }
    if (detail === "self_approval_blocked" || detail === "self_approval_denied") {
      return make("self_approval", "요청한 계정은 자기 요청을 승인할 수 없습니다. 요청자와 다른 담당자 계정으로 승인해 주세요. 반려는 가능합니다.");
    }
    if (detail === "tenant_mismatch") {
      return make("forbidden", "이 승인 건은 현재 계정의 조직 소속이 아닙니다. 올바른 계정으로 로그인했는지 확인해 주세요.");
    }
    return make("forbidden", "이 승인 건을 결정할 권한이 없습니다. 계정 권한을 확인해 주세요.", false, true);
  }
  if (status === 404) {
    return make("not_found", "이미 처리되었거나 만료된 승인 요청입니다. 목록을 다시 조회했습니다.", true);
  }
  if (status === 409) {
    if (detail === HIGH_RISK_DETAIL) {
      return make("high_risk_confirmation", "외부 쓰기를 포함한 승인이라 한 번 더 확인이 필요합니다.");
    }
    if (detail.startsWith("registration_already_decided")) {
      const state = detail.split(":")[1];
      const label = state === "approved" ? "승인됨" : state === "rejected" ? "반려됨" : "처리됨";
      return make("already_decided", `이미 다른 곳에서 ${label} 상태입니다. 목록을 다시 조회했습니다.`, true);
    }
    return make("conflict", "서버가 이 승인을 받아들이지 않았습니다. 내용이 바뀌었을 수 있으니 목록을 다시 조회한 뒤 확인해 주세요.", true);
  }
  if (status >= 500 || status === 0) {
    return make("unavailable", "서버에 연결하지 못했거나 처리 중 오류가 났습니다. 잠시 뒤 같은 카드에서 다시 시도해 주세요.", false, true);
  }
  return make("unknown", `승인을 처리하지 못했습니다(HTTP ${status}). 같은 카드에서 다시 시도하거나 목록을 다시 조회해 주세요.`);
}

export function buildApprovalDecidePath(
  id: string,
  decision: "approved" | "rejected",
  grant: { scope: string; hours: number; max: number },
  confirmHighRisk = false,
): string {
  const q = decision === "approved"
    ? `decision=approved&scope=${grant.scope}&hours=${grant.hours}`
      + (grant.scope === "single" ? "" : `&max_executions=${grant.max}`)
      + (confirmHighRisk ? "&confirm_high_risk=true" : "")
    : "decision=rejected";
  return `/approvals/${encodeURIComponent(id)}/decide?${q}`;
}

export interface HighRiskRequest {
  id: string;
  epoch: number;
  scope: string;
  tool: string;
  summary: string;
  risk?: string;
}

/** 같은 카드의 재확인 요청은 하나만 둔다 — 두 번 눌러도 대화상자가 쌓이지 않는다 */
export function enqueueHighRisk(queue: HighRiskRequest[], item: HighRiskRequest): HighRiskRequest[] {
  if (queue.some((q) => q.id === item.id)) return queue;
  return [...queue, item];
}

/** 세션이 바뀌었거나(epoch) 카드가 목록에서 사라졌으면(만료·처리됨) 재확인 요청을 버린다 */
export function pruneHighRisk(
  queue: HighRiskRequest[], epoch: number, liveIds: ReadonlySet<string>,
): HighRiskRequest[] {
  const next = queue.filter((q) => q.epoch === epoch && liveIds.has(q.id));
  return next.length === queue.length ? queue : next;
}

export type ApprovalDecisionOutcome =
  | { status: "ok" }
  | { status: "needs_confirm"; failure: ApprovalFailure }
  | { status: "failed"; failure: ApprovalFailure };

/**
 * 한 번만 호출한다. 재확인 요청(needs_confirm)은 호출자가 사용자 확인을 받은 뒤
 * confirmHighRisk=true 로 별도 호출해야 하며, 여기서 자동 재시도하지 않는다.
 */
export async function runApprovalDecision(
  post: (path: string) => Promise<unknown>,
  params: {
    id: string;
    decision: "approved" | "rejected";
    grant: { scope: string; hours: number; max: number };
    confirmHighRisk?: boolean;
  },
): Promise<ApprovalDecisionOutcome> {
  const confirmed = params.confirmHighRisk === true && params.decision === "approved";
  try {
    await post(buildApprovalDecidePath(params.id, params.decision, params.grant, confirmed));
    return { status: "ok" };
  } catch (e) {
    const failure = classifyApprovalError(e);
    if (failure.kind === "high_risk_confirmation") {
      if (params.decision === "approved" && !confirmed) return { status: "needs_confirm", failure };
      return {
        status: "failed",
        failure: {
          ...failure, kind: "conflict", refresh: true,
          message: "서버가 확인 후에도 이 승인을 받아들이지 않았습니다. 목록을 다시 조회한 뒤 내용을 확인해 주세요.",
        },
      };
    }
    return { status: "failed", failure };
  }
}
