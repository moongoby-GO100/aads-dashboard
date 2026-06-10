"use client";
/**
 * SessionSummaryCard — 세션 첫 진입 시 이전 세션 요약 카드 표시
 *
 * MemoryContextBar와 동일한 /chat/sessions/{id}/memory-context API 사용.
 * session_history 배열에서 최근 3개 세션을 요약해 표시.
 * 닫기 버튼으로 dismiss 가능.
 */
import React, { useEffect, useState } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface SessionHistoryItem {
  session_id: string;
  title?: string;
  summary?: string;
  created_at?: string;
  message_count?: number;
  cost_total?: number | string;
}

interface MemoryContextResponse {
  session_history?: SessionHistoryItem[];
  context_status?: {
    session_title?: string;
    message_count?: number;
    has_summary?: boolean;
  };
}

interface SessionSummaryCardProps {
  sessionId: string;
}

export default function SessionSummaryCard({ sessionId }: SessionSummaryCardProps) {
  const [items, setItems] = useState<SessionHistoryItem[]>([]);
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || loadedSessionId === sessionId) return;
    let cancelled = false;

    fetch(`${BASE_URL}/chat/sessions/${sessionId}/memory-context`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: MemoryContextResponse | null) => {
        if (cancelled || !data) return;
        const history = data.session_history || [];
        // 현재 세션 자신을 제외한 최근 3개
        const recent = history
          .filter((h) => h.session_id !== sessionId)
          .slice(0, 3);
        setItems(recent);
        setLoadedSessionId(sessionId);
      })
      .catch(() => setLoadedSessionId(sessionId));

    return () => { cancelled = true; };
  }, [sessionId, loadedSessionId]);

  // 히스토리 없거나 dismiss 시 표시 안 함
  if (dismissedSessionId === sessionId || loadedSessionId !== sessionId || items.length === 0) return null;

  return (
    <div
      style={{
        margin: "8px 12px 4px",
        borderRadius: "10px",
        border: "1px solid rgba(108,99,255,0.35)",
        background: "rgba(108,99,255,0.07)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 12px",
          borderBottom: "1px solid rgba(108,99,255,0.2)",
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#a78bfa", display: "flex", alignItems: "center", gap: "5px" }}>
          🧠 이전 세션 요약
        </span>
        <button
          onClick={() => setDismissedSessionId(sessionId)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.4)", fontSize: "14px", lineHeight: 1,
            padding: "0 2px",
          }}
          title="닫기"
        >
          ×
        </button>
      </div>

      {/* 세션 목록 */}
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((item, idx) => (
          <div
            key={item.session_id || idx}
            style={{
              fontSize: "12px",
              padding: "6px 8px",
              borderRadius: "6px",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: item.summary ? "3px" : 0 }}>
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {item.title || "제목 없음"}
              </span>
              {item.message_count != null && (
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", flexShrink: 0, marginLeft: "6px" }}>
                  {item.message_count}턴
                </span>
              )}
            </div>
            {item.summary && (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", lineHeight: 1.4, marginTop: "2px" }}>
                {item.summary.slice(0, 120)}{item.summary.length > 120 ? "…" : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
