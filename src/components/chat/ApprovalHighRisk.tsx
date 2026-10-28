"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { HighRiskRequest } from "@/lib/approvalDecision";

const RECIPE_ACTION = "approve_work_recipe_registration";

/** 승인 카드 안에 붙는 실패 안내 — 긴 문장도 카드 폭 안에서 줄바꿈한다. */
export function ApprovalCardError({
  message, onRefresh, onDismiss,
}: {
  message?: string;
  onRefresh?: () => void;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      data-approval-error
      style={{
        marginTop: 8, padding: "8px 10px", borderRadius: 8, minWidth: 0, maxWidth: "100%",
        boxSizing: "border-box", border: "1px solid rgba(239,68,68,.45)",
        background: "rgba(239,68,68,.09)", color: "var(--ct-text, var(--text-primary, #e5e7eb))", fontSize: 12, lineHeight: 1.55,
        whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word",
        maxHeight: 132, overflowY: "auto",
      }}
    >
      <span>{message}</span>
      {(onRefresh || onDismiss) && (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {onRefresh && (
            <button type="button" onClick={onRefresh} style={errorButtonStyle}>목록 다시 조회</button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss} style={errorButtonStyle}>닫기</button>
          )}
        </span>
      )}
    </div>
  );
}

const errorButtonStyle: React.CSSProperties = {
  minHeight: 32, padding: "4px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  border: "1px solid var(--ct-border, var(--border, #3f3f46))", background: "transparent", color: "var(--ct-text, var(--text-primary, #e5e7eb))",
  cursor: "pointer",
};

/** 외부 쓰기 포함 승인 재확인 — 확인 버튼을 눌러야만 confirm_high_risk=true 호출이 나간다. */
export function HighRiskConfirmDialog({
  request, pendingCount, busy, onConfirm, onCancel,
}: {
  request: HighRiskRequest;
  pendingCount: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, [request.id]);

  if (typeof document === "undefined") return null;
  const isRecipe = request.tool === RECIPE_ACTION;
  const subject = isRecipe ? "레시피 등록" : request.tool;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busyRef.current) onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const order = [cancelRef.current, confirmRef.current].filter((el): el is HTMLButtonElement => !!el && !el.disabled);
    if (order.length === 0) { e.preventDefault(); return; }
    const first = order[0];
    const last = order[order.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !order.includes(active as HTMLButtonElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !order.includes(active as HTMLButtonElement))) {
      e.preventDefault(); first.focus();
    }
  };

  return createPortal(
    <div
      data-high-risk-backdrop
      onClick={() => { if (!busy) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-high-risk-dialog
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "86dvh", overflowY: "auto", boxSizing: "border-box",
          background: "var(--ct-bg, var(--bg-card, #1a1a1d))", color: "var(--ct-text, var(--text-primary, #e5e7eb))", borderRadius: 14,
          border: "1px solid rgba(234,179,8,.6)", borderTop: "4px solid #eab308",
          boxShadow: "0 18px 60px rgba(0,0,0,.5)", padding: "16px 16px 14px",
          overflowWrap: "anywhere",
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.4 }}>
          외부 쓰기 포함 — 다시 확인
        </h2>
        <div id={descId}>
          <p style={{ margin: "8px 0 6px", fontSize: 12.5, lineHeight: 1.6, color: "var(--ct-text2, var(--text-secondary, #9ca3af))" }}>
            이 승인은 외부 사이트·서비스에 <b>쓰기(입력·전송·변경)</b>를 하는 단계를 포함합니다.
            승인하면 아래 건이 <b>승인된 {subject}</b>로 처리되어 이후 실제 외부 변경이 일어날 수 있습니다.
            이번에 누른 이 건 하나에만 적용되며 다른 대기 건은 승인되지 않습니다.
          </p>
          <dl style={{ margin: "8px 0", fontSize: 12.5, lineHeight: 1.55 }}>
            <dt style={{ fontWeight: 700 }}>대상</dt>
            <dd style={{
              margin: "2px 0 8px", padding: "7px 9px", borderRadius: 8, maxHeight: 140, overflowY: "auto",
              background: "rgba(127,127,127,.12)", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{request.summary || "(요약 없음)"}</dd>
            <dt style={{ fontWeight: 700 }}>위험</dt>
            <dd style={{ margin: "2px 0 0" }}>외부 쓰기 포함{request.risk ? ` · 등급 ${request.risk}` : ""}</dd>
          </dl>
          {pendingCount > 1 && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ct-text2, var(--text-secondary, #9ca3af))" }}>
              확인이 필요한 건이 {pendingCount}건 있습니다. 한 건씩 확인합니다.
            </p>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: "1 1 120px", minHeight: 44, padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: "1px solid var(--ct-border, var(--border, #3f3f46))", background: "transparent", color: "var(--ct-text, var(--text-primary, #e5e7eb))",
              cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1,
            }}
          >취소 (승인 대기 유지)</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex: "1 1 160px", minHeight: 44, padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: "none", background: "#b45309", color: "#fff",
              cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1,
            }}
          >{busy ? "처리 중..." : "외부 쓰기를 확인하고 승인"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
