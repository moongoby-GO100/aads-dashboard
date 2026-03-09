/**
 * AADS-188D: diff_preview SSE 상태 + 300초 타임아웃 카운트다운 + 승인 API 연동
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TIMEOUT_SEC = 300;

export interface DiffPreviewState {
  type: "diff_preview";
  file_path: string;
  tool_use_id: string;
  original_content?: string;
  modified_content?: string;
}

export function useDiffApproval() {
  const [payload, setPayload] = useState<DiffPreviewState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "approved" | "rejected">("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiresAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    expiresAtRef.current = null;
    setCountdown(null);
  }, []);

  const onDiffPreview = useCallback((ev: DiffPreviewState) => {
    setPayload(ev);
    setStatus("pending");
    expiresAtRef.current = Date.now() + TIMEOUT_SEC * 1000;
    setCountdown(TIMEOUT_SEC);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = expiresAtRef.current ? Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000)) : 0;
      setCountdown(left);
      if (left <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setStatus("idle");
        setPayload(null);
      }
    }, 1000);
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setPayload(null);
    setStatus("idle");
  }, [clearTimer]);

  const setApproved = useCallback(() => {
    setStatus("approved");
    clearTimer();
  }, [clearTimer]);

  const setRejected = useCallback(() => {
    setStatus("rejected");
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    return () => { clearTimer(); };
  }, [clearTimer]);

  return {
    payload,
    countdown,
    status,
    onDiffPreview,
    close,
    setApproved,
    setRejected,
    isVisible: !!payload && status === "pending",
  };
}
