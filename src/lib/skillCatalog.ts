// 스킬 관리 화면(/skills)의 순수 모델. 서버 계약: aads-server app/api/ohvis_harness.py (/ohvis/harness/skills*).
// 화면 노출 판정은 편의용이다. 최종 권한 판정은 항상 서버가 한다.

export const RISK_TIERS = ["read", "write", "deploy", "auth", "financial", "destructive"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

const RISK_LABEL: Record<string, string> = {
  read: "조회",
  write: "수정",
  deploy: "배포",
  auth: "인증",
  financial: "금융",
  destructive: "파괴적",
};

const RISK_COLOR: Record<string, string> = {
  read: "var(--success)",
  write: "var(--warning)",
  deploy: "var(--warning)",
  auth: "var(--danger)",
  financial: "var(--danger)",
  destructive: "var(--danger)",
};

export function riskLabel(tier: string | null | undefined): string {
  return (tier && RISK_LABEL[tier]) || "등급 미상";
}

export function riskColor(tier: string | null | undefined): string {
  return (tier && RISK_COLOR[tier]) || "var(--text-secondary)";
}

const VERSION_STATUS_LABEL: Record<string, string> = {
  active: "활성",
  candidate: "후보",
  shadow: "검증 중",
  draft: "초안",
  deprecated: "이전 버전",
  quarantined: "격리",
};

export function versionStatusLabel(status: string | null | undefined): string {
  return (status && VERSION_STATUS_LABEL[status]) || status || "-";
}

const RUN_STATUS_LABEL: Record<string, string> = {
  succeeded: "성공",
  failed: "실패",
  running: "실행 중",
  pending: "대기",
};

export function runStatusLabel(status: string | null | undefined): string {
  return (status && RUN_STATUS_LABEL[status]) || status || "-";
}

export function runStatusColor(status: string | null | undefined): string {
  if (status === "succeeded") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  return "var(--text-secondary)";
}

// ── 목록 ────────────────────────────────────────────────────────────────

export interface SkillLatestRun {
  status: string;
  startedAt: string | null;
}

export interface SkillSummary {
  skillId: string;
  slug: string;
  title: string;
  description: string;
  projects: string[];
  riskTier: string;
  enabled: boolean;
  activeVersion: string | null;
  versionCount: number;
  runCount: number;
  latestRun: SkillLatestRun | null;
  source: "db" | "file";
  fileDrift: boolean;
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function parseLatestRun(value: unknown): SkillLatestRun | null {
  if (!isObj(value)) return null;
  const status = str(value.status);
  return status ? { status, startedAt: strOrNull(value.started_at) } : null;
}

/** 서버 목록은 버전 1건당 1행이다. 스킬(skill_id) 단위로 묶는다. 형식이 틀리면 null. */
export function parseSkillList(data: unknown): SkillSummary[] | null {
  if (!isObj(data) || !Array.isArray(data.items)) return null;
  const bySkill = new Map<string, SkillSummary>();
  for (const raw of data.items) {
    if (!isObj(raw)) continue;
    const skillId = str(raw.skill_id);
    if (!skillId || bySkill.has(skillId)) continue;
    const slug = str(raw.slug);
    bySkill.set(skillId, {
      skillId,
      slug,
      title: str(raw.title) || slug || skillId,
      description: str(raw.description),
      projects: strList(raw.projects),
      riskTier: str(raw.risk_tier),
      enabled: raw.enabled !== false,
      activeVersion: strOrNull(raw.active_version),
      versionCount: num(raw.version_count),
      runCount: num(raw.run_count),
      latestRun: parseLatestRun(raw.latest_run),
      source: raw.source === "file" ? "file" : "db",
      fileDrift: raw.file_drift === true,
    });
  }
  return [...bySkill.values()].sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

export type EnabledFilter = "all" | "on" | "off";
export type SourceFilter = "all" | "db" | "file";

export interface SkillFilters {
  project: string;
  risk: string;
  enabled: EnabledFilter;
  source: SourceFilter;
  query: string;
}

export const EMPTY_FILTERS: SkillFilters = { project: "", risk: "", enabled: "all", source: "all", query: "" };

export function hasActiveFilter(filters: SkillFilters): boolean {
  return filters.project !== "" || filters.risk !== "" || filters.enabled !== "all" ||
    filters.source !== "all" || filters.query.trim() !== "";
}

export function filterSkills(skills: SkillSummary[], filters: SkillFilters): SkillSummary[] {
  const query = filters.query.trim().toLowerCase();
  const project = filters.project.toLowerCase();
  return skills.filter((skill) => {
    if (project && !skill.projects.some((p) => p.toLowerCase() === project)) return false;
    if (filters.risk && skill.riskTier !== filters.risk) return false;
    if (filters.enabled === "on" && !skill.enabled) return false;
    if (filters.enabled === "off" && skill.enabled) return false;
    if (filters.source !== "all" && skill.source !== filters.source) return false;
    if (query) {
      const haystack = `${skill.title} ${skill.slug} ${skill.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function projectOptions(skills: SkillSummary[]): string[] {
  const keys = new Set<string>();
  for (const skill of skills) for (const p of skill.projects) keys.add(p.toUpperCase());
  return [...keys].sort((a, b) => a.localeCompare(b));
}

// ── 상세 ────────────────────────────────────────────────────────────────

export interface SkillManifest {
  allowedTools: string[];
  preconditions: string[];
  postconditions: string[];
  evidence: string[];
  inputRequired: string[];
  idempotencyMode: string;
  timeoutSeconds: number | null;
}

export interface SkillVersionView {
  versionId: string;
  version: string;
  status: string;
  createdAt: string | null;
  promotedAt: string | null;
  promotedBy: string | null;
  manifest: SkillManifest;
}

export interface SkillRunView {
  runId: string;
  version: string | null;
  status: string;
  error: string | null;
  costUsd: number | null;
  latencyMs: number | null;
  startedAt: string | null;
  resultSummary: string;
}

export interface SkillDetail extends Omit<SkillSummary, "latestRun"> {
  intents: string[];
  allowedTools: string[];
  filePath: string | null;
  versions: SkillVersionView[];
  runs: SkillRunView[];
}

function parseManifest(value: unknown): SkillManifest {
  const m = isObj(value) ? value : {};
  const inputSchema = isObj(m.input_schema) ? m.input_schema : {};
  const idem = isObj(m.idempotency) ? m.idempotency : {};
  return {
    allowedTools: strList(m.allowed_tools),
    preconditions: strList(m.preconditions),
    postconditions: strList(m.postconditions),
    evidence: strList(m.evidence),
    inputRequired: strList(inputSchema.required),
    idempotencyMode: str(idem.mode) || "optional",
    timeoutSeconds: numOrNull(m.timeout_seconds),
  };
}

export function parseSkillDetail(data: unknown): SkillDetail | null {
  if (!isObj(data)) return null;
  const skillId = str(data.skill_id);
  if (!skillId) return null;
  const slug = str(data.slug);
  const versions: SkillVersionView[] = (Array.isArray(data.versions) ? data.versions : [])
    .filter(isObj)
    .map((v) => ({
      versionId: str(v.version_id),
      version: str(v.version),
      status: str(v.status),
      createdAt: strOrNull(v.created_at),
      promotedAt: strOrNull(v.promoted_at),
      promotedBy: strOrNull(v.promoted_by),
      manifest: parseManifest(v.manifest),
    }));
  const runs: SkillRunView[] = (Array.isArray(data.runs) ? data.runs : [])
    .filter(isObj)
    .map((r) => ({
      runId: str(r.run_id),
      version: strOrNull(r.version),
      status: str(r.status),
      error: strOrNull(r.error),
      costUsd: numOrNull(r.cost_usd),
      latencyMs: numOrNull(r.latency_ms),
      startedAt: strOrNull(r.started_at),
      resultSummary: str(r.result_summary),
    }));
  return {
    skillId,
    slug,
    title: str(data.title) || slug || skillId,
    description: str(data.description),
    projects: strList(data.projects),
    intents: strList(data.intents),
    riskTier: str(data.risk_tier),
    enabled: data.enabled !== false,
    activeVersion: strOrNull(data.active_version),
    versionCount: versions.length || num(data.version_count),
    runCount: num(data.run_count),
    source: data.source === "file" ? "file" : "db",
    fileDrift: data.file_drift === true,
    filePath: strOrNull(data.file_path),
    allowedTools: strList(data.allowed_tools),
    versions,
    runs,
  };
}

/** 허용 도구·검증 규칙을 보여줄 기준 버전: 활성 → 없으면 가장 최근 버전. */
export function referenceVersion(detail: SkillDetail): SkillVersionView | null {
  return detail.versions.find((v) => v.status === "active") ?? detail.versions[0] ?? null;
}

export function effectiveAllowedTools(detail: SkillDetail): string[] {
  if (detail.allowedTools.length > 0) return detail.allowedTools;
  return referenceVersion(detail)?.manifest.allowedTools ?? [];
}

export function activeVersionView(detail: SkillDetail): SkillVersionView | null {
  return detail.versions.find((v) => v.status === "active") ?? null;
}

// ── 권한·동작 ───────────────────────────────────────────────────────────

export interface SkillViewer {
  is_internal_admin?: boolean;
  is_admin?: boolean;
  tenant_role?: string | null;
  user_role?: string | null;
  membership?: { role?: string | null } | null;
}

export interface SkillPermissions {
  canExecute: boolean;
  elevated: boolean;
}

export const NO_PERMISSIONS: SkillPermissions = { canExecute: false, elevated: false };

function viewerRole(user: SkillViewer): string {
  return String(user.tenant_role || user.membership?.role || "").toLowerCase();
}

/** 서버 require_skill_elevated 와 같은 기준: 내부 관리자 또는 테넌트 admin/owner. */
export function isElevated(user: SkillViewer | null | undefined): boolean {
  if (!user) return false;
  const role = viewerRole(user);
  return user.is_internal_admin === true || role === "admin" || role === "owner" ||
    String(user.user_role || "").toLowerCase() === "ceo";
}

export function permissionsFor(user: SkillViewer | null | undefined): SkillPermissions {
  if (!user) return NO_PERMISSIONS;
  const elevated = isElevated(user);
  const role = viewerRole(user);
  return { elevated, canExecute: elevated || role === "member" };
}

export type SkillAction = "execute" | "rollback" | "disable";
export type VersionAction = "validate" | "promote";

export function hasRollbackTarget(detail: Pick<SkillDetail, "versions" | "activeVersion">): boolean {
  return detail.activeVersion !== null && detail.versions.some((v) => v.status === "deprecated");
}

/** 실행은 조회(read) 등급 + 사용 중 + 활성 버전이 있을 때만. 나머지 동작은 대표(elevated) 전용. */
export function skillActions(
  skill: Pick<SkillSummary, "riskTier" | "enabled" | "activeVersion">,
  perms: SkillPermissions,
  rollbackTarget: boolean,
): SkillAction[] {
  const actions: SkillAction[] = [];
  if (perms.canExecute && skill.riskTier === "read" && skill.enabled && skill.activeVersion) actions.push("execute");
  if (perms.elevated && skill.enabled && skill.activeVersion && rollbackTarget) actions.push("rollback");
  if (perms.elevated && skill.enabled) actions.push("disable");
  return actions;
}

export function versionActions(status: string, perms: SkillPermissions): VersionAction[] {
  if (!perms.elevated) return [];
  if (status === "candidate" || status === "shadow") return ["validate", "promote"];
  return [];
}

export function promoteTarget(status: string): "shadow" | "active" | null {
  if (status === "candidate") return "shadow";
  if (status === "shadow") return "active";
  return null;
}

// ── 요청 본문 ───────────────────────────────────────────────────────────

export type BuildResult<T> = { ok: true; body: T } | { ok: false; error: string };

export interface ExecuteBody {
  version: string;
  input: Record<string, unknown>;
  idempotency_key?: string;
  session_id: string;
  correlation_id: string;
}

export function parseJsonObject(text: string, emptyAsObject: boolean): BuildResult<Record<string, unknown>> {
  const trimmed = text.trim();
  if (!trimmed) return emptyAsObject ? { ok: true, body: {} } : { ok: false, error: "값을 입력해 주세요." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "JSON 형식이 올바르지 않습니다. 중괄호와 따옴표를 확인해 주세요." };
  }
  if (!isObj(parsed)) return { ok: false, error: "JSON 객체({ ... }) 형태로 입력해 주세요." };
  return { ok: true, body: parsed };
}

export function buildExecuteBody(
  version: string, inputText: string, manifest: SkillManifest, newId: () => string,
): BuildResult<ExecuteBody> {
  const input = parseJsonObject(inputText, true);
  if (!input.ok) return input;
  const body: ExecuteBody = {
    version,
    input: input.body,
    session_id: `dashboard-skills-${newId()}`,
    correlation_id: newId(),
  };
  if (manifest.idempotencyMode === "required") body.idempotency_key = `skills-ui-${newId()}`;
  return { ok: true, body };
}

export interface PromoteForm {
  handoverKey: string;
  commit: string;
  push: string;
  deploy: string;
  gateJson: string;
}

export const EMPTY_PROMOTE_FORM: PromoteForm = { handoverKey: "", commit: "", push: "", deploy: "", gateJson: "" };

const GATE_KEYS = ["focused_results", "affected_regressions", "candidate_metrics", "active_metrics"] as const;

export interface PromoteBody {
  idempotency_key: string;
  evidence: Array<Record<string, string>>;
  focused_results: Obj;
  affected_regressions: Obj;
  candidate_metrics: Obj;
  active_metrics: Obj;
}

/** 승격 근거는 사람이 직접 채운다. 비어 있으면 서버에 보내지 않는다(기준 미달 시 버전이 격리되기 때문). */
export function buildPromoteBody(form: PromoteForm, idempotencyKey: string): BuildResult<PromoteBody> {
  const handover = form.handoverKey.trim();
  const commit = form.commit.trim();
  const push = form.push.trim();
  const deploy = form.deploy.trim();
  if (!handover) return { ok: false, error: "핸드오버 키를 입력해 주세요." };
  if (!commit || !push || !deploy) return { ok: false, error: "커밋·푸시·배포 상태를 모두 입력해 주세요." };
  const gate = parseJsonObject(form.gateJson, false);
  if (!gate.ok) return { ok: false, error: `검증 결과: ${gate.error}` };
  const missing = GATE_KEYS.filter((key) => !isObj(gate.body[key]));
  if (missing.length > 0) return { ok: false, error: `검증 결과에 빠진 항목이 있습니다: ${missing.join(", ")}` };
  return {
    ok: true,
    body: {
      idempotency_key: idempotencyKey,
      evidence: [
        { type: "aads_handover_db", entry_key: handover },
        { type: "release_state", commit, push, deploy },
      ],
      focused_results: gate.body.focused_results as Obj,
      affected_regressions: gate.body.affected_regressions as Obj,
      candidate_metrics: gate.body.candidate_metrics as Obj,
      active_metrics: gate.body.active_metrics as Obj,
    },
  };
}

export interface RollbackBody {
  idempotency_key: string;
  reason: string;
  evidence: Array<Record<string, string>>;
}

export function buildRollbackBody(reason: string, idempotencyKey: string): BuildResult<RollbackBody> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "되돌리는 사유를 입력해 주세요." };
  return {
    ok: true,
    body: {
      idempotency_key: idempotencyKey,
      reason: trimmed.slice(0, 1000),
      evidence: [{ type: "dashboard_skills_ui", note: "스킬 관리 화면에서 대표가 요청" }],
    },
  };
}

// ── 오류 문구 ───────────────────────────────────────────────────────────

const ERROR_BY_CODE: Record<string, string> = {
  human_gateway_approval_required: "이 스킬은 사람 승인이 먼저 필요해서 여기서는 실행할 수 없습니다.",
  skill_policy_rejected: "정책상 실행이 금지된 등급의 스킬입니다.",
  active_skill_version_not_found: "활성 버전이 없거나 사용이 중지된 스킬입니다. 목록을 새로고침해 주세요.",
  executor_not_registered: "서버에 이 스킬의 실행 코드가 아직 등록되어 있지 않습니다.",
  input_schema_validation_failed: "입력값이 스킬이 요구하는 형식과 맞지 않습니다.",
  idempotency_key_required: "이 스킬은 중복 실행 방지 키가 필요합니다. 다시 시도해 주세요.",
  idempotency_conflict: "같은 요청이 이미 다른 입력값으로 처리되었습니다. 다시 시도해 주세요.",
  skill_execution_failed: "스킬을 실행하는 중 오류가 발생했습니다.",
  previous_active_not_available: "되돌릴 이전 활성 버전이 없습니다.",
  previous_active_invalid: "이전 활성 버전이 되돌릴 수 있는 상태가 아닙니다.",
  version_not_promotable: "이 버전은 지금 상태에서는 승격할 수 없습니다.",
  skill_version_not_found: "해당 버전을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
  skill_not_found: "스킬을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
  aads_handover_db_evidence_required: "승격 근거에 핸드오버 기록이 필요합니다.",
  actual_commit_push_deploy_state_required: "승격 근거에 커밋·푸시·배포 상태가 필요합니다.",
  promotion_evidence_required: "승격 근거가 필요합니다.",
  rollback_reason_and_evidence_required: "되돌리는 사유가 필요합니다.",
  stored_skill_contract_mismatch: "저장된 버전 내용이 무결성 검사를 통과하지 못했습니다. 개발팀 확인이 필요합니다.",
  stored_skill_lifecycle_mismatch: "저장된 버전 상태가 서로 맞지 않습니다. 개발팀 확인이 필요합니다.",
};

export interface SkillApiFailure {
  status: number;
  code: string;
  message: string;
}

export function skillErrorMessage(failure: SkillApiFailure): string {
  const { status, code, message } = failure;
  const known = ERROR_BY_CODE[code];
  if (known) {
    const extra = message && message !== code && (code === "skill_execution_failed" || code === "input_schema_validation_failed")
      ? ` (${message.slice(0, 200)})`
      : "";
    return known + extra;
  }
  if (status === 0) return "서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.";
  if (status === 403) return "권한이 없습니다. 이 동작은 대표(관리자)만 할 수 있습니다.";
  if (status === 404) return "대상을 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  if (status === 409) return "현재 상태와 맞지 않아 처리하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.";
  if (status === 422) return "입력값을 확인해 주세요.";
  if (status >= 500) return "서버에서 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.";
  return "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}

// ── 표시 형식 ───────────────────────────────────────────────────────────

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return "-";
  return costUsd === 0 ? "$0" : `$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "-";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}초`;
}

export function latestRunText(run: SkillLatestRun | null): string {
  if (!run) return "실행 기록 없음";
  return `${runStatusLabel(run.status)} · ${formatTime(run.startedAt)}`;
}

export interface RunResultView {
  status: string;
  error: string | null;
  outputText: string;
  latencyMs: number | null;
}

/** 실행 API 응답(ops_skill_runs 한 행)을 화면용으로 줄인다. */
export function describeRunResult(data: unknown, limit = 1500): RunResultView {
  const run = isObj(data) ? data : {};
  let outputText = "";
  if (run.output !== undefined && run.output !== null) {
    try {
      outputText = typeof run.output === "string" ? run.output : JSON.stringify(run.output, null, 2);
    } catch {
      outputText = "";
    }
  }
  if (outputText.length > limit) outputText = `${outputText.slice(0, limit - 1)}…`;
  return {
    status: str(run.status) || "unknown",
    error: strOrNull(run.error),
    outputText,
    latencyMs: numOrNull(run.latency_ms),
  };
}
