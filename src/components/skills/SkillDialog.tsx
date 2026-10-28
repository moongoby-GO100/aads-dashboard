"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  activeVersionView, buildExecuteBody, buildPromoteBody, buildRollbackBody, describeRunResult, EMPTY_PROMOTE_FORM,
  formatLatency, promoteTarget, riskLabel, runStatusColor, runStatusLabel, skillErrorMessage, versionStatusLabel,
  type PromoteForm, type RunResultView, type SkillDetail,
} from "@/lib/skillCatalog";
import { skillsApi } from "@/lib/skillsApi";
import { BUTTON_DANGER, BUTTON_PLAIN, BUTTON_PRIMARY, INPUT, MUTED } from "./skillStyles";

export type DialogRequest =
  | { kind: "execute" }
  | { kind: "rollback" }
  | { kind: "disable" }
  | { kind: "validate"; version: string }
  | { kind: "promote"; version: string; fromStatus: string };

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const TITLE: Record<DialogRequest["kind"], string> = {
  execute: "스킬 실행",
  validate: "버전 검증",
  promote: "버전 승격",
  rollback: "이전 버전으로 되돌리기",
  disable: "스킬 비활성",
};

const SUBMIT: Record<DialogRequest["kind"], string> = {
  execute: "실행",
  validate: "검증",
  promote: "승격",
  rollback: "되돌리기",
  disable: "비활성",
};

type Outcome = { tone: "ok" | "warn"; text: string; run?: RunResultView };

const TEXTAREA: React.CSSProperties = { ...INPUT, minHeight: 120, fontFamily: "monospace", fontSize: 13, resize: "vertical" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: "var(--text-primary)" }}>
      <span style={{ display: "block", marginBottom: 4, ...MUTED }}>{label}</span>
      {children}
    </label>
  );
}

export default function SkillDialog({
  request, skill, onClose, onChanged,
}: { request: DialogRequest; skill: SkillDetail; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [inputText, setInputText] = useState("{}");
  const [reason, setReason] = useState("");
  const [promoteForm, setPromoteForm] = useState<PromoteForm>(EMPTY_PROMOTE_FORM);
  const idempotencyKey = useRef(`skills-ui-${request.kind}-${newId()}`);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const active = activeVersionView(skill);
  const done = outcome !== null;

  const submit = useCallback(async () => {
    if (busy || done) return;
    setError("");
    let result;
    if (request.kind === "execute") {
      if (!active) return setError("활성 버전이 없어 실행할 수 없습니다.");
      const built = buildExecuteBody(active.version, inputText, active.manifest, newId);
      if (!built.ok) return setError(built.error);
      setBusy(true);
      result = await skillsApi.execute(skill.skillId, built.body);
      setBusy(false);
      if (result.ok) {
        const run = describeRunResult(result.data);
        setOutcome({ tone: run.status === "succeeded" ? "ok" : "warn", text: `실행 결과: ${runStatusLabel(run.status)}`, run });
      }
    } else if (request.kind === "validate") {
      setBusy(true);
      result = await skillsApi.validate(skill.skillId, request.version);
      setBusy(false);
      if (result.ok) {
        const data = result.data as { executor_registered?: boolean };
        setOutcome(
          data.executor_registered === false
            ? { tone: "warn", text: "버전 내용은 올바르지만, 서버에 실행 코드가 아직 등록되어 있지 않아 승격할 수 없습니다." }
            : { tone: "ok", text: "검증을 통과했습니다. 버전 내용과 실행 코드 등록이 모두 정상입니다." },
        );
      }
    } else if (request.kind === "promote") {
      const built = buildPromoteBody(promoteForm, idempotencyKey.current);
      if (!built.ok) return setError(built.error);
      setBusy(true);
      result = await skillsApi.promote(skill.skillId, request.version, built.body);
      setBusy(false);
      if (result.ok) {
        const data = result.data as { status?: string; reasons?: unknown };
        if (data.status === "quarantined") {
          const reasons = Array.isArray(data.reasons) ? data.reasons.filter((r): r is string => typeof r === "string") : [];
          setOutcome({ tone: "warn", text: `승격 기준에 미달해 이 버전이 격리되었습니다.${reasons.length ? ` 사유: ${reasons.join(", ")}` : ""}` });
        } else {
          const target = promoteTarget(request.fromStatus) === "active" ? "활성 버전" : "검증 중(그림자) 단계";
          setOutcome({ tone: "ok", text: `${request.version} 버전이 ${target}으로 승격되었습니다.` });
        }
      }
    } else if (request.kind === "rollback") {
      const built = buildRollbackBody(reason, idempotencyKey.current);
      if (!built.ok) return setError(built.error);
      setBusy(true);
      result = await skillsApi.rollback(skill.skillId, built.body);
      setBusy(false);
      if (result.ok) setOutcome({ tone: "ok", text: "이전 활성 버전으로 되돌렸습니다." });
    } else {
      setBusy(true);
      result = await skillsApi.disable(skill.skillId);
      setBusy(false);
      if (result.ok) setOutcome({ tone: "ok", text: "스킬을 비활성으로 바꿨습니다. 버전과 실행 기록은 그대로 보존됩니다." });
    }
    if (!result) return;
    if (result.ok) onChanged();
    else setError(skillErrorMessage(result));
  }, [active, busy, done, inputText, onChanged, promoteForm, reason, request, skill.skillId]);

  const required = active?.manifest.inputRequired ?? [];

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TITLE[request.kind]}
        data-testid="skill-dialog"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))", background: "var(--bg-card)",
          border: "1px solid var(--border)", borderRadius: "12px 12px 0 0", display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{TITLE[request.kind]}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
          <strong>{skill.title}</strong> ({riskLabel(skill.riskTier)})
          {"version" in request ? ` · 버전 ${request.version} (${versionStatusLabel(skill.versions.find((v) => v.version === request.version)?.status)})` : ""}
        </p>

        {!done && request.kind === "execute" && (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, ...MUTED }}>
              활성 버전 {active?.version ?? "-"}을(를) 지금 실행합니다. 조회 전용 스킬이지만 실행 기록이 남습니다.
            </p>
            <Field label={`입력값 (JSON)${required.length ? ` — 필수: ${required.join(", ")}` : ""}`}>
              <textarea
                data-testid="skill-execute-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                spellCheck={false}
                style={TEXTAREA}
              />
            </Field>
          </>
        )}

        {!done && request.kind === "validate" && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, ...MUTED }}>
            저장된 버전 내용이 규격에 맞는지, 서버에 실행 코드가 등록되어 있는지 확인합니다. 상태는 바뀌지 않습니다.
          </p>
        )}

        {!done && request.kind === "promote" && (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--warning)" }}>
              {promoteTarget(request.fromStatus) === "active"
                ? "활성 버전으로 올리면 지금 쓰는 활성 버전은 이전 버전으로 내려갑니다."
                : "검증 중(그림자) 단계로 올립니다."}
              {" "}검증 기준에 미달하면 이 버전은 격리됩니다. 근거를 확인한 뒤 진행해 주세요.
            </p>
            <Field label="핸드오버 키 (예: runner:abcd1234)">
              <input data-testid="skill-promote-handover" style={INPUT} value={promoteForm.handoverKey} onChange={(e) => setPromoteForm({ ...promoteForm, handoverKey: e.target.value })} />
            </Field>
            <Field label="커밋 (SHA)">
              <input data-testid="skill-promote-commit" style={INPUT} value={promoteForm.commit} onChange={(e) => setPromoteForm({ ...promoteForm, commit: e.target.value })} />
            </Field>
            <Field label="푸시 상태">
              <input data-testid="skill-promote-push" style={INPUT} value={promoteForm.push} onChange={(e) => setPromoteForm({ ...promoteForm, push: e.target.value })} />
            </Field>
            <Field label="배포 상태">
              <input data-testid="skill-promote-deploy" style={INPUT} value={promoteForm.deploy} onChange={(e) => setPromoteForm({ ...promoteForm, deploy: e.target.value })} />
            </Field>
            <Field label="검증 결과 (JSON: focused_results, affected_regressions, candidate_metrics, active_metrics)">
              <textarea data-testid="skill-promote-gate" spellCheck={false} style={TEXTAREA} value={promoteForm.gateJson} onChange={(e) => setPromoteForm({ ...promoteForm, gateJson: e.target.value })} />
            </Field>
          </>
        )}

        {!done && request.kind === "rollback" && (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, ...MUTED }}>
              현재 활성 버전({skill.activeVersion ?? "-"})을 내리고 직전 활성 버전을 다시 활성으로 올립니다.
            </p>
            <Field label="되돌리는 사유">
              <input data-testid="skill-rollback-reason" style={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </Field>
          </>
        )}

        {!done && request.kind === "disable" && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--warning)" }}>
            이 스킬을 비활성으로 바꾸면 더 이상 실행할 수 없습니다. 버전과 실행 기록은 지워지지 않습니다. 이 화면에서는 다시 켤 수 없으니 신중히 진행해 주세요.
          </p>
        )}

        {error && (
          <div role="alert" data-testid="skill-dialog-error" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--danger)", overflowWrap: "anywhere" }}>{error}</div>
        )}

        {outcome && (
          <div role="status" data-testid="skill-dialog-result" style={{ fontSize: 13, lineHeight: 1.5, color: outcome.tone === "ok" ? "var(--success)" : "var(--warning)", overflowWrap: "anywhere" }}>
            <div style={{ fontWeight: 700 }}>{outcome.text}</div>
            {outcome.run && (
              <div style={{ marginTop: 6, color: "var(--text-primary)" }}>
                <div style={{ color: runStatusColor(outcome.run.status) }}>
                  상태 {runStatusLabel(outcome.run.status)} · 지연 {formatLatency(outcome.run.latencyMs)}
                </div>
                {outcome.run.error && <div style={{ color: "var(--danger)" }}>오류: {outcome.run.error}</div>}
                {outcome.run.outputText && (
                  <pre data-testid="skill-run-output" style={{ margin: "6px 0 0", padding: 10, borderRadius: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 220, overflow: "auto" }}>
                    {outcome.run.outputText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button ref={closeRef} type="button" data-testid="skill-dialog-cancel" disabled={busy} onClick={onClose} style={{ ...BUTTON_PLAIN, flex: "1 1 120px", opacity: busy ? 0.55 : 1 }}>
            {done ? "닫기" : "취소"}
          </button>
          {!done && (
            <button
              type="button"
              data-testid="skill-dialog-submit"
              disabled={busy}
              onClick={() => void submit()}
              style={{ ...(request.kind === "disable" ? BUTTON_DANGER : BUTTON_PRIMARY), flex: "1 1 120px", opacity: busy ? 0.55 : 1 }}
            >
              {busy ? "처리 중..." : error ? `다시 ${SUBMIT[request.kind]}` : SUBMIT[request.kind]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
