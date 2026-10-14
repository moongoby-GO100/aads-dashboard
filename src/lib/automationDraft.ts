// 자동화 초안 화면의 타입과 순수 함수. 문장은 서버 카드가 만들고, 여기서는 모양만 다룬다.
import { COPY } from "./automationCopy";

export interface AutomationCardButton { id: string; label: string; primary: boolean }
export interface AutomationCardField { id: string; label: string; value: string }

export interface AutomationCard {
  state: string;
  headline: string;
  title: string;
  body: string;
  buttons: AutomationCardButton[];
  fields?: AutomationCardField[];
  needs_domain_confirm?: boolean;
}

export interface AutomationSchedule {
  kind: "once" | "daily" | "weekdays" | "weekly";
  hour: number;
  minute: number;
  day_of_week?: string;
}

export interface AutomationDraftPublic {
  id: string;
  state: string;
  title: string;
  intent_text: string;
  intent: {
    site_name: string;
    url: string;
    domain: string;
    task: string;
    output_kind: string;
    schedule: AutomationSchedule | null;
    needs_domain_confirm: boolean;
  };
  credential_id: string | null;
  failure_code: string | null;
  evidence: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface AutomationCredentialChoice { id: string; display_name: string; host: string; verified: boolean }

export interface AutomationCredentialInfo {
  status: "none" | "single" | "choices" | "requested" | "linked";
  credentials?: AutomationCredentialChoice[];
  requestId?: string;
  request_id?: string;
  host?: string;
  display_name?: string;
  request_error?: string;
}

export interface AutomationDraftView {
  draft: AutomationDraftPublic;
  card: AutomationCard;
  credential?: AutomationCredentialInfo;
  schedule?: { text?: string; active?: boolean; paused?: boolean; next_run?: string | null };
  run?: { status: string; run_id: string | null };
  recording_id?: string;
  progress_event?: string;
}

export type AutomationCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; actual?: string };

export const POLL_FAST_STATES: ReadonlySet<string> = new Set([
  "intent_confirmed", "credential_waiting", "credential_ready", "demonstrating", "revising", "registering",
]);
export const POLL_SLOW_STATES: ReadonlySet<string> = new Set(["pending_approval", "paused_risk", "manual_record"]);
export const FINAL_STATES: ReadonlySet<string> = new Set(["cancelled", "expired", "rejected", "broken", "paused"]);

export const FAST_POLL_MS = 2_000;
export const SLOW_POLL_MS = 6_000;

export function pollIntervalFor(state: string): number | null {
  if (POLL_FAST_STATES.has(state)) return FAST_POLL_MS;
  if (POLL_SLOW_STATES.has(state)) return SLOW_POLL_MS;
  return null;
}

// 카드 위의 "확인 n / 3" 단계. 해당 없는 상태는 null.
export function stepOf(state: string): number | null {
  if (state === "intent_draft") return 1;
  if (state === "intent_confirmed" || state === "credential_waiting") return 2;
  if (state === "result_review") return 3;
  return null;
}

// ── 증거(진행 화면·결과 확인) 해석 ─────────────────────────────────────────

export interface ProgressStep { text: string; status: "done" | "now" | "wait" }

export interface EvidenceView {
  liveFrameUrl: string | null;
  finalShotUrl: string | null;
  capturedAt: string | null;
  steps: ProgressStep[];
  columns: string[];
  rows: string[][];
  note: string;
}

const MAX_PREVIEW_ROWS = 5;
const MAX_CELL_CHARS = 60;

export function safeImageUrl(value: unknown): string | null {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url || url.length > 4_000_000) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) return url;
  return null;
}

export function withCacheBust(url: string, tick: number): string {
  if (url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}_=${tick}`;
}

function cell(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_CELL_CHARS ? `${flat.slice(0, MAX_CELL_CHARS - 1)}…` : flat;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseSteps(raw: unknown, current: unknown): ProgressStep[] {
  if (!Array.isArray(raw)) return [];
  const now = Number.isInteger(current) ? (current as number) : -1;
  const steps: ProgressStep[] = [];
  raw.slice(0, 25).forEach((item, index) => {
    const rec = asRecord(item);
    const text = cell(typeof item === "string" ? item : rec.text ?? rec.label);
    if (!text) return;
    const given = String(rec.status ?? rec.state ?? "").toLowerCase();
    let status: ProgressStep["status"];
    if (given === "done" || given === "now" || given === "wait") status = given;
    else if (now >= 0) status = index < now ? "done" : index === now ? "now" : "wait";
    else status = "wait";
    steps.push({ text, status });
  });
  return steps;
}

function parseTable(raw: unknown, rawColumns: unknown): { columns: string[]; rows: string[][] } {
  if (!Array.isArray(raw) || raw.length === 0) return { columns: [], rows: [] };
  const limited = raw.slice(0, MAX_PREVIEW_ROWS);
  const first = limited[0];
  if (Array.isArray(first)) {
    const columns = Array.isArray(rawColumns) ? rawColumns.map(cell) : [];
    return { columns, rows: limited.map((row) => (Array.isArray(row) ? row.map(cell) : [cell(row)])) };
  }
  const keys = Array.isArray(rawColumns) && rawColumns.length > 0
    ? rawColumns.map(String)
    : Object.keys(asRecord(first));
  return {
    columns: keys.map(cell),
    rows: limited.map((row) => keys.map((key) => cell(asRecord(row)[key]))),
  };
}

export function parseEvidence(evidence: unknown): EvidenceView {
  const rec = asRecord(evidence);
  const table = parseTable(rec.preview_rows, rec.preview_columns);
  return {
    liveFrameUrl: safeImageUrl(rec.live_frame_url),
    finalShotUrl: safeImageUrl(rec.final_screenshot_url),
    capturedAt: typeof rec.captured_at === "string" ? rec.captured_at : null,
    steps: parseSteps(rec.steps, rec.current_step),
    columns: table.columns,
    rows: table.rows,
    note: cell(rec.preview_note),
  };
}

export function progressPercent(steps: readonly ProgressStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "done").length;
  return Math.round((done / steps.length) * 100);
}

export function formatKstTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function scheduleToTimeValue(schedule: AutomationSchedule | null | undefined): string {
  const hour = schedule?.hour ?? 9;
  const minute = schedule?.minute ?? 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const hit = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!hit) return null;
  const hour = Number(hit[1]);
  const minute = Number(hit[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

// ── 채팅에 붙은 카드 목록(캐시일 뿐 — 상태 원본은 서버) ──────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_OPEN_CARDS = 5;

export function asDraftId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(text) ? text.toLowerCase() : null;
}

export function addCardId(ids: readonly string[], id: string): string[] {
  const next = [...ids.filter((x) => x !== id), id];
  return next.slice(-MAX_OPEN_CARDS);
}

export function parseStoredCardIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      const id = asDraftId(item);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.slice(-MAX_OPEN_CARDS);
  } catch {
    return [];
  }
}

export function draftIdFromSearch(search: string): string | null {
  return asDraftId(new URLSearchParams(search ?? "").get("automation_draft"));
}

export function stripDraftFromUrl(pathname: string, search: string, hash: string): string | null {
  const params = new URLSearchParams(search ?? "");
  if (!params.has("automation_draft")) return null;
  params.delete("automation_draft");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ?? ""}`;
}

const DAY_LABEL: Record<string, string> = {
  mon: "월요일", tue: "화요일", wed: "수요일", thu: "목요일", fri: "금요일", sat: "토요일", sun: "일요일",
};

export function describeSchedule(schedule: AutomationSchedule | null | undefined): string {
  if (!schedule) return "";
  const clock = scheduleToTimeValue(schedule);
  switch (schedule.kind) {
    case "daily": return `매일 ${clock}`;
    case "weekdays": return `평일 ${clock}`;
    case "weekly": return `매주 ${DAY_LABEL[schedule.day_of_week ?? ""] ?? ""} ${clock}`.replace("  ", " ");
    default: return `한 번만 ${clock}`;
  }
}

// ── 상태별로 보여도 되는 버튼(서버가 허용하는 전이만) ─────────────────────────

// 서버는 시연을 중단시키는 API 가 없다. 진행 화면에는 중단을 뜻하는 버튼을 두지 않고,
// 카드를 접는 버튼은 시연이 계속된다고 사실대로 적는다. 서버 카드의 cancel('그만두기')은 쓰지 않는다.
export function progressButtons(state: string, demoStartFailed: boolean): AutomationCardButton[] {
  const buttons: AutomationCardButton[] = [];
  if (state === "credential_ready" && demoStartFailed) {
    buttons.push({ id: "retry_demo", label: COPY.startDemo, primary: true });
  }
  buttons.push({ id: "hide_card", label: COPY.hideProgress, primary: false });
  if (state === "revising") buttons.push({ id: "manual_record", label: COPY.manualRecord, primary: false });
  return buttons;
}

// failed 에서 서버가 받는 전이: /demo(retry_demo), 새 초안(relink_login). manual-record 는 revising·manual_record 에서만 받는다(그 외 409).
const FAILED_ALLOWED: ReadonlySet<string> = new Set(["retry_demo", "relink_login", "cancel"]);

// 서버 aads-server app/services/automation_draft_flow.py 의 LOGIN_RETRY_BLOCKED 와 같은 값.
// 이 실패 코드에서 /demo 는 항상 409 login_retry_blocked 로 거절된다.
const LOGIN_RETRY_BLOCKED: ReadonlySet<string> = new Set(["auth_failed", "challenge"]);

export function failedRecoveryButtons(
  buttons: readonly AutomationCardButton[],
  failureCode?: string | null,
): AutomationCardButton[] {
  const retryBlocked = failureCode != null && LOGIN_RETRY_BLOCKED.has(failureCode);
  const allowed = buttons.filter((b) => FAILED_ALLOWED.has(b.id) && !(retryBlocked && b.id === "retry_demo"));
  if (!allowed.some((b) => b.id !== "cancel")) {
    allowed.unshift(
      retryBlocked
        ? { id: "relink_login", label: COPY.relinkLogin, primary: true }
        : { id: "retry_demo", label: COPY.retryDemo, primary: true },
    );
  }
  const promote = retryBlocked && !allowed.some((b) => b.primary);
  return allowed.map((b) => {
    if (b.id === "cancel") return { ...b, label: COPY.closeCard };
    return promote && b.id === "relink_login" ? { ...b, primary: true } : b;
  });
}

// 서버가 시연·직접 보여주기를 멈추는 길이 없는 상태(paused_risk 제외)에서 cancel 은 카드를 닫을 뿐이다.
export function closeOnlyButtons(state: string, buttons: readonly AutomationCardButton[]): AutomationCardButton[] {
  if (state === "paused_risk") return [...buttons];
  return buttons.map((b) => (b.id === "cancel" ? { ...b, label: COPY.closeCard } : b));
}

// intent_confirmed 에서 연결된 계정도 열린 입력 요청도 없으면 [로그인 연결] 은 항상 보인다. 오류 유무와 무관하다.
export function showCredentialConnect(state: string, credential: AutomationCredentialInfo | undefined): boolean {
  if (state !== "intent_confirmed") return false;
  if ((credential?.credentials ?? []).length > 0) return false;
  if (credential?.status === "linked") return false;
  if (credential?.status === "requested" && (credential.requestId || credential.request_id)) return false;
  return true;
}

// 폴링 응답이 request_error 를 지워도 화면에 낸 오류 문구는 로컬에 남긴다.
export function credentialErrorAfter(previous: boolean, credential: AutomationCredentialInfo | undefined): boolean {
  return previous || Boolean(credential?.request_error);
}
