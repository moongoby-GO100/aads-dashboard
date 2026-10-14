// '내 자동화' 목록 화면의 타입과 순수 함수. 상태 문장·시각 서식은 여기서만 만든다.

export type AutomationStatus = "available" | "waiting" | "broken" | "expired";
export type AutomationTab = "all" | AutomationStatus;

export interface AutomationLastRun { status: string; at: string | null }

export interface AutomationAdminDetail {
  source: string;
  owner: string;
  state: string;
  version: string;
  fragments: string;
}

export interface AutomationListItem {
  key: string;
  name: string;
  status: AutomationStatus;
  statusLabel: string;
  lastRun: AutomationLastRun | null;
  nextRun: string | null;
  draftId: string | null;
  detail: AutomationAdminDetail | null;
}

export interface AutomationListView {
  items: AutomationListItem[];
  unavailableSources: string[];
}

export const AUTOMATION_TABS: readonly { id: AutomationTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "available", label: "사용 가능" },
  { id: "waiting", label: "확인 대기" },
  { id: "broken", label: "고장" },
];

const STATUS_LABEL: Record<AutomationStatus, string> = {
  available: "사용 가능",
  waiting: "확인 기다리는 중",
  broken: "고장",
  expired: "만료",
};

const STATUSES: ReadonlySet<string> = new Set(["available", "waiting", "broken", "expired"]);

const DRAFT_KEY = /^draft:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDetail(raw: unknown): AutomationAdminDetail | null {
  const rec = record(raw);
  if (!rec) return null;
  const fragments = Array.isArray(rec.fragments) ? String(rec.fragments.length) : text(rec.fragments);
  return {
    source: text(rec.source),
    owner: text(rec.owner),
    state: text(rec.state),
    version: text(rec.version),
    fragments,
  };
}

function parseItem(raw: unknown): AutomationListItem | null {
  const rec = record(raw);
  if (!rec) return null;
  const key = text(rec.key);
  const status = text(rec.status);
  if (!key || !STATUSES.has(status)) return null;
  const run = record(rec.last_run);
  const draftId = DRAFT_KEY.test(key) ? key.slice("draft:".length) : null;
  return {
    key,
    name: text(rec.name),
    status: status as AutomationStatus,
    statusLabel: text(rec.status_label) || STATUS_LABEL[status as AutomationStatus],
    lastRun: run ? { status: text(run.status), at: text(run.at) || null } : null,
    nextRun: text(rec.next_run) || null,
    draftId,
    detail: parseDetail(rec.detail),
  };
}

export function parseAutomationList(raw: unknown): AutomationListView {
  const rec = record(raw);
  const list = Array.isArray(rec?.automations) ? rec.automations : [];
  const items: AutomationListItem[] = [];
  for (const entry of list) {
    const item = parseItem(entry);
    if (item) items.push(item);
  }
  const unavailable = Array.isArray(rec?.unavailable_sources) ? rec.unavailable_sources.map(text).filter(Boolean) : [];
  return { items, unavailableSources: unavailable };
}

export function filterByTab(items: readonly AutomationListItem[], tab: AutomationTab): AutomationListItem[] {
  return tab === "all" ? [...items] : items.filter((item) => item.status === tab);
}

export function countByTab(items: readonly AutomationListItem[]): Record<AutomationTab, number> {
  return {
    all: items.length,
    available: filterByTab(items, "available").length,
    waiting: filterByTab(items, "waiting").length,
    broken: filterByTab(items, "broken").length,
    expired: filterByTab(items, "expired").length,
  };
}

export type AutomationAction = "run" | "pause" | "resume" | "fix";

// 서버는 run·pause·resume 을 대화로 만든 자동화(draft:) 에만 받는다. 그 밖의 출처는 항상 409 이므로 버튼을 두지 않는다.
export function actionsFor(item: AutomationListItem): AutomationAction[] {
  if (!item.draftId) return [];
  if (item.status === "available") return ["run", item.nextRun ? "pause" : "resume"];
  if (item.status === "broken") return ["fix"];
  return [];
}

const KST_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  return KST_FORMAT.format(time).replace(/\s+/g, " ").replace(/ 24:/, " 00:");
}

const RUN_OK = new Set(["succeeded", "success", "completed", "done", "ok"]);
const RUN_FAILED = new Set(["failed", "error", "blocked"]);
const RUN_ACTIVE = new Set(["running", "started", "in_progress", "pending", "queued"]);

export function runStatusLabel(status: string): string {
  const code = status.toLowerCase();
  if (RUN_OK.has(code)) return "성공";
  if (RUN_FAILED.has(code)) return "실패";
  if (RUN_ACTIVE.has(code)) return "진행 중";
  return "기록 있음";
}

export function lastRunText(run: AutomationLastRun | null): string {
  if (!run) return "아직 없어요";
  const when = formatWhen(run.at);
  const label = runStatusLabel(run.status);
  return when ? `${when} · ${label}` : label;
}

export function nextRunText(nextRun: string | null): string {
  return formatWhen(nextRun) || "예정 없음";
}

const SOURCE_LABEL: Record<string, string> = {
  draft: "대화로 만든 자동화",
  work_recipe: "업무 자동화 보관함",
  browser_recipe: "브라우저 자동화",
  ovis_recipe: "오비스 자동화",
};

export function sourceLabel(source: string): string {
  const name = SOURCE_LABEL[source];
  return name ? `${name} (${source})` : source || "-";
}

export interface DetailRow { label: string; value: string }

// 관리자 [자세히]. 서버가 아직 안 보내는 값은 숨기지 않고 '아직 제공되지 않음'으로 적는다.
export function detailRows(item: AutomationListItem): DetailRow[] {
  const detail = item.detail;
  if (!detail) return [];
  const pending = "아직 제공되지 않음";
  return [
    { label: "내부 식별자", value: item.key },
    { label: "출처", value: sourceLabel(detail.source) },
    { label: "만든 사람", value: detail.owner || "-" },
    { label: "내부 상태", value: detail.state || "-" },
    { label: "버전", value: detail.version || pending },
    { label: "조각", value: detail.fragments || pending },
  ];
}
