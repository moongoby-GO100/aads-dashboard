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
export type MockupChangeReportItem = {
  change_request_id: string; sequence: number; source_message_id: string; screen_id: string | null;
  original_text: string; status: string; queued?: boolean; requested_at?: string;
  base_revision: { revision_id: string; revision: number | null } | null;
  new_revision: { revision_id: string; revision: number | null } | null;
  outcome: string | null; outcome_reason: string | null;
};
export type MockupChangeReport = { review_id: string; status: string; generation: number; change_requests: MockupChangeReportItem[] };
export type MockupScreen = { screen_id: string; title: string; route: string };
export type MockupAsset = {
  asset_id: string; role: "primary" | "child"; mime: string; url?: string; uri?: string; filename?: string; sha256?: string;
  screen_id: string | null; phase: string | null; viewport: string | null; state: string | null;
};
export type MockupDocRef = {
  role: string; document_key?: string | null; revision_id?: string | null; content_hash?: string | null;
  exempt_reason?: string | null; exempt_policy_ref?: string | null;
};
export type MockupRevision = {
  revision_id: string; revision: number; status: string; manifest_hash: string;
  is_latest: boolean; is_approved: boolean;
  parent_revision_id?: string | null; doc_refs?: MockupDocRef[];
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

// ---- 목업 보관함(목록) ----
// 서버 계약: GET /projects/{p}/mockup-reviews → {items, total}(total 은 프로젝트 전체 건수). latest_revision 은 판 번호(정수).
export type MockupReviewListItem = {
  review_id: string; title: string; status: string;
  project?: string; session_id?: string | null; goal_id?: string | null;
  latest_revision_id?: string | null; latest_revision?: number | null;
  link?: string | null; updated_at?: string | null;
};
export type MockupReviewListResponse = { items: MockupReviewListItem[]; total: number };
export type ArchiveReview = MockupReviewListItem & { sourceProject: string };

export const ARCHIVE_STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "review_ready", label: "검토 대기" },
  { value: "approved", label: "승인됨" },
];
export const ARCHIVE_PAGE_LIMIT = 50;

export type ArchiveProjectPage = { project: string; items: MockupReviewListItem[] | null; total: number };

// 더 불러올 프로젝트와 다음 offset. 실패(items null)한 프로젝트는 제외하고, total 이 불확실하면 한 페이지가 꽉 찼을 때만 이어서 받는다.
export function archiveNextOffsets(pages: ReadonlyArray<ArchiveProjectPage>): Array<{ project: string; offset: number }> {
  const out: Array<{ project: string; offset: number }> = [];
  for (const pg of pages) {
    if (pg.items && pg.items.length > 0 && pg.items.length < pg.total) out.push({ project: pg.project, offset: pg.items.length });
  }
  return out;
}

// 프로젝트별 목록을 합쳐 최근 수정순으로 정렬한다. 실패한 프로젝트(null)는 건너뛰고, 같은 목업은 한 번만 낸다.
export function mergeArchiveReviews(
  results: ReadonlyArray<{ project: string; items: MockupReviewListItem[] | null }>,
): ArchiveReview[] {
  const seen = new Set<string>();
  const merged: ArchiveReview[] = [];
  for (const r of results) {
    if (!r.items) continue;
    for (const it of r.items) {
      const key = `${r.project}:${it.review_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...it, sourceProject: it.project || r.project });
    }
  }
  const time = (x: ArchiveReview) => {
    const t = Date.parse(x.updated_at ?? "");
    return Number.isNaN(t) ? 0 : t;
  };
  return merged.sort((a, b) => time(b) - time(a) || (a.review_id < b.review_id ? 1 : a.review_id > b.review_id ? -1 : 0));
}

// 가장 최근 판 번호. 모르면 null.
export function archiveRevisionNumber(item: MockupReviewListItem): number | null {
  const n = item.latest_revision;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// 목록 행 → 기존 패널이 쓰는 MockupDeepLink. 서버 link 가 유효하면 그 값을, 아니면 필드로 만든다.
export function reviewToDeepLink(item: ArchiveReview): MockupDeepLink | null {
  const link = safeChatLink(item.link);
  if (link) {
    const q = link.indexOf("?");
    if (q >= 0) {
      const parsed = parseMockupDeepLink(link.slice(q).split("#")[0]);
      if (parsed) return parsed;
    }
  }
  const reviewId = asUuid(item.review_id);
  const project = asProjectKey(item.sourceProject);
  if (!reviewId || !project) return null;
  return { reviewId, project, revisionId: asUuid(item.latest_revision_id) };
}

export function archiveEmptyMessage(sessionOnly: boolean, status: string): string {
  if (sessionOnly) return "이 세션에 연결된 목업이 없습니다";
  const label = ARCHIVE_STATUS_FILTERS.find((f) => f.value === status)?.label;
  return status && label ? `'${label}' 상태의 목업이 없습니다` : "아직 목업이 없습니다";
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
  /** 대상이 둘 이상이라 서버가 거절했을 때 후보 review_id. */
  candidates: string[];
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
  session_not_found: "채팅 세션을 찾을 수 없습니다. 세션을 다시 열어 주세요.",
  reply_target_not_found: "답장한 메시지를 서버에서 찾지 못했습니다.",
  reply_target_session_mismatch: "답장한 메시지가 이 채팅창의 것이 아닙니다.",
  review_target_conflict: "답장·선택한 목업과 수정 요청 대상이 서로 달라 접수하지 않았습니다. 대상을 다시 고르세요.",
  artifact_not_a_mockup: "선택한 아티팩트는 목업 검토 건이 아닙니다.",
  artifact_not_found: "선택한 아티팩트를 찾을 수 없습니다.",
  review_session_mismatch: "이 목업은 다른 채팅창에 연결돼 있어 접수하지 않았습니다.",
  review_target_not_found: "이 채팅창에서 수정할 수 있는 목업을 찾지 못했습니다.",
  ambiguous_review_target: "수정할 수 있는 목업이 둘 이상입니다. 대상 목업을 골라 주세요.",
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
  const candidates = d && Array.isArray(d.candidates) ? d.candidates.filter((c): c is string => typeof c === "string") : [];
  if (candidates.length) details.push(`후보 ${candidates.length}건`);
  return { status, code, message, details, needsRefresh, candidates };
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

// ---------------------------------------------------------------- 이미지 확대 보기

export const PANEL_WIDE_STORAGE_KEY = "aads_mockup_panel_wide";
export const PANEL_WIDTH_NORMAL = "min(640px, 94vw)";
export const PANEL_WIDTH_WIDE = "min(1480px, 96vw)";

export function parsePanelWide(raw: string | null | undefined): boolean {
  return raw === "1";
}

export function panelWidthCss(wide: boolean, narrow: boolean): string {
  if (narrow) return "100vw";
  return wide ? PANEL_WIDTH_WIDE : PANEL_WIDTH_NORMAL;
}

export type ZoomMode = "fit" | "original";

/** 확대 보기에서 이미지에 곱할 배율. 화면 맞춤은 원본보다 키우지 않는다. */
export function zoomScale(mode: ZoomMode, naturalW: number, naturalH: number, boxW: number, boxH: number): number {
  if (!(naturalW > 0) || !(naturalH > 0)) return 1;
  if (mode === "original") return 1;
  if (!(boxW > 0) || !(boxH > 0)) return 1;
  return Math.min(1, boxW / naturalW, boxH / naturalH);
}

/** 이전/다음 이동. 처음·끝에서는 멈춘다(순환하지 않는다). */
export function stepZoomIndex(index: number, delta: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, index + delta));
}

// URI is used only as a display name; browser navigation always uses the authenticated viewer.
export function mockupHtmlFilename(asset: MockupAsset): string {
  if (asset.filename) return asset.filename;
  const name = (asset.uri || asset.url || "").split(/[?#]/)[0].split("/").pop() || asset.asset_id;
  try { return decodeURIComponent(name); } catch { return name; }
}
export function mockupHtmlLink(project: string, review: string, revision: string, asset: string): string {
  return `/mockups/view?${new URLSearchParams({ project, review, revision, asset })}`;
}

// ---------------------------------------------------------------- 채팅 카드 → 같은 아티팩트 패널

export type MockupBinding = { project: string; reviewId: string; revisionId: string | null };

// 채팅 아티팩트 metadata 가 목업 검토 건을 가리키면 같은 아티팩트 패널에서 검토 화면으로 연다.
// 서버 resolve_change_target 이 읽는 키와 같다(metadata.mockup_review_id).
export function mockupBindingFromArtifact(metadata: Record<string, unknown> | null | undefined): MockupBinding | null {
  if (!metadata || typeof metadata !== "object") return null;
  const reviewId = asUuid(typeof metadata.mockup_review_id === "string" ? metadata.mockup_review_id : null);
  const project = asProjectKey(typeof metadata.mockup_project === "string" ? metadata.mockup_project : null);
  if (!reviewId || !project) return null;
  return { project, reviewId, revisionId: asUuid(typeof metadata.mockup_revision_id === "string" ? metadata.mockup_revision_id : null) };
}

// 딥링크가 가리키는 검토 건의 카드. 같은 검토 건·같은 프로젝트일 때만 찾는다(링크 값만으로 다른 건에 붙이지 않는다).
export function findMockupArtifact<T extends { metadata?: Record<string, unknown> | null }>(
  artifacts: readonly T[], link: Pick<MockupDeepLink, "reviewId" | "project">,
): T | undefined {
  return artifacts.find((a) => {
    const b = mockupBindingFromArtifact(a.metadata);
    return !!b && b.reviewId === link.reviewId && b.project === link.project;
  });
}

// 카드가 열 판. 딥링크의 mockup_revision 이 같은 검토 건을 가리키면 그 판, 아니면 카드 metadata 의 판.
export function bindingRevisionFor(
  binding: MockupBinding, hint: { reviewId: string; project: string; revisionId: string | null } | null | undefined,
): string | null {
  if (hint && hint.revisionId && hint.reviewId === binding.reviewId && hint.project === binding.project) return hint.revisionId;
  return binding.revisionId;
}

// ---------------------------------------------------------------- 전후 비교·수정 문서

export type ComparePair = { state: string; cur: MockupAsset; prev: MockupAsset | null; changed: boolean };

// 같은 화면·크기에서 이 판의 목업 이미지와 직전 판의 같은 상태 이미지를 짝지운다. 해시를 모르면 바뀐 것으로 본다.
export function pairWithPreviousRevision(
  cur: Pick<MockupRevision, "manifest">, prev: Pick<MockupRevision, "manifest"> | null, screenId: string, viewport: ViewportClass,
): ComparePair[] {
  const pick = (rev: Pick<MockupRevision, "manifest">) => (rev.manifest?.assets ?? []).filter((a) =>
    a.role === "primary" && a.screen_id === screenId && viewportClass(a.viewport) === viewport
    && (a.phase === "mockup" || a.phase === "implemented") && isImageAsset(a));
  const before = prev ? pick(prev) : [];
  return pick(cur).map((a) => {
    const state = a.state ?? "default";
    const match = before.find((b) => (b.state ?? "default") === state && b.phase === a.phase) ?? null;
    const changed = !match || !match.sha256 || !a.sha256 || match.sha256 !== a.sha256;
    return { state, cur: a, prev: match, changed };
  });
}

export const DOC_ROLE_LABEL: Record<string, string> = { plan: "계획서", prd: "PRD", spec: "명세서" };

export function docRefLabel(ref: MockupDocRef): string {
  const role = DOC_ROLE_LABEL[ref.role] ?? ref.role;
  if (ref.exempt_reason) return `${role} · 면제: ${ref.exempt_reason}`;
  return `${role} · ${ref.document_key ?? "문서 키 없음"}${ref.content_hash ? ` · ${ref.content_hash.slice(0, 8)}` : ""}`;
}

export function outcomeLabel(item: Pick<MockupChangeReportItem, "outcome" | "status">): string {
  if (item.outcome === "applied") return "반영됨";
  if (item.outcome === "not_applied") return "미반영";
  return item.status === "resolved" ? "처리됨" : "대기·진행 중";
}

// ---------------------------------------------------------------- 수정 요청 대상 고정

export type MockupTarget = {
  sessionId: string; project: string; reviewId: string; revisionId: string | null;
  artifactId: string | null; screenId: string | null; title: string;
  /** 대상을 고른 시점의 서버 generation. 그 뒤 새 판이 올라왔으면 서버가 구버전으로 거절한다. */
  generation: number | null;
};
export type TargetVia = "reply" | "panel" | "chosen";
export type TargetResolution =
  | { kind: "none" }
  | { kind: "target"; target: MockupTarget; via: TargetVia }
  | { kind: "ambiguous"; reason: "reply_vs_panel" | "choose"; candidates: MockupTarget[] };

export function targetKey(t: Pick<MockupTarget, "project" | "reviewId">): string {
  return `${t.project}:${t.reviewId}`;
}

// 답장한 메시지의 카드 > 열려 있는 패널 > 직접 고른 후보. 다른 세션의 대상은 쓰지 않고, 후보가 하나뿐이어도 자동으로 고르지 않는다.
export function resolveMockupTarget(input: {
  sessionId: string; reply: MockupTarget | null; panel: MockupTarget | null;
  candidates: readonly MockupTarget[]; chosenKey: string | null;
}): TargetResolution {
  const inSession = (t: MockupTarget | null) => (t && t.sessionId === input.sessionId ? t : null);
  const reply = inSession(input.reply);
  const panel = inSession(input.panel);
  const candidates = input.candidates.filter((c) => c.sessionId === input.sessionId);
  const chosen = input.chosenKey ? [reply, panel, ...candidates].find((c) => c && targetKey(c) === input.chosenKey) ?? null : null;
  if (reply && panel && targetKey(reply) !== targetKey(panel)) {
    return chosen ? { kind: "target", target: chosen, via: "chosen" } : { kind: "ambiguous", reason: "reply_vs_panel", candidates: [reply, panel] };
  }
  if (reply) return { kind: "target", target: reply, via: "reply" };
  if (panel) return { kind: "target", target: panel, via: "panel" };
  if (chosen) return { kind: "target", target: chosen, via: "chosen" };
  return candidates.length ? { kind: "ambiguous", reason: "choose", candidates } : { kind: "none" };
}

export type IntakeBody = {
  idempotency_key: string; expected_generation: number | null; change_request_id: string;
  session_id: string; source_message_id: string; comment: string;
  review_id: string; artifact_id: string | null; reply_to_id: string | null; screen_id: string | null;
};

// 서버 /change-intake 본문. 대상 review 는 항상 명시하고, 서버가 답장·아티팩트 단서와 어긋나면 거절한다.
export function intakeBody(
  target: MockupTarget, ids: { changeRequestId: string; idempotencyKey: string; sourceMessageId: string },
  comment: string, replyToId: string | null,
): IntakeBody {
  return {
    idempotency_key: ids.idempotencyKey, expected_generation: target.generation, change_request_id: ids.changeRequestId,
    session_id: target.sessionId, source_message_id: ids.sourceMessageId, comment: comment.trim(),
    review_id: target.reviewId, artifact_id: asUuid(target.artifactId), reply_to_id: asUuid(replyToId), screen_id: target.screenId,
  };
}

export type PersistedUserMessage = { id: string; role: string; content: string; created_at?: string };

// 전송 직후 저장된 내 메시지를 찾는다. 같은 내용의 가장 최근 메시지만 인정하고, 못 찾으면 null(등록하지 않는다).
export function findPersistedUserMessage(messages: readonly PersistedUserMessage[], content: string, sentAtMs: number): PersistedUserMessage | null {
  const since = sentAtMs - 10_000;
  const hits = messages
    .filter((m) => m.role === "user" && m.content === content && asUuid(m.id) && (!m.created_at || Date.parse(m.created_at) >= since))
    .sort((a, b) => (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0));
  return hits[0] ?? null;
}
