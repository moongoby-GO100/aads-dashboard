"use client";
import { useEffect, useState } from "react";
import { listSessions, type BramingSession } from "../api";

interface Props {
  activeSessionId: string | null;
  onSelect: (session: BramingSession) => void;
  onNewSession: () => void;
  refreshKey: number;
}

export default function SessionSidebar({ activeSessionId, onSelect, onNewSession, refreshKey }: Props) {
  const [sessions, setSessions] = useState<BramingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listSessions(30)
      .then((r) => setSessions(r.items || r.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div style={{ width: "240px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-sidebar, #111827)", flexShrink: 0 }}>
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={onNewSession}
          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
        >
          + 새 세션
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        {loading && <div style={{ color: "var(--text-secondary)", fontSize: "13px", padding: "16px", textAlign: "center" }}>로딩 중...</div>}
        {!loading && sessions.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: "13px", padding: "16px", textAlign: "center" }}>세션이 없습니다</div>}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: "8px", border: "none",
              background: activeSessionId === s.id ? "rgba(99,102,241,0.15)" : "transparent",
              textAlign: "left", cursor: "pointer", marginBottom: "2px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 600, color: activeSessionId === s.id ? "var(--accent)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.title || s.topic}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px", display: "flex", justifyContent: "space-between" }}>
              <span>{s.status === "active" ? "🟢" : "⬜"} {s.status}</span>
              <span>{new Date(s.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
