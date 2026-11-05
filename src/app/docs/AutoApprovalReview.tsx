"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import DocBadge from "@/components/docs/DocBadge";
import { buildCanonicalDocHref } from "@/lib/canonicalDocLinks";
import {
  canCancelApproval, cancelDialogReducer, changeDialogReducer, changeTargetOf, createRequestGate, FEEDBACK_MAX, FEEDBACK_MIN,
  feedbackState, formatPending, GROUP_LABEL, initialCancelDialog, initialChangeDialog, initialReviewState, isDigestEmpty,
  MODE_LABEL, needsCeoActions, reviewReducer, runCancelApproval, runChangeRequest, runDigestLoad, STALE_TEXT, visibleGroups,
  type AutoFixingItem, type CancelDialogAction, type CancelDialogState, type ChangeDialogAction, type ChangeDialogState, type ChangeTarget, type Digest, type GroupKey,
  type NeedsCeoItem, type RequestGate, type ReviewItem, type ReviewProblem, type ReviewState, type SinceHours,
} from "@/lib/autoApprovalReview";

const BORDER = { borderColor: "var(--border)" } as const;
const MUTED = { color: "var(--text-secondary)" } as const;
const BUTTON = "min-h-11 rounded-lg px-4 text-sm font-medium";
const OUTLINE = { border: "1px solid var(--border)" } as const;

// 색은 기존 CSS 변수만 쓴다(하드코딩 색 금지). 버튼 글자색은 --text-primary — 어두운 테마(파랑 강조)·밝은 테마(노랑 강조) 모두 읽힌다.
const DANGER_BORDER = { borderColor: "var(--danger)" } as const;
const OVERLAY = { background: "color-mix(in srgb, var(--background) 80%, transparent)" } as const;

function kstText(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date) + " KST";
}

export function ReviewProblemBox({ problem, onRetry }: { problem: ReviewProblem; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border p-3 text-sm" style={DANGER_BORDER}>
      <p className="break-words">{problem.text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {problem.kind === "auth" && <a href="/login?next=%2Fdocs" className="inline-flex min-h-11 items-center underline">로그인 복구</a>}
        {onRetry && problem.kind !== "auth" && <button type="button" onClick={onRetry} className={BUTTON} style={OUTLINE}>재시도</button>}
      </div>
    </div>
  );
}

function KeyLine({ documentKey }: { documentKey: string }) {
  return <p className="break-all text-[11px]" style={MUTED}>{documentKey}</p>;
}

function Brief({ text }: { text?: string }) {
  return text ? <p className="whitespace-pre-wrap break-words text-sm">{text}</p> : null;
}

function OpenListLink({ project, documentKey }: { project: string; documentKey: string }) {
  return (
    <a href={buildCanonicalDocHref({ project, documentKey })} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm underline" style={OUTLINE}>
      정본 문서 목록에서 열기
    </a>
  );
}

export function ReviewItemCard({ group, item, onChange, onCancel }: {
  group: Exclude<GroupKey, "needs_ceo" | "auto_fixing">;
  item: ReviewItem;
  onChange: (target: ChangeTarget) => void;
  onCancel: (item: ReviewItem) => void;
}) {
  const approvedGone = group === "auto_approved" && item.currently_approved === false;
  const statusLabel = approvedGone ? "승인 취소됨 · 다른 판본 승인" : GROUP_LABEL[group];
  const approvedAt = kstText(item.approved_at);
  return (
    <li className="space-y-2 rounded-lg border p-3" style={BORDER} data-group={group}>
      <div className="flex flex-wrap items-center gap-2">
        <DocBadge tone={group === "auto_approved" && !approvedGone ? "approved" : group === "held" ? "review" : "draft"}>{statusLabel}</DocBadge>
        {item.risk === "high" && <DocBadge tone="review">고위험</DocBadge>}
        {typeof item.score === "number" && <span className="text-xs" style={MUTED}>점수 {item.score}</span>}
        {approvedAt && <span className="text-xs" style={MUTED}>{approvedAt}</span>}
      </div>
      <div>
        <h4 className="break-words text-sm font-semibold">{item.title}</h4>
        <KeyLine documentKey={item.document_key} />
      </div>
      <Brief text={item.ceo_brief} />
      {item.hold_reasons.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">보류 사유</p>
          <ul className="list-disc space-y-0.5 pl-5">{item.hold_reasons.map((reason, index) => <li key={index} className="break-words">{reason}</li>)}</ul>
        </div>
      )}
      {item.minor_issues.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">경미한 지적</p>
          <ul className="list-disc space-y-0.5 pl-5" style={MUTED}>{item.minor_issues.map((issue, index) => <li key={index} className="break-words">{issue}</li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(changeTargetOf(item))} className={BUTTON} style={OUTLINE}>수정 요청</button>
        {canCancelApproval(group, item) && <button type="button" onClick={() => onCancel(item)} className={BUTTON} style={OUTLINE}>승인 취소</button>}
      </div>
    </li>
  );
}

export function NeedsCeoCard({ item, digest, onChange }: { item: NeedsCeoItem; digest: Digest; onChange: (target: ChangeTarget) => void }) {
  const { target, actions, cardHref, guidance } = needsCeoActions(item, digest);
  const pending = formatPending(item.pending_days);
  return (
    <li className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--accent)" }} data-group="needs_ceo">
      <div className="flex flex-wrap items-center gap-2">
        <DocBadge tone="review">대표님 판단 필요</DocBadge>
        {item.risk === "high" && <DocBadge tone="review">고위험</DocBadge>}
        {pending && <span className="text-xs font-semibold">{pending}</span>}
        {typeof item.round === "number" && typeof item.max_rounds === "number" && (
          <span className="text-xs" style={MUTED}>자동 보완 {item.round}/{item.max_rounds}회 시도</span>
        )}
      </div>
      <div>
        <h4 className="break-words text-sm font-semibold">{item.title}</h4>
        <KeyLine documentKey={item.document_key} />
      </div>
      {item.reason && <p className="break-words text-sm"><span className="font-medium">상신 사유</span> · {item.reason}</p>}
      <Brief text={item.ceo_brief} />
      {item.remaining_issues.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {item.remaining_issues.map((issue, index) => (
            <li key={index} className="break-words">{issue.severity && `[${issue.severity}] `}{issue.location && `${issue.location} · `}{issue.problem}</li>
          ))}
        </ul>
      )}
      {item.decision_needed && <p className="break-words text-sm font-medium">{item.decision_needed}</p>}
      {item.card_id && (
        <p className="break-words text-xs" style={MUTED} data-testid="needs-ceo-card-id">결정 카드 {item.card_id.slice(0, 8)} · 채팅의 승인 카드에서 결정하실 수 있습니다</p>
      )}
      <p className="text-xs" style={MUTED} data-testid="needs-ceo-guidance">{guidance}</p>
      <div className="flex flex-wrap gap-2">
        {actions.includes("change_request") && (
          <button type="button" disabled={!target} onClick={() => target && onChange(target)} className={`${BUTTON} disabled:opacity-50`} style={OUTLINE}>수정 요청</button>
        )}
        {actions.includes("open_list") && <OpenListLink project={item.project_key} documentKey={item.document_key} />}
        {actions.includes("open_card") && cardHref && (
          <a href={cardHref} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm underline" style={OUTLINE}>결정 카드 열기</a>
        )}
      </div>
    </li>
  );
}

export function AutoFixingCard({ item }: { item: AutoFixingItem }) {
  return (
    <li className="space-y-1 rounded-lg border p-3" style={BORDER} data-group="auto_fixing">
      <div className="flex flex-wrap items-center gap-2">
        <DocBadge tone="draft">자동 보완 중</DocBadge>
        {typeof item.round === "number" && typeof item.max_rounds === "number" && <span className="text-xs" style={MUTED}>{item.round}/{item.max_rounds}회</span>}
      </div>
      <h4 className="break-words text-sm font-semibold">{item.title}</h4>
      <KeyLine documentKey={item.document_key} />
      {item.job_id && <p className="break-all text-[11px]" style={MUTED}>작업 번호 {item.job_id}</p>}
    </li>
  );
}

export function AutoApprovalReviewView({ state, hours, onHours, onRetry, onChange, onCancel }: {
  state: ReviewState;
  hours: SinceHours;
  onHours: (hours: SinceHours) => void;
  onRetry: () => void;
  onChange: (target: ChangeTarget) => void;
  onCancel: (item: ReviewItem) => void;
}) {
  const { digest } = state;
  const emptyText = hours === 24 ? "오늘 자동승인된 문서가 없습니다" : "최근 7일 동안 자동승인된 문서가 없습니다";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="조회 기간" className="flex gap-2">
          {([[24, "24시간"], [168, "7일"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={hours === value} onClick={() => onHours(value)}
              className="min-h-11 rounded-lg px-4 text-sm font-medium"
              style={hours === value ? { background: "var(--accent)", color: "var(--text-primary)" } : OUTLINE}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={onRetry} className={BUTTON} style={OUTLINE}>새로고침</button>
        {digest && digest.mode && <span className="min-w-0 break-words text-xs" style={MUTED}>{MODE_LABEL[digest.mode] ?? digest.mode}</span>}
      </div>
      {state.status === "loading" && !digest && <p role="status" className="text-sm">참고검토 목록을 불러오는 중…</p>}
      {state.status === "error" && state.problem && <ReviewProblemBox problem={state.problem} onRetry={onRetry} />}
      {digest && state.status !== "error" && (
        <>
          {digest.truncated && <p role="status" className="text-xs" style={MUTED}>일부만 표시합니다. 나머지는 정본 문서 목록에서 확인하세요.</p>}
          {isDigestEmpty(digest) && <p className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-hover)" }}>{emptyText}</p>}
          {visibleGroups(digest).map((group) => (
            <section key={group} aria-label={GROUP_LABEL[group]} className="space-y-2">
              <h3 className="text-sm font-semibold">{GROUP_LABEL[group]} <span style={MUTED}>{digest[group].length}건</span></h3>
              <ul className="space-y-2">
                {group === "needs_ceo" && digest.needs_ceo.map((item) => <NeedsCeoCard key={`${item.project_key}:${item.document_key}`} item={item} digest={digest} onChange={onChange} />)}
                {group === "auto_fixing" && digest.auto_fixing.map((item) => <AutoFixingCard key={`${item.project_key}:${item.document_key}`} item={item} />)}
                {(group === "auto_approved" || group === "held" || group === "would_approve") && digest[group].map((item) => (
                  <ReviewItemCard key={`${group}:${item.document_key}:${item.revision_id}`} group={group} item={item} onChange={onChange} onCancel={onCancel} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ModalShell({ label, busy, onClose, children }: { label: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" style={OVERLAY} role="dialog" aria-modal="true" aria-label={label}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }}>
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

export function ChangeRequestDialogView({ target, state, onText, onSubmit, onClose, onRefresh }: {
  target: ChangeTarget;
  state: ChangeDialogState;
  onText: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const busy = state.phase === "busy";
  const done = state.phase === "done" && state.result;
  const stale = state.problem?.kind === "stale";
  const count = feedbackState(state.text);
  const locked = busy || state.phase === "done" || stale;
  return (
    <ModalShell label="수정 요청" busy={busy} onClose={onClose}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">수정 요청 · {target.title}</h3>
        <button type="button" aria-label="닫기" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 shrink-0 rounded-lg disabled:opacity-50" style={OUTLINE}>×</button>
      </div>
      <KeyLine documentKey={target.document_key} />
      {done ? (
        <div role="status" className="mt-3 space-y-1 text-sm">
          <p className="break-words font-medium">수정 작업을 맡겼습니다(작업 번호 {state.result?.jobId})</p>
          {state.result?.archived && <p>기존 승인은 취소되었고, 새 판본이 등록되면 다시 검토됩니다.</p>}
          {state.result?.idempotent && <p style={MUTED}>같은 내용으로 이미 접수된 요청입니다.</p>}
        </div>
      ) : (
        <>
          <label className="mt-3 block text-sm font-medium" htmlFor="change-request-feedback">어떻게 고치면 좋을지 적어 주세요</label>
          <textarea id="change-request-feedback" value={state.text} disabled={locked} rows={6} onChange={(event) => onText(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-transparent p-3 text-sm disabled:opacity-60" style={BORDER} />
          <p className="mt-1 text-xs" style={MUTED} data-testid="feedback-count">
            {count.length}/{FEEDBACK_MAX}자{state.text !== "" && count.tooShort && ` · ${FEEDBACK_MIN}자 이상 적어 주세요`}{count.tooLong && " · 너무 깁니다. 줄여 주세요"}
          </p>
        </>
      )}
      {state.problem && (stale
        ? <div role="alert" className="mt-3 rounded-lg border p-3 text-sm" style={DANGER_BORDER}><p>{STALE_TEXT}</p></div>
        : <div className="mt-3"><ReviewProblemBox problem={state.problem} /></div>)}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {done || stale ? (
          <>
            {stale && <button type="button" onClick={onRefresh} className={BUTTON} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>새로고침</button>}
            <button type="button" onClick={onClose} className={BUTTON} style={OUTLINE}>닫기</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onClose} className={`${BUTTON} disabled:opacity-50`} style={OUTLINE}>취소</button>
            <button type="button" disabled={busy || !count.valid} onClick={onSubmit} className={`${BUTTON} disabled:opacity-50`} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
              {busy ? "보내는 중…" : "수정 요청 보내기"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

/** 수정 요청 모달의 동작(입력·제출). 훅 컴포넌트가 그대로 쓰고, 테스트도 같은 함수를 View 의 onChange/onClick 에 연결해 검증한다. */
export function createChangeRequestController(args: {
  target: ChangeTarget; getState: () => ChangeDialogState; dispatch: (action: ChangeDialogAction) => void;
  isActive: () => boolean; onSubmitted: () => void;
}) {
  const { target, getState, dispatch, isActive, onSubmitted } = args;
  return {
    edit: (text: string) => { if (getState().phase !== "busy") dispatch({ type: "edit", text }); },
    submit: (): Promise<void> => {
      const current = getState();
      if (current.phase === "busy" || !feedbackState(current.text).valid) return Promise.resolve();
      return runChangeRequest({ target, feedback: current.text, dispatch, isActive, onSubmitted });
    },
  };
}

/** 승인 취소 모달의 동작. 목록에 표시된 revision_id·generation 그대로 archive 한다(runCancelApproval). */
export function createCancelController(args: {
  item: ReviewItem; getState: () => CancelDialogState; dispatch: (action: CancelDialogAction) => void;
  isActive: () => boolean; onDone: () => void;
}) {
  const { item, getState, dispatch, isActive, onDone } = args;
  return {
    confirm: (): Promise<void> => (getState().phase === "busy" ? Promise.resolve() : runCancelApproval({ item, dispatch, isActive, onDone })),
  };
}

/** 수정 요청·승인 취소가 성공하면 참고검토 목록과 상위 화면(정본 목록·상세)을 함께 새로 읽는다. */
export function afterMutation(reload: () => void, onChanged?: () => void): () => void {
  return () => { reload(); onChanged?.(); };
}

export function ChangeRequestDialog({ target, onClose, onSubmitted, onRefresh }: {
  target: ChangeTarget;
  onClose: () => void;
  onSubmitted: () => void;
  onRefresh: () => void;
}) {
  const [state, dispatch] = useReducer(changeDialogReducer, initialChangeDialog);
  const active = useRef(true);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  // 컨트롤러는 이벤트 처리 시점에 만든다(렌더 중 ref 접근 금지). 테스트도 같은 컨트롤러를 View 에 연결한다.
  const controller = () => createChangeRequestController({ target, getState: () => latest.current, dispatch, isActive: () => active.current, onSubmitted });
  return <ChangeRequestDialogView target={target} state={state} onText={(text) => controller().edit(text)} onSubmit={() => { void controller().submit(); }} onClose={onClose} onRefresh={onRefresh} />;
}

export function CancelDialogView({ item, state, onConfirm, onClose, onRefresh }: {
  item: ReviewItem;
  state: CancelDialogState;
  onConfirm: () => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const busy = state.phase === "busy";
  const stale = state.problem?.kind === "stale";
  return (
    <ModalShell label="승인 취소 확인" busy={busy} onClose={onClose}>
      <h3 className="font-semibold">승인 취소를 확인하세요</h3>
      <p className="mt-2 break-words text-sm">{item.title}{item.version ? ` · v${item.version}` : ""}</p>
      <KeyLine documentKey={item.document_key} />
      {state.phase === "done"
        ? <p role="status" className="mt-3 text-sm">승인을 취소했습니다.</p>
        : <p className="mt-3 text-sm">자동으로 승인된 이 판본의 승인을 취소하고 보관합니다. 이 화면에서는 되돌릴 수 없습니다.</p>}
      {state.problem && (stale
        ? <div role="alert" className="mt-3 rounded-lg border p-3 text-sm" style={DANGER_BORDER}><p>{STALE_TEXT}</p></div>
        : <div className="mt-3"><ReviewProblemBox problem={state.problem} /></div>)}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {state.phase === "done" || stale ? (
          <>
            {stale && <button type="button" onClick={onRefresh} className={BUTTON} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>새로고침</button>}
            <button type="button" onClick={onClose} className={BUTTON} style={OUTLINE}>닫기</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onClose} className={`${BUTTON} disabled:opacity-50`} style={OUTLINE}>취소</button>
            <button type="button" disabled={busy} onClick={onConfirm} className={`${BUTTON} disabled:opacity-50`} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>{busy ? "처리 중…" : "확인"}</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

export function CancelApprovalDialog({ item, onClose, onDone, onRefresh }: {
  item: ReviewItem;
  onClose: () => void;
  onDone: () => void;
  onRefresh: () => void;
}) {
  const [state, dispatch] = useReducer(cancelDialogReducer, initialCancelDialog);
  const active = useRef(true);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const controller = () => createCancelController({ item, getState: () => latest.current, dispatch, isActive: () => active.current, onDone });
  return <CancelDialogView item={item} state={state} onConfirm={() => { void controller().confirm(); }} onClose={onClose} onRefresh={onRefresh} />;
}

export default function AutoApprovalReview({ project, onChanged }: { project: string; onChanged?: () => void }) {
  const [state, dispatch] = useReducer(reviewReducer, project, (initial) => initialReviewState(initial));
  const [hours, setHours] = useState<SinceHours>(24);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState(true);
  const [gate] = useState<RequestGate>(createRequestGate);

  useEffect(() => {
    const token = gate.begin();
    dispatch({ type: "load_started", project, hours });
    void runDigestLoad({ project, hours, token, dispatch });
    return () => gate.invalidate();
  }, [gate, project, hours, nonce]);

  const shown: ReviewState = state.project === project ? state : initialReviewState(project, hours);
  const refresh = () => {
    dispatch({ type: "close_change" });
    dispatch({ type: "close_cancel" });
    setNonce((value) => value + 1);
  };
  const reload = () => setNonce((value) => value + 1);
  const mutated = afterMutation(reload, onChanged);
  const digest = shown.digest;

  return (
    <section className="min-w-0 rounded-xl border p-3" style={BORDER} aria-label="자동승인 참고검토">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">자동승인 참고검토</h2>
        {digest && <span className="text-xs" style={MUTED}>대표님 판단 {digest.needs_ceo.length} · 자동승인 {digest.auto_approved.length} · 보류 {digest.held.length}</span>}
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="ml-auto min-h-11 rounded-lg px-4 text-sm" style={OUTLINE}>{open ? "접기" : "펼치기"}</button>
      </div>
      {open && (
        <div className="mt-2 max-h-[60dvh] overflow-y-auto">
          <AutoApprovalReviewView state={shown} hours={hours} onHours={setHours} onRetry={reload}
            onChange={(target) => dispatch({ type: "open_change", target })} onCancel={(item) => dispatch({ type: "open_cancel", item })} />
        </div>
      )}
      {shown.target && <ChangeRequestDialog key={`${shown.target.project_key}:${shown.target.document_key}:${shown.target.revision_id}`} target={shown.target}
        onClose={() => dispatch({ type: "close_change" })} onSubmitted={mutated} onRefresh={refresh} />}
      {shown.cancelItem && <CancelApprovalDialog key={`${shown.cancelItem.project_key}:${shown.cancelItem.document_key}:${shown.cancelItem.revision_id}`} item={shown.cancelItem}
        onClose={() => dispatch({ type: "close_cancel" })} onDone={mutated} onRefresh={refresh} />}
    </section>
  );
}
