/**
 * AADS-188D: diff_preview 수신 시 슬라이드인 패널 — CodeDiffViewer + 승인 API 연동
 */
"use client";

import { useCallback } from "react";
import { CodeDiffViewer } from "./CodeDiffViewer";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aads_token");
}

export interface DiffPreviewPayload {
  type: "diff_preview";
  file_path: string;
  tool_use_id: string;
  original_content?: string;
  modified_content?: string;
}

export interface CodePanelProps {
  visible: boolean;
  payload: DiffPreviewPayload | null;
  sessionId: string | null;
  projectName?: string;
  theme?: "dark" | "light";
  countdown?: number | null;
  onClose: () => void;
  onResult?: (action: "approve" | "reject", message?: string) => void;
}

export function CodePanel({
  visible,
  payload,
  sessionId,
  projectName = "AADS",
  theme = "dark",
  countdown = null,
  onClose,
  onResult,
}: CodePanelProps) {
  const handleAccept = useCallback(async () => {
    if (!payload || !sessionId) return;
    const token = getToken();
    try {
      const res = await fetch(`${BASE_URL}/chat/approve-diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          tool_use_id: payload.tool_use_id,
          action: "approve",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onResult?.("approve", "승인되었습니다.");
      onClose();
    } catch (e) {
      onResult?.("approve", `승인 API 실패: ${(e as Error).message}`);
    }
  }, [payload, sessionId, onClose, onResult]);

  const handleReject = useCallback(async () => {
    if (!payload || !sessionId) return;
    const token = getToken();
    try {
      const res = await fetch(`${BASE_URL}/chat/approve-diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          tool_use_id: payload.tool_use_id,
          action: "reject",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onResult?.("reject", "거부되었습니다.");
      onClose();
    } catch (e) {
      onResult?.("reject", `거부 API 실패: ${(e as Error).message}`);
    }
  }, [payload, sessionId, onClose, onResult]);

  if (!visible) return null;

  const filename = payload?.file_path?.split("/").pop() || "file.txt";
  const original = payload?.original_content ?? "";
  const modified = payload?.modified_content ?? "";

  return (
    <div className="code-panel" data-theme={theme}>
      <div className="code-panel-header">
        <span className="code-panel-title">코드 수정 검토</span>
        <span className="code-panel-project">{projectName}</span>
        {countdown !== null && countdown > 0 && (
          <span
            style={{
              marginLeft: "auto",
              marginRight: "8px",
              fontSize: "12px",
              fontWeight: 700,
              color: countdown <= 30 ? "#ef4444" : "var(--ct-accent)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
          </span>
        )}
        <button type="button" className="code-panel-close" onClick={onClose} aria-label="닫기"
          style={countdown !== null ? undefined : { marginLeft: "auto" }}
        >
          ×
        </button>
      </div>
      <div className="code-panel-body">
        {payload ? (
          <CodeDiffViewer
            original={original}
            modified={modified}
            filename={filename}
            toolUseId={payload.tool_use_id}
            sessionId={sessionId!}
            theme={theme}
            onAccept={handleAccept}
            onReject={handleReject}
            readOnly
          />
        ) : (
          <div className="code-panel-empty">diff_preview 대기 중...</div>
        )}
      </div>
    </div>
  );
}
