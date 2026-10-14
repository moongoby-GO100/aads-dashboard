"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  COPY, DAY_CHOICES, OUTPUT_CHOICES, REJECT_REASONS, SCHEDULE_CHOICES, errorSentence,
} from "@/lib/automationCopy";
import {
  FINAL_STATES, closeOnlyButtons, credentialErrorAfter, describeSchedule, failedRecoveryButtons, formatKstTime,
  parseEvidence, parseTimeValue, pollIntervalFor, progressButtons, progressPercent, scheduleToTimeValue,
  showCredentialConnect, stepOf, withCacheBust,
  type AutomationCallResult, type AutomationCardButton, type AutomationDraftView, type AutomationSchedule,
} from "@/lib/automationDraft";
import {
  RUN_CONFIRM_INITIAL, canStartRun, confirmedCommandBody, reduceRunConfirm, type RunConfirmation,
} from "@/lib/automationRunConfirm";
import VaultCredentialCard from "@/components/chat/VaultCredentialCard";

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 48, padding: "10px 12px", borderRadius: 9, boxSizing: "border-box",
  fontSize: 16, border: "1px solid var(--ct-border)", background: "var(--ct-bg)", color: "var(--ct-text)",
};

const BTN_BASE: React.CSSProperties = {
  flex: "1 1 120px", minHeight: 48, padding: "10px 16px", borderRadius: 9, boxSizing: "border-box",
  fontSize: 14, fontWeight: 700, cursor: "pointer", maxWidth: "100%",
};

function btnStyle(kind: "primary" | "plain" | "danger", disabled: boolean): React.CSSProperties {
  const look: React.CSSProperties = kind === "primary"
    ? { border: "none", background: "#16a34a", color: "#fff" }
    : kind === "danger"
      ? { border: "1px solid #f87171", background: "transparent", color: "#f87171" }
      : { border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text)" };
  return { ...BTN_BASE, ...look, opacity: disabled ? 0.55 : 1, cursor: disabled ? "default" : "pointer" };
}

const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ct-text2)", marginBottom: 4 };
const HINT: React.CSSProperties = { fontSize: 13, color: "var(--ct-text2)", lineHeight: 1.55, margin: "4px 0 0", wordBreak: "break-word" };

function RetryImg({ src, alt, style }: { src: string; alt: string; style: React.CSSProperties }) {
  const [failedSrc, setFailedSrc] = useState("");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={failedSrc === src ? { ...style, display: "none" } : style}
      onError={() => setFailedSrc(src)}
      onLoad={() => setFailedSrc("")}
    />
  );
}

type EditField = "site" | "task" | "output" | "when";
type ActionId = string;

export interface AutomationDraftCardProps {
  draftId: string;
  onDismiss: (draftId: string) => void;
  onReplace?: (oldId: string, newId: string) => void;
  onLayoutChange?: () => void;
  // 있으면 서버에서 초안을 읽지 않고 "실행할까요?" 확인 카드로 그린다.
  runConfirm?: { confirmation: RunConfirmation; sessionId?: string };
}

function Button({ label, kind, disabled, onClick, busy, testId }: {
  label: string; kind: "primary" | "plain" | "danger"; disabled?: boolean; busy?: boolean;
  onClick: () => void; testId?: string;
}) {
  const off = Boolean(disabled || busy);
  return (
    <button type="button" data-testid={testId} disabled={off} onClick={onClick} style={btnStyle(kind, off)}>
      {busy ? `${label}…` : label}
    </button>
  );
}

function ScheduleEditor({ initial, allowNone, submitLabel, busy, onSubmit, onCancel }: {
  initial: AutomationSchedule | null;
  allowNone: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (schedule: AutomationSchedule | null) => void;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<AutomationSchedule["kind"]>(initial?.kind ?? (allowNone ? "once" : "daily"));
  const [time, setTime] = useState(scheduleToTimeValue(initial));
  const [day, setDay] = useState(initial?.day_of_week ?? "mon");
  const needsTime = !(allowNone && kind === "once");
  const parsed = parseTimeValue(time);
  const submit = () => {
    if (allowNone && kind === "once") { onSubmit(null); return; }
    if (!parsed) return;
    onSubmit({ kind, hour: parsed.hour, minute: parsed.minute, ...(kind === "weekly" ? { day_of_week: day } : {}) });
  };
  return (
    <div data-testid="automation-schedule-editor">
      <div role="group" aria-label={COPY.doneScheduleTitle} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {SCHEDULE_CHOICES.map((c) => (
          <button
            key={c.kind}
            type="button"
            aria-pressed={kind === c.kind}
            onClick={() => setKind(c.kind)}
            disabled={busy}
            style={{
              flex: "1 1 72px", minHeight: 48, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${kind === c.kind ? "#16a34a" : "var(--ct-border)"}`,
              background: kind === c.kind ? "rgba(22,163,74,.14)" : "transparent", color: "var(--ct-text)",
            }}
          >{c.label}</button>
        ))}
      </div>
      {kind === "weekly" && (
        <div style={{ marginBottom: 8 }}>
          <label style={LABEL} htmlFor="automation-sched-day">{COPY.doneScheduleDay}</label>
          <select id="automation-sched-day" value={day} onChange={(e) => setDay(e.target.value)} disabled={busy} style={FIELD}>
            {DAY_CHOICES.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>
        </div>
      )}
      {needsTime && (
        <div style={{ marginBottom: 8 }}>
          <label style={LABEL} htmlFor="automation-sched-time">{COPY.doneScheduleTime}</label>
          <input id="automation-sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} style={FIELD} />
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button label={submitLabel} kind="primary" busy={busy} disabled={needsTime && !parsed} onClick={submit} testId="automation-schedule-submit" />
        {onCancel && <Button label={COPY.cancel} kind="plain" disabled={busy} onClick={onCancel} />}
      </div>
    </div>
  );
}

export default function AutomationDraftCard(props: AutomationDraftCardProps) {
  if (props.runConfirm) {
    return (
      <RunConfirmBody
        confirmation={props.runConfirm.confirmation}
        sessionId={props.runConfirm.sessionId}
        onDismiss={props.onDismiss}
        onLayoutChange={props.onLayoutChange}
      />
    );
  }
  return <AutomationDraftBody {...props} />;
}

function RunConfirmBody({ confirmation, sessionId, onDismiss, onLayoutChange }: {
  confirmation: RunConfirmation;
  sessionId?: string;
  onDismiss: (draftId: string) => void;
  onLayoutChange?: () => void;
}) {
  const [state, dispatch] = React.useReducer(reduceRunConfirm, RUN_CONFIRM_INITIAL);
  const rootRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const sendingRef = useRef(false);
  const layoutRef = useRef(onLayoutChange);
  const { draftId } = confirmation;

  useEffect(() => { layoutRef.current = onLayoutChange; }, [onLayoutChange]);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  useEffect(() => { layoutRef.current?.(); }, [state.phase]);

  const run = useCallback(async () => {
    if (sendingRef.current || !canStartRun(state)) return;
    sendingRef.current = true;
    dispatch({ type: "run" });
    const r = await api.runOhvisConsoleCommandConfirmed(confirmedCommandBody(confirmation, sessionId));
    sendingRef.current = false;
    if (!aliveRef.current) return;
    if (r.ok && r.data.status !== "confirmation_required") dispatch({ type: "ok" });
    else if (r.ok) dispatch({ type: "fail", status: 500, code: "" });
    else dispatch({ type: "fail", status: r.status, code: r.code });
  }, [state, confirmation, sessionId]);

  const decline = useCallback(() => {
    if (sendingRef.current) return;
    dispatch({ type: "decline" });
  }, []);

  const closeCard = useCallback(() => onDismiss(draftId), [onDismiss, draftId]);
  const sending = state.phase === "sending";
  const runButton = confirmation.buttons.find((b) => b.id === "confirm_run");
  const declineButton = confirmation.buttons.find((b) => b.id === "decline_run");

  return (
    <Shell rootRef={rootRef} draftId={draftId} state={`confirm-${state.phase}`}>
      <h3 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, color: "var(--ct-text)", wordBreak: "break-word" }}>
        {confirmation.headline}
      </h3>
      {(state.phase === "idle" || state.phase === "sending" || state.phase === "error") && (
        <p style={HINT}>{confirmation.body}</p>
      )}
      {sending && <div role="status" style={HINT}>{COPY.runConfirmSending}</div>}
      {state.phase === "error" && (
        <div role="alert" data-testid="automation-run-error" style={{ marginTop: 10, fontSize: 13, color: "#f87171", lineHeight: 1.55, wordBreak: "break-word" }}>
          {errorSentence(state.errorStatus, state.errorCode)}
        </div>
      )}
      {state.phase === "done" && <p role="status" style={HINT}>{COPY.runConfirmDone}</p>}
      {state.phase === "declined" && <p role="status" style={HINT}>{COPY.runConfirmDeclined}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {(state.phase === "idle" || state.phase === "sending" || state.phase === "error") && (
          <>
            {declineButton && (
              <Button label={declineButton.label} kind="plain" disabled={sending} onClick={decline} testId="automation-btn-decline_run" />
            )}
            {runButton && (
              <Button
                label={state.phase === "error" ? COPY.runConfirmRetry : runButton.label}
                kind="primary"
                busy={sending}
                disabled={sending}
                onClick={() => void run()}
                testId="automation-btn-confirm_run"
              />
            )}
          </>
        )}
        {(state.phase === "done" || state.phase === "declined") && (
          <Button label={COPY.closeCard} kind="plain" onClick={closeCard} testId="automation-btn-close" />
        )}
      </div>
    </Shell>
  );
}

function AutomationDraftBody({ draftId, onDismiss, onReplace, onLayoutChange }: AutomationDraftCardProps) {
  const [view, setView] = useState<AutomationDraftView | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; code: string } | null>(null);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [notice, setNotice] = useState("");
  const [editField, setEditField] = useState<EditField | null>(null);
  const [editText, setEditText] = useState("");
  const [domainOk, setDomainOk] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [demoStartFailed, setDemoStartFailed] = useState(false);
  const [credentialFailed, setCredentialFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const loadSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const autoDemoRef = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(onLayoutChange);
  const lastStateRef = useRef("");

  useEffect(() => { layoutRef.current = onLayoutChange; }, [onLayoutChange]);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const state = view?.draft.state ?? "";
  useEffect(() => {
    if (!state || state === lastStateRef.current) return;
    lastStateRef.current = state;
    layoutRef.current?.();
  }, [state]);

  const applyView = useCallback((data: AutomationDraftView) => {
    setView(data);
    setCredentialFailed((prev) => credentialErrorAfter(prev, data.credential));
  }, []);

  const applyFailure = useCallback((r: Extract<AutomationCallResult<AutomationDraftView>, { ok: false }>) => {
    setNotice(errorSentence(r.status, r.code));
  }, []);

  const load = useCallback(async () => {
    const epoch = epochRef.current;
    const seq = ++loadSeqRef.current;
    const r = await api.getAutomationDraft(draftId);
    if (!aliveRef.current || epoch !== epochRef.current || busyRef.current) return;
    if (seq < appliedSeqRef.current) return;
    appliedSeqRef.current = seq;
    if (r.ok) {
      applyView(r.data);
      setLoadError(null);
      setTick((n) => n + 1);
    } else if (r.status === 404 || r.status === 403 || r.status === 401) {
      setLoadError({ status: r.status, code: r.code });
    } else {
      setLoadError((prev) => prev ?? { status: r.status, code: r.code });
    }
  }, [draftId, applyView]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ms = pollIntervalFor(state);
    if (ms === null || loadError?.status === 404 || loadError?.status === 403) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, ms);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [state, load, loadError?.status]);

  const act = useCallback(async (
    id: ActionId,
    call: () => Promise<AutomationCallResult<AutomationDraftView>>,
    after?: (data: AutomationDraftView) => void,
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    epochRef.current += 1;
    setBusy(id);
    setNotice("");
    const r = await call();
    epochRef.current += 1;
    busyRef.current = false;
    if (!aliveRef.current) return r.ok;
    setBusy(null);
    if (r.ok) {
      applyView(r.data);
      setLoadError(null);
      after?.(r.data);
      return true;
    }
    applyFailure(r);
    if (r.status === 409) void load();
    return false;
  }, [applyFailure, applyView, load]);

  const connectCredential = useCallback(() => {
    setCredentialFailed(false);
    void act("cred-new", () => api.chooseAutomationCredential(draftId, { requestNew: true })).then((ok) => {
      if (!ok) setCredentialFailed(true);
    });
  }, [act, draftId]);

  const startDemo = useCallback((expected: string) => {
    setDemoStartFailed(false);
    return act("demo", () => api.startAutomationDemo(draftId, expected)).then((ok) => {
      if (!ok) setDemoStartFailed(true);
      return ok;
    });
  }, [act, draftId]);

  // 로그인 준비가 끝나면 화면에서 따로 누르지 않아도 시연을 시작한다(목업 S3 → S4).
  useEffect(() => {
    if (state !== "credential_ready" || autoDemoRef.current === draftId) return;
    autoDemoRef.current = draftId;
    void startDemo("credential_ready");
  }, [state, draftId, startDemo]);

  const restart = useCallback(async () => {
    if (!view || busyRef.current) return;
    busyRef.current = true;
    setBusy("restart");
    setNotice("");
    const r = await api.createAutomationDraft(view.draft.intent_text);
    busyRef.current = false;
    if (!aliveRef.current) return;
    setBusy(null);
    if (r.ok) onReplace?.(draftId, r.data.draft.id);
    else setNotice(errorSentence(r.status, r.code));
  }, [view, draftId, onReplace]);

  const closeCard = useCallback(() => onDismiss(draftId), [onDismiss, draftId]);

  const saveEdit = useCallback(async (field: EditField, changes: Parameters<typeof api.patchAutomationDraft>[1]) => {
    const ok = await act(`edit-${field}`, () => api.patchAutomationDraft(draftId, changes));
    if (ok) { setEditField(null); setDomainOk(false); }
  }, [act, draftId]);

  const openEdit = useCallback((field: EditField) => {
    if (!view) return;
    const intent = view.draft.intent;
    setEditText(field === "site" ? (intent.site_name || intent.domain) : field === "task" ? intent.task : intent.output_kind);
    setEditField(field);
    setNotice("");
  }, [view]);

  const onButton = useCallback((button: AutomationCardButton) => {
    if (!view) return;
    const current = view.draft.state;
    switch (button.id) {
      case "confirm_intent":
        if (!view.draft.intent.domain) { setNotice(COPY.domainNeeded); return; }
        if (view.card.needs_domain_confirm && !domainOk) { setNotice(errorSentence(422, "domain_confirmation_required")); return; }
        void act("confirm", () => api.confirmAutomationIntent(draftId, current, domainOk));
        return;
      case "edit_intent": openEdit("site"); return;
      case "cancel":
        if (current === "paused_risk") void act("cancel", () => api.decideAutomationRisk(draftId, "cancel"));
        else closeCard();
        return;
      case "proceed": void act("proceed", () => api.decideAutomationRisk(draftId, "proceed")); return;
      case "stop_here": void act("stop_here", () => api.decideAutomationRisk(draftId, "stop_here")); return;
      case "approve_result": void act("approve", () => api.reviewAutomationDraft(draftId, true)); return;
      case "reject_result": setRejectOpen(true); return;
      case "start_manual":
      case "manual_record":
        if (current !== "revising" && current !== "manual_record") return;
        void act("manual", () => api.startAutomationManualRecord(draftId), (data) => {
          if (data.recording_id) setNotice(COPY.manualStarted);
        });
        return;
      case "retry_demo": void startDemo(current); return;
      case "relink_login": void restart(); return;
      case "run_now":
        void act("run", () => api.runAutomationDraft(draftId), () => setNotice(COPY.doneRunStarted));
        return;
      case "pause":
        void act("pause", () => api.pauseAutomationDraft(draftId), () => setNotice(COPY.donePaused));
        return;
      default:
    }
  }, [view, draftId, domainOk, act, openEdit, closeCard, startDemo, restart]);

  const evidence = useMemo(() => parseEvidence(view?.draft.evidence), [view?.draft.evidence]);

  if (!view) {
    return (
      <Shell rootRef={rootRef} draftId={draftId} state="loading">
        {loadError ? (
          <>
            <div role="alert" style={{ fontSize: 14, color: "var(--ct-text)", lineHeight: 1.55 }}>
              {errorSentence(loadError.status, loadError.code) === COPY.loadMissing || loadError.status === 404
                ? errorSentence(loadError.status || 404, loadError.code)
                : COPY.loadFailed}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {loadError.status !== 404 && loadError.status !== 403 && (
                <Button label={COPY.retryLoad} kind="plain" onClick={() => { setLoadError(null); void load(); }} />
              )}
              <Button label={COPY.closeCard} kind="plain" onClick={closeCard} />
            </div>
          </>
        ) : (
          <div role="status" style={HINT}>{COPY.progressWaiting}</div>
        )}
      </Shell>
    );
  }

  const { draft, card } = view;
  const step = stepOf(draft.state);
  const isBusy = busy !== null;
  const orderedButtons = closeOnlyButtons(draft.state, card.buttons)
    .filter((b) => b.id !== "edit_intent")
    .sort((a, b) => Number(a.primary) - Number(b.primary));
  const failedButtons = failedRecoveryButtons(card.buttons, draft.failure_code).sort((a, b) => Number(a.primary) - Number(b.primary));
  const isFinal = FINAL_STATES.has(draft.state);

  const rowButtons = (items: AutomationCardButton[]) => items.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {items.map((b) => (
        <Button
          key={b.id}
          label={b.label}
          kind={b.primary ? "primary" : b.id === "cancel" ? "plain" : "plain"}
          busy={busy === b.id.replace("_intent", "").replace("_result", "")}
          disabled={isBusy}
          onClick={() => onButton(b)}
          testId={`automation-btn-${b.id}`}
        />
      ))}
    </div>
  );

  const header = (
    <>
      {step !== null && <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8" }}>{COPY.stepLabel(step)}</span>}
      <h3 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, color: "var(--ct-text)", wordBreak: "break-word" }}>
        {card.headline}
      </h3>
      {card.title && draft.state !== "intent_draft" && (
        <div style={{ fontSize: 13, color: "var(--ct-text2)", marginTop: 2, wordBreak: "break-word" }}>{card.title}</div>
      )}
    </>
  );

  const noticeBox = notice && (
    <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "#f87171", lineHeight: 1.55, wordBreak: "break-word" }}>{notice}</div>
  );

  const closeRow = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      <Button label={COPY.closeCard} kind="plain" disabled={isBusy} onClick={closeCard} testId="automation-btn-close" />
    </div>
  );

  // ── 카드 1: 이렇게 이해했어요 ────────────────────────────────────────────
  if (draft.state === "intent_draft") {
    const fields = card.fields ?? [];
    const fieldMap: Record<string, EditField> = { site: "site", task: "task", output: "output", when: "when" };
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        {header}
        <p style={HINT}>{card.body}</p>
        <div style={{ marginTop: 8 }}>
          {fields.map((f) => {
            const key = fieldMap[f.id];
            const editing = key !== undefined && editField === key;
            return (
              <div key={f.id} style={{ padding: "10px 0", borderTop: "1px solid var(--ct-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: "0 0 64px", fontSize: 12, fontWeight: 700, color: "var(--ct-text2)" }}>{f.label}</div>
                  <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 14, color: "var(--ct-text)", wordBreak: "break-word" }}>
                    {f.value || "-"}
                    {f.id === "site" && draft.intent.domain && (
                      <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>{draft.intent.domain}</div>
                    )}
                  </div>
                  {key !== undefined && !editing && (
                    <button
                      type="button"
                      onClick={() => openEdit(key)}
                      disabled={isBusy}
                      aria-label={`${f.label} ${COPY.edit}`}
                      style={{ flex: "0 0 auto", minHeight: 48, minWidth: 64, padding: "0 10px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text2)" }}
                    >{COPY.edit}</button>
                  )}
                </div>
                {editing && (key === "site" || key === "task") && (
                  <form
                    style={{ marginTop: 8 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = editText.trim();
                      if (!value) return;
                      void saveEdit(key, key === "site" ? { site: value } : { task: value });
                    }}
                  >
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder={key === "site" ? COPY.fieldSitePlaceholder : COPY.fieldTaskPlaceholder}
                      maxLength={key === "site" ? 200 : 120}
                      disabled={isBusy}
                      style={FIELD}
                      aria-label={f.label}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      <button type="submit" disabled={isBusy || !editText.trim()} style={btnStyle("primary", isBusy || !editText.trim())}>
                        {busy === `edit-${key}` ? `${COPY.save}…` : COPY.save}
                      </button>
                      <Button label={COPY.cancel} kind="plain" disabled={isBusy} onClick={() => setEditField(null)} />
                    </div>
                  </form>
                )}
                {editing && key === "output" && (
                  <div style={{ marginTop: 8 }}>
                    <div role="group" aria-label={f.label} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {OUTPUT_CHOICES.map((o) => (
                        <button
                          key={o.code}
                          type="button"
                          aria-pressed={editText === o.code}
                          disabled={isBusy}
                          onClick={() => setEditText(o.code)}
                          style={{
                            flex: "1 1 72px", minHeight: 48, borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${editText === o.code ? "#16a34a" : "var(--ct-border)"}`,
                            background: editText === o.code ? "rgba(22,163,74,.14)" : "transparent", color: "var(--ct-text)",
                          }}
                        >{o.label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      <Button label={COPY.save} kind="primary" busy={busy === "edit-output"} disabled={isBusy} onClick={() => void saveEdit("output", { output: editText })} />
                      <Button label={COPY.cancel} kind="plain" disabled={isBusy} onClick={() => setEditField(null)} />
                    </div>
                  </div>
                )}
                {editing && key === "when" && (
                  <div style={{ marginTop: 8 }}>
                    <ScheduleEditor
                      initial={draft.intent.schedule}
                      allowNone
                      submitLabel={COPY.save}
                      busy={busy === "edit-when"}
                      onSubmit={(schedule) => void saveEdit("when", { schedule })}
                      onCancel={() => setEditField(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {card.needs_domain_confirm && draft.intent.domain && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, marginTop: 4, fontSize: 14, color: "var(--ct-text)", lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={domainOk}
              onChange={(e) => setDomainOk(e.target.checked)}
              disabled={isBusy}
              style={{ width: 24, height: 24, flex: "0 0 auto" }}
            />
            <span>{COPY.domainCheck(draft.intent.domain)} <b>{COPY.domainOk}</b></span>
          </label>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Button label={COPY.edit} kind="plain" disabled={isBusy} onClick={() => openEdit("site")} testId="automation-btn-edit_intent" />
          {card.buttons.filter((b) => b.id === "confirm_intent").map((b) => (
            <Button key={b.id} label={b.label} kind="primary" busy={busy === "confirm"} disabled={isBusy} onClick={() => onButton(b)} testId="automation-btn-confirm_intent" />
          ))}
          {card.buttons.filter((b) => b.id === "cancel").map((b) => (
            <Button key={b.id} label={b.label} kind="plain" disabled={isBusy} onClick={() => onButton(b)} testId="automation-btn-cancel" />
          ))}
        </div>
        {noticeBox}
      </Shell>
    );
  }

  // ── 카드 2: 로그인 연결 ─────────────────────────────────────────────────
  if (draft.state === "intent_confirmed" || draft.state === "credential_waiting") {
    const credential = view.credential;
    const requestId = credential?.requestId || credential?.request_id || "";
    const host = draft.intent.domain || credential?.host || "";
    if (draft.state === "credential_waiting" && requestId) {
      return (
        <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
          {header}
          <p style={HINT}>{COPY.credentialSafeNote}</p>
          <VaultCredentialCard
            card={{ id: `automation-${draftId}`, requestId, host, loginUrl: draft.intent.url || (host ? `https://${host}` : "") }}
            onDismiss={closeCard}
          />
          {noticeBox}
        </Shell>
      );
    }
    const choices = credential?.credentials ?? [];
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        {header}
        {choices.length > 0 ? (
          <>
            <p style={HINT}>{COPY.credentialLead(host || draft.intent.site_name)}</p>
            <div style={{ marginTop: 8 }}>
              {choices.map((c) => (
                <div key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid var(--ct-border)" }}>
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ct-text)", wordBreak: "break-word" }}>{c.display_name}</div>
                    <div style={{ fontSize: 12, color: "var(--ct-text2)" }}>
                      {c.host} · {c.verified ? COPY.credentialVerified : COPY.credentialUnverified}
                    </div>
                  </div>
                  <Button
                    label={COPY.credentialUse}
                    kind="primary"
                    busy={busy === `cred-${c.id}`}
                    disabled={isBusy}
                    onClick={() => void act(`cred-${c.id}`, () => api.chooseAutomationCredential(draftId, { credentialId: c.id }))}
                    testId="automation-btn-use-credential"
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <Button
                label={COPY.credentialOther}
                kind="plain"
                busy={busy === "cred-new"}
                disabled={isBusy}
                onClick={() => void act("cred-new", () => api.chooseAutomationCredential(draftId, { requestNew: true }))}
                testId="automation-btn-other-credential"
              />
            </div>
          </>
        ) : (
          <>
            <p style={HINT}>{credentialFailed ? COPY.credentialRequestFailed : card.body}</p>
            {showCredentialConnect(draft.state, credential) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <Button
                  label={credentialFailed ? COPY.credentialRetry : COPY.credentialConnect}
                  kind="primary"
                  busy={busy === "cred-new"}
                  disabled={isBusy}
                  onClick={connectCredential}
                  testId="automation-btn-connect-credential"
                />
              </div>
            )}
          </>
        )}
        {noticeBox}
      </Shell>
    );
  }

  // ── 진행 화면 ──────────────────────────────────────────────────────────
  if (draft.state === "credential_ready" || draft.state === "demonstrating" || draft.state === "revising") {
    const percent = progressPercent(evidence.steps);
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        {header}
        <p style={HINT}>{evidence.steps.length === 0 ? COPY.progressWaiting : card.body}</p>
        {evidence.liveFrameUrl && (
          <div style={{ position: "relative", marginTop: 10, borderRadius: 9, overflow: "hidden", border: "1px solid var(--ct-border)", background: "#0b1220" }}>
            <RetryImg
              src={withCacheBust(evidence.liveFrameUrl, tick)}
              alt={COPY.progressLive}
              style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%" }}
            />
            <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" }}>
              {COPY.progressLive}
            </span>
          </div>
        )}
        {evidence.steps.length > 0 && (
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }} aria-label={COPY.progressDone}>
            {evidence.steps.map((s, i) => (
              <li
                key={`${i}-${s.text}`}
                aria-current={s.status === "now" ? "step" : undefined}
                style={{
                  display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", fontSize: 14, wordBreak: "break-word",
                  color: s.status === "wait" ? "var(--ct-text2)" : "var(--ct-text)", fontWeight: s.status === "now" ? 700 : 400,
                }}
              >
                <span aria-hidden="true" style={{ flex: "0 0 20px", textAlign: "center", color: s.status === "done" ? "#16a34a" : "#38bdf8" }}>
                  {s.status === "done" ? "✓" : i + 1}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        )}
        {evidence.steps.length > 0 && (
          <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: "var(--ct-border)", marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "#16a34a", transition: "width .3s" }} />
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {progressButtons(draft.state, demoStartFailed).map((b) => (
            <Button
              key={b.id}
              label={b.label}
              kind={b.primary ? "primary" : "plain"}
              busy={busy === (b.id === "retry_demo" ? "demo" : b.id === "manual_record" ? "manual" : "")}
              disabled={isBusy}
              onClick={() => (b.id === "hide_card" ? closeCard() : onButton(b))}
              testId={`automation-btn-${b.id}`}
            />
          ))}
        </div>
        <p style={{ ...HINT, marginTop: 8 }}>{COPY.hideNote}</p>
        {noticeBox}
      </Shell>
    );
  }

  // ── 카드 3: 결과 확인 ──────────────────────────────────────────────────
  if (draft.state === "result_review") {
    const when = formatKstTime(evidence.capturedAt);
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        {header}
        <p style={HINT}>{card.body}</p>
        <div style={{ marginTop: 10, border: "1px solid var(--ct-border)", borderRadius: 9, padding: 8, overflow: "hidden" }}>
          {(evidence.finalShotUrl || when) && (
            <div style={{ fontSize: 12, color: "var(--ct-text2)", marginBottom: 6 }}>
              {COPY.resultCaption(when || "-")}
            </div>
          )}
          {evidence.finalShotUrl && (
            <RetryImg
              src={evidence.finalShotUrl}
              alt={COPY.progressLive}
              style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%", borderRadius: 6, marginBottom: 8 }}
            />
          )}
          {evidence.rows.length > 0 && (
            <>
              <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
                {evidence.columns.length > 0 && (
                  <thead>
                    <tr>{evidence.columns.map((c, i) => (
                      <th key={`${i}-${c}`} style={{ textAlign: "left", padding: "4px 6px", color: "var(--ct-text2)", fontWeight: 600, wordBreak: "break-word" }}>{c}</th>
                    ))}</tr>
                  </thead>
                )}
                <tbody>
                  {evidence.rows.map((row, ri) => (
                    <tr key={ri}>{row.map((c, ci) => (
                      <td key={ci} style={{ padding: "4px 6px", borderTop: "1px solid var(--ct-border)", color: "var(--ct-text)", wordBreak: "break-word" }}>{c}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 12, color: "var(--ct-text2)", marginTop: 6 }}>{evidence.note || COPY.resultPreviewNote}</div>
            </>
          )}
        </div>
        {!rejectOpen ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {orderedButtons.map((b) => (
              <Button
                key={b.id}
                label={b.label}
                kind={b.primary ? "primary" : "plain"}
                busy={b.id === "approve_result" && busy === "approve"}
                disabled={isBusy}
                onClick={() => onButton(b)}
                testId={`automation-btn-${b.id}`}
              />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ct-text)", marginBottom: 8 }}>{COPY.rejectAsk}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {REJECT_REASONS.map((r) => (
                <Button
                  key={r.code}
                  label={r.label}
                  kind="plain"
                  busy={busy === `reject-${r.code}`}
                  disabled={isBusy}
                  onClick={() => void act(`reject-${r.code}`, () => api.reviewAutomationDraft(draftId, false, r.code), () => setRejectOpen(false))}
                  testId={`automation-reject-${r.code}`}
                />
              ))}
              <Button label={COPY.cancel} kind="plain" disabled={isBusy} onClick={() => setRejectOpen(false)} />
            </div>
          </div>
        )}
        {noticeBox}
      </Shell>
    );
  }

  // ── 완료·예약 ──────────────────────────────────────────────────────────
  if (draft.state === "pending_approval" || draft.state === "active" || draft.state === "registering") {
    const saving = draft.state === "registering";
    const scheduleText = view.schedule?.text || describeSchedule(draft.intent.schedule) || COPY.doneNoSchedule;
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        <div aria-hidden="true" style={{ fontSize: 28, textAlign: "center" }}>{saving ? "⏳" : "✅"}</div>
        <h3 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, textAlign: "center", color: "var(--ct-text)" }}>
          {saving ? COPY.doneSavingHeadline : COPY.doneHeadline}
        </h3>
        {card.title && <p style={{ ...HINT, textAlign: "center" }}>{card.title}</p>}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: "1px solid var(--ct-border)", fontSize: 14 }}>
            <span style={{ color: "var(--ct-text2)" }}>{COPY.doneStatus}</span>
            <b style={{ color: "var(--ct-text)", textAlign: "right" }}>{card.headline}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: "1px solid var(--ct-border)", fontSize: 14 }}>
            <span style={{ color: "var(--ct-text2)" }}>{COPY.doneRun}</span>
            <span style={{ color: "var(--ct-text)", textAlign: "right", wordBreak: "break-word" }}>{scheduleText}</span>
          </div>
        </div>
        <p style={HINT}>{card.body}</p>
        {!saving && scheduleOpen && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ct-text)", marginBottom: 8 }}>{COPY.doneScheduleTitle}</div>
            <ScheduleEditor
              initial={draft.intent.schedule}
              allowNone={false}
              submitLabel={COPY.doneScheduleApply}
              busy={busy === "schedule"}
              onCancel={() => setScheduleOpen(false)}
              onSubmit={(schedule) => {
                if (!schedule) return;
                void act("schedule", () => api.setAutomationSchedule(draftId, schedule), (data) => {
                  setScheduleOpen(false);
                  const text = data.schedule?.text || describeSchedule(schedule);
                  setNotice(COPY.doneScheduleSaved(text, Boolean(data.schedule?.active)));
                });
              }}
            />
          </div>
        )}
        {!saving && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {draft.state === "active" && card.buttons.map((b) => (
              <Button
                key={b.id}
                label={b.label}
                kind={b.primary ? "primary" : "plain"}
                busy={busy === (b.id === "run_now" ? "run" : b.id)}
                disabled={isBusy}
                onClick={() => onButton(b)}
                testId={`automation-btn-${b.id}`}
              />
            ))}
            {!scheduleOpen && (
              <Button label={COPY.doneScheduleTitle} kind="plain" disabled={isBusy} onClick={() => setScheduleOpen(true)} testId="automation-btn-schedule" />
            )}
            <Button label={COPY.closeCard} kind="plain" disabled={isBusy} onClick={closeCard} />
          </div>
        )}
        {noticeBox}
      </Shell>
    );
  }

  // ── 실패 복구 ──────────────────────────────────────────────────────────
  if (draft.state === "failed") {
    return (
      <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
        {header}
        <div role="alert" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.4)", fontSize: 14, color: "var(--ct-text)", lineHeight: 1.6, wordBreak: "break-word" }}>
          {card.body}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {failedButtons.map((b) => (
            <Button
              key={b.id}
              label={b.label}
              kind={b.primary ? "primary" : "plain"}
              busy={busy === (b.id === "retry_demo" ? "demo" : b.id === "relink_login" ? "restart" : b.id)}
              disabled={isBusy}
              onClick={() => onButton(b)}
              testId={`automation-btn-${b.id}`}
            />
          ))}
        </div>
        {noticeBox}
      </Shell>
    );
  }

  // ── 일시정지(위험 단계)·진행 확인·끝난 상태 ────────────────────────────
  return (
    <Shell rootRef={rootRef} draftId={draftId} state={draft.state}>
      {header}
      <p style={HINT}>{card.body}</p>
      {rowButtons(orderedButtons)}
      {isFinal && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Button label={COPY.restart} kind="primary" busy={busy === "restart"} disabled={isBusy} onClick={() => void restart()} testId="automation-btn-restart" />
          <Button label={COPY.closeCard} kind="plain" disabled={isBusy} onClick={closeCard} testId="automation-btn-close" />
        </div>
      )}
      {!isFinal && draft.state !== "paused_risk" && draft.state !== "manual_record" && closeRow}
      {noticeBox}
    </Shell>
  );
}

function Shell({ rootRef, draftId, state, children }: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  draftId: string;
  state: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={rootRef}
      data-automation-draft-card={draftId}
      data-automation-state={state}
      tabIndex={-1}
      aria-live="polite"
      style={{
        margin: "10px 0", padding: "12px 14px", borderRadius: 10, boxSizing: "border-box", maxWidth: "100%",
        background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.34)", borderLeft: "4px solid #16a34a",
        scrollMarginTop: 96, overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );
}
