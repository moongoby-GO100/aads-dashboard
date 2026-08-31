"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface CodexUsageLimit {
  limit_id: string;
  plan_type?: string;
  primary?: { used_percent?: number; window_minutes?: number; resets_at_iso?: string; resets_in_sec?: number };
  secondary?: { used_percent?: number; window_minutes?: number; resets_at_iso?: string; resets_in_sec?: number };
}

interface CodexUsage {
  ok?: boolean;
  plan_type?: string;
  limits?: CodexUsageLimit[];
  fetched_at?: number;
  cached?: boolean;
  age_sec?: number;
  error?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerHealth {
  server_id: string | number;
  ip: string;
  role: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  disk_pct?: number;
  disk_used?: string;
  disk_total?: string;
  disk_available?: string;
  load?: number;
  load_5m?: number;
  load_15m?: number;
  memory_pct?: number;
  memory_used_mb?: number;
  memory_total_mb?: number;
  memory_available_mb?: number;
  claude_sessions?: number;
  services?: Record<string, boolean>;
  checked_at?: string;
  source?: string;
  error?: string;
}

interface ServerConfig {
  id: string;
  ip: string;
  sshPort: number;
  role: string;
}

interface PCAgent {
  agent_id: string;
  hostname?: string;
  status?: string;
  command_types?: string[];
  capabilities?: string[];
  heartbeat_age_seconds?: number;
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

const SERVER_HEALTH_TIMEOUT_MS = 20000;

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

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function encodePowerShellCommand(command: string): string {
  const bytes = new Uint8Array(command.length * 2);
  for (let i = 0; i < command.length; i += 1) {
    const code = command.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >> 8;
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function mbLabel(value?: number): string {
  if (value == null) return "-";
  if (value >= 1024) return `${(value / 1024).toFixed(1)}GB`;
  return `${value.toFixed(0)}MB`;
}

// ─── 서버 헬스 조회 ───────────────────────────────────────────────────────────

async function fetchServerHealth(
  serverId: string,
  ip: string,
  role: string
): Promise<ServerHealth> {
  const url = `/api/v1/ops/server-health/${serverId}`;

  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") || "" : "";
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const r = await fetch(url, { headers, signal: AbortSignal.timeout(SERVER_HEALTH_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const rawStatus = String(data.status || "").toLowerCase();
    const diskPct = numberOrUndefined(data.disk_pct ?? data.disk_usage_pct);
    const memoryPct = numberOrUndefined(data.memory_pct ?? data.memory_usage_pct);
    const load1m = numberOrUndefined(data.load_1m ?? data.load);
    const status: ServerHealth["status"] =
      rawStatus === "critical" || rawStatus === "fail" || data.healthy === false ? "critical" :
      rawStatus === "warning" || (diskPct != null && diskPct >= 80) || (memoryPct != null && memoryPct >= 80) ? "warning" :
      rawStatus === "ok" || rawStatus === "healthy" || data.healthy === true ? "healthy" :
      "unknown";

    return {
      server_id: serverId,
      ip,
      role,
      status,
      disk_pct: diskPct,
      disk_used: data.disk_used,
      disk_total: data.disk_total,
      disk_available: data.disk_available,
      load: load1m,
      load_5m: numberOrUndefined(data.load_5m),
      load_15m: numberOrUndefined(data.load_15m),
      memory_pct: memoryPct,
      memory_used_mb: numberOrUndefined(data.memory_used_mb),
      memory_total_mb: numberOrUndefined(data.memory_total_mb),
      memory_available_mb: numberOrUndefined(data.memory_available_mb),
      claude_sessions: data.claude_sessions,
      services: data.services || {},
      source: data.source,
      checked_at: data.checked_at || new Date().toISOString(),
    };
  } catch (e) {
    return {
      server_id: serverId,
      ip,
      role,
      status: "unknown",
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

const SERVERS: ServerConfig[] = [
  { id: "contabo116", ip: "5.104.86.116", sshPort: 22, role: "AADS Backend (FastAPI / PostgreSQL / Dashboard)" },
  { id: "contabo14", ip: "5.104.86.14", sshPort: 22, role: "GO100 / KIS 트레이딩 (스케줄러 / 스캘핑 / WS / API)" },
  { id: "cafe24_114", ip: "114.207.244.86", sshPort: 7916, role: "SF / NTV2 / NAS (ShortFlow / NewTalk V2)" },
];

const CROSS_EDGES: CrossCheckEdge[] = [
  { from: "contabo116", to: "contabo14" },
  { from: "contabo116", to: "cafe24_114" },
  { from: "contabo14", to: "cafe24_114" },
  { from: "cafe24_114", to: "contabo116" },
];

const WATCH_LAYERS: WatchLayer[] = [
  { name: "L1", label: "L1: claude_exec 내장 타이머", active: true, detail: "30분 타임아웃, bridge 셀프체크 60초" },
  { name: "L2", label: "L2: watchdog + pipeline_monitor", active: true, detail: "watchdog 30초, pipeline_monitor 2분, bridge_monitor 60초" },
  { name: "L3", label: "L3: meta_watchdog (contabo14)", active: true, detail: "1분 주기 cron, L2 장애 감지+복구" },
  { name: "L4", label: "L4: 외부 모니터", active: false, detail: "UptimeRobot / GitHub Actions (등록 필요)" },
];

export default function ServersPage() {
  const [servers, setServers] = useState<ServerHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("-");
  const [codexUsage, setCodexUsage] = useState<CodexUsage | null>(null);
  const [pcAgents, setPcAgents] = useState<PCAgent[]>([]);
  const [psStatus, setPsStatus] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      SERVERS.map((s) => fetchServerHealth(s.id, s.ip, s.role))
    );
    setServers(results);
    // AADS-193: Codex live rate-limit
    try {
      const cu = await api.getOpsCodexUsage();
      setCodexUsage(cu as CodexUsage);
    } catch (e) {
      setCodexUsage({ ok: false, error: String(e).slice(0, 200) });
    }
    try {
      const pc = await api.getPCAgents();
      setPcAgents(Array.isArray(pc) ? pc : pc.agents || []);
    } catch {
      setPcAgents([]);
    }
    setLastUpdated(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }));
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(fetchAll);
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  };
  const healthById = (serverId: string) => servers.find((s) => String(s.server_id) === serverId);
  const powershellAgent = pcAgents.find((agent) => {
    const online = String(agent.status || "").toLowerCase() === "online";
    const supports = (agent.command_types || []).includes("powershell") || (agent.capabilities || []).includes("pc_control");
    return online && supports && String(agent.hostname || "").toLowerCase().includes("oby");
  }) || pcAgents.find((agent) => {
    const online = String(agent.status || "").toLowerCase() === "online";
    return online && ((agent.command_types || []).includes("powershell") || (agent.capabilities || []).includes("pc_control"));
  });
  const powerShellReady = Boolean(powershellAgent);

  const openPowerShell = async (srv: ServerConfig) => {
    if (!powershellAgent) return;
    setPsStatus((prev) => ({ ...prev, [srv.id]: "opening" }));
    try {
      const sshCommand = `ssh -p ${srv.sshPort} root@${srv.ip}`;
      const command = [
        `$host.UI.RawUI.WindowTitle = 'AADS SSH ${srv.id}'`,
        `Write-Host 'AADS ${srv.id} 접속: ${sshCommand}'`,
        sshCommand,
      ].join("; ");
      const encodedCommand = encodePowerShellCommand(command);
      const result = await api.routePCCommand({
        agent_id: powershellAgent.agent_id,
        command_type: "powershell",
        params: {
          command: `Start-Process powershell.exe -ArgumentList '-NoExit','-EncodedCommand','${encodedCommand}'`,
        },
        required_capabilities: ["pc_control"],
        wait_for_agent_seconds: 10,
        command_timeout_seconds: 20,
        queue_if_busy: true,
      });
      const success = typeof result === "object" && result !== null && "status" in result && result.status === "success";
      setPsStatus((prev) => ({
        ...prev,
        [srv.id]: success ? `opened:${powershellAgent.hostname || powershellAgent.agent_id}` : "failed",
      }));
    } catch (e) {
      setPsStatus((prev) => ({ ...prev, [srv.id]: `failed:${String(e).slice(0, 120)}` }));
    }
  };

  const topologyNodes = [
    { id: "contabo14", label: "contabo14", x: 150, y: 30 },
    { id: "contabo116", label: "contabo116", x: 50, y: 185 },
    { id: "cafe24_114", label: "cafe24_114", x: 250, y: 185 },
  ];

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

        {/* ─── 섹션 0: Codex Live Rate-Limit (AADS-193) ─── */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
            ⚡ Codex CLI — 실시간 사용률 {codexUsage?.cached ? "(cached)" : ""}
            {codexUsage?.plan_type && (
              <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(34,197,94,0.1)", color: "var(--success)" }}>
                {codexUsage.plan_type.toUpperCase()}
              </span>
            )}
          </h3>
          {!codexUsage && <div style={{ ...cardStyle, fontSize: 12, color: "var(--text-secondary)" }}>불러오는 중...</div>}
          {codexUsage?.error && <div style={{ ...cardStyle, fontSize: 12, color: "var(--danger)" }}>오류: {codexUsage.error}</div>}
          {codexUsage?.limits && codexUsage.limits.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {codexUsage.limits.map((lim) => {
                const fmtReset = (sec?: number) => {
                  if (sec == null || sec <= 0) return "-";
                  const h = Math.floor(sec / 3600);
                  const m = Math.floor((sec % 3600) / 60);
                  return h > 0 ? `${h}h ${m}m 후` : `${m}m 후`;
                };
                const bar = (used?: number) => {
                  const u = Math.max(0, Math.min(100, used ?? 0));
                  const color = u >= 90 ? "var(--danger)" : u >= 70 ? "var(--warning)" : "var(--success)";
                  return (
                    <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
                      <div style={{ width: `${u}%`, height: "100%", background: color, transition: "width 0.3s" }} />
                    </div>
                  );
                };
                return (
                  <div key={lim.limit_id} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{lim.limit_id}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{lim.plan_type || "-"}</span>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
                        <span>5시간 윈도우</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{lim.primary?.used_percent ?? 0}%</span>
                      </div>
                      {bar(lim.primary?.used_percent)}
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>리셋: {fmtReset(lim.primary?.resets_in_sec)}</div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
                        <span>7일 윈도우</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{lim.secondary?.used_percent ?? 0}%</span>
                      </div>
                      {bar(lim.secondary?.used_percent)}
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>리셋: {fmtReset(lim.secondary?.resets_in_sec)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>디스크</div>
                        <GaugeBar pct={health?.disk_pct} />
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                          {health?.disk_used && health?.disk_total ? `${health.disk_used} / ${health.disk_total}` : "용량 미수집"}
                          {health?.disk_available ? ` · 여유 ${health.disk_available}` : ""}
                        </div>

                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, marginBottom: 3 }}>메모리</div>
                        <GaugeBar pct={health?.memory_pct} />
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>
                          {health?.memory_used_mb && health?.memory_total_mb
                            ? `${mbLabel(health.memory_used_mb)} / ${mbLabel(health.memory_total_mb)}`
                            : "메모리 미수집"}
                          {health?.memory_available_mb ? ` · 가용 ${mbLabel(health.memory_available_mb)}` : ""}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                          {[
                            ["1m", health?.load],
                            ["5m", health?.load_5m],
                            ["15m", health?.load_15m],
                          ].map(([label, value]) => (
                            <div key={label as string} style={{ background: "var(--bg-hover)", borderRadius: 6, padding: "6px 8px" }}>
                              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Load {label}</div>
                              <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 700 }}>
                                {typeof value === "number" ? value.toFixed(2) : "-"}
                              </div>
                            </div>
                          ))}
                        </div>
                        {health?.claude_sessions != null && (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                            Claude 세션: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{health.claude_sessions}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Windows PowerShell SSH</div>
                            <div style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              ssh -p {srv.sshPort} root@{srv.ip}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openPowerShell(srv)}
                            disabled={!powerShellReady || psStatus[srv.id] === "opening"}
                            title={powerShellReady ? "CEO PC에서 PowerShell SSH 창을 엽니다" : "온라인 PC Agent가 필요합니다"}
                            style={{
                              flexShrink: 0,
                              background: powerShellReady ? "var(--accent)" : "var(--bg-hover)",
                              color: powerShellReady ? "#fff" : "var(--text-secondary)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 11,
                              cursor: powerShellReady ? "pointer" : "not-allowed",
                            }}
                          >
                            {psStatus[srv.id] === "opening" ? "여는 중" : "PowerShell"}
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: psStatus[srv.id]?.startsWith("failed") ? "var(--danger)" : "var(--text-secondary)", marginTop: 5 }}>
                          {psStatus[srv.id]?.startsWith("opened")
                            ? `열림 · ${psStatus[srv.id].replace("opened:", "")}`
                            : psStatus[srv.id]?.startsWith("failed")
                              ? psStatus[srv.id]
                              : powerShellReady
                                ? `준비 · ${powershellAgent?.hostname || powershellAgent?.agent_id}`
                                : "PC Agent 오프라인"}
                          {health?.source ? ` · ${health.source}` : ""}
                        </div>
                      </div>

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
              {/* 꼭짓점: contabo14(상단), contabo116(좌하), cafe24_114(우하) */}
              {/* 연결선 */}
              <line x1="150" y1="30" x2="50" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
              <line x1="150" y1="30" x2="250" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
              <line x1="50" y1="185" x2="250" y2="185" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />

              {/* 화살표 (양방향) */}
              {/* contabo14↔contabo116 */}
              <text x="80" y="100" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>
              {/* contabo14↔cafe24_114 */}
              <text x="220" y="100" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>
              {/* contabo116↔cafe24_114 */}
              <text x="150" y="200" fontSize="9" fill="var(--success)" textAnchor="middle">↕ 감시</text>

              {/* 서버 노드 */}
              {topologyNodes.map((node) => {
                const health = healthById(node.id);
                const color = statusColor(health?.status || "unknown");
                return (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r="26" fill="var(--bg-card)" stroke={color} strokeWidth="2" />
                    <text x={node.x} y={node.y - 3} textAnchor="middle" fontSize="8" fill="var(--text-primary)" fontWeight="bold">{node.label}</text>
                    <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="7" fill={color}>{(health?.status || "unknown").toUpperCase()}</text>
                  </g>
                );
              })}
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
