"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const cardStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "16px",
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getChatSessions();
      const list = Array.isArray(res) ? res : res?.sessions || [];
      setSessions(list.slice(0, 50));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "세션 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (sessionId: string) => {
    try {
      const [session, messages] = await Promise.all([
        api.getChatSession(sessionId),
        api.getChatMessages(sessionId, 100),
      ]);
      setSelected({ ...session, messages: Array.isArray(messages) ? messages : messages?.messages || [] });
    } catch (err) {
      console.error("session detail load failed", err);
    }
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Session Replay" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>세션 리플레이</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                에이전트 작업 세션의 메시지·도구 호출 타임라인을 확인합니다.
              </div>
            </div>
            <button onClick={() => { load(); setSelected(null); }} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              새로고침
            </button>
          </div>

          {error && <div style={{ ...cardStyle, color: "var(--danger)" }}>{error}</div>}
          {loading && <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>로딩 중...</div>}

          {!loading && !selected && (
            <div style={cardStyle}>
              <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>최근 세션 ({sessions.length}건)</div>
              <div className="grid gap-2">
                {sessions.length === 0 && <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: "24px" }}>세션이 없습니다.</div>}
                {sessions.map((s: any) => (
                  <button
                    key={s.session_id || s.id}
                    type="button"
                    onClick={() => loadDetail(s.session_id || s.id)}
                    style={{ background: "rgba(15,23,42,0.28)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", textAlign: "left", cursor: "pointer", width: "100%" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 700 }}>{s.session_id || s.id}</div>
                      <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{formatDateTime(s.updated_at || s.created_at)}</span>
                    </div>
                    <div style={{ color: "var(--text-primary)", fontSize: "13px", marginTop: "6px" }}>{s.title || s.workspace_id || "(제목 없음)"}</div>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "8px" }}>
                      {s.current_model && <span style={{ padding: "2px 8px", borderRadius: "6px", background: "rgba(59,130,246,0.12)", color: "#93c5fd", fontSize: "11px" }}>{s.current_model}</span>}
                      {s.message_count != null && <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{s.message_count}건</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <div className="grid gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }}>← 목록</button>
                <div>
                  <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 700 }}>{selected.session_id || selected.id}</div>
                  <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700 }}>{selected.title || "(제목 없음)"}</div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>메시지 타임라인 ({selected.messages?.length || 0}건)</div>
                <div className="grid gap-3">
                  {(selected.messages || []).map((msg: any, i: number) => (
                    <div key={msg.id || i} style={{ borderLeft: `3px solid ${msg.role === "user" ? "#3b82f6" : msg.role === "assistant" ? "#22c55e" : "#64748b"}`, paddingLeft: "12px", paddingBottom: "8px" }}>
                      <div className="flex items-center gap-2" style={{ marginBottom: "4px" }}>
                        <span style={{ color: msg.role === "user" ? "#60a5fa" : msg.role === "assistant" ? "#4ade80" : "#94a3b8", fontSize: "12px", fontWeight: 700 }}>
                          {msg.role || "system"}
                        </span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{formatDateTime(msg.created_at)}</span>
                        {msg.model && <span style={{ padding: "1px 6px", borderRadius: "4px", background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: "10px" }}>{msg.model}</span>}
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "200px", overflow: "auto" }}>
                        {typeof msg.content === "string" ? msg.content.slice(0, 2000) : JSON.stringify(msg.content).slice(0, 2000)}
                      </div>
                      {msg.tool_calls && (
                        <div style={{ marginTop: "6px", padding: "6px 8px", borderRadius: "6px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", fontSize: "11px", color: "#c4b5fd" }}>
                          🔧 {Array.isArray(msg.tool_calls) ? msg.tool_calls.map((t: any) => t.name || t.function?.name).join(", ") : "tool call"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
