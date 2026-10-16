// 목업 검토 화면의 순수 로직 — 타입, 한글 라벨, 오류 매핑, 딥링크, 자산 묶음.
// 서버 계약: aads-server app/api/mockup_reviews.py, app/models/mockup_review.py.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type MockupRevisionRef = {
  revision_id: string; revision: number; manifest_hash: string;
  pointer_applied?: boolean; created_by?: string; created_at?: string;
};
export type MockupRevisionRow = {
  revision_id: string; revision: number; status: string; manifest_hash: string;
  is_latest: boolean; is_approved: boolean; created_at?: string;
};
export type MockupChangeRequest = {
  change_request_id: string; status: string; comment: string; screen_id: string | null;
  requested_by?: string; created_at?: string;
};
export type MockupReview = {
  review_id: string; project: string; title: string; change_type: string;
  session_id: string | null; status: string; generation: number; pointer_generation: number;
  latest_revision: MockupRevisionRef | null; approved_revision: MockupRevisionRef | null;
  pending_change_requests: number;
  revisions: MockupRevisionRow[];
  unresolved_change_requests: MockupChangeRequest[];
};
export type MockupScreen = { screen_id: string; title: string; route: string };
export type MockupAsset = {
  asset_id: string; role: "primary" | "child"; mime: string; url?: string;
  screen_id: string | null; phase: string | null; viewport: string | null; state: string | null;
};
export type MockupRevision = {
  revision_id: string; revision: number; status: string; manifest_hash: string;
  is_latest: boolean; is_approved: boolean;
  manifest: { screens: MockupScreen[]; assets: MockupAsset[] };
};
export type MockupNotification = {
  id: number; kind: string; title: string; body: string; link: string; project: string;
  review_id: string | null; revision_id: string | null; read: boolean; created_at: string;
};

export function asUuid(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return UUID_RE.test(v) ? v : null;
}

export function asProjectKey(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return PROJECT_RE.test(v) ? v : null;
}

export type MockupDeepLink = { reviewId: string; project: string; revisionId: string | null };

// /chat?mockup_review=<id>&mockup_project=<P>[&mockup_revision=<rev>]
export function parseMockupDeepLink(search: string): MockupDeepLink | null {
  const params = new URLSearchParams(search ?? "");
  const reviewId = asUuid(params.get("mockup_review"));
  const project = asProjectKey(params.get("mockup_project"));
  if (!reviewId || !project) return null;
  return { reviewId, project, revisionId: asUuid(params.get("mockup_revision")) };
}

export const MOCKUP_QUERY_KEYS = ["mockup_review", "mockup_project", "mockup_revision"] as const;

// mockup_* 파라미터만 제거한 pathname+search+hash. 바뀔 것이 없으면 null.
export function stripMockupFromUrl(pathname: string, search: string, hash: string): string | null {
  const params = new URLSearchParams(search ?? "");
  let had = false;
  for (const k of MOCKUP_QUERY_KEYS) {
    if (params.has(k)) { had = true; params.delete(k); }
  }
  if (!had) return null;
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ?? ""}`;
}

// CEO 통합 워크스페이스(project_key=CEO)는 전 프로젝트의 목업 검토 알림을 한 배지에서 본다.
export const CEO_PROJECT_KEY = "CEO";
export const CEO_BADGE_PROJECTS: readonly string[] = ["AADS", "KIS", "GO100", "SF", "NTV2", "NAS"];

export function badgeProjects(project: string): string[] {
  const key = (project ?? "").trim().toUpperCase();
  return key === CEO_PROJECT_KEY ? [...CEO_BADGE_PROJECTS] : [project];
}

export type BadgeNotification = MockupNotification & { sourceProject: string };

// 프로젝트별 조회 결과를 합쳐 최신순으로 정렬한다. 실패한 프로젝트(null)는 건너뛴다.
export function mergeBadgeNotifications(
  results: ReadonlyArray<{ project: string; items: MockupNotification[] | null }>,
): BadgeNotification[] {
  const merged: BadgeNotification[] = [];
  for (const r of results) {
    if (!r.items) continue;
    for (const n of r.items) merged.push({ ...n, sourceProject: r.project });
  }
  const time = (n: BadgeNotification) => {
    const t = Date.parse(n.created_at);
    return Number.isNaN(t) ? 0 : t;
  };
  return merged.sort((a, b) => time(b) - time(a) || b.id - a.id);
}

// 알림 link 는 서버가 만든 /chat 상대 경로만 따라간다.
export function safeChatLink(link: string | null | undefined): string | null {
  const v = (link ?? "").trim();
  if (!v.startsWith("/chat") || v.startsWith("//")) return null;
  const next = v.charAt(5);
  return next === "" || next === "?" || next === "#" || next === "/" ? v : null;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  review_ready: "검토 대기",
  approved: "승인됨",
  changes_requested: "수정 요청됨",
  revising: "수정 중",
  revoked: "승인 철회",
  archived_stale: "지난 판본(보관)",
};

export function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  return STATUS_LABEL[s] ?? (s || "알 수 없음");
}

export function statusColor(status: string | null | undefined): string {
  switch (status) {
    case "approved": return "#16a34a";
    case "review_ready": return "#2563eb";
    case "changes_requested": return "#d97706";
    case "revising": return "#7c3aed";
    case "revoked": return "#dc2626";
    default: return "#64748b";
  }
}

export const PHASE_LABEL: Record<string, string> = { before: "이전(Before)", mockup: "목업", implemented: "구현" };
export function phaseLabel(phase: string | null | undefined): string {
  const p = (phase ?? "").trim();
  return PHASE_LABEL[p] ?? (p || "단계 미지정");
}

export const NOTIFICATION_KIND_LABEL: Record<string, string> = {
  review_requested: "목업 검토 요청",
  change_received: "수정 요청 접수",
  re_reported: "수정본 재보고",
  approval_waiting: "승인 대기",
  approved: "승인됨",
  revoked: "승인 철회/반려",
  failed: "실행 게이트 차단",
};
export function notificationKindLabel(kind: string): string {
  return NOTIFICATION_KIND_LABEL[kind] ?? kind;
}

// ---------------------------------------------------------------- 뷰포트

export type ViewportClass = "desktop" | "tablet" | "mobile";
export const VIEWPORT_LABEL: Record<ViewportClass, string> = { desktop: "데스크톱 1440", tablet: "태블릿", mobile: "모바일 390" };

export function viewportClass(viewport: string | null | undefined): ViewportClass {
  const v = (viewport ?? "").trim();
  if (v === "desktop" || v === "mobile" || v === "tablet") return v;
  const width = Number.parseInt(v.split("x")[0] ?? "", 10);
  if (!Number.isFinite(width)) return "desktop";
  return width <= 500 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}

// ---------------------------------------------------------------- 자산 묶음

export type ScreenAssetGroup = {
  screen: MockupScreen;
  viewports: ViewportClass[];
  // viewport 별로 phase(before/mockup/…) 순서대로 나란히 둘 자산
  byViewport: Record<string, MockupAsset[]>;
};

const PHASE_ORDER: Record<string, number> = { before: 0, mockup: 1, implemented: 2 };
const VIEWPORT_ORDER: ViewportClass[] = ["desktop", "tablet", "mobile"];

export function groupAssetsByScreen(rev: Pick<MockupRevision, "manifest">): ScreenAssetGroup[] {
  const screens = rev.manifest?.screens ?? [];
  const assets = (rev.manifest?.assets ?? []).filter((a) => a.role === "primary");
  return screens.map((screen) => {
    const mine = assets.filter((a) => a.screen_id === screen.screen_id);
    const byViewport: Record<string, MockupAsset[]> = {};
    for (const a of mine) {
      (byViewport[viewportClass(a.viewport)] ??= []).push(a);
    }
    for (const list of Object.values(byViewport)) {
      list.sort((x, y) => (PHASE_ORDER[x.phase ?? ""] ?? 9) - (PHASE_ORDER[y.phase ?? ""] ?? 9)
        || (x.state === "default" ? 0 : 1) - (y.state === "default" ? 0 : 1)
        || (x.state ?? "").localeCompare(y.state ?? ""));
    }
    const viewports = VIEWPORT_ORDER.filter((v) => (byViewport[v]?.length ?? 0) > 0);
    return { screen, viewports, byViewport };
  });
}

export function isImageAsset(a: Pick<MockupAsset, "mime">): boolean {
  return (a.mime ?? "").toLowerCase().startsWith("image/");
}

// ---------------------------------------------------------------- 오류 한글화

export type MockupErrorView = {
  status: number;
  code: string | null;
  message: string;
  details: string[];
  /** 서버 상태가 앞서 나갔으므로 화면을 다시 받아야 한다. */
  needsRefresh: boolean;
};

const MISSING_LABEL: Record<string, string> = {
  document_ref_missing: "연결 문서 없음",
  backend_only_rationale_missing: "백엔드 전용 사유 없음",
  screens_missing: "화면 없음",
  redaction_pending: "가림 처리 대기",
  blocked_evidence: "사용할 수 없는 Before 증거",
  mockup_missing: "목업 이미지 없음",
  state_missing: "상태 화면 없음",
  before_missing: "Before 이미지 없음",
  visual_evidence_missing: "시각 증거 없음",
};

const ROLE_LABEL: Record<string, string> = { plan: "계획서", prd: "PRD", spec: "명세서" };

function describeMissing(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const m = raw as Record<string, unknown>;
  const code = String(m.code ?? "");
  const label = MISSING_LABEL[code] ?? (code || "누락 항목");
  const parts: string[] = [];
  if (m.role) parts.push(ROLE_LABEL[String(m.role)] ?? String(m.role));
  if (m.screen_id) parts.push(`화면 ${String(m.screen_id)}`);
  if (m.viewport) parts.push(String(m.viewport));
  if (m.state) parts.push(`상태 ${String(m.state)}`);
  if (m.asset_id) parts.push(`자산 ${String(m.asset_id)}`);
  return parts.length ? `${label} (${parts.join(" · ")})` : label;
}

const CODE_MESSAGE: Record<string, string> = {
  stale_revision: "다른 곳에서 목업이 바뀌었습니다. 새로고침 후 최신 판본을 확인해 주세요.",
  invalid_state: "지금 상태에서는 이 작업을 할 수 없습니다.",
  missing_artifacts: "승인에 필요한 자료가 부족합니다.",
  asset_tampered: "저장된 시안 파일이 승인 시점의 해시와 다릅니다. 승인할 수 없습니다.",
  idempotency_key_conflict: "같은 요청 키로 다른 내용이 이미 처리되었습니다. 새로고침 후 다시 시도해 주세요.",
  change_request_conflict: "같은 수정 요청 번호로 다른 내용이 이미 접수되어 있습니다.",
  empty_comment: "수정 요청 내용을 입력해 주세요.",
  credential_content_rejected: "비밀번호·토큰 같은 민감 정보가 들어 있어 접수하지 않았습니다. 지우고 다시 보내 주세요.",
  unknown_screen: "선택한 화면이 이 판본에 없습니다.",
  source_message_not_found: "수정 요청의 근거가 되는 채팅 메시지를 서버에서 찾지 못했습니다. 이 목업이 연결된 채팅창에서 요청해 주세요.",
  source_message_session_mismatch: "이 목업이 연결된 채팅창과 다른 창의 메시지라서 접수되지 않았습니다.",
  source_message_not_user_message: "수정 요청의 근거 메시지가 사용자 메시지가 아닙니다.",
  review_not_found: "목업 검토 건을 찾을 수 없습니다.",
  revision_not_found: "해당 판본을 찾을 수 없습니다.",
  asset_not_found: "해당 시안 파일을 찾을 수 없습니다.",
};

const STATUS_MESSAGE: Record<number, string> = {
  401: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  403: "이 작업을 할 권한이 없습니다.",
  404: "대상을 찾을 수 없습니다.",
  0: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
};

function detailObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const d = (body as { detail?: unknown }).detail;
  if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, unknown>;
  return null;
}

export function describeMockupError(status: number, body: unknown): MockupErrorView {
  const d = detailObject(body);
  const rawDetail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
  const code = d && typeof d.code === "string" ? d.code : typeof rawDetail === "string" ? rawDetail : null;
  const details: string[] = [];

  if (d && Array.isArray(d.missing)) {
    for (const item of d.missing.slice(0, 20)) details.push(describeMissing(item));
    if (d.missing.length > 20) details.push(`…외 ${d.missing.length - 20}건`);
  }
  if (d && Array.isArray(d.assets)) {
    for (const item of d.assets.slice(0, 10)) details.push(describeMissing(item));
  }
  if (code === "invalid_state" && d) {
    const cur = typeof d.status === "string" ? d.status : null;
    const req = typeof d.required === "string" ? d.required : null;
    if (cur) details.push(`현재 상태: ${statusLabel(cur)}`);
    if (req) details.push(`필요 상태: ${statusLabel(req)}`);
  }
  if (code === "stale_revision" && d && typeof d.latest_revision === "number") {
    details.push(`최신 판본: v${d.latest_revision}`);
  }
  if (code === "missing_artifacts" && d?.blocked_evidence === true) {
    details.push("로그인·오류 화면이 Before 증거로 쓰였습니다.");
  }

  let message = (code && CODE_MESSAGE[code]) || STATUS_MESSAGE[status] || "";
  if (!message) {
    if (status === 422 && Array.isArray(rawDetail)) message = "요청 형식이 올바르지 않습니다. 입력을 확인해 주세요.";
    else if (status === 409) message = "서버 상태와 충돌했습니다. 새로고침 후 다시 시도해 주세요.";
    else if (status === 422) message = "요청을 처리할 수 없습니다.";
    else message = `요청에 실패했습니다 (HTTP ${status}).`;
  }
  const needsRefresh = status === 409 || code === "missing_artifacts" || code === "invalid_state" || code === "stale_revision";
  return { status, code, message, details, needsRefresh };
}

// ---------------------------------------------------------------- 요청 본문

export type ApproveBody = {
  revision_id: string; manifest_hash: string; confirm: true;
  expected_generation: number; idempotency_key: string;
};
export type ChangeBody = {
  change_request_id: string; base_revision_id: string; source_message_id: string;
  comment: string; screen_id: string | null; expected_generation: number; idempotency_key: string;
};

export function approveBody(review: MockupReview, rev: MockupRevision, newKey: string): ApproveBody {
  return {
    revision_id: rev.revision_id, manifest_hash: rev.manifest_hash, confirm: true,
    expected_generation: review.generation, idempotency_key: newKey,
  };
}

export function changeBody(
  review: MockupReview, rev: MockupRevision, input: { comment: string; screenId: string | null },
  ids: { changeRequestId: string; sourceMessageId: string; idempotencyKey: string },
): ChangeBody {
  return {
    change_request_id: ids.changeRequestId, base_revision_id: rev.revision_id,
    source_message_id: ids.sourceMessageId, comment: input.comment.trim(),
    screen_id: input.screenId || null, expected_generation: review.generation,
    idempotency_key: ids.idempotencyKey,
  };
}

// 수정 요청의 근거 메시지 — 서버는 source_message_id 가 실제 채팅 사용자 메시지여야 받는다(없으면 404).
// 임의 UUID 를 만들어 보내지 않는다. 연결 세션이 있으면 그 세션의 메시지만 쓸 수 있다.
export type ChangeSource =
  | { ok: true; messageId: string }
  | { ok: false; reason: "no_message" | "other_session" };

export function resolveChangeSource(
  review: Pick<MockupReview, "session_id"> | null, chatSessionId: string | null | undefined,
  sourceMessageId: string | null | undefined,
): ChangeSource {
  if (review?.session_id && review.session_id !== chatSessionId) return { ok: false, reason: "other_session" };
  const id = asUuid(sourceMessageId);
  return id ? { ok: true, messageId: id } : { ok: false, reason: "no_message" };
}

export function changeSourceNotice(reason: "no_message" | "other_session"): string {
  return reason === "other_session"
    ? "이 목업은 다른 채팅창에 연결돼 있습니다. 연결된 채팅창을 열어 수정 요청을 보내 주세요."
    : "수정 요청은 채팅창에 남긴 내 메시지를 근거로 접수됩니다. 이 채팅창에 메시지를 먼저 보낸 뒤 다시 시도해 주세요.";
}

// 재시도 중복 방지 — 같은 내용의 재전송은 같은 change_request_id·idempotency_key·본문을 다시 보낸다.
export type ChangeAttempt = { fingerprint: string; body: ChangeBody };

export function changeFingerprint(revisionId: string, sourceMessageId: string, comment: string, screenId: string | null): string {
  return JSON.stringify([revisionId, sourceMessageId, comment.trim(), screenId || null]);
}

// 응답을 못 받았거나(네트워크·5xx) 결과를 알 수 없을 때만 같은 요청을 유지한다. 서버가 명확히 거절하면 폐기.
export function keepChangeAttempt(status: number): boolean {
  return status === 0 || status >= 500;
}

// 승인 버튼 활성 조건 — 서버는 최신 판본만 승인한다.
export function canApprove(review: MockupReview | null, rev: MockupRevision | null): boolean {
  return !!review && !!rev && review.status === "review_ready"
    && review.latest_revision?.revision_id === rev.revision_id;
}

export function canRequestChanges(review: MockupReview | null, rev: MockupRevision | null): boolean {
  return !!review && !!rev && review.latest_revision?.revision_id === rev.revision_id
    && ["review_ready", "changes_requested", "revising", "approved"].includes(review.status);
}

export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
