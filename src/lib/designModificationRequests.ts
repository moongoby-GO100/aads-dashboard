import type {
  CreateDesignModificationRequestResponse,
  DesignModificationCategory,
  DesignModificationClassification,
  DesignModificationRequest,
  DesignModificationRequestDetailResponse,
  DesignModificationRequestDraft,
  DesignModificationRequestListResponse,
  DesignModificationRequestSource,
  DesignModificationRequestStatus,
} from "@/types";

const STORAGE_KEY = "aads-design-modification-requests";

type CategoryDescriptor = {
  value: DesignModificationCategory;
  label: string;
  hint: string;
  keywords: string[];
};

export const DESIGN_MODIFICATION_CATEGORIES: CategoryDescriptor[] = [
  {
    value: "layout",
    label: "레이아웃",
    hint: "구조, 배치, 카드 순서",
    keywords: ["layout", "grid", "column", "row", "panel", "section", "header", "sidebar", "레이아웃", "배치", "정렬", "구성", "영역", "구조"],
  },
  {
    value: "spacing",
    label: "간격",
    hint: "여백, 밀도, 패딩",
    keywords: ["spacing", "gap", "padding", "margin", "density", "compact", "whitespace", "여백", "간격", "패딩", "마진", "밀도"],
  },
  {
    value: "color_token",
    label: "색상/토큰",
    hint: "팔레트, 대비, 시맨틱 토큰",
    keywords: ["color", "token", "palette", "contrast", "accent", "background", "foreground", "theme", "색상", "토큰", "팔레트", "대비", "테마"],
  },
  {
    value: "typography",
    label: "타이포그래피",
    hint: "폰트, 크기, 행간",
    keywords: ["typography", "font", "heading", "line-height", "letter-spacing", "copy size", "text scale", "폰트", "타이포", "서체", "행간", "자간", "텍스트 크기"],
  },
  {
    value: "component_state",
    label: "컴포넌트 상태",
    hint: "hover, disabled, loading, empty",
    keywords: ["hover", "focus", "active", "disabled", "loading", "error", "empty", "selected", "pressed", "state", "호버", "포커스", "비활성", "로딩", "에러", "빈 상태", "선택 상태"],
  },
  {
    value: "content_tone",
    label: "콘텐츠 톤",
    hint: "카피, 문구, 안내 톤",
    keywords: ["copy", "content", "tone", "message", "wording", "microcopy", "cta", "label", "placeholder", "문구", "카피", "톤", "메시지", "안내문", "버튼명"],
  },
];

export const DESIGN_MODIFICATION_STATUS_LABELS: Record<DesignModificationRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewing: "Reviewing",
  planned: "Planned",
  implemented: "Implemented",
  archived: "Archived",
};

export const EMPTY_DESIGN_MODIFICATION_DRAFT: DesignModificationRequestDraft = {
  title: "",
  current_state: "",
  target_state: "",
  locked_elements: [],
  affected_routes: [],
  affected_components: [],
  acceptance_checks: [],
  notes: "",
  requester: "dashboard",
};

const CATEGORY_ALIASES: Record<string, DesignModificationCategory> = {
  layout: "layout",
  spacing: "spacing",
  "color-token": "color_token",
  "color token": "color_token",
  "color/token": "color_token",
  color_token: "color_token",
  typograph: "typography",
  typography: "typography",
  "component-state": "component_state",
  "component state": "component_state",
  component_state: "component_state",
  "content-tone": "content_tone",
  "content tone": "content_tone",
  content_tone: "content_tone",
};

const STATUS_ALIASES: Record<string, DesignModificationRequestStatus> = {
  draft: "draft",
  submitted: "submitted",
  reviewing: "reviewing",
  review: "reviewing",
  planned: "planned",
  implemented: "implemented",
  done: "implemented",
  archived: "archived",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((entry) => toText(entry)).filter(Boolean).join(", ");
  if (isRecord(value)) return JSON.stringify(value);
  return "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return "";
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

export function parseMultiValueInput(value: string): string[] {
  return uniqueStrings(
    value
      .split(/\r?\n|,/)
      .map((entry) => entry.replace(/^[\-\u2022]\s*/, "").trim())
      .filter(Boolean)
  );
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((entry) => toText(entry)).filter(Boolean));
  }
  if (typeof value === "string") {
    return parseMultiValueInput(value);
  }
  return [];
}

function normalizeCategory(value: unknown): DesignModificationCategory | null {
  const key = toText(value).toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!key) return null;
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[key.replace(/\s/g, "-")] ?? null;
}

function normalizeStatus(value: unknown): DesignModificationRequestStatus | null {
  const key = toText(value).toLowerCase().replace(/\s+/g, " ").trim();
  if (!key) return null;
  return STATUS_ALIASES[key] ?? null;
}

function shorten(text: string, limit = 120): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function buildSummary(targetState: string, currentState: string, notes: string): string {
  const summary = firstText(targetState, currentState, notes);
  return shorten(summary || "디자인 수정 요청");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createDesignModificationClassification(
  draft: Partial<DesignModificationRequestDraft>
): DesignModificationClassification {
  const haystack = [
    draft.title,
    draft.current_state,
    draft.target_state,
    draft.notes,
    ...(draft.locked_elements ?? []),
    ...(draft.affected_routes ?? []),
    ...(draft.affected_components ?? []),
    ...(draft.acceptance_checks ?? []),
  ]
    .map((value) => toText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  const scores = DESIGN_MODIFICATION_CATEGORIES.map((category) => {
    const matchedTerms = uniqueStrings(
      category.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()))
    );
    const score = matchedTerms.length;
    return {
      category: category.value,
      score,
      matched_terms: matchedTerms,
    };
  }).sort((left, right) => right.score - left.score);

  const explicitCategory = draft.category;
  const leadingCategory = scores[0];
  const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
  const suggestedCategory =
    leadingCategory && leadingCategory.score > 0
      ? leadingCategory.category
      : explicitCategory ?? "layout";
  const confidence =
    leadingCategory && leadingCategory.score > 0 && totalScore > 0
      ? Number((leadingCategory.score / totalScore).toFixed(2))
      : explicitCategory
        ? 0.34
        : 0;

  return {
    suggested_category: suggestedCategory,
    confidence,
    scores,
  };
}

export function createDesignModificationRequestEntity(
  draft: DesignModificationRequestDraft,
  source: DesignModificationRequestSource,
  overrides?: Partial<DesignModificationRequest>
): DesignModificationRequest {
  const createdAt = overrides?.created_at ?? nowIso();
  const updatedAt = overrides?.updated_at ?? createdAt;
  const classification = createDesignModificationClassification(draft);
  const category = draft.category ?? classification.suggested_category;

  return {
    id: overrides?.id ?? `dmr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: draft.title.trim(),
    summary: overrides?.summary ?? buildSummary(draft.target_state, draft.current_state, draft.notes ?? ""),
    category: overrides?.category ?? category,
    status: overrides?.status ?? draft.status ?? "draft",
    current_state: overrides?.current_state ?? draft.current_state.trim(),
    target_state: overrides?.target_state ?? draft.target_state.trim(),
    locked_elements: overrides?.locked_elements ?? uniqueStrings(draft.locked_elements),
    affected_routes: overrides?.affected_routes ?? uniqueStrings(draft.affected_routes),
    affected_components: overrides?.affected_components ?? uniqueStrings(draft.affected_components),
    acceptance_checks: overrides?.acceptance_checks ?? uniqueStrings(draft.acceptance_checks),
    requester: overrides?.requester ?? firstText(draft.requester, "dashboard"),
    notes: overrides?.notes ?? firstText(draft.notes),
    classification: overrides?.classification ?? classification,
    created_at: createdAt,
    updated_at: updatedAt,
    source: overrides?.source ?? source,
  };
}

export function normalizeDesignModificationRequest(
  raw: unknown,
  source: DesignModificationRequestSource
): DesignModificationRequest | null {
  if (!isRecord(raw)) return null;

  const draft: DesignModificationRequestDraft = {
    title: firstText(raw.title, raw.name, raw.subject, raw.summary, "Untitled request"),
    category: normalizeCategory(raw.category ?? raw.request_category ?? raw.type) ?? undefined,
    status: normalizeStatus(raw.status) ?? undefined,
    current_state: firstText(raw.current_state, raw.currentState, raw.as_is, raw.before),
    target_state: firstText(raw.target_state, raw.targetState, raw.to_be, raw.after),
    locked_elements: toStringArray(raw.locked_elements ?? raw.lockedElements ?? raw.locked),
    affected_routes: toStringArray(raw.affected_routes ?? raw.affectedRoutes ?? raw.routes ?? raw.route_scope),
    affected_components: toStringArray(raw.affected_components ?? raw.affectedComponents ?? raw.components ?? raw.component_scope),
    acceptance_checks: toStringArray(raw.acceptance_checks ?? raw.acceptanceChecks ?? raw.checks),
    requester: firstText(raw.requester, raw.requested_by, raw.created_by, raw.author),
    notes: firstText(raw.notes, raw.description, raw.context, raw.detail),
  };

  const normalized = createDesignModificationRequestEntity(draft, source, {
    id: firstText(raw.id, raw.request_id, raw.uuid) || undefined,
    summary: firstText(raw.summary, raw.description) || undefined,
    created_at: firstText(raw.created_at, raw.createdAt, raw.requested_at) || undefined,
    updated_at: firstText(raw.updated_at, raw.updatedAt, raw.modified_at, raw.requested_at) || undefined,
  });

  const classification = createDesignModificationClassification({
    ...draft,
    category: normalizeCategory(raw.category ?? raw.request_category ?? raw.type) ?? normalized.category,
  });

  return {
    ...normalized,
    category: normalizeCategory(raw.category ?? raw.request_category ?? raw.type) ?? classification.suggested_category,
    status: normalizeStatus(raw.status) ?? normalized.status,
    summary: firstText(raw.summary, raw.description, normalized.summary),
    classification,
  };
}

function sortRequests(items: DesignModificationRequest[]): DesignModificationRequest[] {
  return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function normalizeDesignModificationListResponse(
  raw: unknown,
  meta: Omit<DesignModificationRequestListResponse, "items" | "total">
): DesignModificationRequestListResponse {
  const rawItems = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? (Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.requests)
          ? raw.requests
          : Array.isArray(raw.data)
            ? raw.data
            : [])
      : [];

  const items = sortRequests(
    rawItems
      .map((item) => normalizeDesignModificationRequest(item, meta.source))
      .filter((item): item is DesignModificationRequest => item !== null)
  );

  const total =
    isRecord(raw) && typeof raw.total === "number"
      ? raw.total
      : items.length;

  return {
    ...meta,
    items,
    total,
  };
}

export function normalizeDesignModificationDetailResponse(
  raw: unknown,
  meta: Omit<DesignModificationRequestDetailResponse, "item">
): DesignModificationRequestDetailResponse {
  const rawItem =
    isRecord(raw) && "item" in raw
      ? raw.item
      : isRecord(raw) && "request" in raw
        ? raw.request
        : isRecord(raw) && "data" in raw
          ? raw.data
          : raw;

  return {
    ...meta,
    item: normalizeDesignModificationRequest(rawItem, meta.source),
  };
}

function readStoredRequests(): DesignModificationRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return sortRequests(
      parsed
        .map((item) => normalizeDesignModificationRequest(item, "local_stub"))
        .filter((item): item is DesignModificationRequest => item !== null)
    );
  } catch {
    return [];
  }
}

function writeStoredRequests(items: DesignModificationRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listLocalDesignModificationRequests(): DesignModificationRequest[] {
  return readStoredRequests();
}

export function getLocalDesignModificationRequest(id: string): DesignModificationRequest | null {
  return readStoredRequests().find((item) => item.id === id) ?? null;
}

export function saveLocalDesignModificationRequest(
  draft: DesignModificationRequestDraft
): CreateDesignModificationRequestResponse {
  const item = createDesignModificationRequestEntity(draft, "local_stub");
  const nextItems = [item, ...readStoredRequests().filter((existing) => existing.id !== item.id)];
  writeStoredRequests(sortRequests(nextItems));
  return {
    item,
    source: "local_stub",
    api_available: false,
    message: "백엔드 API가 아직 연결되지 않아 브라우저 로컬 draft로 저장했습니다.",
  };
}

export function buildLocalDesignModificationListResponse(message?: string): DesignModificationRequestListResponse {
  const items = listLocalDesignModificationRequests();
  return {
    items,
    total: items.length,
    source: "local_stub",
    api_available: false,
    message: message ?? "백엔드 API를 찾지 못해 로컬 draft만 표시합니다.",
  };
}

export function buildLocalDesignModificationDetailResponse(
  id: string,
  message?: string
): DesignModificationRequestDetailResponse {
  return {
    item: getLocalDesignModificationRequest(id),
    source: "local_stub",
    api_available: false,
    message: message ?? "백엔드 detail API를 찾지 못해 로컬 draft detail을 표시합니다.",
  };
}
