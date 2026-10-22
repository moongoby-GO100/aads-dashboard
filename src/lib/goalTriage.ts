// 휴면·차단 정리 카드의 선택 상태·반영 요청·실패 해석 (순수 함수).
// 정본: PRD goal-first-triage-execution-prd rev1 §3-3 UI-1~4.
// 서버 계약: aads-server POST /api/v1/goals/triage/apply (app/services/goal_triage.py, runner-047ad691).
import {
  ACTIVE_P0_CAP, STRIP_OPEN_STATUSES, isP0, shortGoalTitle,
  type CleanupCandidates, type GoalSignal,
} from "./goalStrip";

export type TriageActionKind = "resume" | "unblock" | "pause" | "close" | "merge";
export type TriageLane = "dormant" | "blocked";

export interface TriageChoice { action: TriageActionKind; mergeInto: string | null }
export interface TriageSelection { keepP0: string[]; choices: Record<string, TriageChoice> }

export const EMPTY_SELECTION: TriageSelection = { keepP0: [], choices: {} };

export const LANE_ACTIONS: Record<TriageLane, readonly TriageActionKind[]> = {
  dormant: ["resume", "pause", "close", "merge"],
  blocked: ["unblock", "pause", "close", "merge"],
};

export const ACTION_LABEL: Record<TriageActionKind, string> = {
  resume: "재개", unblock: "차단 해소", pause: "일시정지", close: "종료", merge: "병합",
};

const STATUS_OPEN = (g: Pick<GoalSignal, "status">) => STRIP_OPEN_STATUSES.includes(String(g.status || "").toLowerCase());
const isActive = (g: Pick<GoalSignal, "status">) => String(g.status || "").toLowerCase() === "active";
const isEnding = (c: TriageChoice | undefined) => c?.action === "close" || c?.action === "merge";

/** 고르지 않으면 P1 로 내려가는 목표 — 서버는 keep_p0 밖의 active P0 만 내린다. */
export function isDemotedP0(g: GoalSignal, sel: TriageSelection): boolean {
  return isActive(g) && isP0(g.priority) && !sel.keepP0.includes(g.goal_id);
}

/** ① 체크 토글. 3개를 넘겨 고를 수 없고, 고른 P0 는 ②·③ 선택에서 빠진다. */
export function toggleKeepP0(sel: TriageSelection, goalId: string): TriageSelection {
  if (sel.keepP0.includes(goalId)) return { ...sel, keepP0: sel.keepP0.filter((id) => id !== goalId) };
  if (sel.keepP0.length >= ACTIVE_P0_CAP) return sel;
  const { [goalId]: _dropped, ...choices } = sel.choices;
  void _dropped;
  return { keepP0: [...sel.keepP0, goalId], choices };
}

/** 세그먼트 선택. 같은 것을 다시 누르면 선택 해제(보류), 이 줄에 없는 동작은 무시. */
export function chooseAction(
  sel: TriageSelection, goalId: string, lane: TriageLane, action: TriageActionKind,
): TriageSelection {
  if (!LANE_ACTIONS[lane].includes(action)) return sel;
  if (sel.choices[goalId]?.action === action) {
    const { [goalId]: _dropped, ...choices } = sel.choices;
    void _dropped;
    return { ...sel, choices };
  }
  return { ...sel, choices: { ...sel.choices, [goalId]: { action, mergeInto: action === "merge" ? sel.choices[goalId]?.mergeInto ?? null : null } } };
}

export function setMergeTarget(sel: TriageSelection, goalId: string, target: string | null): TriageSelection {
  const cur = sel.choices[goalId];
  if (!cur || cur.action !== "merge") return sel;
  return { ...sel, choices: { ...sel.choices, [goalId]: { action: "merge", mergeInto: target || null } } };
}

/** 카드에 실제로 보이는 ②·③ — ① 에서 고른 P0 는 뺀다. */
export function visibleCandidates(c: CleanupCandidates, sel: TriageSelection): { dormant: GoalSignal[]; blocked: GoalSignal[] } {
  const kept = new Set(sel.keepP0);
  return { dormant: c.dormant.filter((g) => !kept.has(g.goal_id)), blocked: c.blocked.filter((g) => !kept.has(g.goal_id)) };
}

/** 병합 대상 후보: 열린 목표 중 자기 자신과, 이번에 종료·병합하는 목표는 제외 (서버가 invalid_merge_target 으로 거절). */
export function mergeTargetOptions(openGoals: readonly GoalSignal[], sel: TriageSelection, goalId: string): GoalSignal[] {
  return openGoals
    .filter((g) => STATUS_OPEN(g) && g.goal_id !== goalId && !isEnding(sel.choices[g.goal_id]))
    .sort((a, b) => (a.priority_rank ?? 9) - (b.priority_rank ?? 9) || String(a.title).localeCompare(String(b.title), "ko"));
}

export function mergeTargetLabel(g: GoalSignal): string {
  const p = String(g.priority || "").trim().toUpperCase();
  return `${p ? `[${p}] ` : ""}${shortGoalTitle(g.title, g.project)}`;
}

/**
 * 후보가 바뀌면(30초 갱신·stale_candidates 재조회) 기존 선택 중 아직 유효한 것만 남긴다 (UI-3).
 * 바뀐 것이 없으면 같은 객체를 돌려줘 불필요한 상태 갱신을 막는다.
 */
export function reconcileSelection(
  sel: TriageSelection, c: CleanupCandidates, openGoals: readonly GoalSignal[],
): TriageSelection {
  const activeP0 = new Set(c.activeP0.map((g) => g.goal_id));
  const keepP0 = sel.keepP0.filter((id) => activeP0.has(id)).slice(0, ACTIVE_P0_CAP);
  const kept = new Set(keepP0);
  const lane = new Map<string, TriageLane>();
  c.dormant.forEach((g) => { if (!kept.has(g.goal_id)) lane.set(g.goal_id, "dormant"); });
  c.blocked.forEach((g) => { if (!kept.has(g.goal_id)) lane.set(g.goal_id, "blocked"); });
  const open = new Set(openGoals.filter(STATUS_OPEN).map((g) => g.goal_id));

  const stage: Record<string, TriageChoice> = {};
  for (const [id, ch] of Object.entries(sel.choices)) {
    const l = lane.get(id);
    if (l && LANE_ACTIONS[l].includes(ch.action)) stage[id] = ch;
  }
  const choices: Record<string, TriageChoice> = {};
  for (const [id, ch] of Object.entries(stage)) {
    if (ch.action !== "merge" || ch.mergeInto === null) { choices[id] = ch; continue; }
    const ok = ch.mergeInto !== id && open.has(ch.mergeInto) && !isEnding(stage[ch.mergeInto]);
    choices[id] = ok ? ch : { action: "merge", mergeInto: null };
  }
  const same = keepP0.length === sel.keepP0.length
    && Object.keys(choices).length === Object.keys(sel.choices).length
    && Object.entries(choices).every(([id, ch]) => sel.choices[id] === ch);
  return same ? sel : { keepP0, choices };
}

export interface SelectionSummary {
  p0: number;
  dormant: number;
  blocked: number;
  byAction: Record<TriageActionKind, number>;
  unselected: number;
  closing: number;
  merging: number;
  incompleteMerges: number;
}

export function summarizeSelection(sel: TriageSelection, c: CleanupCandidates): SelectionSummary {
  const v = visibleCandidates(c, sel);
  const byAction: Record<TriageActionKind, number> = { resume: 0, unblock: 0, pause: 0, close: 0, merge: 0 };
  let dormant = 0;
  let blocked = 0;
  let incompleteMerges = 0;
  const count = (list: GoalSignal[]) => {
    let n = 0;
    for (const g of list) {
      const ch = sel.choices[g.goal_id];
      if (!ch) continue;
      n += 1;
      byAction[ch.action] += 1;
      if (ch.action === "merge" && !ch.mergeInto) incompleteMerges += 1;
    }
    return n;
  };
  dormant = count(v.dormant);
  blocked = count(v.blocked);
  return {
    p0: sel.keepP0.length, dormant, blocked, byAction,
    unselected: v.dormant.length + v.blocked.length - dormant - blocked,
    closing: byAction.close, merging: byAction.merge, incompleteMerges,
  };
}

/** 반영하려면 고를 P0 수 — 진행 P0 가 3개 미만이면 있는 만큼 전부. */
export function requiredP0Count(c: CleanupCandidates): number {
  return Math.min(ACTIVE_P0_CAP, c.activeP0.length);
}

export type ApplyBlock = "p0_count" | "merge_target" | "nothing" | "no_version" | null;

export function applyBlockReason(sel: TriageSelection, c: CleanupCandidates, version: string | null | undefined): ApplyBlock {
  if (!version) return "no_version";
  if (sel.keepP0.length < requiredP0Count(c)) return "p0_count";
  const s = summarizeSelection(sel, c);
  if (s.incompleteMerges > 0) return "merge_target";
  if (s.dormant + s.blocked === 0 && c.activeP0.length <= ACTIVE_P0_CAP) return "nothing";
  return null;
}

export const APPLY_BLOCK_TEXT: Record<Exclude<ApplyBlock, null>, string> = {
  p0_count: "① 에서 진행 P0 를 먼저 고르세요 — 고르지 않은 P0 는 P1 로 내려갑니다.",
  merge_target: "병합을 고른 목표는 병합 대상도 골라야 합니다.",
  nothing: "고른 것이 없습니다. ②·③ 에서 목표별로 고르세요.",
  no_version: "후보 정보를 받지 못했습니다. 카드를 닫고 다시 여세요.",
};

export interface TriageApplyAction { goal_id: string; action: TriageActionKind; merge_into?: string }
export interface TriageApplyBody { keep_p0: string[]; actions: TriageApplyAction[]; candidates_version: string }

export function buildApplyRequest(sel: TriageSelection, c: CleanupCandidates, version: string): TriageApplyBody {
  const v = visibleCandidates(c, sel);
  const actions: TriageApplyAction[] = [];
  for (const g of [...v.dormant, ...v.blocked]) {
    const ch = sel.choices[g.goal_id];
    if (!ch) continue;
    actions.push(ch.action === "merge" && ch.mergeInto
      ? { goal_id: g.goal_id, action: "merge", merge_into: ch.mergeInto }
      : { goal_id: g.goal_id, action: ch.action });
  }
  return { keep_p0: [...sel.keepP0], actions, candidates_version: version };
}

/** 같은 내용인지 비교하는 지문 — 같은 Idempotency-Key 로 다른 요청을 보내지 않게 한다. */
export function requestFingerprint(body: TriageApplyBody): string {
  return JSON.stringify({
    k: [...body.keep_p0].sort(),
    a: [...body.actions].sort((x, y) => x.goal_id.localeCompare(y.goal_id)).map((x) => [x.goal_id, x.action, x.merge_into ?? null]),
    v: body.candidates_version,
  });
}

// ── Idempotency-Key ──────────────────────────────────────────────────────────
export function newIdempotencyKey(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c?.randomUUID) return `triage-${c.randomUUID()}`;
  return `triage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface KeyState { key: string; fingerprint: string | null }

/** 카드를 열 때 만든 키를 재시도에 재사용한다. 보낼 내용이 바뀌었으면 새 키(서버가 idempotency_key_reused 로 거절). */
export function keyForAttempt(state: KeyState, fingerprint: string): KeyState {
  return state.fingerprint !== null && state.fingerprint !== fingerprint
    ? { key: newIdempotencyKey(), fingerprint }
    : { key: state.key, fingerprint };
}

/** 실패 응답(서버가 처리해 거절)을 받았으면 다음 시도는 새 키. 응답을 못 받았거나 5xx 면 반영됐는지 모르므로 같은 키로 다시 보낸다. */
export function keyAfterFailure(state: KeyState, failure: TriageFailure): KeyState {
  return failure.definitive ? { key: newIdempotencyKey(), fingerprint: null } : state;
}

// ── 실패 해석 ────────────────────────────────────────────────────────────────
export interface TriageFailure {
  status: number | null;
  code: string | null;
  message: string | null;
  /** 서버가 요청을 처리하고 거절한 것(4xx). 응답을 못 받았거나 5xx 면 false — 반영 여부를 모른다. */
  definitive: boolean;
  currentP0: number | null;
  cap: number | null;
}

/** chatApi 가 던지는 `409: {"detail":{...}}` 또는 api.ts 의 `API error 409: {...}` 를 푼다. */
export function parseTriageFailure(e: unknown): TriageFailure {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const statusProp = (e as { status?: unknown } | null)?.status;
  const m = raw.match(/^(?:API error )?(\d{3}):\s*([\s\S]*)$/);
  const status = typeof statusProp === "number" ? statusProp : m ? Number(m[1]) : null;
  let code: string | null = null;
  let message: string | null = null;
  let currentP0: number | null = null;
  let cap: number | null = null;
  if (m) {
    try {
      const detail = (JSON.parse(m[2]) as { detail?: unknown })?.detail;
      if (typeof detail === "string") code = detail;
      else if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        const d = detail as { error?: unknown; code?: unknown; message?: unknown; current_p0?: unknown; cap?: unknown };
        code = typeof d.error === "string" ? d.error : typeof d.code === "string" ? d.code : null;
        message = typeof d.message === "string" ? d.message : null;
        currentP0 = Array.isArray(d.current_p0) ? d.current_p0.length : null;
        cap = typeof d.cap === "number" ? d.cap : null;
      }
    } catch { /* 본문이 JSON 이 아니면 상태만 쓴다 */ }
  }
  return { status, code, message, definitive: status !== null && status >= 400 && status < 500, currentP0, cap };
}

export const TRIAGE_FAILURE_HEADLINE = "반영하지 못했습니다 — 아무것도 바뀌지 않았습니다";
export const TRIAGE_UNKNOWN_HEADLINE = "반영 결과를 확인하지 못했습니다";

export function triageFailureHeadline(f: TriageFailure): string {
  return f.definitive ? TRIAGE_FAILURE_HEADLINE : TRIAGE_UNKNOWN_HEADLINE;
}

/** 원인 코드를 사람이 읽을 말로. 코드는 괄호로 덧붙인다. */
export function triageFailureText(f: TriageFailure): string {
  const code = f.code ? ` (원인 코드: ${f.code})` : f.status ? ` (오류 ${f.status})` : "";
  switch (f.code) {
    case "p0_cap_exceeded": {
      const n = f.currentP0 !== null ? `${f.currentP0}개가 되어 ` : "";
      return `반영하면 진행 중인 P0 가 ${n}상한 ${f.cap ?? ACTIVE_P0_CAP}개를 넘습니다. 서버가 한 번에 반영하다 실패해 전부 취소했습니다. ① 에서 P0 를 다시 고르세요${code}.`;
    }
    case "stale_candidates":
      return `카드를 연 뒤 다른 곳에서 목표 상태가 바뀌었습니다. 최신 후보로 새로 불러왔고, 고른 내용 중 아직 유효한 것은 그대로 남겼습니다. 확인한 뒤 다시 시도하세요${code}.`;
    case "triage_ceo_only":
      return `목표 일괄 정리는 대표님만 할 수 있습니다${code}.`;
    case "keep_p0_not_active_p0":
      return `고른 P0 중 더 이상 진행 중인 P0 가 아닌 목표가 있습니다. 목록을 새로 불러온 뒤 다시 고르세요${code}.`;
    case "goal_not_found":
      return `고른 목표 중 찾을 수 없는 것이 있습니다. 목록을 새로 불러온 뒤 다시 고르세요${code}.`;
    case "goal_already_closed":
      return `고른 목표 중 이미 끝난 목표가 있습니다. 목록을 새로 불러온 뒤 다시 고르세요${code}.`;
    case "not_blocked":
      return `차단 해소를 고른 목표 중 이미 차단이 풀린 것이 있습니다. 목록을 새로 불러온 뒤 다시 고르세요${code}.`;
    case "merge_into_required":
    case "invalid_merge_target":
      return `병합 대상이 올바르지 않습니다. 병합 대상은 열려 있고, 이번에 종료·병합하지 않는 다른 목표여야 합니다${code}.`;
    case "duplicate_action":
      return `같은 목표가 두 번 담겼습니다. 카드를 닫고 다시 여세요${code}.`;
    case "idempotency_key_reused":
      return `같은 요청 번호로 다른 내용이 전달되어 거절됐습니다. 다시 시도하면 새 번호로 보냅니다${code}.`;
    case "idempotency_key_required":
      return `요청 번호가 빠졌습니다. 다시 시도하면 새 번호로 보냅니다${code}.`;
    default:
      break;
  }
  if (f.status === 403) return `이 정리를 반영할 권한이 없습니다${code}.`;
  if (f.status === 422) return `요청 형식이 올바르지 않습니다. 고른 내용을 확인한 뒤 다시 시도하세요${code}.`;
  if (f.status !== null && f.status >= 500) {
    return `서버가 응답하는 중 오류가 났습니다${code}. 반영됐는지 확실하지 않습니다 — 같은 요청 번호로 다시 보내므로 다시 시도해도 두 번 반영되지 않습니다.`;
  }
  if (f.status === null) {
    return "서버에 연결하지 못했거나 응답을 받지 못했습니다. 반영됐는지 확실하지 않습니다 — 같은 요청 번호로 다시 보내므로 다시 시도해도 두 번 반영되지 않습니다.";
  }
  return `서버가 요청을 받아들이지 않았습니다${code}. 고른 내용은 그대로 남아 있습니다.`;
}

/** GET /goals 의 모든 행에 같은 후보 지문이 실려 온다. 첫 값을 쓴다. */
export function candidatesVersionOf(signals: readonly GoalSignal[] | null | undefined): string | null {
  for (const s of signals || []) if (s.candidates_version) return s.candidates_version;
  return null;
}

// ── 반영 실행 ────────────────────────────────────────────────────────────────
export interface TriageApplyDeps {
  apply: (body: TriageApplyBody, idempotencyKey: string) => Promise<unknown>;
  /** 성공 뒤 목표 띠 재조회. 실패해도 반영은 이미 끝났으므로 결과를 바꾸지 않는다. */
  applied: () => Promise<unknown> | void;
  /** stale_candidates 면 최신 후보를 다시 불러온다. */
  refresh: () => Promise<unknown> | void;
}

export type TriageApplyResult = { ok: true } | { ok: false; failure: TriageFailure };

export async function runTriageApply(
  keyBox: { current: KeyState }, body: TriageApplyBody, deps: TriageApplyDeps,
): Promise<TriageApplyResult> {
  keyBox.current = keyForAttempt(keyBox.current, requestFingerprint(body));
  try {
    await deps.apply(body, keyBox.current.key);
  } catch (e) {
    const failure = parseTriageFailure(e);
    keyBox.current = keyAfterFailure(keyBox.current, failure);
    if (failure.code === "stale_candidates") {
      try { await deps.refresh(); } catch { /* 재조회 실패는 목록 오류 상태가 알린다 */ }
    }
    return { ok: false, failure };
  }
  try { await deps.applied(); } catch { /* 다음 30초 갱신이 따라잡는다 */ }
  return { ok: true };
}
