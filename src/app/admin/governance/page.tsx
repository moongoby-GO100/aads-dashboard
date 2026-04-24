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

export default function GovernancePage() {
  const [data, setData] = useState<any>(null);
  const [layers, setLayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gov, ly] = await Promise.all([api.getGovernance(), api.getGovernanceLayers()]);
      setData(gov);
      setLayers(Array.isArray(ly) ? ly : ly?.layers || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Governance v2.1" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>Governance Dashboard</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                모델 거버넌스 정책, kill-switch, 감사 로그를 관리합니다.
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
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["거버넌스 상태", data.governance_enabled ? "✅ 활성" : "❌ 비활성", data.governance_enabled ? "#22c55e" : "#ef4444"],
                  ["DB Primary", data.db_primary ? "✅ DB" : "⚡ Legacy", data.db_primary ? "#3b82f6" : "#f59e0b"],
                  ["정책 수", data.policy_count ?? data.policies?.length ?? "-", "#60a5fa"],
                  ["감사 로그", data.audit_count ?? "-", "#a78bfa"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} style={{ ...cardStyle, padding: "14px" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>{label}</div>
                    <div style={{ color: String(color), fontWeight: 700, fontSize: "22px" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Layers */}
              {layers.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>거버넌스 레이어</div>
                  <div className="grid gap-3">
                    {layers.map((layer: any, i: number) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", background: "rgba(15,23,42,0.28)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "14px" }}>{layer.name || layer.layer || `Layer ${i + 1}`}</div>
                          <span style={{ padding: "3px 8px", borderRadius: "999px", background: layer.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)", color: layer.status === "active" ? "#4ade80" : "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
                            {layer.status || "unknown"}
                          </span>
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "6px" }}>{layer.description || ""}</div>
                        {layer.components && (
                          <div className="flex gap-2 flex-wrap" style={{ marginTop: "8px" }}>
                            {(Array.isArray(layer.components) ? layer.components : []).map((c: string, j: number) => (
                              <span key={j} style={{ padding: "2px 8px", borderRadius: "6px", background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: "11px" }}>{c}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roles */}
              {data.roles && data.roles.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>역할 프로필</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "8px", textAlign: "left", color: "var(--text-secondary)" }}>역할</th>
                          <th style={{ padding: "8px", textAlign: "left", color: "var(--text-secondary)" }}>프로젝트</th>
                          <th style={{ padding: "8px", textAlign: "left", color: "var(--text-secondary)" }}>모델</th>
                          <th style={{ padding: "8px", textAlign: "left", color: "var(--text-secondary)" }}>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.roles.map((role: any, i: number) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px", color: "var(--text-primary)" }}>{role.role || role.name || "-"}</td>
                            <td style={{ padding: "8px", color: "var(--text-secondary)" }}>{role.project_scope || role.project || "-"}</td>
                            <td style={{ padding: "8px", color: "#60a5fa" }}>{role.default_model || "-"}</td>
                            <td style={{ padding: "8px" }}>
                              <span style={{ color: role.is_active !== false ? "#4ade80" : "#94a3b8" }}>{role.is_active !== false ? "활성" : "비활성"}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Evolution Stats */}
              {data.evolution && (
                <div style={cardStyle}>
                  <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>진화 통계</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(data.evolution).map(([key, val]) => (
                      <div key={key} style={{ padding: "10px", borderRadius: "8px", background: "rgba(15,23,42,0.28)", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{key}</div>
                        <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "16px", marginTop: "4px" }}>{String(val)}</div>
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
