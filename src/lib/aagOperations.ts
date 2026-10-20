// 아키텍처 상태(AAG) 화면의 순수 로직 — 타입, 4축 판정, 오류 분류, 필터 복원, 결함 정규화.
// 서버 계약: GET /api/v1/aag/v2/operations (aag-operations-v1, 공유 backend 예정 계약),
// GET /api/v1/aag/v2/findings (aag-v2, 기존). 이 파일은 네트워크를 쓰지 않는다.

export const OPERATIONS_SCHEMA = "aag-operations-v1";

export type AxisStatus = string | null | undefined;

export type OperationsAxes = {
  freshness?: { status?: AxisStatus; verified_at?: string | null; age_minutes?: number | null } | null;
  last_run?: { status?: AxisStatus; finished_at?: string | null; error?: string | null; reason?: string | null } | null;
  debt?: { status?: AxisStatus; p0?: number | null; p1?: number | null; p2?: number | null; p3?: number | null } | null;
  coverage?: {
    status?: AxisStatus;
    inventory_scanned?: number | null; inventory_total?: number | null;
    risk_scanned?: number | null; risk_total?: number | null;
  } | null;
};

export type RecoveryAction = { kind: string; label: string; enabled: boolean; reason?: string | null };

export type OperationsResponse = {
  schema_version: string;
  project: string;
  repository_id: string;
  target_ref: string;
  snapshot_id: string | null;
  commit_sha: string | null;
  axes: OperationsAxes;
  recovery_actions?: RecoveryAction[];
  limitations?: string[];
};

export type AagFilters = {
  project: string;
  repositoryId: string;
  targetRef: string;
  severity: string;
  finding: string;
};

export const DEFAULT_FILTERS: AagFilters = {
  project: "GO100",
  repositoryId: "kis-autotrade-v4",
  targetRef: "refs/heads/main",
  severity: "",
  finding: "",
};

export const PROJECT_PRESETS: ReadonlyArray<{ project: string; repositoryId: string; targetRef: string }> = [
  { project: "GO100", repositoryId: "kis-autotrade-v4", targetRef: "refs/heads/main" },
  { project: "AADS", repositoryId: "aads-server", targetRef: "refs/heads/main" },
];

export const SEVERITY_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
];

// ---- 필터 복원 -------------------------------------------------------------

const PROJECT_RE = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const REF_RE = /^refs\/[A-Za-z0-9._/-]{1,200}$/;
const SEVERITY_RE = /^P[0-3]$/;
const FINDING_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$/;

export const FILTER_STORAGE_KEY = "aag.ops.filters.v1";

export function isValidRef(ref: string): boolean {
  return REF_RE.test(ref) && !ref.includes("..") && !ref.endsWith("/");
}

function pick(value: string | null | undefined, ok: (v: string) => boolean): string | null {
  const v = (value ?? "").trim();
  return v && ok(v) ? v : null;
}

type FilterSource = { project?: string | null; repository_id?: string | null; target_ref?: string | null; severity?: string | null; finding?: string | null };

function fromParams(p: URLSearchParams): FilterSource {
  return {
    project: p.get("project"), repository_id: p.get("repo"), target_ref: p.get("ref"),
    severity: p.get("sev"), finding: p.get("finding"),
  };
}

function fromStored(raw: string | null | undefined): FilterSource {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
    return { project: s("project"), repository_id: s("repository_id"), target_ref: s("target_ref") };
  } catch {
    return {};
  }
}

// 우선순위: 주소(URL) > 마지막 사용값(localStorage) > 기본값. severity/finding 은 주소에서만 복원한다.
export function resolveFilters(search: string, storedRaw: string | null | undefined): { filters: AagFilters; rejected: string[] } {
  const url = fromParams(new URLSearchParams(search ?? ""));
  const stored = fromStored(storedRaw);
  const rejected: string[] = [];
  const check = (label: string, fromUrl: string | null | undefined, fromStore: string | null | undefined, ok: (v: string) => boolean): string | null => {
    const u = pick(fromUrl, ok);
    if (u) return u;
    if ((fromUrl ?? "").trim()) rejected.push(label);
    return pick(fromStore, ok);
  };
  const project = check("프로젝트", url.project?.toUpperCase(), stored.project?.toUpperCase(), (v) => PROJECT_RE.test(v));
  const sameProjectAsStored = !!project && project === pick(stored.project?.toUpperCase(), (v) => PROJECT_RE.test(v));
  const preset = PROJECT_PRESETS.find((p) => p.project === project);
  const repo = check("저장소", url.repository_id, sameProjectAsStored ? stored.repository_id : null, (v) => REPO_RE.test(v));
  const ref = check("브랜치", url.target_ref, sameProjectAsStored ? stored.target_ref : null, isValidRef);
  const severity = pick(url.severity?.toUpperCase(), (v) => SEVERITY_RE.test(v));
  if ((url.severity ?? "").trim() && !severity) rejected.push("심각도");
  const finding = pick(url.finding, (v) => FINDING_RE.test(v));
  if ((url.finding ?? "").trim() && !finding) rejected.push("결함");
  return {
    filters: {
      project: project ?? DEFAULT_FILTERS.project,
      repositoryId: repo ?? preset?.repositoryId ?? (project ? "" : DEFAULT_FILTERS.repositoryId),
      targetRef: ref ?? preset?.targetRef ?? (project ? "refs/heads/main" : DEFAULT_FILTERS.targetRef),
      severity: severity ?? "",
      finding: finding ?? "",
    },
    rejected,
  };
}

export function filtersToSearch(f: AagFilters): string {
  const p = new URLSearchParams();
  p.set("project", f.project);
  if (f.repositoryId) p.set("repo", f.repositoryId);
  p.set("ref", f.targetRef);
  if (f.severity) p.set("sev", f.severity);
  if (f.finding) p.set("finding", f.finding);
  return p.toString();
}

export function filtersToStored(f: AagFilters): string {
  return JSON.stringify({ project: f.project, repository_id: f.repositoryId, target_ref: f.targetRef });
}

export function filtersReady(f: AagFilters): boolean {
  return PROJECT_RE.test(f.project) && REPO_RE.test(f.repositoryId) && isValidRef(f.targetRef);
}

export function isOperations(v: unknown): v is OperationsResponse {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.project === "string" && typeof o.repository_id === "string" && typeof o.target_ref === "string"
    && !!o.axes && typeof o.axes === "object";
}

// ---- 시간 표시 -------------------------------------------------------------

export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function formatKst(value: string | null | undefined): string {
  const t = parseTime(value);
  if (t === null) return "기록 없음";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(t));
  const g = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")} KST`;
}

export function formatAge(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "경과 시간 미확인";
  if (minutes < 1) return "1분 미만 전";
  if (minutes < 60) return `${Math.floor(minutes)}분 전`;
  if (minutes < 60 * 48) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}

export function ageMinutesAt(value: string | null | undefined, now: Date): number | null {
  const t = parseTime(value);
  return t === null ? null : Math.max(0, Math.floor((now.getTime() - t) / 60000));
}

// ---- 4축 판정 --------------------------------------------------------------

export type Tone = "ok" | "warn" | "bad" | "info" | "unknown";
export type AxisKey = "freshness" | "last_run" | "debt" | "coverage";

export const AXIS_LABELS: Record<AxisKey, string> = {
  freshness: "최신성",
  last_run: "마지막 적재",
  debt: "결함 부채",
  coverage: "검사 범위",
};

export const TONE_LABELS: Record<Tone, string> = {
  ok: "정상",
  warn: "주의",
  bad: "문제",
  info: "참고",
  unknown: "미입증",
};

export type AxisView = {
  key: AxisKey;
  label: string;
  tone: Tone;
  headline: string;
  detail: string;
  rawStatus: string;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const lc = (v: AxisStatus) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export type CoverageProof = { proven: boolean; reason: string };

export function coverageProof(c: OperationsAxes["coverage"]): CoverageProof {
  if (!c) return { proven: false, reason: "검사 범위 정보가 없습니다" };
  const pairs: Array<[string, unknown, unknown]> = [
    ["인벤토리", c.inventory_scanned, c.inventory_total],
    ["위험 영역", c.risk_scanned, c.risk_total],
  ];
  for (const [name, scanned, total] of pairs) {
    if (!num(scanned) || !num(total)) return { proven: false, reason: `${name} 검사 수치가 없습니다` };
    if (total <= 0) return { proven: false, reason: `${name} 전체 수가 0이라 검사 범위를 입증할 수 없습니다` };
    if (scanned <= 0) return { proven: false, reason: `${name}을 하나도 검사하지 않았습니다` };
    if (scanned > total) return { proven: false, reason: `${name} 검사 수가 전체 수보다 커서 범위를 입증할 수 없습니다` };
    if (scanned < total) return { proven: false, reason: `${name} ${scanned}/${total}만 검사했습니다` };
  }
  if (!["complete", "full"].includes(lc(c.status))) {
    return { proven: false, reason: "서버가 전체 범위 검사를 확인하지 못했습니다. 미관측 영역을 확인하세요" };
  }
  return { proven: true, reason: "인벤토리와 위험 영역을 모두 검사했습니다" };
}

function freshnessView(a: OperationsAxes["freshness"]): AxisView {
  const base = { key: "freshness" as const, label: AXIS_LABELS.freshness, rawStatus: lc(a?.status) };
  if (!a) return { ...base, tone: "unknown", headline: "정보 없음", detail: "최신성 정보를 받지 못했습니다" };
  const s = lc(a.status);
  const when = parseTime(a.verified_at) === null ? "검증 시각 기록 없음" : `${formatKst(a.verified_at)} · ${formatAge(a.age_minutes)}`;
  if (["failed", "error"].includes(s)) return { ...base, tone: "bad", headline: "최신성 확인 실패", detail: when };
  if (["stale", "expired", "outdated"].includes(s)) return { ...base, tone: "warn", headline: "오래됨(stale)", detail: when };
  if (s === "fresh") {
    if (parseTime(a.verified_at) === null) return { ...base, tone: "unknown", headline: "최신이라고 표시됐지만 근거 시각 없음", detail: when };
    return { ...base, tone: "ok", headline: "최신", detail: when };
  }
  return { ...base, tone: "unknown", headline: "최신성 판단 불가", detail: when };
}

function lastRunView(a: OperationsAxes["last_run"]): AxisView {
  const base = { key: "last_run" as const, label: AXIS_LABELS.last_run, rawStatus: lc(a?.status) };
  if (!a) return { ...base, tone: "unknown", headline: "정보 없음", detail: "적재 실행 정보를 받지 못했습니다" };
  const s = lc(a.status);
  const finished = parseTime(a.finished_at) === null ? "종료 시각 기록 없음" : `${formatKst(a.finished_at)}에 종료`;
  const why = [a.error, a.reason].filter((x): x is string => !!x && x.trim() !== "").join(" · ");
  if (["succeeded", "success", "ok", "completed", "verified"].includes(s)) {
    if (parseTime(a.finished_at) === null) return { ...base, tone: "unknown", headline: "성공이라고 표시됐지만 종료 시각 없음", detail: why || finished };
    return { ...base, tone: "ok", headline: "적재 성공", detail: finished };
  }
  if (["failed", "error", "scan_failed", "ingest_failed", "commit_mismatch"].includes(s)) {
    return { ...base, tone: "bad", headline: "적재 실패", detail: [finished, why].filter(Boolean).join(" · ") };
  }
  if (["source_behind", "out_of_order", "partial"].includes(s)) {
    return { ...base, tone: "warn", headline: "실행 결과를 최신으로 인정하지 못함", detail: [finished, why].filter(Boolean).join(" · ") };
  }
  if (["running", "pending", "queued", "in_progress"].includes(s)) {
    return { ...base, tone: "info", headline: "적재 진행 중", detail: why || "완료 후 다시 확인하세요" };
  }
  if (["none", "no_run", "never", "no_snapshot"].includes(s)) {
    return { ...base, tone: "unknown", headline: "적재 기록 없음", detail: why || "아직 확인된 적재 기록이 없습니다" };
  }
  return { ...base, tone: "unknown", headline: "적재 상태 판단 불가", detail: [finished, why].filter(Boolean).join(" · ") };
}

function coverageView(a: OperationsAxes["coverage"]): AxisView {
  const base = { key: "coverage" as const, label: AXIS_LABELS.coverage, rawStatus: lc(a?.status) };
  const proof = coverageProof(a);
  const fmt = (x: unknown, y: unknown) => (num(x) && num(y) ? `${x}/${y}` : "수치 없음");
  const detail = a ? `인벤토리 ${fmt(a.inventory_scanned, a.inventory_total)} · 위험 영역 ${fmt(a.risk_scanned, a.risk_total)}` : proof.reason;
  if (proof.proven) return { ...base, tone: "ok", headline: "전체 범위 검사", detail };
  const zero = !a || [a.inventory_total, a.risk_total].some((t) => !num(t) || t <= 0);
  if (zero) return { ...base, tone: "unknown", headline: "검사 범위 미입증", detail: `${detail} — ${proof.reason}` };
  return { ...base, tone: "warn", headline: "일부만 검사", detail: `${detail} — ${proof.reason}` };
}

function debtView(a: OperationsAxes["debt"], coverage: CoverageProof): AxisView {
  const base = { key: "debt" as const, label: AXIS_LABELS.debt, rawStatus: lc(a?.status) };
  if (!a) return { ...base, tone: "unknown", headline: "정보 없음", detail: "결함 집계를 받지 못했습니다" };
  const counts = { p0: a.p0, p1: a.p1, p2: a.p2, p3: a.p3 };
  if (![counts.p0, counts.p1].every(num)) {
    return { ...base, tone: "unknown", headline: "P0/P1 집계 없음", detail: "결함 수를 알 수 없어 결함이 없다고 말할 수 없습니다" };
  }
  const detail = `P0 ${counts.p0} · P1 ${counts.p1} · P2 ${num(counts.p2) ? counts.p2 : "-"} · P3 ${num(counts.p3) ? counts.p3 : "-"}`;
  if ((counts.p0 as number) > 0) return { ...base, tone: "bad", headline: `P0 ${counts.p0}건 해결 필요`, detail };
  if ((counts.p1 as number) > 0) return { ...base, tone: "warn", headline: `P1 ${counts.p1}건 확인 필요`, detail };
  if (!coverage.proven) {
    return { ...base, tone: "unknown", headline: "결함 없음은 미입증", detail: `${detail} — 검사 범위가 입증되지 않아 결함이 없다고 볼 수 없습니다` };
  }
  const minor = (num(counts.p2) ? counts.p2 : 0) + (num(counts.p3) ? counts.p3 : 0);
  if (minor > 0) return { ...base, tone: "info", headline: "P0/P1 없음, P2·P3 남음", detail };
  return { ...base, tone: "ok", headline: "검사 범위 안에서 결함 없음", detail };
}

export function buildAxisViews(axes: OperationsAxes): AxisView[] {
  const coverage = coverageProof(axes.coverage);
  return [freshnessView(axes.freshness), lastRunView(axes.last_run), debtView(axes.debt, coverage), coverageView(axes.coverage)];
}

// 4축을 한 개의 색으로 합치지 않는다. 개수 요약만 만든다.
export function summarizeAxes(views: readonly AxisView[]): { counts: Record<Tone, number>; sentence: string } {
  const counts: Record<Tone, number> = { ok: 0, warn: 0, bad: 0, info: 0, unknown: 0 };
  for (const v of views) counts[v.tone] += 1;
  const parts = (["bad", "warn", "unknown", "info", "ok"] as Tone[])
    .filter((t) => counts[t] > 0)
    .map((t) => `${TONE_LABELS[t]} ${counts[t]}`);
  return { counts, sentence: `${views.length}개 축 중 ${parts.join(" · ")}` };
}

// ---- 복구 행동 -------------------------------------------------------------

export type RecoveryView = { kind: string; label: string; enabled: boolean; reason: string; note: string };

// 이 화면은 다시 스캔·권한 우회 API 를 호출하지 않는다. enabled 여부와 무관하게 안내만 보여준다.
export function buildRecoveryViews(actions: readonly RecoveryAction[] | undefined, views: readonly AxisView[]): RecoveryView[] {
  const list = (actions ?? []).filter((a) => a && typeof a.label === "string" && a.label.trim() !== "");
  if (list.length > 0) {
    return list.map((a) => ({
      kind: a.kind,
      label: a.label,
      enabled: !!a.enabled,
      reason: (a.reason ?? "").trim() || (a.enabled ? "서버가 가능하다고 표시했습니다" : "서버가 이유를 알려주지 않았습니다"),
      note: a.enabled
        ? "이 화면에서는 실행하지 않습니다. 운영 승인 후 Runner 또는 운영 담당이 수행합니다."
        : "지금은 실행할 수 없습니다.",
    }));
  }
  const need = views.filter((v) => v.tone === "bad" || v.tone === "warn" || v.tone === "unknown");
  if (need.length === 0) return [];
  return [{
    kind: "guidance",
    label: "복구 안내",
    enabled: false,
    reason: `서버가 복구 행동 목록을 보내지 않았습니다. 확인 필요 축: ${need.map((v) => v.label).join(", ")}`,
    note: "다시 스캔은 이 화면에서 실행하지 않습니다. 운영 승인을 요청하거나 운영 담당에게 알려 주세요.",
  }];
}

// ---- 오류 분류 -------------------------------------------------------------

export type AagErrorKind =
  | "network" | "auth" | "forbidden" | "not_scanned" | "disabled" | "endpoint_missing"
  | "snapshot_changed" | "bad_request" | "server" | "unknown";

export type AagErrorView = {
  kind: AagErrorKind;
  status: number;
  title: string;
  message: string;
  action: string;
  retryable: boolean;
  loginRequired: boolean;
};

export function detailText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const d = (body as Record<string, unknown>).detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const m = (d as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function classifyApiError(status: number, body: unknown, endpoint: "operations" | "findings" = "operations"): AagErrorView {
  const detail = detailText(body).toLowerCase();
  const mk = (kind: AagErrorKind, title: string, message: string, action: string, retryable: boolean, loginRequired = false): AagErrorView =>
    ({ kind, status, title, message, action, retryable, loginRequired });
  if (status === 0) {
    return mk("network", "서버에 연결하지 못했습니다", "네트워크가 끊겼거나 서버가 응답하지 않습니다.", "연결을 확인한 뒤 다시 시도하세요.", true);
  }
  if (status === 401) {
    return mk("auth", "로그인이 필요합니다", "로그인이 만료되었거나 확인되지 않았습니다.", "다시 로그인하면 이 화면으로 돌아옵니다.", false, true);
  }
  if (status === 403) {
    return mk("forbidden", "이 프로젝트를 볼 권한이 없습니다", "아키텍처 상태는 해당 프로젝트의 조회 권한(viewer 이상)이 있어야 열립니다.", "권한 부여는 프로젝트 운영 담당에게 요청하세요. 이 화면에서는 권한을 바꿀 수 없습니다.", false);
  }
  if (status === 404) {
    if (detail.includes("snapshot")) {
      return mk("not_scanned", "아직 스캔된 스냅샷이 없습니다", "이 저장소·브랜치에 검증된 최신 스냅샷이 없습니다. 결함이 없다는 뜻이 아닙니다.", "최초 스캔이 필요합니다. 스캔 실행은 운영 승인 후 진행됩니다.", true);
    }
    if (detail.includes("disabled")) {
      return mk("disabled", "아키텍처 상태 조회가 꺼져 있습니다", "서버에서 AAG v2 조회가 비활성화되어 있습니다.", "운영 담당에게 활성화 여부를 확인하세요.", true);
    }
    if (endpoint === "operations") {
      return mk("endpoint_missing", "상태 요약 API가 아직 준비되지 않았습니다", "서버가 상태 요약 경로를 알지 못합니다. 아직 배포되지 않았을 수 있습니다.", "배포 상태를 확인하세요. 이 화면은 준비되는 즉시 같은 주소로 읽습니다.", true);
    }
    return mk("not_scanned", "조회할 스냅샷이 없습니다", "결함 목록을 읽을 스냅샷을 찾지 못했습니다.", "상태 요약을 새로고침하세요.", true);
  }
  if (status === 400 && endpoint === "findings") {
    return mk("snapshot_changed", "스냅샷이 바뀌었습니다", "보고 있던 스냅샷이 더 이상 최신이 아니거나 목록 위치(cursor)가 맞지 않습니다.", "상태 요약을 새로고침해 최신 스냅샷에서 다시 시작하세요.", true);
  }
  if (status >= 500) {
    return mk("server", "서버에서 오류가 났습니다", `서버 응답 코드 ${status}.`, "잠시 뒤 다시 시도하세요. 계속되면 운영 담당에게 알려 주세요.", true);
  }
  if (status >= 400) {
    return mk("bad_request", "요청이 거부되었습니다", `서버가 요청을 받아들이지 않았습니다 (코드 ${status}).`, "대상 설정(프로젝트·저장소·브랜치)을 확인하세요.", false);
  }
  return mk("unknown", "알 수 없는 오류", `예상하지 못한 응답입니다 (코드 ${status}).`, "다시 시도하세요.", true);
}

// ---- 결함 ------------------------------------------------------------------

export const RULE_LABELS: Record<string, string> = {
  ROUTE_SHADOWED: "다른 경로에 가려진 라우트",
  ORPHAN_ROUTER: "연결되지 않은 라우터",
  STALE_BACKUP: "오래된 백업 파일",
};

export type FindingView = {
  key: string;
  severity: string;
  severityRank: number;
  ruleCode: string;
  ruleLabel: string;
  title: string;
  path: string;
  status: string;
  owners: string[];
  evidence: Array<[string, string]>;
};

const SEVERITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function normalizeFinding(raw: unknown, index = 0): FindingView {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const severity = s(f.severity).toUpperCase();
  const ruleCode = s(f.rule);
  const path = (s(f.path) || s(f.module) || s(f.file) || s(f.semantic_target)).replace(/\\/g, "/");
  const key = s(f.stable_finding_key) || s(f.key) || `row-${index}`;
  const ruleLabel = RULE_LABELS[ruleCode.toUpperCase()] ?? (ruleCode ? "분류 이름이 아직 없는 규칙" : "규칙 정보 없음");
  const owners = (Array.isArray(f.owners) ? f.owners : [f.owner]).map(s).filter(Boolean);
  const title = s(f.title) || s(f.message) || s(f.description) || ruleLabel;
  const evidence: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(f)) {
    if (v === null || v === undefined || v === "") continue;
    evidence.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  return {
    key,
    severity: severity in SEVERITY_RANK ? severity : "기타",
    severityRank: SEVERITY_RANK[severity] ?? 9,
    ruleCode,
    ruleLabel,
    title,
    path,
    status: s(f.status).toLowerCase() || "open",
    owners,
    evidence,
  };
}

export function statusLabel(status: string): string {
  switch (status) {
    case "open": return "열림";
    case "resolved": case "closed": return "해결됨";
    case "excepted": case "accepted": return "예외 승인";
    default: return "상태 확인 필요";
  }
}

export function shortSha(sha: string | null | undefined): string {
  const v = (sha ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(v) ? v.slice(0, 8) : "";
}

export type FindingsPage = {
  snapshot_id?: string;
  findings?: unknown[];
  pagination?: { total?: number; returned?: number; next_cursor?: string | null };
};

// 결함 목록이 상태 요약과 같은 스냅샷에서 왔는지 확인한다.
export function findingsMatchSnapshot(page: FindingsPage | null | undefined, snapshotId: string | null | undefined): boolean {
  return !!page && !!snapshotId && page.snapshot_id === snapshotId;
}

export const EVIDENCE_DOCS: ReadonlyArray<{ label: string; project: string; documentKey: string; note: string }> = [
  { label: "AAG 소비자 목록", project: "GO100", documentKey: "aag-consumer-inventory", note: "초안 · 승인 여부 미확인" },
];
