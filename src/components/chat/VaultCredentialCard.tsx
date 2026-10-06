"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, type VaultCredentialRequestStatus } from "@/lib/api";

export interface VaultCredentialCardData {
  /** 승인 카드(agent_permission_requests) id */
  id: string;
  /** 보안 입력 요청 id — submit/cancel/GET 은 이 id 로 호출한다 */
  requestId: string;
  host: string;
  loginUrl: string;
  sourceMessageId?: string | null;
}

type Phase = "pending" | "submitting" | VaultCredentialRequestStatus;

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MS = 120_000;

const FIELD_STYLE: React.CSSProperties = {
  width: "100%", minHeight: 48, padding: "10px 12px", borderRadius: 9, boxSizing: "border-box",
  fontSize: 16, border: "1px solid var(--ct-border)", background: "var(--ct-bg)", color: "var(--ct-text)",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "var(--ct-text2)", marginBottom: 4,
};

function submitErrorMessage(status: number, code: string, retryAfter?: number): string {
  if (status === 409) return "이미 처리된 요청입니다.";
  if (status === 410) return "입력 요청이 만료되었습니다. AI 에게 로그인을 다시 요청해 주세요.";
  if (status === 403) return "이 요청을 처리할 권한이 없습니다.";
  if (status === 404) {
    return code === "secure_input_disabled"
      ? "보안 입력 기능이 꺼져 있습니다."
      : "입력 요청을 찾을 수 없습니다.";
  }
  if (status === 422) return "아이디와 비밀번호를 확인해 주세요.";
  if (status === 429) return `시도가 너무 많습니다. ${retryAfter ?? 60}초 뒤에 다시 시도해 주세요.`;
  if (status === 503) return "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 0) return "네트워크 오류입니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  if (status === 401) return "로그인 세션이 만료되었습니다.";
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

const PHASE_TERMINAL: ReadonlySet<Phase> = new Set(["verified", "expired", "cancelled"]);

export default function VaultCredentialCard({
  card, onDismiss,
}: {
  card: VaultCredentialCardData;
  onDismiss?: (id: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retryForm, setRetryForm] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const applyStatus = useCallback((status: string) => {
    if (!aliveRef.current) return;
    if (status === "pending" || status === "submitted" || status === "verified"
      || status === "failed" || status === "expired" || status === "cancelled") {
      setPhase((prev) => (prev === "submitting" && status === "pending" ? prev : status));
    }
  }, []);

  // 화면을 다시 그린 시점의 실제 상태를 한 번 맞춘다(다른 기기에서 처리됐을 수 있다).
  useEffect(() => {
    let cancelled = false;
    void api.getVaultCredentialRequest(card.requestId).then((r) => {
      if (cancelled) return;
      if (r.ok) applyStatus(r.data.request.status);
      else if (r.status === 410) applyStatus("expired");
    });
    return () => { cancelled = true; };
  }, [card.requestId, applyStatus]);

  // submitted → verified/failed 는 에이전트 브라우저가 로그인해 보는 동안 서버가 바꾼다.
  useEffect(() => {
    if (phase !== "submitted") return;
    let stopped = false;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (stopped) return;
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        window.clearInterval(timer);
        setPollTimedOut(true);
        return;
      }
      void api.getVaultCredentialRequest(card.requestId).then((r) => {
        if (stopped || !r.ok) return;
        if (r.data.request.status !== "submitted") applyStatus(r.data.request.status);
      });
    }, POLL_INTERVAL_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [phase, pollRound, card.requestId, applyStatus]);

  const refreshOnce = useCallback(async () => {
    const r = await api.getVaultCredentialRequest(card.requestId);
    if (!aliveRef.current) return;
    if (r.ok) {
      if (r.data.request.status === "submitted") { setPollTimedOut(false); setPollRound((n) => n + 1); }
      else applyStatus(r.data.request.status);
    } else {
      setNotice(submitErrorMessage(r.status, r.code, r.retryAfter));
    }
  }, [card.requestId, applyStatus]);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== "pending" && !(phase === "failed" && retryForm)) return;
    const u = username.trim();
    const p = password;
    if (!u || !p) { setNotice("아이디와 비밀번호를 모두 입력해 주세요."); return; }
    // 값은 지역 상수로만 들고 있고 state 는 호출 전에 비운다.
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setNotice("");
    setPollTimedOut(false);
    setPhase("submitting");
    const r = await api.submitVaultCredentialRequest(card.requestId, { username: u, password: p });
    if (!aliveRef.current) return;
    if (r.ok) {
      setRetryForm(false);
      setPhase("submitted");
      return;
    }
    setNotice(r.status === 409 && r.requestStatus === "failed"
      ? "이 요청은 이미 종료되었습니다. AI 에게 로그인을 다시 요청하면 새 입력 카드가 만들어집니다."
      : submitErrorMessage(r.status, r.code, r.retryAfter));
    if (r.status === 410) { setPhase("expired"); return; }
    if (r.status === 409) {
      const st = r.requestStatus;
      if (st === "submitted" || st === "verified" || st === "failed" || st === "cancelled" || st === "expired") {
        setRetryForm(false);
        setPhase(st);
      } else {
        setPhase("pending");
      }
      return;
    }
    setUsername(u);
    setPhase(retryForm ? "failed" : "pending");
  }, [phase, retryForm, username, password, card.requestId]);

  const onCancel = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    setNotice("");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    const r = await api.cancelVaultCredentialRequest(card.requestId);
    if (!aliveRef.current) return;
    setCancelling(false);
    if (r.ok) { setPhase("cancelled"); return; }
    if (r.status === 410) { setPhase("expired"); return; }
    if (r.status === 409 && r.requestStatus) { applyStatus(r.requestStatus); }
    setNotice(submitErrorMessage(r.status, r.code, r.retryAfter));
  }, [cancelling, card.requestId, applyStatus]);

  const title = `로그인 정보 입력 — ${card.host || "(알 수 없는 사이트)"}`;
  const formOpen = phase === "pending" || phase === "submitting" || (phase === "failed" && retryForm);
  const submitting = phase === "submitting";

  const statusLine = (() => {
    switch (phase) {
      case "submitted":
        return pollTimedOut
          ? { color: "#eab308", text: "⏳ 로그인 확인이 지연되고 있습니다. 잠시 뒤 상태를 다시 확인해 주세요." }
          : { color: "#38bdf8", text: "⏳ 저장했습니다. 로그인 확인 중…" };
      case "verified":
        return { color: "#16a34a", text: "✅ 저장·로그인 확인 완료" };
      case "failed":
        return retryForm ? null : { color: "#f87171", text: "❌ 로그인 실패 — 아이디·비밀번호를 확인해 주세요." };
      case "expired":
        return { color: "var(--ct-text2)", text: "⌛ 만료된 요청입니다. AI 에게 로그인을 다시 요청해 주세요." };
      case "cancelled":
        return { color: "var(--ct-text2)", text: "입력 요청을 취소했습니다." };
      default:
        return null;
    }
  })();

  return (
    <div
      data-vault-credential-card={card.requestId}
      data-approval-id={card.id}
      tabIndex={-1}
      style={{
        margin: "10px 0", padding: "12px 14px", borderRadius: 10, boxSizing: "border-box",
        background: "rgba(56,189,248,.07)", border: "1px solid rgba(56,189,248,.38)",
        borderLeft: "4px solid #38bdf8", scrollMarginTop: 96, maxWidth: "100%",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ct-text)", wordBreak: "break-word" }}>
        🔐 {title}
      </div>
      {card.loginUrl && (
        <div style={{ fontSize: 12, color: "var(--ct-text2)", marginTop: 4, wordBreak: "break-all", lineHeight: 1.5 }}>
          로그인 URL: {card.loginUrl}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--ct-text2)", marginTop: 4, lineHeight: 1.55 }}>
        입력값은 Agent Vault 에 암호화 저장되며 AI·채팅 기록에 남지 않습니다
      </div>

      {formOpen && (
        <form onSubmit={(e) => void onSubmit(e)} autoComplete="on" style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor={`vault-user-${card.id}`} style={LABEL_STYLE}>아이디</label>
            <input
              id={`vault-user-${card.id}`}
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              style={FIELD_STYLE}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor={`vault-pass-${card.id}`} style={LABEL_STYLE}>비밀번호</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id={`vault-pass-${card.id}`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                style={{ ...FIELD_STYLE, flex: "1 1 auto", minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                disabled={submitting}
                style={{
                  flex: "0 0 auto", minWidth: 64, minHeight: 48, padding: "0 12px", borderRadius: 9,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text2)",
                }}
              >{showPassword ? "숨기기" : "보기"}</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              style={{
                flex: "1 1 160px", minHeight: 48, padding: "10px 18px", borderRadius: 9,
                fontSize: 14, fontWeight: 700, border: "none", background: "#16a34a", color: "#fff",
                cursor: submitting || !username.trim() || !password ? "default" : "pointer",
                opacity: submitting || !username.trim() || !password ? .55 : 1,
              }}
            >{submitting ? "저장 중…" : "저장하고 로그인"}</button>
            <button
              type="button"
              onClick={() => {
                if (phase === "failed") { setRetryForm(false); setNotice(""); setUsername(""); setPassword(""); return; }
                void onCancel();
              }}
              disabled={submitting || cancelling}
              style={{
                flex: "1 1 100px", minHeight: 48, padding: "10px 18px", borderRadius: 9,
                fontSize: 14, fontWeight: 600, cursor: submitting || cancelling ? "default" : "pointer",
                border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text2)",
                opacity: submitting || cancelling ? .55 : 1,
              }}
            >{cancelling ? "취소 중…" : "취소"}</button>
          </div>
        </form>
      )}

      {statusLine && (
        <div role="status" style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: statusLine.color, lineHeight: 1.55, wordBreak: "break-word" }}>
          {statusLine.text}
        </div>
      )}

      {!formOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {phase === "failed" && (
            <button
              type="button"
              onClick={() => { setRetryForm(true); setNotice(""); }}
              style={{
                flex: "1 1 160px", minHeight: 48, padding: "10px 18px", borderRadius: 9,
                fontSize: 14, fontWeight: 700, border: "none", background: "#38bdf8", color: "#04293a", cursor: "pointer",
              }}
            >다시 입력</button>
          )}
          {phase === "submitted" && pollTimedOut && (
            <button
              type="button"
              onClick={() => void refreshOnce()}
              style={{
                flex: "1 1 160px", minHeight: 48, padding: "10px 18px", borderRadius: 9,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                border: "1px solid #38bdf8", background: "transparent", color: "#38bdf8",
              }}
            >상태 다시 확인</button>
          )}
          {(PHASE_TERMINAL.has(phase) || phase === "failed") && onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(card.id)}
              style={{
                flex: "1 1 100px", minHeight: 48, padding: "10px 18px", borderRadius: 9,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--ct-border)", background: "transparent", color: "var(--ct-text2)",
              }}
            >닫기</button>
          )}
        </div>
      )}

      {notice && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "#f87171", lineHeight: 1.55, wordBreak: "break-word" }}>
          {notice}
        </div>
      )}
    </div>
  );
}
