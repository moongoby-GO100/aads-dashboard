// 채팅 상단 목표 띠 칩·휴면 정리 카드 표시 로직 (순수 함수).
// 정본: PRD goal-priority-dormancy-autoapproval-display-prd rev5 §3·§5·§6-1,
//       설계 aads-goal-strip-dormancy-card-mockup-v1 (승인 목업 b90bbca3 / c22f3fb1).
// 서버가 내려준 판정(strip_group·strip_order·dormant·activity·auto_approval·cleanup_lane)을 그대로 쓰고,
// 서버 값이 없는 구서버 응답에서만 같은 규칙으로 직접 판정한다.
// 드롭다운 전환: PRD aads-goal-strip-dropdown-prd rev1 GD-1~GD-13, 설계 명세 aads-goal-strip-dropdown-spec rev1 §3-1.

export type StripActivity = "working" | "awaiting" | null;

export type AutoApprovalState =
  | "manual" | "high" | "all" | "exhausted" | "off" | "delegated" | "paused" | "expired";

export interface AutoApprovalView {
  state?: string | null;
  used?: number | null;
  max?: number | null;
  expires_at?: string | null;
  set_by?: string | null;
  set_at?: string | null;
  max_risk_tier?: string | null;
}

export type CleanupLane = "dormant" | "blocked_resolution" | null;

/** GET /goals/for-session/{sid} 의 목표 한 줄. */
export interface StripGoal {
  goal_id: string;
  title: string;
  status: string;
  project?: string;
  progress: number;
  milestone: string | null;
  dispatch_note: string | null;
  is_lead?: boolean;
  priority?: string | null;
  priority_rank?: number | null;
  dormant?: boolean;
  dormant_reason?: string | null;
  activity?: StripActivity;
  strip_rank?: number | null;
  current_runner?: { job_id: string; status: string } | null;
  goal_paused?: boolean;
  goal_paused_reason?: string | null;
  strip_group?: string | null;
  strip_order?: number | null;
  last_activity_at?: string | null;
}

/** GET /goals 의 목표 한 줄 중 띠·카드가 쓰는 부분. */
export interface GoalSignal {
  goal_id: string;
  title: string;
  status: string;
  project?: string;
  priority?: string | null;
  priority_rank?: number | null;
  last_activity_at?: string | null;
  dormant?: boolean;
  dormant_reason?: string | null;
  cleanup_lane?: CleanupLane;
  auto_approval?: AutoApprovalView | null;
}

export type StripChipGoal = StripGoal & {
  auto_approval?: AutoApprovalView | null;
};

const DAY_MS = 86_400_000;
export const P0_IDLE_WARN_DAYS = 7;
export const AA_WARN_RATIO = 0.8;
export const AA_EXPIRY_WARN_DAYS = 7;
export const STRIP_OPEN_STATUSES = ["draft", "active", "blocked"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_ID_RE = /^(?:runner|job|goal|ms|milestone)[-_][0-9a-z]{6,}$/i;

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function isP0(priority: string | null | undefined): boolean {
  return String(priority || "").trim().toUpperCase().startsWith("P0");
}

/** 칩 이름. `#번호` 는 그 번호, 아니면 괄호 부연을 떼고 12자. 내부 ID 모양이면 업무명 대신 프로젝트로 대체한다. */
export function shortGoalTitle(title: string, project?: string | null): string {
  const t = (title || "").trim();
  if (!t || UUID_RE.test(t) || INTERNAL_ID_RE.test(t)) {
    const p = (project || "").trim();
    return p ? `${p} 목표` : "이름 없는 목표";
  }
  const numbered = t.match(/^#\s*(\d+)/);
  if (numbered) return `#${numbered[1]}`;
  const noParens = t.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim();
  return noParens.length > 12 ? `${noParens.slice(0, 12)}…` : noParens;
}

/** 목록 줄 제목: 전체 제목을 쓰되, 내부 ID 모양이면 업무명 대신 프로젝트로 대체한다. */
export function goalDisplayTitle(title: string, project?: string | null): string {
  const t = (title || "").trim();
  return !t || UUID_RE.test(t) || INTERNAL_ID_RE.test(t) ? shortGoalTitle(title, project) : t;
}

export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  const t = toMs(iso);
  if (t === null) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

export type PriorityBadge = { text: string; tone: "p0" | "p1" | "p2" | "other"; critical: boolean };

export function priorityBadge(priority: string | null | undefined): PriorityBadge | null {
  const p = String(priority || "").trim().toUpperCase();
  if (!p) return null;
  if (p === "P0-CRITICAL" || p === "P0 CRITICAL") return { text: "P0 CRITICAL", tone: "p0", critical: true };
  if (p.startsWith("P0")) return { text: "P0", tone: "p0", critical: false };
  if (p === "P1") return { text: "P1", tone: "p1", critical: false };
  if (p === "P2") return { text: "P2", tone: "p2", critical: false };
  return { text: p.slice(0, 4), tone: "other", critical: false };
}

export function activityIcon(activity: StripActivity | undefined): string | null {
  if (activity === "working") return "🔄";
  if (activity === "awaiting") return "⏳";
  return null;
}

function priorityRankOf(g: Pick<StripGoal, "priority_rank" | "priority">): number {
  if (typeof g.priority_rank === "number") return g.priority_rank;
  const p = String(g.priority || "").trim().toUpperCase();
  const table: Record<string, number> = { "P0-CRITICAL": 0, P0: 1, P1: 2, P2: 3, P3: 4 };
  return table[p] ?? 9;
}

// ── 드롭다운 목록: 7그룹·정렬·순서 고정 ─────────────────────────────────────────
export type DropdownGroupKey = "working" | "awaiting" | "blocked" | "p0" | "other" | "paused" | "dormant";

/** 서버 strip_order(0~6)와 같은 순서. */
export const DROPDOWN_GROUP_ORDER: DropdownGroupKey[] = [
  "working", "awaiting", "blocked", "p0", "other", "paused", "dormant",
];

export const DROPDOWN_GROUP_LABEL: Record<DropdownGroupKey, string> = {
  working: "🔄 작업중",
  awaiting: "⏳ 대표님 대기",
  blocked: "⛔ 막힘",
  p0: "P0",
  other: "P1 · P2",
  paused: "⏸ 멈춤",
  dormant: "💤 휴면·초안",
};

type DropdownClassifiable = Pick<
  StripGoal, "strip_group" | "goal_paused" | "activity" | "dormant" | "status" | "dispatch_note" | "priority"
>;

/** 서버 strip_group 이 7개 중 하나면 그대로, 아니면 처음 맞는 규칙 하나 (PRD §3). */
export function dropdownGroupOf(g: DropdownClassifiable): DropdownGroupKey {
  const server = g.strip_group as DropdownGroupKey | null | undefined;
  if (server && DROPDOWN_GROUP_ORDER.includes(server)) return server;
  if (g.goal_paused) return "paused";
  if (g.activity === "working") return "working";
  if (g.activity === "awaiting") return "awaiting";
  if (g.dormant || String(g.status || "").toLowerCase() === "draft") return "dormant";
  if (String(g.status || "").toLowerCase() === "blocked" || String(g.dispatch_note || "").trim() !== "") return "blocked";
  return isP0(g.priority) ? "p0" : "other";
}

function groupIndexOf(g: DropdownClassifiable & Pick<StripGoal, "strip_order">): number {
  const server = g.strip_group as DropdownGroupKey | null | undefined;
  if (server && DROPDOWN_GROUP_ORDER.includes(server) && typeof g.strip_order === "number") return g.strip_order;
  return DROPDOWN_GROUP_ORDER.indexOf(dropdownGroupOf(g));
}

/** 서버 strip_order 우선, 없으면 그룹 순번 → 우선순위 순번 → 마지막 활동 최근순(없으면 뒤) → 제목. */
export function sortDropdownGoals<T extends StripGoal>(goals: readonly T[]): T[] {
  return [...goals].sort((a, b) => {
    const r = groupIndexOf(a) - groupIndexOf(b);
    if (r !== 0) return r;
    const p = priorityRankOf(a) - priorityRankOf(b);
    if (p !== 0) return p;
    const ta = toMs(a.last_activity_at);
    const tb = toMs(b.last_activity_at);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    return String(a.title || "").localeCompare(String(b.title || ""), "ko");
  });
}

export interface DropdownGroup<T> { key: DropdownGroupKey; label: string; goals: T[] }

/** 이미 정렬된 목록을 그룹으로 묶는다. 빈 그룹은 뺀다. keyOf 로 열린 동안 고정한 그룹을 줄 수 있다. */
export function groupDropdownGoals<T extends StripGoal>(
  goals: readonly T[], keyOf: (g: T) => DropdownGroupKey = dropdownGroupOf,
): DropdownGroup<T>[] {
  const out: DropdownGroup<T>[] = [];
  for (const key of DROPDOWN_GROUP_ORDER) {
    const members = goals.filter((g) => keyOf(g) === key);
    if (members.length > 0) out.push({ key, label: DROPDOWN_GROUP_LABEL[key], goals: members });
  }
  return out;
}

export interface DropdownTriggerSummary<T> {
  total: number; working: number; awaiting: number; blocked: number; top: T | null;
}

export function dropdownTriggerSummary<T extends StripGoal>(goals: readonly T[]): DropdownTriggerSummary<T> {
  const sorted = sortDropdownGoals(goals);
  const count = (k: DropdownGroupKey) => goals.filter((g) => dropdownGroupOf(g) === k).length;
  return {
    total: goals.length, working: count("working"), awaiting: count("awaiting"), blocked: count("blocked"),
    top: sorted[0] ?? null,
  };
}

/**
 * 열린 동안 순서 고정: 이전 id 순서를 유지하고, 새 목표는 자기 그룹의 끝에 붙이며, 사라진 목표는 뺀다.
 * 값(진행률·아이콘·막힘)은 새 goals 의 것을 쓴다.
 */
export function freezeOrder<T extends StripGoal>(prevIds: readonly string[], goals: readonly T[]): T[] {
  const byId = new Map(goals.map((g) => [g.goal_id, g]));
  const kept = prevIds.filter((id, i) => byId.has(id) && prevIds.indexOf(id) === i).map((id) => byId.get(id) as T);
  const known = new Set(kept.map((g) => g.goal_id));
  const fresh = sortDropdownGoals(goals.filter((g) => !known.has(g.goal_id)));
  const out = [...kept];
  for (const g of fresh) {
    const gi = groupIndexOf(g);
    let at = out.length;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (groupIndexOf(out[i]) <= gi) { at = i + 1; break; }
      at = i;
    }
    out.splice(at, 0, g);
  }
  return out;
}

/** 0~1 이면 ×100, 그 외 그대로. 0~100 으로 자르고 반올림 (기존 칩 계산과 동일). */
export function progressPct(progress: number | null | undefined): number {
  const n = Number(progress || 0);
  const v = n <= 1 ? n * 100 : n;
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
}

/** 목록 키보드 이동: ↑↓ Home End. 이동 키가 아니면 null. */
export function nextOptionIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(count - 1, current + 1);
  if (key === "ArrowUp") return current < 0 ? count - 1 : Math.max(0, current - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** P0 인데 7일 이상 무활동이면 일수, 아니면 null (PR-4). 휴면으로 넘어가도 유지한다. */
export function p0IdleDays(
  g: Pick<StripChipGoal, "priority" | "last_activity_at">, now: number = Date.now(),
): number | null {
  if (!isP0(g.priority)) return null;
  const d = daysSince(g.last_activity_at, now);
  return d !== null && d >= P0_IDLE_WARN_DAYS ? d : null;
}

/** 띠(GET for-session)에 GET /goals 신호(자동승인·마지막 활동)를 목표 id 로 합친다. 없으면 그대로 둔다. */
export function mergeStripSignals(
  goals: readonly StripGoal[], signals: readonly GoalSignal[] | null | undefined,
): StripChipGoal[] {
  const byId = new Map((signals || []).map((s) => [s.goal_id, s]));
  return goals.map((g) => {
    const s = byId.get(g.goal_id);
    if (!s) return { ...g };
    return {
      ...g,
      priority: g.priority ?? s.priority ?? null,
      priority_rank: g.priority_rank ?? s.priority_rank ?? null,
      last_activity_at: s.last_activity_at ?? null,
      auto_approval: s.auto_approval ?? null,
    };
  });
}

// ── 자동승인 칩 (PRD §5 8종) ─────────────────────────────────────────────────
export type AutoApprovalTone = "manual" | "auto" | "strong" | "warn" | "off" | "info" | "paused";

export interface AutoApprovalChip {
  state: AutoApprovalState;
  text: string;
  tone: AutoApprovalTone;
  warn: boolean;
}

const KNOWN_AA: readonly string[] = ["manual", "high", "all", "exhausted", "off", "delegated", "paused", "expired"];

function usage(view: AutoApprovalView): string {
  const used = Number(view.used ?? 0);
  const max = Number(view.max ?? 0);
  return max > 0 ? ` ${used}/${max}` : "";
}

export function autoApprovalExpiryDays(view: AutoApprovalView, now: number = Date.now()): number | null {
  const t = toMs(view.expires_at);
  if (t === null) return null;
  return Math.ceil((t - now) / DAY_MS);
}

/** 사용 80% 초과 또는 만료 7일 전 (AA-4). 한도 소진·만료는 이미 별도 칩이라 켜짐 상태에서만 본다. */
export function autoApprovalNeedsAttention(view: AutoApprovalView, now: number = Date.now()): boolean {
  if (view.state !== "high" && view.state !== "all") return false;
  const max = Number(view.max ?? 0);
  const used = Number(view.used ?? 0);
  if (max > 0 && used / max > AA_WARN_RATIO) return true;
  const left = autoApprovalExpiryDays(view, now);
  return left !== null && left <= AA_EXPIRY_WARN_DAYS;
}

/** 서버 값이 없거나 모르는 상태면 null — 칩을 그리지 않고 기존 띠를 유지한다. */
export function autoApprovalChip(
  view: AutoApprovalView | null | undefined, now: number = Date.now(),
): AutoApprovalChip | null {
  const state = String(view?.state || "");
  if (!view || !KNOWN_AA.includes(state)) return null;
  const s = state as AutoApprovalState;
  const warn = autoApprovalNeedsAttention(view, now);
  switch (s) {
    case "manual": return { state: s, text: "🔒 수동", tone: "manual", warn };
    case "high": return { state: s, text: `🟢 고위험까지${usage(view)}`, tone: "auto", warn };
    case "all": return { state: s, text: `🟢 전체${usage(view)}`, tone: "strong", warn };
    case "exhausted": return { state: s, text: `⛔ 한도 소진${usage(view)}`, tone: "warn", warn: false };
    case "off": return { state: s, text: "🔒 해제됨", tone: "off", warn: false };
    case "delegated": return { state: s, text: "👥 위임", tone: "info", warn: false };
    case "paused": return { state: s, text: "⏸ 정지", tone: "paused", warn: false };
    case "expired": return { state: s, text: "⌛ 만료", tone: "warn", warn: false };
  }
}

const AA_FULL_LABEL: Record<AutoApprovalState, string> = {
  manual: "수동",
  high: "자동(고위험까지)",
  all: "자동(전체)",
  exhausted: "한도 소진",
  off: "해제됨",
  delegated: "위임",
  paused: "정지",
  expired: "만료",
};

function ymd(iso: string | null | undefined): string {
  const t = toMs(iso);
  if (t === null) return "—";
  const d = new Date(t + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 툴팁·시트 행 (AA-6): 설정자·설정일·범위·사용·만료. 값이 없으면 "—". */
export function autoApprovalDetailRows(
  view: AutoApprovalView, now: number = Date.now(),
): Array<{ label: string; value: string }> {
  const state = view.state as AutoApprovalState;
  const max = Number(view.max ?? 0);
  const used = Number(view.used ?? 0);
  const left = autoApprovalExpiryDays(view, now);
  const expiry = view.expires_at
    ? `${ymd(view.expires_at)}${left === null ? "" : left >= 0 ? ` (D-${left})` : ` (${-left}일 지남)`}`
    : "—";
  const scope = view.max_risk_tier === "A2" ? "전체 자동 통과" : view.max_risk_tier === "A1" ? "고위험까지 자동 통과" : "—";
  return [
    { label: "상태", value: AA_FULL_LABEL[state] ?? "—" },
    { label: "설정자", value: view.set_by || "—" },
    { label: "설정일", value: ymd(view.set_at) },
    { label: "범위", value: scope },
    { label: "사용", value: max > 0 ? `${used} / ${max} (${Math.round((used / max) * 100)}%)` : "—" },
    { label: "만료", value: expiry },
  ];
}

export function autoApprovalHint(view: AutoApprovalView): string | null {
  switch (view.state) {
    case "paused": return "목표가 정지(blocked·draft·일시정지·휴면) 상태라 판정에서 제외됩니다. 재개하면 다시 켜집니다.";
    case "exhausted": return "한도를 다 써서 승인 대기에서 멈춰 있습니다. 한도를 갱신해야 자동으로 통과합니다.";
    case "expired": return "만료되어 자동승인이 적용되지 않습니다. 갱신이 필요합니다.";
    default: return null;
  }
}

export function autoApprovalTooltip(view: AutoApprovalView, now: number = Date.now()): string {
  const lines = autoApprovalDetailRows(view, now).map((r) => `${r.label}: ${r.value}`);
  const hint = autoApprovalHint(view);
  return hint ? `${lines.join("\n")}\n${hint}` : lines.join("\n");
}

// ── 요약 칩·정리 후보 ────────────────────────────────────────────────────────
export function summarizeOpenGoals(signals: readonly GoalSignal[] | null | undefined): { open: number; p0: number } | null {
  if (!signals) return null;
  const open = signals.filter((s) => STRIP_OPEN_STATUSES.includes(String(s.status || "").toLowerCase()));
  return { open: open.length, p0: open.filter((s) => isP0(s.priority)).length };
}

export function unlinkedChipLabel(count: number | null | undefined): string | null {
  const n = Number(count ?? 0);
  return n > 0 ? `🔗 목표 미연결 ${n}건` : null;
}

export interface CleanupCandidates {
  dormant: GoalSignal[];
  blocked: GoalSignal[];
  total: number;
  activeP0: GoalSignal[];
}

function byPriorityThenIdle(a: GoalSignal, b: GoalSignal): number {
  const p = priorityRankOf(a) - priorityRankOf(b);
  if (p !== 0) return p;
  return (toMs(a.last_activity_at) ?? 0) - (toMs(b.last_activity_at) ?? 0);
}

/** 정리 후보: 서버 cleanup_lane 으로 휴면(active)과 차단(blocked)을 따로 모은다 (DO-2). */
export function cleanupCandidates(signals: readonly GoalSignal[] | null | undefined): CleanupCandidates {
  const list = signals || [];
  const dormant = list.filter((s) => s.cleanup_lane === "dormant").sort(byPriorityThenIdle);
  const blocked = list.filter((s) => s.cleanup_lane === "blocked_resolution").sort(byPriorityThenIdle);
  const activeP0 = list
    .filter((s) => String(s.status || "").toLowerCase() === "active" && isP0(s.priority))
    .sort(byPriorityThenIdle);
  return { dormant, blocked, total: dormant.length + blocked.length, activeP0 };
}

export type DormancyCardState = "loading" | "error" | "empty" | "default";

/** 진행 P0 상한 — 넘으면 정리 후보가 0개여도 카드는 empty 가 아니라 default(① 열)로 보여준다. */
export const ACTIVE_P0_CAP = 3;

export function dormancyCardState(input: {
  loaded: boolean; error: boolean; candidates: CleanupCandidates;
}): DormancyCardState {
  if (input.error) return "error";
  if (!input.loaded) return "loading";
  const { total, activeP0 } = input.candidates;
  return total > 0 || activeP0.length > ACTIVE_P0_CAP ? "default" : "empty";
}

/** 🧹 칩은 후보가 있을 때만 (설계 A7). 조회 실패·미로드는 숨긴다. */
export function cleanupChipLabel(total: number, compact = false): string | null {
  if (!(total > 0)) return null;
  return compact ? `🧹 정리 ${total}` : `🧹 휴면·차단 정리 ${total}건`;
}

export function idleLabel(iso: string | null | undefined, now: number = Date.now()): string {
  const d = daysSince(iso, now);
  return d === null ? "활동 기록 없음" : d === 0 ? "마지막 활동 오늘" : `마지막 활동 ${d}일 전`;
}

export function dormantReasonLabel(reason: string | null | undefined): string | null {
  if (reason === "blocked_without_reason") return "차단 사유 없음";
  return null;
}

/** 자동승인이 정지(⏸)된 열린 목표 — 정리 카드 안내띠의 "보류 목표 N개". */
export function pausedAutoApprovalGoals(signals: readonly GoalSignal[] | null | undefined): GoalSignal[] {
  return (signals || []).filter(
    (s) => s.auto_approval?.state === "paused" && STRIP_OPEN_STATUSES.includes(String(s.status || "").toLowerCase()),
  );
}

/** 조회 실패 시 이전 신호는 최신이 아니다 — 자동승인·정리 후보·요약에 쓰지 않는다. */
export function freshSignals(signals: GoalSignal[] | null, error: boolean): GoalSignal[] | null {
  return error ? null : signals;
}

/** 이 대화에 연결된 목표가 없어도 정리 후보·미연결 작업·조회 실패(재시도 경로)가 있으면 띠를 보인다. */
export function shouldShowGoalStrip(input: {
  sessionGoalCount: number; cleanupTotal: number; unlinkedCount: number; signalsError?: boolean;
}): boolean {
  return input.sessionGoalCount > 0 || input.cleanupTotal > 0 || Number(input.unlinkedCount || 0) > 0
    || Boolean(input.signalsError);
}
