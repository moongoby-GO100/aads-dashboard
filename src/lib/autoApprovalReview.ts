// 자동승인 참고검토 — 서버 GET /projects/{P}/documents/auto-approval-digest 와
// POST /projects/{P}/documents/{key}/change-request 계약. React 없이 테스트할 수 있도록 로직만 둔다.
import { api } from "@/lib/api";
import { canonicalErrorKind, type CanonicalErrorKind } from "@/lib/canonicalProjects";

export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 2000;
export const MINOR_LIMIT = 3;
export type SinceHours = 24 | 168;

export interface ReviewItem {
  project_key: string;
  document_key: string;
  title: string;
  revision_id: string;
  generation: number;
  version?: string;
  kind?: string;
  risk?: "normal" | "high";
  score?: number;
  ceo_brief?: string;
  minor_issues: string[];
  hold_reasons: string[];
  approved_at?: string;
  currently_approved?: boolean;
}
export interface RemainingIssue { severity: string; location: string; problem: string }
export interface NeedsCeoItem {
  project_key: string;
  document_key: string;
  title: string;
  risk?: "normal" | "high";
  round?: number;
  max_rounds?: number;
  reason?: string;
  ceo_brief?: string;
  remaining_issues: RemainingIssue[];
  decision_needed?: string;
  resolve_path?: string;
  card_id?: string;
  pending_days?: number;
}
export interface AutoFixingItem {
  project_key: string;
  document_key: string;
  title: string;
  round?: number;
  max_rounds?: number;
  job_id?: string;
}
export interface Digest {
  project_key: string;
  mode: string;
  since_hours: number;
  auto_approved: ReviewItem[];
  held: ReviewItem[];
  would_approve: ReviewItem[];
  needs_ceo: NeedsCeoItem[];
  auto_fixing: AutoFixingItem[];
  truncated: boolean;
}

export class DigestFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigestFormatError";
  }
}

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const bad = (what: string): never => { throw new DigestFormatError(what); };
const reqText = (rec: Rec, key: string, where: string): string => {
  const value = rec[key];
  return typeof value === "string" && value.trim() ? value : bad(`${where}.${key}`);
};
const optText = (rec: Rec, key: string, where: string): string | undefined => {
  const value = rec[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? (value.trim() ? value : undefined) : bad(`${where}.${key}`);
};
const optNumber = (rec: Rec, key: string, where: string): number | undefined => {
  const value = rec[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : bad(`${where}.${key}`);
};
const optRisk = (rec: Rec, where: string): "normal" | "high" | undefined => {
  const value = rec.risk;
  if (value === undefined || value === null) return undefined;
  return value === "normal" || value === "high" ? value : bad(`${where}.risk`);
};
const optStrings = (rec: Rec, key: string, where: string, limit?: number): string[] => {
  const value = rec[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return bad(`${where}.${key}`);
  const texts = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return limit === undefined ? texts : texts.slice(0, limit);
};
const arrayOf = <T,>(rec: Rec, key: string, parse: (entry: unknown, where: string) => T, required: boolean): T[] => {
  const value = rec[key];
  if (value === undefined || value === null) return required ? bad(key) : [];
  if (!Array.isArray(value)) return bad(key);
  return value.map((entry, index) => parse(entry, `${key}[${index}]`));
};

const sameProject = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

function parseReviewItem(project: string) {
  return (entry: unknown, where: string): ReviewItem => {
    if (!isRec(entry)) return bad(where);
    const projectKey = reqText(entry, "project_key", where);
    if (!sameProject(projectKey, project)) return bad(`${where}.project_key`);
    const generation = entry.generation;
    if (typeof generation !== "number" || !Number.isInteger(generation) || generation < 1) return bad(`${where}.generation`);
    const approvedFlag = entry.currently_approved;
    if (approvedFlag !== undefined && approvedFlag !== null && typeof approvedFlag !== "boolean") return bad(`${where}.currently_approved`);
    return {
      project_key: projectKey, document_key: reqText(entry, "document_key", where), title: reqText(entry, "title", where),
      revision_id: reqText(entry, "revision_id", where), generation,
      version: optText(entry, "version", where), kind: optText(entry, "kind", where), risk: optRisk(entry, where),
      score: optNumber(entry, "score", where), ceo_brief: optText(entry, "ceo_brief", where),
      minor_issues: optStrings(entry, "minor_issues", where, MINOR_LIMIT), hold_reasons: optStrings(entry, "hold_reasons", where),
      approved_at: optText(entry, "approved_at", where),
      currently_approved: typeof approvedFlag === "boolean" ? approvedFlag : undefined,
    };
  };
}

function parseIssue(entry: unknown, where: string): RemainingIssue {
  if (!isRec(entry)) return bad(where);
  return {
    severity: optText(entry, "severity", where) ?? "", location: optText(entry, "location", where) ?? "",
    problem: reqText(entry, "problem", where),
  };
}

function parseNeedsCeo(project: string) {
  return (entry: unknown, where: string): NeedsCeoItem => {
    if (!isRec(entry)) return bad(where);
    const projectKey = reqText(entry, "project_key", where);
    if (!sameProject(projectKey, project)) return bad(`${where}.project_key`);
    return {
      project_key: projectKey, document_key: reqText(entry, "document_key", where), title: reqText(entry, "title", where),
      risk: optRisk(entry, where), round: optNumber(entry, "round", where), max_rounds: optNumber(entry, "max_rounds", where),
      reason: optText(entry, "reason", where), ceo_brief: optText(entry, "ceo_brief", where),
      remaining_issues: arrayOf(entry, "remaining_issues", parseIssue, false).slice(0, MINOR_LIMIT),
      decision_needed: optText(entry, "decision_needed", where), resolve_path: optText(entry, "resolve_path", where),
      card_id: optText(entry, "card_id", where), pending_days: optNumber(entry, "pending_days", where),
    };
  };
}

function parseAutoFixing(project: string) {
  return (entry: unknown, where: string): AutoFixingItem => {
    if (!isRec(entry)) return bad(where);
    const projectKey = reqText(entry, "project_key", where);
    if (!sameProject(projectKey, project)) return bad(`${where}.project_key`);
    return {
      project_key: projectKey, document_key: reqText(entry, "document_key", where), title: reqText(entry, "title", where),
      round: optNumber(entry, "round", where), max_rounds: optNumber(entry, "max_rounds", where), job_id: optText(entry, "job_id", where),
    };
  };
}

export function parseDigest(raw: unknown, project: string): Digest {
  if (!isRec(raw)) return bad("body");
  if (!sameProject(reqText(raw, "project_key", "body"), project)) return bad("project_key");
  const hours = raw.since_hours;
  const truncated = raw.truncated;
  return {
    project_key: project, mode: optText(raw, "mode", "body") ?? "", since_hours: typeof hours === "number" ? hours : 0,
    auto_approved: arrayOf(raw, "auto_approved", parseReviewItem(project), true),
    held: arrayOf(raw, "held", parseReviewItem(project), true),
    would_approve: arrayOf(raw, "would_approve", parseReviewItem(project), false),
    needs_ceo: arrayOf(raw, "needs_ceo", parseNeedsCeo(project), false),
    auto_fixing: arrayOf(raw, "auto_fixing", parseAutoFixing(project), false),
    truncated: isRec(truncated) ? Object.values(truncated).some(Boolean) : truncated === true,
  };
}

// ---- 오류 분류 ----------------------------------------------------------------------------------------------

export type ReviewProblemKind = CanonicalErrorKind | "format" | "stale";
export interface ReviewProblem { kind: ReviewProblemKind; text: string }

export const STALE_TEXT = "문서가 바뀌었습니다 — 새로고침";

export function reviewProblemOf(error: unknown, project: string): ReviewProblem {
  if (error instanceof DigestFormatError) return { kind: "format", text: "서버 응답 형식이 올바르지 않아 표시하지 못했습니다. 잠시 후 재시도하세요." };
  const kind = canonicalErrorKind(error);
  if (kind === "auth") return { kind, text: "로그인이 만료되었습니다. 다시 로그인한 뒤 재시도하세요." };
  if (kind === "forbidden") return { kind, text: `${project} 프로젝트의 문서 접근 권한이 없습니다.` };
  if (kind === "conflict") return { kind: "stale", text: STALE_TEXT };
  const raw = error instanceof Error ? error.message : "네트워크 오류";
  return { kind: "network", text: `연결에 실패했습니다. 네트워크를 확인하고 재시도하세요. (${raw.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 120)})` };
}

const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

// ---- 요청 순번 -----------------------------------------------------------------------------------------------

export interface GateToken { signal: AbortSignal; isCurrent: () => boolean }
export interface RequestGate { begin: () => GateToken; invalidate: () => void }

export function createRequestGate(): RequestGate {
  let seq = 0;
  let controller: AbortController | null = null;
  const invalidate = () => { seq += 1; controller?.abort(); controller = null; };
  return {
    invalidate,
    begin() {
      invalidate();
      const mine = seq;
      const own = new AbortController();
      controller = own;
      return { signal: own.signal, isCurrent: () => seq === mine };
    },
  };
}

// ---- 화면 상태 -----------------------------------------------------------------------------------------------

export interface ChangeTarget { project_key: string; document_key: string; title: string; revision_id: string; generation: number }

export interface ReviewState {
  project: string;
  hours: SinceHours;
  status: "loading" | "ready" | "error";
  digest: Digest | null;
  problem: ReviewProblem | null;
  target: ChangeTarget | null;
  cancelItem: ReviewItem | null;
}

export type ReviewAction =
  | { type: "load_started"; project: string; hours: SinceHours }
  | { type: "load_ok"; project: string; hours: SinceHours; digest: Digest }
  | { type: "load_failed"; project: string; hours: SinceHours; problem: ReviewProblem }
  | { type: "open_change"; target: ChangeTarget }
  | { type: "close_change" }
  | { type: "open_cancel"; item: ReviewItem }
  | { type: "close_cancel" };

export const initialReviewState = (project: string, hours: SinceHours = 24): ReviewState => ({
  project, hours, status: "loading", digest: null, problem: null, target: null, cancelItem: null,
});

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "load_started":
      if (action.project !== state.project) return initialReviewState(action.project, action.hours);
      return {
        ...state, hours: action.hours, status: "loading", problem: null,
        digest: action.hours === state.hours ? state.digest : null,
      };
    case "load_ok":
      if (action.project !== state.project || action.hours !== state.hours) return state;
      return { ...state, status: "ready", digest: action.digest, problem: null };
    case "load_failed":
      if (action.project !== state.project || action.hours !== state.hours) return state;
      return { ...state, status: "error", digest: null, problem: action.problem };
    case "open_change":
      return action.target.project_key.toUpperCase() === state.project.toUpperCase() ? { ...state, target: action.target } : state;
    case "close_change":
      return { ...state, target: null };
    case "open_cancel":
      return action.item.project_key.toUpperCase() === state.project.toUpperCase() ? { ...state, cancelItem: action.item } : state;
    case "close_cancel":
      return { ...state, cancelItem: null };
  }
}

export async function runDigestLoad(args: {
  project: string; hours: SinceHours; token: GateToken; dispatch: (action: ReviewAction) => void;
}): Promise<void> {
  const { project, hours, token, dispatch } = args;
  try {
    const digest = parseDigest(await api.getAutoApprovalDigest(project, hours, token.signal), project);
    if (token.isCurrent()) dispatch({ type: "load_ok", project, hours, digest });
  } catch (cause) {
    if (!token.isCurrent() || isAbort(cause)) return;
    dispatch({ type: "load_failed", project, hours, problem: reviewProblemOf(cause, project) });
  }
}

// ---- 표시 그룹 -----------------------------------------------------------------------------------------------

export type GroupKey = "needs_ceo" | "auto_approved" | "held" | "would_approve" | "auto_fixing";
export const GROUP_LABEL: Record<GroupKey, string> = {
  needs_ceo: "대표님 판단 필요", auto_approved: "자동 승인됨", held: "보류 (수정 필요)",
  would_approve: "승인 예정 (시험 운영)", auto_fixing: "자동 보완 중",
};
export const GROUP_ORDER: readonly GroupKey[] = ["needs_ceo", "auto_approved", "held", "would_approve", "auto_fixing"];

export function visibleGroups(digest: Digest): GroupKey[] {
  return GROUP_ORDER.filter((key) => digest[key].length > 0);
}

export const isDigestEmpty = (digest: Digest) => visibleGroups(digest).length === 0;

export const MODE_LABEL: Record<string, string> = {
  on: "자동승인 켜짐", shadow: "시험 운영 (실제 승인은 하지 않음)", off: "자동승인 꺼짐 (보류 사유만 표시)",
};

export function changeTargetOf(item: ReviewItem): ChangeTarget {
  return {
    project_key: item.project_key, document_key: item.document_key, title: item.title,
    revision_id: item.revision_id, generation: item.generation,
  };
}

// needs_ceo 항목에는 revision_id 가 없다 — 같은 document_key 의 보류 항목에서만 가져온다.
export function heldTargetFor(item: NeedsCeoItem, digest: Digest): ChangeTarget | null {
  const held = digest.held.find((entry) => entry.document_key === item.document_key && sameProject(entry.project_key, item.project_key));
  return held ? changeTargetOf(held) : null;
}

export const canCancelApproval = (group: GroupKey, item: ReviewItem) => group === "auto_approved" && item.currently_approved === true;

export const safeResolvePath = (path: string | undefined): string | null =>
  path && path.startsWith("/") && !path.startsWith("//") && !/[\s\\]/.test(path) ? path : null;

export type CeoAction = "change_request" | "open_list" | "open_card";

// 안내 문구와 실제 버튼을 한 곳에서 만든다 — 문구가 가리키는 버튼은 반드시 렌더된다.
export function needsCeoActions(item: NeedsCeoItem, digest: Digest): { target: ChangeTarget | null; actions: CeoAction[]; cardHref: string | null; guidance: string } {
  const target = heldTargetFor(item, digest);
  const cardHref = safeResolvePath(item.resolve_path);
  const actions: CeoAction[] = ["change_request"];
  if (!target) actions.push("open_list");
  if (cardHref) actions.push("open_card");
  const parts: string[] = [];
  parts.push(target
    ? "고칠 내용이 있으면 '수정 요청' 버튼으로 알려 주세요."
    : "이 화면에서는 수정 요청을 할 수 없습니다. '정본 문서 목록에서 열기'로 문서를 확인해 주세요.");
  if (cardHref) parts.push("결정은 '결정 카드 열기'에서 카드의 버튼으로 하실 수 있습니다.");
  return { target, actions, cardHref, guidance: parts.join(" ") };
}

export function formatPending(days: number | undefined): string | null {
  return typeof days === "number" && days >= 0 ? `미결 ${Math.floor(days)}일` : null;
}

// ---- 수정 요청 -----------------------------------------------------------------------------------------------

export function feedbackState(text: string): { length: number; valid: boolean; tooShort: boolean; tooLong: boolean } {
  const length = [...text.trim()].length;
  return { length, valid: length >= FEEDBACK_MIN && length <= FEEDBACK_MAX, tooShort: length < FEEDBACK_MIN, tooLong: length > FEEDBACK_MAX };
}

export type SubmitResult =
  | { ok: true; jobId: string; archived: boolean; idempotent: boolean }
  | { ok: false; problem: ReviewProblem };

export async function submitChangeRequest(target: ChangeTarget, feedback: string): Promise<SubmitResult> {
  const text = feedback.trim();
  if (!feedbackState(text).valid) return { ok: false, problem: { kind: "format", text: `수정 요청은 ${FEEDBACK_MIN}~${FEEDBACK_MAX}자로 적어 주세요.` } };
  try {
    const body = await api.requestCanonicalChange(target.project_key, target.document_key, target.revision_id, target.generation, text);
    const jobId = isRec(body) && typeof body.job_id === "string" && body.job_id ? body.job_id : null;
    if (!jobId) return { ok: false, problem: { kind: "format", text: "요청은 접수되었을 수 있지만 작업 번호를 확인하지 못했습니다. 새로고침해 확인하세요." } };
    return { ok: true, jobId, archived: isRec(body) && body.archived === true, idempotent: isRec(body) && body.idempotent === true };
  } catch (cause) {
    return { ok: false, problem: reviewProblemOf(cause, target.project_key) };
  }
}

export interface ChangeDialogState {
  text: string;
  phase: "editing" | "busy" | "done" | "failed";
  problem: ReviewProblem | null;
  result: Extract<SubmitResult, { ok: true }> | null;
}
export type ChangeDialogAction =
  | { type: "edit"; text: string }
  | { type: "submit_started" }
  | { type: "submit_finished"; result: SubmitResult };

export const initialChangeDialog: ChangeDialogState = { text: "", phase: "editing", problem: null, result: null };

export function changeDialogReducer(state: ChangeDialogState, action: ChangeDialogAction): ChangeDialogState {
  switch (action.type) {
    case "edit":
      return state.phase === "busy" || state.phase === "done" || state.problem?.kind === "stale" ? state : { ...state, text: action.text, phase: "editing", problem: null };
    case "submit_started":
      return state.phase === "busy" || state.phase === "done" ? state : { ...state, phase: "busy", problem: null };
    case "submit_finished":
      if (state.phase !== "busy") return state;
      return action.result.ok
        ? { ...state, phase: "done", problem: null, result: action.result }
        : { ...state, phase: "failed", problem: action.result.problem };
  }
}

// isActive: 요청을 낸 모달 인스턴스가 아직 열려 있는지. 닫힌 모달·다른 모달에는 아무것도 반영하지 않는다.
export async function runChangeRequest(args: {
  target: ChangeTarget; feedback: string; dispatch: (action: ChangeDialogAction) => void;
  isActive: () => boolean; onSubmitted?: (result: Extract<SubmitResult, { ok: true }>) => void;
}): Promise<void> {
  const { target, feedback, dispatch, isActive, onSubmitted } = args;
  dispatch({ type: "submit_started" });
  const result = await submitChangeRequest(target, feedback);
  if (!isActive()) return;
  dispatch({ type: "submit_finished", result });
  if (result.ok) onSubmitted?.(result);
}

// ---- 승인 취소 -----------------------------------------------------------------------------------------------

export interface CancelDialogState { phase: "confirm" | "busy" | "done" | "failed"; problem: ReviewProblem | null }
export type CancelDialogAction = { type: "started" } | { type: "finished"; problem: ReviewProblem | null };

export const initialCancelDialog: CancelDialogState = { phase: "confirm", problem: null };

export function cancelDialogReducer(state: CancelDialogState, action: CancelDialogAction): CancelDialogState {
  if (action.type === "started") return state.phase === "busy" || state.phase === "done" ? state : { phase: "busy", problem: null };
  if (state.phase !== "busy") return state;
  return action.problem ? { phase: "failed", problem: action.problem } : { phase: "done", problem: null };
}

// 목록에 표시된 revision_id·generation 을 그대로 보낸다. 확인 직전에 최신 값을 다시 조회해 바꿔 넣지 않는다.
export async function runCancelApproval(args: {
  item: ReviewItem; dispatch: (action: CancelDialogAction) => void; isActive: () => boolean; onDone?: () => void;
}): Promise<void> {
  const { item, dispatch, isActive, onDone } = args;
  dispatch({ type: "started" });
  let problem: ReviewProblem | null = null;
  try {
    await api.decideCanonicalDocument(item.project_key, item.document_key, "archive", item.revision_id, item.generation);
  } catch (cause) {
    problem = reviewProblemOf(cause, item.project_key);
  }
  if (!isActive()) return;
  dispatch({ type: "finished", problem });
  if (!problem) onDone?.();
}
