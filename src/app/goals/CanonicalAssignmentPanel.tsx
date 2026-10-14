"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getMe } from "@/lib/auth";
import {
  AssignmentApiError, createHolderSession, decideAssignment, executeAssignment, listProjectWorkspaces,
  listWorkspaceSessions, loadGoalSnapshot, previewAssignment, proposeAssignment, rollbackAssignment,
} from "@/lib/canonicalAssignmentApi";
import {
  GOAL_EXPECTATIONS, ROLES, compareExpectation, emptyTypeCounts, executionKeyFor, findHolderCandidate, flattenTree,
  friendlyError, holderSessionTitle, isOwnerUser, isUuid, lastUuid, rollbackKeyFor, shortId, summarizePlan,
  type AssignRole, type ExecuteResult, type FriendlyError, type HolderCandidate, type PreviewResult,
  type RollbackResult, type RoleRow, type TreeItemLike,
} from "@/lib/canonicalAssignmentModel";

type Props = { goalId: string; goalTitle: string; project: string };
type Workspace = { id: string; name?: string; display_name?: string };
type ChangeSetState = {
  id: string; state: string; actor: string; decisionRef: string; messageId: string;
  plan: PreviewResult["plan"]; holders: Record<AssignRole, string>; replayed: boolean;
};
type ShownError = FriendlyError & { raw: string };
type ModalKind = "sessions" | "approve" | "execute" | "rollback";

const STORE_PREFIX = "aads.canonicalAssign.";
const HOLDER_SOURCE_LABEL: Record<HolderCandidate["source"], string> = {
  assignment: "이미 배정된 세션 재사용", session: "기존 세션 재사용", created: "방금 생성",
};

const card: CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-primary)", padding: 12, marginTop: 10 };
const th: CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "6px 8px", fontSize: 12, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 44, padding: "0 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", boxSizing: "border-box" };

function button(color: string, enabled: boolean, solid = true): CSSProperties {
  return {
    minHeight: 44, minWidth: 44, padding: "0 14px", borderRadius: 8, fontWeight: 800, fontSize: 12.5,
    border: `1px solid ${enabled ? color : "var(--border)"}`,
    background: enabled && solid ? color : "transparent",
    color: enabled ? (solid ? "white" : color) : "var(--text-secondary)",
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.6,
  };
}

function Table({ children, minWidth = 460 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth }}>{children}</table>
    </div>
  );
}

function Step({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-primary)" }}>
        <span style={{ color: "var(--accent)", marginRight: 6 }}>{no}</span>{title}
      </div>
      {children}
    </div>
  );
}

function Modal({ title, onCancel, onConfirm, confirmLabel, confirmColor, confirmDisabled, children }: {
  title: string; onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmColor: string;
  confirmDisabled?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div role="presentation" onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border)", padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: "var(--text-primary)" }}>{children}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" autoFocus onClick={onCancel} style={button("var(--accent)", true, false)}>취소</button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled} style={button(confirmColor, !confirmDisabled)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function toShownError(cause: unknown): ShownError {
  if (cause instanceof AssignmentApiError) return { ...cause.friendly, raw: cause.raw() };
  const text = cause instanceof Error ? cause.message : String(cause);
  const status = Number((/(?:API error |^)(\d{3})/.exec(text) || [])[1] || 0);
  return { ...friendlyError(status, null), raw: JSON.stringify({ message: text.slice(0, 400) }, null, 2) };
}

function RoleTable({ rows, showAssigned }: { rows: RoleRow[]; showAssigned?: boolean }) {
  const total = rows.reduce((acc, r) => {
    acc.epic += r.types.epic; acc.story += r.types.story; acc.task += r.types.task; acc.total += r.types.total;
    acc.assigned += r.assigned; acc.drafts += r.drafts; return acc;
  }, { ...emptyTypeCounts(), assigned: 0, drafts: 0 });
  return (
    <Table minWidth={480}>
      <thead><tr>
        <th style={th}>역할</th><th style={th}>Epic</th><th style={th}>Story</th><th style={th}>Task</th>
        <th style={th}>합계</th><th style={th}>draft</th>{showAssigned && <th style={th}>배정 연결</th>}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.role}>
            <td style={{ ...td, fontWeight: 800 }}>{r.role}</td><td style={td}>{r.types.epic}</td><td style={td}>{r.types.story}</td>
            <td style={td}>{r.types.task}</td><td style={{ ...td, fontWeight: 800 }}>{r.types.total}</td>
            <td style={td}>{r.drafts}</td>{showAssigned && <td style={td}>{r.assigned}</td>}
          </tr>
        ))}
        <tr>
          <td style={{ ...td, fontWeight: 800 }}>전체</td><td style={td}>{total.epic}</td><td style={td}>{total.story}</td>
          <td style={td}>{total.task}</td><td style={{ ...td, fontWeight: 800 }}>{total.total}</td>
          <td style={td}>{total.drafts}</td>{showAssigned && <td style={td}>{total.assigned}</td>}
        </tr>
      </tbody>
    </Table>
  );
}

function PanelBody({ goalId, goalTitle, project }: Props) {
  const [open, setOpen] = useState(Boolean(GOAL_EXPECTATIONS[goalId]));
  const [flat, setFlat] = useState<TreeItemLike[] | null>(null);
  const [assignments, setAssignments] = useState<Array<{ role_key: string; session_id: string }>>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [candidates, setCandidates] = useState<Record<AssignRole, HolderCandidate | null>>({ PM: null, Developer: null, QA: null });
  const [actorRaw, setActorRaw] = useState("");
  const [decisionRef, setDecisionRef] = useState("");
  const [messageRaw, setMessageRaw] = useState("");
  const [preview, setPreview] = useState<{ data: PreviewResult; sig: string } | null>(null);
  const [cs, setCs] = useState<ChangeSetState | null>(null);
  const [before, setBefore] = useState<RoleRow[] | null>(null);
  const [after, setAfter] = useState<RoleRow[] | null>(null);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const [rbResult, setRbResult] = useState<RollbackResult | null>(null);
  const [rbReason, setRbReason] = useState("");
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ShownError | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const busyRef = useRef(false);

  const actorId = lastUuid(actorRaw);
  const messageId = lastUuid(messageRaw);
  const holderIds = useMemo(() => ({
    PM: candidates.PM?.sessionId || "", Developer: candidates.Developer?.sessionId || "", QA: candidates.QA?.sessionId || "",
  }), [candidates]);
  const holdersReady = ROLES.every((r) => isUuid(holderIds[r]));
  const inputSig = [actorId, decisionRef.trim(), messageId, holderIds.PM, holderIds.Developer, holderIds.QA].join("|");

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_PREFIX + goalId) || "null");
      if (saved) { setActorRaw(saved.actor || ""); setDecisionRef(saved.decisionRef || ""); setMessageRaw(saved.message || ""); }
    } catch { /* 저장값이 깨졌으면 빈 입력으로 시작 */ }
  }, [goalId]);
  useEffect(() => {
    try { sessionStorage.setItem(STORE_PREFIX + goalId, JSON.stringify({ actor: actorRaw, decisionRef, message: messageRaw })); } catch { /* 무시 */ }
  }, [goalId, actorRaw, decisionRef, messageRaw]);

  const refreshSnapshot = useCallback(async (): Promise<TreeItemLike[]> => {
    const [tree, governance] = await loadGoalSnapshot(goalId);
    const next = flattenTree(tree.items as unknown as TreeItemLike[]);
    setFlat(next);
    setAssignments((governance.assignments || []).map((a) => ({ role_key: a.role_key, session_id: a.session_id })));
    return next;
  }, [goalId]);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true); setError(null);
    try {
      const [, spaces] = await Promise.all([refreshSnapshot(), listProjectWorkspaces(project)]);
      setWorkspaces(spaces);
      setWorkspaceId((cur) => cur || spaces[0]?.id || "");
    } catch (cause) { setError(toShownError(cause)); }
    finally { setLoadingStatus(false); }
  }, [project, refreshSnapshot]);

  useEffect(() => { if (open && flat === null) void loadStatus(); }, [open, flat, loadStatus]);

  // 보유 세션 후보 계산(읽기 전용): 배정된 세션 → 같은 제목·역할의 기존 세션 순으로 찾는다.
  useEffect(() => {
    if (!open || !workspaceId || flat === null) return;
    let cancelled = false;
    listWorkspaceSessions(workspaceId).then((sessions) => {
      if (cancelled) return;
      setCandidates((prev) => Object.fromEntries(ROLES.map((role) => {
        const found = findHolderCandidate(role, goalId, sessions, assignments);
        return [role, found || (prev[role]?.source === "created" ? prev[role] : null)];
      })) as Record<AssignRole, HolderCandidate | null>);
    }).catch((cause) => { if (!cancelled) setError(toShownError(cause)); });
    return () => { cancelled = true; };
  }, [open, workspaceId, flat, assignments, goalId]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(null);
    try { await fn(); } catch (cause) { setError(toShownError(cause)); }
    finally { busyRef.current = false; setBusy(null); }
  }, []);

  const previewFresh = preview !== null && preview.sig === inputSig;
  const issues = useMemo(() => (preview ? compareExpectation(goalId, preview.data.plan) : []), [preview, goalId]);
  const actorMismatch = preview !== null && preview.data.evidence.source_session_id !== actorId;
  const goalMismatch = preview !== null && preview.data.goal_id !== goalId;
  const gateOk = previewFresh && issues.length === 0 && !actorMismatch && !goalMismatch;
  const previewRows = useMemo(() => (preview && flat ? summarizePlan(preview.data.plan, flat) : null), [preview, flat]);
  const canPreview = !busy && Boolean(actorId) && decisionRef.trim().length > 0 && isUuid(messageId) && holdersReady;
  const missingRoles = ROLES.filter((r) => !candidates[r]);

  const doCreateSessions = () => run("세션 생성 중", async () => {
    setModal(null);
    if (!workspaceId) throw new Error("프로젝트 워크스페이스를 찾지 못했습니다.");
    for (const role of ROLES) {
      // 만들기 직전에 목록을 다시 읽어 중복 생성을 막는다.
      const sessions = await listWorkspaceSessions(workspaceId);
      const found = findHolderCandidate(role, goalId, sessions, assignments);
      if (found) { setCandidates((p) => ({ ...p, [role]: found })); continue; }
      const made = await createHolderSession(workspaceId, role, holderSessionTitle(role, goalId));
      setCandidates((p) => ({ ...p, [role]: { sessionId: made.id, source: "created" } }));
    }
  });

  const doPreview = () => run("서버 미리보기 중", async () => {
    const data = await previewAssignment(goalId, actorId, { decisionRef: decisionRef.trim(), messageId }, holderIds);
    setPreview({ data, sig: inputSig });
    await refreshSnapshot();
  });

  const doPropose = () => run("제안 중", async () => {
    if (!preview || !gateOk) return;
    const res = await proposeAssignment(goalId, actorId, { decisionRef: decisionRef.trim(), messageId }, holderIds);
    setCs({
      id: res.change_set.id, state: res.change_set.state, actor: actorId, decisionRef: decisionRef.trim(), messageId,
      plan: preview.data.plan, holders: { ...holderIds }, replayed: res.replayed,
    });
  });

  const doApprove = () => run("승인 기록 중", async () => {
    setModal(null);
    if (!cs) return;
    await decideAssignment(cs.id, cs.actor, true, "대표님 확인 — 정본 역할 배정 패널에서 승인");
    setCs({ ...cs, state: "approved" });
  });

  const doExecute = () => run("실행 중", async () => {
    setModal(null);
    if (!cs) return;
    const latest = await refreshSnapshot();
    setBefore(summarizePlan(cs.plan, latest).rows);
    setAfter(null); setExecResult(null); setRbResult(null);
    const res = await executeAssignment(cs.id, cs.actor, { decisionRef: cs.decisionRef, messageId: cs.messageId }, executionKeyFor(cs.id));
    setExecResult(res);
    setCs({ ...cs, state: res.state || "executed" });
    const fresh = await refreshSnapshot();
    setAfter(summarizePlan(cs.plan, fresh).rows);
  });

  const doRollback = () => run("롤백 중", async () => {
    setModal(null);
    if (!cs || !rbReason.trim()) return;
    const res = await rollbackAssignment(cs.id, cs.actor, rollbackKeyFor(cs.id), rbReason.trim());
    setRbResult(res);
    setCs({ ...cs, state: res.state || "revoked" });
    const fresh = await refreshSnapshot();
    setAfter(summarizePlan(cs.plan, fresh).rows);
  });

  const statusRows = useMemo(() => {
    if (!flat) return null;
    const c = emptyTypeCounts();
    let assigned = 0, drafts = 0;
    for (const item of flat) { c[item.type] += 1; c.total += 1; if (item.assignment_id) assigned += 1; if (item.status === "draft") drafts += 1; }
    return { c, assigned, drafts };
  }, [flat]);

  const countsLine = preview ? ROLES.map((r) => `${r} ${preview.data.plan[r].length}건`).join(" · ") : "";
  const totalLine = preview ? ROLES.reduce((n, r) => n + preview.data.plan[r].length, 0) : 0;

  return (
    <section aria-label="정본 역할 배정" style={{ margin: "12px 18px", padding: 13, borderRadius: 12, border: "1px solid var(--accent)", background: "var(--bg-card)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", width: "100%", minHeight: 44, alignItems: "center", justifyContent: "space-between", gap: 8, padding: 0, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
        <span>
          <strong style={{ color: "var(--text-primary)", fontSize: 13.5 }}>정본 역할 배정 · 대표님 전용</strong>
          <span style={{ display: "block", marginTop: 3, color: "var(--text-secondary)", fontSize: 10.5 }}>
            미리보기 → 제안 → 승인 → 실행 → (필요 시) 롤백 · 업무의 상태·작성자는 바뀌지 않고 배정 연결만 바뀝니다
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--text-secondary)" }}>{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div>
          {error && (
            <div role="alert" style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #dc2626", background: "rgba(220,38,38,.06)", color: "#dc2626", fontSize: 12 }}>
              <strong>{error.message}</strong>
              {error.hint && <div style={{ marginTop: 3, color: "var(--text-secondary)" }}>{error.hint}</div>}
              {error.kind === "identity" && (
                <a href={`/login?next=${encodeURIComponent("/goals")}&reason=session_expired`}
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 44, marginTop: 4, color: "var(--accent)", fontWeight: 800 }}>다시 로그인</a>
              )}
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", minHeight: 32, color: "var(--text-secondary)" }}>원문 코드 보기</summary>
                <pre style={{ margin: "4px 0 0", padding: 8, overflowX: "auto", fontSize: 10.5, background: "var(--bg-primary)", color: "var(--text-primary)", borderRadius: 6 }}>{error.raw}</pre>
              </details>
            </div>
          )}

          <Step no={1} title="현황 (읽기 전용)">
            {loadingStatus && !statusRows ? <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>불러오는 중…</div> : null}
            {statusRows && (
              <Table minWidth={420}>
                <thead><tr><th style={th}>Epic</th><th style={th}>Story</th><th style={th}>Task</th><th style={th}>전체</th><th style={th}>draft</th><th style={th}>배정 연결</th></tr></thead>
                <tbody><tr>
                  <td style={td}>{statusRows.c.epic}</td><td style={td}>{statusRows.c.story}</td><td style={td}>{statusRows.c.task}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{statusRows.c.total}</td><td style={td}>{statusRows.drafts}</td><td style={td}>{statusRows.assigned}</td>
                </tr></tbody>
              </Table>
            )}
            <button type="button" onClick={() => void loadStatus()} disabled={loadingStatus || Boolean(busy)} style={{ ...button("var(--accent)", !loadingStatus && !busy, false), marginTop: 8 }}>
              {loadingStatus ? "불러오는 중" : "현황 새로고침"}
            </button>
          </Step>

          <Step no={2} title="승인 참조 입력">
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                대표님 통합지시 창 주소 또는 세션 ID (승인 결정을 남긴 창)
                <input value={actorRaw} onChange={(e) => setActorRaw(e.target.value)} placeholder="https://aads.newtalk.kr/chat#…" style={inputStyle} inputMode="url" autoComplete="off" />
                <span style={{ fontSize: 10.5 }}>{actorRaw ? (actorId ? `인식된 세션 ${shortId(actorId)}…` : "세션 ID 를 찾지 못했습니다") : ""}</span>
              </label>
              <label style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                승인 결정 참조 (handover entry_key)
                <input value={decisionRef} onChange={(e) => setDecisionRef(e.target.value)} style={inputStyle} autoComplete="off" />
              </label>
              <label style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                승인 원 메시지 ID (UUID)
                <input value={messageRaw} onChange={(e) => setMessageRaw(e.target.value)} style={inputStyle} autoComplete="off" />
                <span style={{ fontSize: 10.5 }}>{messageRaw ? (messageId ? `인식된 ID ${shortId(messageId)}…` : "UUID 형식이 아닙니다") : ""}</span>
              </label>
            </div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-secondary)" }}>이 값은 승인 증거가 아닙니다 — 서버가 결정 기록·원 메시지·소유권을 다시 검증합니다.</div>
          </Step>

          <Step no={3} title="목표 전용 PM · Developer · QA 세션">
            {workspaces.length > 1 && (
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} aria-label="세션을 만들 워크스페이스" style={{ ...inputStyle, marginTop: 8 }}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.display_name || w.name || w.id}</option>)}
              </select>
            )}
            {flat !== null && workspaces.length === 0 && !loadingStatus && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#d97706" }}>{project} 프로젝트 워크스페이스를 찾지 못했습니다.</div>
            )}
            <Table minWidth={420}>
              <thead><tr><th style={th}>역할</th><th style={th}>보유 세션</th><th style={th}>상태</th></tr></thead>
              <tbody>
                {ROLES.map((role) => {
                  const cand = candidates[role];
                  return (
                    <tr key={role}>
                      <td style={{ ...td, fontWeight: 800 }}>{role}</td>
                      <td style={td}>{cand ? `${shortId(cand.sessionId)}…` : "—"}</td>
                      <td style={{ ...td, color: cand ? "#16a34a" : "#d97706" }}>{cand ? HOLDER_SOURCE_LABEL[cand.source] : "생성 필요"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <button type="button" onClick={() => setModal("sessions")} disabled={Boolean(busy) || missingRoles.length === 0 || !workspaceId}
              style={{ ...button("var(--accent)", !busy && missingRoles.length > 0 && Boolean(workspaceId)), marginTop: 8 }}>
              {missingRoles.length === 0 ? "세션 3개 모두 준비됨" : `없는 세션 ${missingRoles.length}개 생성`}
            </button>
          </Step>

          <Step no={4} title="서버 미리보기 (읽기 전용)">
            <button type="button" onClick={() => void doPreview()} disabled={!canPreview} style={{ ...button("var(--accent)", canPreview), marginTop: 8 }}>
              {busy === "서버 미리보기 중" ? busy : "미리보기"}
            </button>
            {!canPreview && !busy && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-secondary)" }}>2·3단계 입력이 모두 필요합니다.</span>}
            {preview && !previewFresh && (
              <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "#d97706" }}>입력이 바뀌었습니다 — 미리보기를 다시 실행하십시오.</div>
            )}
            {preview && previewRows && (
              <div style={{ marginTop: 8, opacity: previewFresh ? 1 : 0.5 }}>
                {(issues.length > 0 || actorMismatch || goalMismatch) && (
                  <div role="alert" style={{ marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #dc2626", background: "rgba(220,38,38,.07)", color: "#dc2626", fontSize: 12 }}>
                    <strong>⚠ 서버 값이 기준과 달라 다음 단계를 막았습니다.</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {issues.map((m) => <li key={m}>{m}</li>)}
                      {actorMismatch && <li>입력한 통합지시 세션이 승인 결정의 출처 세션과 다릅니다(출처 {shortId(preview.data.evidence.source_session_id)}…). 승인은 출처 세션에서만 가능합니다.</li>}
                      {goalMismatch && <li>서버 응답의 목표가 이 화면의 목표와 다릅니다.</li>}
                    </ul>
                  </div>
                )}
                <RoleTable rows={previewRows.rows} showAssigned />
                {previewRows.missing > 0 && <div style={{ marginTop: 4, fontSize: 11, color: "#d97706" }}>업무 트리에서 찾지 못한 대상 {previewRows.missing}건(유형 미상).</div>}
                <Table minWidth={420}>
                  <tbody>
                    <tr><td style={th}>ID 집합 md5</td><td style={td}>{(() => {
                      const md5 = GOAL_EXPECTATIONS[goalId]?.idsMd5;
                      return md5 ? (issues.some((m) => m.includes("md5")) ? "기준과 다름" : `${md5} (기준과 일치)`) : "기준값 없음 — 서버가 제안 시 확정";
                    })()}</td></tr>
                    <tr><td style={th}>승인 결정</td><td style={td}>{preview.data.evidence.decision_ref} · rev {preview.data.evidence.decision_revision}</td></tr>
                    <tr><td style={th}>결정의 역할별 건수</td><td style={td}>{ROLES.map((r) => `${r} ${preview.data.evidence.role_counts[r]}`).join(" · ")}</td></tr>
                    {ROLES.map((r) => (
                      <tr key={r}><td style={th}>{r} 보유 세션</td><td style={td}>{shortId(preview.data.holders[r].holder_session_id)}… · {preview.data.holders[r].mode === "existing" ? "기존 배정 재사용" : "신규 배정 예정"} · {preview.data.holders[r].role_key}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Step>

          <Step no={5} title="제안 → 승인 → 실행">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" onClick={() => void doPropose()} disabled={!gateOk || Boolean(busy) || Boolean(cs)} style={button("var(--accent)", gateOk && !busy && !cs)}>
                {busy === "제안 중" ? busy : "제안 만들기"}
              </button>
              <button type="button" onClick={() => setModal("approve")} disabled={!cs || cs.state !== "pending" || Boolean(busy)} style={button("#7c3aed", Boolean(cs) && cs?.state === "pending" && !busy)}>
                {busy === "승인 기록 중" ? busy : "대표님 승인"}
              </button>
              <button type="button" onClick={() => setModal("execute")} disabled={!cs || cs.state !== "approved" || Boolean(busy)} style={button("#16a34a", Boolean(cs) && cs?.state === "approved" && !busy)}>
                {busy === "실행 중" ? busy : "실행"}
              </button>
            </div>
            {cs && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-primary)" }}>
                변경 제안 {shortId(cs.id)}… · 상태 <strong>{cs.state}</strong>{cs.replayed ? " · 같은 승인으로 이미 만들어진 제안을 이어받았습니다" : ""}
              </div>
            )}
            {!gateOk && !cs && <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>미리보기가 기준과 일치해야 제안할 수 있습니다.</div>}

            {execResult && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>실행 결과{execResult.replayed ? " (이미 실행된 결과를 다시 받음)" : ""} · 적용 {execResult.applied ?? execResult.total ?? "—"}건 · 신규 배정 {execResult.created_assignment_ids?.length ?? 0}개</div>
                <Table minWidth={420}>
                  <thead><tr><th style={th}>역할</th><th style={th}>대상</th><th style={th}>실행 전 배정 연결</th><th style={th}>현재 배정 연결</th></tr></thead>
                  <tbody>
                    {ROLES.map((role, i) => (
                      <tr key={role}>
                        <td style={{ ...td, fontWeight: 800 }}>{role}</td>
                        <td style={td}>{after?.[i]?.types.total ?? before?.[i]?.types.total ?? "—"}</td>
                        <td style={td}>{before?.[i]?.assigned ?? "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{after?.[i]?.assigned ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Step>

          <Step no={6} title="롤백">
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-secondary)" }}>실행된 변경이 있을 때만 쓸 수 있습니다. 업무가 draft 를 벗어났으면 서버가 거부합니다.</div>
            <button type="button" onClick={() => { setRbReason(""); setModal("rollback"); }} disabled={!cs || cs.state !== "executed" || Boolean(busy)}
              style={{ ...button("#dc2626", Boolean(cs) && cs?.state === "executed" && !busy), marginTop: 8 }}>
              {busy === "롤백 중" ? busy : "롤백"}
            </button>
            {rbResult && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                롤백 완료{rbResult.replayed ? " (이미 처리된 결과)" : ""} · 배정 해제 {rbResult.restored ?? "—"}건 · 종료한 신규 배정 {rbResult.ended_assignment_ids?.length ?? 0}개 · 현재 배정 연결 {after ? after.reduce((n, r) => n + r.assigned, 0) : "—"}건
              </div>
            )}
          </Step>
        </div>
      )}

      {modal === "sessions" && (
        <Modal title="목표 전용 세션 생성" onCancel={() => setModal(null)} onConfirm={() => void doCreateSessions()} confirmLabel={`${missingRoles.length}개 생성`} confirmColor="var(--accent)">
          <div>대상: <b>{goalTitle}</b> ({project})</div>
          <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
            {missingRoles.map((r) => <li key={r}>{holderSessionTitle(r, goalId)}</li>)}
          </ul>
          <div>이미 있는 세션은 만들지 않고 재사용합니다. 생성된 세션은 채팅 목록에 남으며, 이 단계에서는 업무 배정이 바뀌지 않습니다.</div>
        </Modal>
      )}
      {modal === "approve" && cs && preview && (
        <Modal title="정본 역할 배정 승인" onCancel={() => setModal(null)} onConfirm={() => void doApprove()} confirmLabel="승인합니다" confirmColor="#7c3aed">
          <div>대상: <b>{goalTitle}</b> ({project})</div>
          <div>건수: <b>{totalLine}건</b> ({countsLine})</div>
          <div>보유 세션: {ROLES.map((r) => `${r} ${shortId(cs.holders[r])}…`).join(" · ")}</div>
          <div style={{ marginTop: 6 }}>승인만으로는 업무 데이터가 바뀌지 않습니다. 이후 &quot;실행&quot;을 눌러야 배정 연결이 적용됩니다.</div>
          <div style={{ marginTop: 6 }}><b>되돌리는 법:</b> 실행 전에는 실행하지 않으면 그만이고, 실행 후에는 &quot;롤백&quot; 버튼으로 배정 연결을 해제하고 신규 배정을 종료합니다.</div>
        </Modal>
      )}
      {modal === "execute" && cs && preview && (
        <Modal title="정본 역할 배정 실행" onCancel={() => setModal(null)} onConfirm={() => void doExecute()} confirmLabel="실행합니다" confirmColor="#16a34a" confirmDisabled={Boolean(busy)}>
          <div>대상: <b>{goalTitle}</b> ({project})</div>
          <div>건수: <b>{totalLine}건</b> ({countsLine}) — 상태·작성자는 그대로, 배정 연결만 적용됩니다.</div>
          <div>실행 키는 변경 제안마다 고정되어 있어, 두 번 눌러도 한 번만 적용됩니다.</div>
          <div style={{ marginTop: 6 }}><b>되돌리는 법:</b> 실행 후 &quot;롤백&quot; 버튼(사유 입력 필요).</div>
        </Modal>
      )}
      {modal === "rollback" && cs && (
        <Modal title="정본 역할 배정 롤백" onCancel={() => setModal(null)} onConfirm={() => void doRollback()} confirmLabel="롤백합니다" confirmColor="#dc2626" confirmDisabled={!rbReason.trim() || Boolean(busy)}>
          <div>대상: <b>{goalTitle}</b> ({project}) · 변경 제안 {shortId(cs.id)}…</div>
          <div>배정 연결을 해제하고, 이번 실행으로 새로 만든 역할 배정을 종료합니다. 다시 적용하려면 새 승인이 필요합니다.</div>
          <label style={{ display: "block", marginTop: 8, fontSize: 11.5, color: "var(--text-secondary)" }}>
            롤백 사유 (필수)
            <input value={rbReason} onChange={(e) => setRbReason(e.target.value)} maxLength={500} style={inputStyle} />
          </label>
        </Modal>
      )}
    </section>
  );
}

export default function CanonicalAssignmentPanel(props: Props) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getMe().then((user) => { if (!cancelled) setAllowed(isOwnerUser(user)); }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);
  if (!allowed) return null;
  return <PanelBody key={props.goalId} {...props} />;
}
