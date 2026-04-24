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
  return parsed.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EmergencyPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getEmergencyStatus();
      setData(res);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action: string) => {
    if (!actionReason.trim() && action !== "status") {
      alert("사유를 입력하세요.");
      return;
    }
    setActing(true);
    try {
      await api.postEmergencyAction(action, actionReason);
      setActionReason("");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "액션 실패");
    } finally {
      setActing(false);
    }
  };

  const govEnabled = data?.governance_enabled ?? true;
  const actions = data?.recent_actions || [];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Emergency Kill-Switch" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>🚨 Emergency Kill-Switch</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                거버넌스 기능 전체를 즉시 비활성화/활성화할 수 있습니다. (Q17)
              </div>
            </div>
            <button onClick={() => load()} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              새로고침
            </button>
          </div>

          {error && <div style={{ ...cardStyle, color: "var(--danger)" }}>{error}</div>}
          {loading && <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>로딩 중...</div>}

          {data && !loading && (
            <>
              {/* Current Status */}
              <div style={{ ...cardStyle, borderLeft: `4px solid ${govEnabled ? "#22c55e" : "#ef4444"}` }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>현재 거버넌스 상태</div>
                    <div style={{ color: govEnabled ? "#22c55e" : "#ef4444", fontSize: "28px", fontWeight: 700, marginTop: "4px" }}>
                      {govEnabled ? "✅ 활성 (정상)" : "❌ 비활성 (Kill-Switch ON)"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ padding: "4px 12px", borderRadius: "999px", background: govEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: govEnabled ? "#4ade80" : "#f87171", fontSize: "13px", fontWeight: 700 }}>
                      {govEnabled ? "ACTIVE" : "KILLED"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Panel */}
              <div style={cardStyle}>
                <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>긴급 조치</div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ color: "var(--text-secondary)", fontSize: "12px", display: "block", marginBottom: "4px" }}>사유 (필수)</label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="긴급 조치 사유를 입력하세요..."
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "14px" }}
                  />
                </div>
                <div className="flex gap-3 flex-wrap">
                  {govEnabled ? (
                    <button
                      onClick={() => handleAction("kill")}
                      disabled={acting}
                      style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#ef4444", color: "#fff", cursor: acting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "14px" }}
                    >
                      {acting ? "처리 중..." : "🛑 거버넌스 비활성화 (Kill)"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction("restore")}
                      disabled={acting}
                      style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#22c55e", color: "#fff", cursor: acting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "14px" }}
                    >
                      {acting ? "처리 중..." : "✅ 거버넌스 복원 (Restore)"}
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Actions */}
              {actions.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>최근 긴급 조치 이력</div>
                  <div className="grid gap-2">
                    {actions.map((a: any, i: number) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", background: "rgba(15,23,42,0.28)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ color: a.action_type === "kill" ? "#f87171" : "#4ade80", fontWeight: 600, fontSize: "13px" }}>{a.action_type}</span>
                          <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{formatDateTime(a.created_at)}</span>
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>{a.reason || "-"}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "2px" }}>by {a.triggered_by || "system"} · {a.status || "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
