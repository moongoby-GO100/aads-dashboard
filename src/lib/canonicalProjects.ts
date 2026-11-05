// 정본 탭 프로젝트 탐색 레지스트리. goals 화면(통합지시)의 프로젝트 목록과 같은 키를 쓴다.
// 접근 권한은 이 목록이 아니라 GET /projects/{key}/documents 의 grant 검사(401/403)가 결정한다.
export const CANONICAL_NAV_PROJECTS: readonly string[] = [
  "AADS", "ACCT", "GO100", "KIS", "SF", "NTV2", "NAS", "FOOD", "LAW", "COM", "DESIGN", "KAKAOBOT",
];

const PROJECT_KEY = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

export function mergeCanonicalProjects(scanned: readonly string[] = []): string[] {
  const extra = scanned.filter((name) => PROJECT_KEY.test(name));
  return [...new Set([...CANONICAL_NAV_PROJECTS, ...extra])];
}

export type CanonicalApprovalView = "required" | "all";
export type CanonicalApprovalBadge = "required" | "record" | null;

export const CANONICAL_NO_APPROVAL_TEXT = "승인할 문서가 없습니다. 보고서·참고 문서는 승인 없이 기록으로 보관됩니다.";

interface ApprovalFields {
  approval_required?: unknown;
  status: string;
  approved_revision_id?: string | null;
}

// 구버전 서버는 approval_required 를 주지 않고 쿼리 파라미터도 무시한다 → 목록 전체가 기존 화면 그대로 동작해야 한다.
export function isLegacyApprovalList(documents: readonly Pick<ApprovalFields, "approval_required">[]): boolean {
  return documents.length > 0 && documents.some((item) => typeof item.approval_required !== "boolean");
}

// '승인 필요' 배지 / '기록용' 배지 / 배지 없음(승인된 문서는 기존 표시 유지, 서버가 필드를 안 주면 표시 없음).
export function canonicalApprovalBadge(item: ApprovalFields): CanonicalApprovalBadge {
  if (typeof item.approval_required !== "boolean") return null;
  if (item.approval_required) return "required";
  if (item.status === "approved" || item.approved_revision_id) return null;
  return "record";
}

export type CanonicalErrorKind = "auth" | "forbidden" | "conflict" | "network";

export function canonicalErrorKind(error: unknown): CanonicalErrorKind {
  const message = error instanceof Error ? error.message : "";
  const status = /^(?:API error )?(\d{3})\b/.exec(message)?.[1];
  if (status === "401") return "auth";
  if (status === "403") return "forbidden";
  if (status === "409") return "conflict";
  return "network";
}

export const CANONICAL_CONFLICT_FALLBACK = "문서 상태가 변경되었습니다. 새로고침 후 다시 시도하세요.";

const CONFLICT_TEXT: Record<string, (reviewState: string | null) => string> = {
  document_split_required: () => "문서가 너무 길어(5만 자 초과) 검토·승인할 수 없습니다. 문서를 나누어 등록해 주세요.",
  cross_review_required: (state) =>
    `다른 회사 AI의 교차 검토가 필요합니다${state ? `(현재: ${state})` : ""}. 이 요청으로 교차 검토가 자동 시작됩니다. 검토가 끝나면 다시 시도하세요.`,
  approval_not_required: () => "짧은 문서(D1)는 승인 단계 없이 검토만으로 사용합니다.",
  revision_not_in_review: () => "먼저 '검토로 이동'을 눌러야 승인할 수 있습니다.",
  revision_already_decided: () => "이미 승인 또는 보관된 판본입니다. 새로고침해 최신 상태를 확인하세요.",
};

// request() 는 오류 메시지에 `API error 409: <응답 본문>` 을 싣는다. 본문 detail 에서 code·message 를 꺼내 사용자 문구로 바꾼다.
export function canonicalConflictText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const bodyStart = message.indexOf("{");
  let detail: unknown;
  if (bodyStart >= 0) {
    try {
      const body = JSON.parse(message.slice(bodyStart)) as { detail?: unknown };
      detail = body?.detail;
    } catch {
      detail = undefined;
    }
  }
  let code = "";
  let serverMessage = "";
  let reviewState: string | null = null;
  if (typeof detail === "string") {
    code = detail;
  } else if (detail && typeof detail === "object") {
    const d = detail as { code?: unknown; message?: unknown; review_state?: unknown };
    if (typeof d.code === "string") code = d.code;
    if (typeof d.message === "string") serverMessage = d.message;
    if (typeof d.review_state === "string") reviewState = d.review_state;
  }
  const known = CONFLICT_TEXT[code];
  if (known) return known(reviewState);
  if (code && code !== "generation_conflict" && serverMessage) {
    return serverMessage.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 200);
  }
  return CANONICAL_CONFLICT_FALLBACK;
}
