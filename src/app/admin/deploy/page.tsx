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

function statusColor(status: string): string {
  if (status === "ok" || status === "done") return "#22c55e";
  if (status === "error" || status === "failed") return "#ef4444";
  if (status === "deploying" || status === "running") return "#3b82f6";
  return "#94a3b8";
}

export default function DeployStatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDeployStatus();
      setData(res);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "배포 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const servers = data?.servers || data?.groups || [];
  const summary = data?.summary || {};

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Deploy Status" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>배포 현황</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                각 프로젝트/서버의 최근 배포 상태를 확인합니다.
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
              {/* Summary */}
              {summary && Object.keys(summary).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(summary).map(([key, val]) => (
                    <div key={key} style={{ ...cardStyle, padding: "14px" }}>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>{key}</div>
                      <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "22px" }}>{String(val)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Server Groups */}
              <div className="grid gap-4">
                {servers.map((server: any, i: number) => (
                  <div key={i} style={{ ...cardStyle, borderLeft: `4px solid ${statusColor(server.status || "unknown")}` }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: "12px" }}>
                      <div>
                        <div style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 700 }}>
                          {server.name || server.id || `Server ${i + 1}`}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>
                          {server.ip || ""} · {(server.projects || []).join(", ")}
                        </div>
                      </div>
                      <span style={{ padding: "4px 12px", borderRadius: "999px", background: `${statusColor(server.status || "unknown")}22`, color: statusColor(server.status || "unknown"), fontSize: "12px", fontWeight: 700 }}>
                        {server.status || "unknown"}
                      </span>
                    </div>

                    {server.recent_deploys && server.recent_deploys.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                              <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>Job</th>
                              <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>프로젝트</th>
                              <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>상태</th>
                              <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>커밋</th>
                              <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>시각</th>
                            </tr>
                          </thead>
                          <tbody>
                            {server.recent_deploys.map((deploy: any, j: number) => (
                              <tr key={j} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "6px 8px", color: "var(--accent)", fontSize: "12px" }}>{deploy.job_id || "-"}</td>
                                <td style={{ padding: "6px 8px", color: "var(--text-primary)" }}>{deploy.project || "-"}</td>
                                <td style={{ padding: "6px 8px" }}>
                                  <span style={{ color: statusColor(deploy.status || "unknown") }}>{deploy.status || "-"}</span>
                                </td>
                                <td style={{ padding: "6px 8px", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "11px" }}>{deploy.commit || "-"}</td>
                                <td style={{ padding: "6px 8px", color: "var(--text-secondary)", fontSize: "12px" }}>{formatDateTime(deploy.updated_at || deploy.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
