"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerHealth {
  server_id: string | number;
  ip: string;
  role: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  disk_pct?: number;
  load?: number;
  memory_pct?: number;
  claude_sessions?: number;
  services?: Record<string, boolean>;
  checked_at?: string;
  error?: string;
}

interface WatchLayer {
  name: string;
  label: string;
  active: boolean;
  last_run?: string;
  detail?: string;
}

interface CrossCheckEdge {
  from: string;
  to: string;
  last_check?: string;
  ok?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKST(dtStr: string | null | undefined): string {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr.slice(0, 16);
    const kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const m = kst.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
    if (m) {
      const [, y, mo, day, h, min] = m;
      return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")} ${h.padStart(2, "0")}:${min}`;
    }
    return dtStr.slice(0, 16);
  } catch {
    return dtStr.slice(0, 16);
  }
}

function statusIcon(s: string): string {
  switch (s) {
    case "healthy": return "🟢";
    case "warning": return "🟡";
    case "critical": return "🔴";
    default: return "⚪";
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "healthy": return "var(--success)";
    case "warning": return "var(--warning)";
    case "critical": return "var(--danger)";
    default: return "var(--text-secondary)";
  }
}

// ─── 서버 헬스 조회 ───────────────────────────────────────────────────────────

async function fetchServerHealth(
  serverId: string,
  ip: string,
  role: string
): Promise<ServerHealth> {
  const url = serverId === "68"
    ? "/api/v1/ops/health-check"
    : `http://${ip}:9090/health`;

  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") || "" : "";
    const headers: Record<string, string> = serverId === "68"
      ? { Authorization: `Bearer ${token}` }
      : {};

    const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    // 서버 68: aads ops health-check 응답 파싱
    if (serverId === "68") {
      return {
        server_id: serverId,
        ip,
        role,
        status: data.pipeline_healthy ? "healthy" : "warning",
        checked_at: data.checked_at || new Date().toISOString(),
        services: data.checks
          ? Object.fromEntries(Object.entries(data.checks).map(([k, v]) => [k, (v as { ok: boolean }).ok]))
          : {},
      };
    }
    // 서버 211/114: health_server.py 응답 파싱
    return {
      server_id: serverId,
      ip,
      role,
      status: data.status === "ok" || data.healthy ? "healthy" : "warning",
      disk_pct: data.disk_pct,
      load: data.load_1m,
      memory_pct: data.memory_pct,
      claude_sessions: data.claude_sessions,
      services: data.services || {},
      checked_at: data.checked_at || new Date().toISOString(),
    };
  } catch (e) {
    return {
      server_id: serverId,
      ip,
      role,
      status: "critical",
      error: String(e),
      checked_at: new Date().toISOString(),
    };
  }
}

// ─── Gauge Bar ────────────────────────────────────────────────────────────────

function GaugeBar({ pct, warn = 80 }: { pct?: number; warn?: number }) {
  if (pct == null) return <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>-</span>;
  const color = pct >= warn ? "var(--danger)" : pct >= warn * 0.75 ? "var(--warning)" : "var(--success)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 8, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden", minWidth: 60 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 36 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const SERVERS = [
  { id: "211", ip: "211.188.51.113", role: "Hub (Bridge / auto_trigger / pipeline_monitor)" },
  { id: "68",  ip: "68.183.183.11",  role: "AADS Backend (FastAPI / PostgreSQL / Dashboard)" },
  { id: "114", ip: "116.120.58.155", role: "실행 서버 (SF / NTV2)" },
];

const CROSS_EDGES: CrossCheckEdge[] = [
  { from: "211", to: "68" },
  { from: "68",  to: "114" },
  { from: "114", to: "211" },
  { from: "68",  to: "211" },
  { from: "211", to: "114" },
  { from: "114", to: "68" },
];

const WATCH_LAYERS: WatchLayer[] = [
  { name: "L1", label: "L1: claude_exec 내장 타이머", active: true, detail: "30분 타임아웃, bridge 셀프체크 60초" },
  { name: "L2", label: "L2: watchdog + pipeline_monitor", active: true, detail: "watchdog 30초, pipeline_monitor 2분, bridge_monitor 60초" },
  { name: "L3", label: "L3: meta_watchdog (서버 211)", active: true, detail: "1분 주기 cron, L2 장애 감지+복구" },
  { name: "L4", label: "L4: 외부 모니터", active: false, detail: "UptimeRobot / GitHub Actions (등록 필요)" },
];

export default function ServersPage() {
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("-");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      SERVERS.map((s) => fetchServerHealth(s.id, s.ip, s.role))
    );
    setServers(results);
    setLastUpdated(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="서버 모니터" />
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>🖥️ 서버 상태 모니터</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>최근 갱신: {lastUpdated}</span>
            <button
              onClick={fetchAll}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}
            >
              새로고침
            </button>
          </div>
        </div>

        {/* ─── 섹션 1: 3서버 상태 카드 ─── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {SERVERS.map((srv) => {
              const health = servers.find((s) => String(s.server_id) === srv.id);
              const statusVal = health?.status || "unknown";
              return (
                <div
                  key={srv.id}
                  style={{
                    ...cardStyle,
                    border: `1px solid ${statusVal === "healthy" ? "rgba(34,197,94,0.4)" : statusVal === "warning" ? "rgba(234,179,8,0.4)" : statusVal === "critical" ? "var(--danger)" : "var(--border)"}`,
                  }}
                >
                  {/* 헤더 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 22 }}>{statusIcon(statusVal)}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>서버 {srv.id}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{srv.ip}</div>
                    </div>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: `${statusColor(statusVal)}22`,
                        color: statusColor(statusVal),
                      }}
                    >
                      {statusVal.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>{srv.role}</div>

                  {loading && !health ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>로딩 중...</div>
                  ) : health?.error ? (
                    <div style={{ fontSize: 12, color: "var(--danger)" }}>⚠️ {health.error}</div>
                  ) : (
                    <>
                      {/* 리소스 */}
                      {(health?.disk_pct != null || health?.memory_pct != null || health?.load != null) && (
                        <div style={{ marginBottom: 12 }}>
                          {health.disk_pct != null && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>디스크</div>
                              <GaugeBar pct={health.disk_pct} />
                            </div>
                          )}
                          {health.memory_pct != null && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>메모리</div>
                              <GaugeBar pct={health.memory_pct} />
                            </div>
                          )}
                          {health.load != null && (
                            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              Load: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{health.load.toFixed(2)}</span>
                            </div>
                          )}
                          {health.claude_sessions != null && (
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                              Claude 세션: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{health.claude_sessions}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 서비스 상태 */}
                      {health?.services && Object.keys(health.services).length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>서비스 상태</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {Object.entries(health.services).map(([svc, ok]) => (
                              <span
                                key={svc}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                  background: ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                                  border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "var(--danger)"}`,
                                  borderRadius: 12, padding: "2px 7px", fontSize: 10,
                                  color: ok ? "var(--success)" : "var(--danger)",
                                }}
                              >
                                {ok ? "✅" : "❌"} {svc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {health?.checked_at && (
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 10 }}>
                          마지막 체크: {toKST(health.checked_at)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── 섹션 2: 감시 토폴로지 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>🔺 서버 상호 감시 토폴로지 (2분 주기)</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, flexWrap: "wrap", padding: "16px 0" }}>
            {/* 삼각형 토폴로지 SVG */}
            <svg viewBox="0 0 300 220" style={{ width: "min(300px, 100%)", height: "auto" }}>
              {/* 꼭짓점: 211(상단), 68(좌하), 114(우하) */}
              {/* 연결선 */}
              <line x1="150" y1="30" x2="50" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
              <line x1="150" y1="30" x2="250" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
              <line x1="50" y1="185" x2="250" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />

              {/* 화살표 (양방향) */}
              {/* 211↔68 */}
              <text x="80" y="100" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>
              {/* 211↔114 */}
              <text x="220" y="100" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>
              {/* 68↔114 */}
              <text x="150" y="200" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>

              {/* 서버 노드 */}
              {/* 211 상단 */}
              {(() => {
                const h211 = servers.find((s) => String(s.server_id) === "211");
                const c211 = statusColor(h211?.status || "unknown");
                return (
                  <g>
                    <circle cx="150" cy="30" r="22" fill="var(--bg-card)" stroke={c211} strokeWidth="2" />
                    <text x="150" y="27" textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="bold">211</text>
                    <text x="150" y="40" textAnchor="middle" fontSize="7" fill={c211}>{(h211?.status || "unknown").toUpperCase()}</text>
                  </g>
                );
              })()}
              {/* 68 좌하 */}
              {(() => {
                const h68 = servers.find((s) => String(s.server_id) === "68");
                const c68 = statusColor(h68?.status || "unknown");
                return (
                  <g>
                    <circle cx="50" cy="185" r="22" fill="var(--bg-card)" stroke={c68} strokeWidth="2" />
                    <text x="50" y="182" textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="bold">68</text>
                    <text x="50" y="195" textAnchor="middle" fontSize="7" fill={c68}>{(h68?.status || "unknown").toUpperCase()}</text>
                  </g>
                );
              })()}
              {/* 114 우하 */}
              {(() => {
                const h114 = servers.find((s) => String(s.server_id) === "114");
                const c114 = statusColor(h114?.status || "unknown");
                return (
                  <g>
                    <circle cx="250" cy="185" r="22" fill="var(--bg-card)" stroke={c114} strokeWidth="2" />
                    <text x="250" y="182" textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="bold">114</text>
                    <text x="250" y="195" textAnchor="middle" fontSize="7" fill={c114}>{(h114?.status || "unknown").toUpperCase()}</text>
                  </g>
                );
              })()}
            </svg>

            {/* 범례 */}
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>감시 방향</div>
              {CROSS_EDGES.map((e, i) => (
                <div key={i} style={{ color: "var(--text-secondary)" }}>
                  서버 {e.from} → 서버 {e.to}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 섹션 3: 4계층 감시 현황 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>🛡️ 4계층 자기치유 감시 현황</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {WATCH_LAYERS.map((layer) => (
              <div
                key={layer.name}
                style={{
                  background: "var(--bg-hover)",
                  border: `1px solid ${layer.active ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{layer.active ? "🟢" : "🔴"}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{layer.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{layer.detail}</div>
                <div style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: layer.active ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                  color: layer.active ? "var(--success)" : "var(--danger)",
                }}>
                  {layer.active ? "ACTIVE" : "INACTIVE"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
