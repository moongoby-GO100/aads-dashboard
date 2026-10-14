// 정본 역할 배정 패널의 순수 로직. 서버 계약(aads-server app/services/canonical_hierarchy_assignment.py,
// app/routers/work_items.py)과 맞춘다. 네트워크·DOM 의존 없음 — selftest 로 검증한다.

export const ROLES = ["PM", "Developer", "QA"] as const;
export type AssignRole = (typeof ROLES)[number];

export const ROLE_LABEL: Record<AssignRole, string> = { PM: "PM", Developer: "Developer", QA: "QA" };

export type GoalExpectation = { counts: Record<AssignRole, number>; total: number; idsMd5: string };

// 서버 도구(docs/specs/canonical-goal-hierarchy/assign_work_hierarchy.py)의 운영 기준값. 이 값은 승인 증거가 아니다 —
// 서버 응답이 이 값과 다를 때 "멈추고 확인"하게 만드는 경보 기준일 뿐이다.
export const GOAL_EXPECTATIONS: Record<string, GoalExpectation> = {
  "ac431290-66be-4d00-8bbb-9bf162917240": {
    counts: { PM: 36, Developer: 30, QA: 24 },
    total: 90,
    idsMd5: "c523a6d044c5d0be31f3469161a66beb",
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_FIND_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

export function isUuid(value: string): boolean {
  return UUID_RE.test((value || "").trim());
}

/** 붙여넣은 글에서 마지막 UUID 를 소문자로. 없으면 빈 문자열. (서버 session ref 규칙과 동일) */
export function lastUuid(text: string): string {
  const found = (text || "").match(UUID_FIND_RE);
  return found && found.length ? found[found.length - 1].toLowerCase() : "";
}

export function shortId(id: string | null | undefined): string {
  return id ? String(id).slice(0, 8) : "—";
}

// ── md5 (서버 ids_fingerprint 와 같은 지문을 브라우저에서 계산) ─────────────────────────
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

export function md5Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const m: number[] = [];
    for (let j = 0; j < 16; j++) m.push(view.getUint32(off + j * 4, true));
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      f = (f + a + MD5_K[i] + m[g]) >>> 0;
      a = d; d = c; c = b;
      b = (b + ((f << MD5_S[i]) | (f >>> (32 - MD5_S[i])))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const hex = (n: number) => Array.from({ length: 4 }, (_, k) => ((n >>> (k * 8)) & 0xff).toString(16).padStart(2, "0")).join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/** 서버 ids_fingerprint: 정렬한 ID 를 쉼표로 이어 md5. */
export function idsFingerprint(ids: readonly string[]): string {
  return md5Hex([...ids].map(String).sort().join(","));
}

// ── 서버 응답 모양 ─────────────────────────────────────────────────────────────────────
export type HolderPlan = { mode: "existing" | "new"; assignment_id: string | null; role_key: string; holder_session_id: string };
export type ApprovalEvidence = {
  decision_ref: string; decision_id: string; decision_revision: number;
  approval_message_id: string; source_session_id: string; approver_user_id: string;
  role_counts: Record<AssignRole, number>;
};
export type PreviewResult = {
  goal_id: string; project: string; evidence: ApprovalEvidence;
  plan: Record<AssignRole, string[]>; holders: Record<AssignRole, HolderPlan>;
};
export type ChangeSetRow = { id: string; state: string; patch_hash?: string; idempotency_key?: string };
export type ProposalResult = { change_set: ChangeSetRow; replayed: boolean; evidence?: ApprovalEvidence };
export type ExecuteResult = {
  change_set_id: string; state: string; execution_key: string; replayed: boolean;
  applied?: number; total?: number; assignments?: Record<string, string>; created_assignment_ids?: string[];
};
export type RollbackResult = {
  change_set_id: string; rollback_change_set_id: string; state: string; replayed: boolean;
  restored?: number; ended_assignment_ids?: string[];
};

// ── 업무 트리 집계 ────────────────────────────────────────────────────────────────────
export type TreeItemLike = {
  id: string; type: "epic" | "story" | "task"; status: string;
  assignment_id?: string | null; children?: TreeItemLike[];
};

export function flattenTree(items: readonly TreeItemLike[]): TreeItemLike[] {
  return items.flatMap((item) => [item, ...flattenTree(item.children || [])]);
}

export type TypeCounts = { epic: number; story: number; task: number; total: number };
export function emptyTypeCounts(): TypeCounts { return { epic: 0, story: 0, task: 0, total: 0 }; }

export type RoleRow = { role: AssignRole; types: TypeCounts; assigned: number; drafts: number };

/** 역할별 대상 ID(plan) 를 트리의 유형·배정 상태로 풀어 표 한 줄씩 만든다. 트리에 없는 ID 는 missing 으로 센다. */
export function summarizePlan(plan: Record<AssignRole, readonly string[]>, flat: readonly TreeItemLike[]): { rows: RoleRow[]; missing: number } {
  const byId = new Map(flat.map((item) => [item.id, item]));
  let missing = 0;
  const rows = ROLES.map((role) => {
    const types = emptyTypeCounts();
    let assigned = 0, drafts = 0;
    for (const id of plan[role] || []) {
      const item = byId.get(id);
      if (!item) { missing += 1; types.total += 1; continue; }
      types[item.type] += 1; types.total += 1;
      if (item.assignment_id) assigned += 1;
      if (item.status === "draft") drafts += 1;
    }
    return { role, types, assigned, drafts };
  });
  return { rows, missing };
}

export function countPlanTotal(plan: Record<AssignRole, readonly string[]>): number {
  return ROLES.reduce((sum, role) => sum + (plan[role]?.length || 0), 0);
}

/** 서버 계획이 기준값과 다르면 사람이 읽는 경고를 돌려준다. 빈 배열이면 일치(또는 기준값 없음). */
export function compareExpectation(goalId: string, plan: Record<AssignRole, readonly string[]>): string[] {
  const expected = GOAL_EXPECTATIONS[goalId];
  if (!expected) return [];
  const issues: string[] = [];
  const diff = ROLES.filter((role) => (plan[role]?.length || 0) !== expected.counts[role]);
  if (diff.length) {
    issues.push(`역할별 건수가 기준(PM ${expected.counts.PM} · Developer ${expected.counts.Developer} · QA ${expected.counts.QA})과 다릅니다: ` +
      ROLES.map((role) => `${role} ${plan[role]?.length || 0}`).join(" · "));
  }
  const total = countPlanTotal(plan);
  if (total !== expected.total) issues.push(`전체 대상이 ${total}건입니다(기준 ${expected.total}건).`);
  const md5 = idsFingerprint(ROLES.flatMap((role) => [...(plan[role] || [])]));
  if (md5 !== expected.idsMd5) issues.push(`ID 집합 md5 가 기준과 다릅니다(서버 ${md5} / 기준 ${expected.idsMd5}).`);
  return issues;
}

// ── 키·제목 ───────────────────────────────────────────────────────────────────────────
/** 같은 change set 에는 항상 같은 실행 키 — 더블클릭·재시도가 서버에서 한 번만 적용된다. */
export function executionKeyFor(changeSetId: string): string { return `canonical-assign-exec:${changeSetId}`; }
export function rollbackKeyFor(changeSetId: string): string { return `canonical-assign-rollback:${changeSetId}`; }

export function holderSessionTitle(role: AssignRole, goalId: string): string {
  return `[목표 ${goalId.slice(0, 8)}] ${role} 정본 역할 세션`;
}

export type SessionLike = { id: string; title?: string | null; role_key?: string | null };
export type GovernanceAssignmentLike = { role_key: string; session_id: string };
export type HolderCandidate = { sessionId: string; source: "assignment" | "session" | "created" };

/** 보유 세션 후보: ① 이미 이 목표 role_key(PM@xxxxxxxx) 로 배정된 세션 ② 제목·role_key 가 같은 기존 세션. 없으면 null(생성 필요). */
export function findHolderCandidate(
  role: AssignRole, goalId: string, sessions: readonly SessionLike[], assignments: readonly GovernanceAssignmentLike[],
): HolderCandidate | null {
  const scoped = `${role}@${goalId.slice(0, 8)}`.toLowerCase();
  const assigned = assignments.find((a) => String(a.role_key || "").toLowerCase() === scoped);
  if (assigned?.session_id) return { sessionId: assigned.session_id, source: "assignment" };
  const title = holderSessionTitle(role, goalId);
  const hit = sessions.find((s) => (s.title || "").trim() === title && String(s.role_key || "").toLowerCase() === role.toLowerCase());
  return hit ? { sessionId: hit.id, source: "session" } : null;
}

// ── 오류 문구 ─────────────────────────────────────────────────────────────────────────
export type ErrorKind = "auth" | "identity" | "stale" | "input" | "state" | "disabled" | "other";
export type FriendlyError = { kind: ErrorKind; message: string; hint?: string };

const IDENTITY = "본인 확인이 필요합니다 — 다시 로그인하십시오";
const IDENTITY_HINT = "입력한 통합지시 세션이 로그인한 계정 소유인지, 승인 결정을 남긴 세션인지 확인하십시오.";
const STALE = "대상이 바뀌어 실행이 거부됐습니다 — 미리보기를 다시 보세요";

const CODE_TABLE: Record<string, FriendlyError> = {
  unauthenticated: { kind: "auth", message: "로그인이 만료되었습니다 — 다시 로그인하십시오" },
  project_scope_denied: { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT },
  ceo_owner_verification_required: { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT },
  approval_actor_not_owner: { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT },
  rollback_owner_required: { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT },
  approver_session_impersonation: { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT },
  ceo_approval_required: { kind: "identity", message: IDENTITY, hint: "승인은 승인 결정을 남긴 통합지시 세션에서만 할 수 있습니다." },
  approval_source_not_ceo: { kind: "identity", message: IDENTITY, hint: "승인 결정의 출처 세션이 [CEO] 통합지시 창이 아닙니다." },
  target_set_mismatch: { kind: "stale", message: STALE, hint: "대상 업무가 승인 당시와 달라졌습니다(역할 표기·상태·배정)." },
  target_version_changed: { kind: "stale", message: STALE },
  approval_evidence_changed: { kind: "stale", message: STALE, hint: "승인 결정·원 메시지가 승인 이후 바뀌었습니다." },
  holder_changed: { kind: "stale", message: STALE, hint: "보유 세션 상태가 제안 당시와 달라졌습니다." },
  rollback_target_changed: { kind: "stale", message: "롤백 대상이 그 사이 바뀌어 거부됐습니다 — 미리보기를 다시 보세요" },
  approval_ref_required: { kind: "input", message: "승인 결정 참조와 승인 메시지 ID 를 모두 입력하십시오" },
  approval_ref_invalid: { kind: "input", message: "승인 메시지 ID 형식이 올바르지 않습니다(UUID)" },
  approval_decision_not_found: { kind: "input", message: "승인 결정 참조를 서버에서 찾지 못했습니다", hint: "결정 참조(handover entry_key)를 확인하십시오." },
  approval_ref_mismatch: { kind: "input", message: "결정 참조와 승인 메시지가 서로 맞지 않습니다" },
  approval_scope_exceeded: { kind: "input", message: "승인 결정의 범위가 이 작업과 맞지 않습니다(배포 허용 등)" },
  approval_roles_invalid: { kind: "input", message: "승인 결정에 역할별 건수가 올바르게 기록돼 있지 않습니다" },
  approval_source_session_missing: { kind: "input", message: "승인 결정에 출처 세션이 기록돼 있지 않습니다" },
  approval_message_mismatch: { kind: "input", message: "승인 메시지가 출처 세션의 대표님 발언과 맞지 않습니다" },
  approval_message_after_decision: { kind: "input", message: "승인 메시지가 결정보다 나중에 작성됐습니다" },
  approval_withdrawn: { kind: "state", message: "승인 결정이 철회되었습니다" },
  approval_message_withdrawn: { kind: "state", message: "승인 원 메시지가 삭제·철회되었습니다" },
  approval_revoked: { kind: "state", message: "승인이 취소된 변경입니다 — 새로 제안하십시오" },
  approval_required: { kind: "state", message: "아직 대표님 승인이 기록되지 않았습니다 — 승인 단계를 먼저 진행하십시오" },
  approval_ref_already_used: { kind: "state", message: "이 승인 결정으로 이미 진행 중이거나 실행된 변경이 있습니다" },
  idempotency_conflict: { kind: "state", message: "같은 승인으로 다른 보유 세션 구성의 제안이 이미 있습니다" },
  execution_key_conflict: { kind: "state", message: "이미 다른 실행 키로 처리된 변경입니다" },
  holders_incomplete: { kind: "input", message: "PM·Developer·QA 보유 세션 3개가 모두 필요합니다" },
  holder_duplicate: { kind: "input", message: "세 역할의 보유 세션은 서로 달라야 합니다" },
  holder_session_invalid: { kind: "input", message: "보유 세션 ID 형식이 올바르지 않습니다" },
  holder_session_forbidden: { kind: "input", message: "승인 세션은 보유 세션으로 쓸 수 없습니다" },
  holder_role_mismatch: { kind: "input", message: "보유 세션의 역할(role_key)이 맞지 않습니다" },
  holder_role_conflict: { kind: "input", message: "보유 세션이 이미 다른 역할을 맡고 있습니다" },
  role_holder_conflict: { kind: "input", message: "이 목표의 해당 역할이 다른 세션에 이미 배정돼 있습니다" },
  rollback_not_applicable: { kind: "state", message: "실행된 상태가 아니어서 롤백할 수 없습니다" },
  rollback_blocked_started: { kind: "state", message: "일부 업무가 이미 시작되어 롤백이 거부됐습니다" },
  rollback_record_missing: { kind: "state", message: "실행 기록을 찾지 못해 롤백할 수 없습니다" },
  rollback_key_and_reason_required: { kind: "input", message: "롤백 사유를 입력하십시오" },
  goal_workflow_approval_disabled: { kind: "disabled", message: "승인 워크플로 기능이 운영에서 아직 켜져 있지 않습니다" },
  goal_work_hierarchy_disabled: { kind: "disabled", message: "업무 계층 기능이 운영에서 아직 켜져 있지 않습니다" },
  goal_not_found: { kind: "input", message: "목표를 찾지 못했습니다" },
  change_set_not_found: { kind: "input", message: "변경 제안을 찾지 못했습니다" },
};

export function friendlyError(status: number, code: string | null | undefined, message?: string | null): FriendlyError {
  if (code === "project_scope_denied" && /X-Chat-Session-ID/i.test(message || "")) {
    return { kind: "input", message: "대표님 통합지시 세션을 먼저 입력하십시오" };
  }
  if (code && CODE_TABLE[code]) return CODE_TABLE[code];
  if (status === 401) return CODE_TABLE.unauthenticated;
  if (status === 403) return { kind: "identity", message: IDENTITY, hint: IDENTITY_HINT };
  if (status === 404) return { kind: "other", message: "요청한 대상을 찾지 못했습니다(기능이 아직 켜져 있지 않을 수 있습니다)" };
  if (status === 409) return { kind: "stale", message: STALE };
  if (status === 422 || status === 400) return { kind: "input", message: "입력값을 서버가 받아들이지 않았습니다 — 입력을 확인하십시오" };
  if (status >= 500) return { kind: "other", message: "서버 오류가 발생했습니다 — 잠시 뒤 다시 시도하십시오" };
  return { kind: "other", message: "요청을 처리하지 못했습니다" };
}

/** FastAPI 오류 본문에서 (code, message) 를 꺼낸다. detail 이 {code,message} / 문자열 / 배열(422) 모두 가능. */
export function parseErrorBody(body: unknown): { code: string | null; message: string | null } {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: unknown; message?: unknown };
    return { code: typeof d.code === "string" ? d.code : null, message: typeof d.message === "string" ? d.message : null };
  }
  if (typeof detail === "string") return { code: null, message: detail };
  if (Array.isArray(detail)) return { code: null, message: JSON.stringify(detail).slice(0, 300) };
  return { code: null, message: null };
}

/** 대표님 소유자 권한 판정(노출용). 최종 판정은 서버가 한다. */
export function isOwnerUser(user: {
  tenant_role?: string | null; user_role?: string | null; membership?: { role?: string | null } | null;
} | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.tenant_role || user.membership?.role || "").toLowerCase();
  return role === "owner" || String(user.user_role || "").toLowerCase() === "ceo";
}
