"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useSSE, SSEHealth, SSEPipeline, SSEDirectiveChange } from "@/hooks/useSSE";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullHealthData {
  status: string;
  checked_at: string;
  duration_ms: number;
  sections: {
    directives: Record<string, { count: number; folder_exists: boolean }>;
    pipeline: { overall: string; server_211?: Record<string, unknown>; server_68?: Record<string, unknown> };
    infra: { overall: string; issues?: Array<{ type: string; detail: string; severity?: string }> } & Record<string, unknown>;
    consistency: { overall: string; issues?: Array<{ type: string; detail: string }> } & Record<string, unknown>;
    existing_health: Record<string, unknown>;
  };
  issues: Array<{ type: string; detail: string; severity?: string }>;
  summary_kr: string;
}

interface WatchdogServerData {
  scan_ok?: boolean;
  process_counts?: Record<string, number>;
  running_slots_db?: number;
  bridge_alive?: boolean;
  auto_trigger_alive?: boolean;
}

interface CleanupAction {
  ts?: string;
  server?: string;
  type?: string;
  action?: string;
  pid?: number;
  result?: string;
}

interface WatchdogIssue {
  severity: string;
  server: string;
  type: string;
  detail: string;
}

interface WatchdogReport {
  file?: string;
  generated_at?: string;
  summary?: {
    total_issues?: number;
    critical_issues?: number;
    high_issues?: number;
    cleanup_actions?: number;
  };
  servers?: Record<string, WatchdogServerData>;
  issues?: WatchdogIssue[];
  cleanup_log?: CleanupAction[];
}

interface ProcessesResponse {
  ok: boolean;
  count: number;
  reports: WatchdogReport[];
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function ConfirmModal({ title, message, onConfirm, onCancel, loading }: ConfirmModalProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}
    >
      <div
        style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 28, minWidth: 340, maxWidth: 480, width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9", marginBottom: 12 }}>{title}</div>
        <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #475569", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "처리중..." : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Modal ─────────────────────────────────────────────────────────────

interface ResultModalProps {
  title: string;
  data: unknown;
  onClose: () => void;
}

function ResultModal({ title, data, onClose }: ResultModalProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 24, minWidth: 340, maxWidth: 560, width: "90%", maxHeight: "80vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>X</button>
        </div>
        <pre style={{ fontSize: 11, color: "#94a3b8", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "HEALTHY" ? "bg-green-500" :
    status === "DEGRADED" ? "bg-yellow-500" :
    status === "CRITICAL" ? "bg-red-500 animate-pulse" :
    "bg-gray-400";
  return <span className={`inline-block w-3 h-3 rounded-full ${color}`} />;
}

function Card({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  const borderColor =
    status === "HEALTHY" ? "border-green-700" :
    status === "DEGRADED" ? "border-yellow-700" :
    status === "CRITICAL" ? "border-red-700" :
    "border-gray-700";
  return (
    <div className={`bg-gray-800 border ${borderColor} rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <StatusDot status={status} />
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      <div className="text-xs text-gray-400 space-y-1">{children}</div>
    </div>
  );
}

// ─── Claude Bot Status Card (AADS-169) ────────────────────────────────────────

interface ClaudeBotStatusCardProps {
  processesData: ProcessesResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

function ClaudeBotStatusCard({ processesData, loading, onRefresh }: ClaudeBotStatusCardProps) {
  const [confirmModal, setConfirmModal] = useState<{
    type: "cleanup" | "bridge" | "scan";
    server?: string | null;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [resultModal, setResultModal] = useState<{ title: string; data: unknown } | null>(null);

  const latestReport = processesData?.reports?.[0] || null;
  const servers = latestReport?.servers || {};
  const allIssues: WatchdogIssue[] = latestReport?.issues || [];
  const cleanupLog: CleanupAction[] = latestReport?.cleanup_log || [];
  const summary = latestReport?.summary;

  const criticalCount = summary?.critical_issues ?? allIssues.filter((i) => i.severity === "CRITICAL").length;
  const highCount = summary?.high_issues ?? allIssues.filter((i) => i.severity === "HIGH").length;
  const totalIssues = summary?.total_issues ?? allIssues.length;

  let bannerBg = "rgba(34,197,94,0.1)";
  let bannerBorder = "rgba(34,197,94,0.4)";
  let bannerText = "#22c55e";
  let bannerMsg = "All Claude Bots Healthy";

  if (criticalCount > 0) {
    bannerBg = "rgba(239,68,68,0.1)";
    bannerBorder = "rgba(239,68,68,0.5)";
    bannerText = "#ef4444";
    bannerMsg = `CRITICAL: ${criticalCount} stalled processes`;
  } else if (highCount > 0) {
    bannerBg = "rgba(245,158,11,0.1)";
    bannerBorder = "rgba(245,158,11,0.4)";
    bannerText = "#f59e0b";
    bannerMsg = `Warning: ${totalIssues} issues detected`;
  }

  const zombieCount = allIssues.filter((i) => i.type?.includes("zombie") || i.type?.includes("stalled")).length;

  const handleAction = async () => {
    if (!confirmModal) return;
    setActionLoading(true);
    try {
      let result: unknown;
      if (confirmModal.type === "cleanup") {
        const res = await fetch(`${BASE_URL}/ops/claude-cleanup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server: confirmModal.server || null, dry_run: false, reason: "manual_ceo_trigger" }),
        });
        result = await res.json();
      } else if (confirmModal.type === "scan") {
        const res = await fetch(`${BASE_URL}/ops/claude-cleanup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server: null, dry_run: true, reason: "manual_scan" }),
        });
        result = await res.json();
      } else {
        const res = await fetch(`${BASE_URL}/ops/bridge-restart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "manual_ceo_trigger" }),
        });
        result = await res.json();
      }
      setConfirmModal(null);
      setResultModal({
        title: confirmModal.type === "cleanup" ? "좀비 정리 결과" : confirmModal.type === "scan" ? "전체 스캔 결과" : "Bridge 재시작 결과",
        data: result,
      });
      onRefresh();
    } catch (e) {
      setConfirmModal(null);
      setResultModal({ title: "오류", data: String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: 16 }}>
      {/* Header + Control Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Claude Bot Status</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setConfirmModal({ type: "scan" })}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #475569", background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
          >
            전체 스캔
          </button>
          <button
            onClick={() => setConfirmModal({ type: "bridge" })}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #f59e0b", background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontSize: 11, cursor: "pointer" }}
          >
            Bridge 재시작
          </button>
          <button
            onClick={() => setConfirmModal({ type: "cleanup", server: null })}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", fontSize: 11, cursor: "pointer" }}
          >
            좀비 정리
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {!loading && (
        <div style={{ background: bannerBg, border: `1px solid ${bannerBorder}`, borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 600, color: bannerText }}>
          {bannerMsg}
          {latestReport?.generated_at && (
            <span style={{ fontWeight: 400, marginLeft: 12, color: "#64748b" }}>
              스캔: {toKST(latestReport.generated_at)}
            </span>
          )}
        </div>
      )}

      {loading && <div style={{ color: "#64748b", fontSize: 12, padding: 8 }}>데이터 로딩중...</div>}

      {/* Server Table (Part 1) */}
      {!loading && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155" }}>
                {["서버", "Claude 프로세스", "좀비", "bridge.py", "auto_trigger", "마지막 스캔", "이슈"].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {["68", "211", "114"].map((sid) => {
                const sd: WatchdogServerData = servers[sid] || {};
                const procCounts = sd.process_counts || {};
                const claudeCount = procCounts["claude"] ?? procCounts["claude_exec"] ?? "-";
                const zombieProc = procCounts["zombie"] ?? 0;
                const serverIssues = allIssues.filter((i) => i.server === sid);
                const critIssues = serverIssues.filter((i) => i.severity === "CRITICAL").length;
                const highIssues = serverIssues.filter((i) => i.severity === "HIGH").length;
                const medIssues = serverIssues.length - critIssues - highIssues;

                return (
                  <tr key={sid} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "7px 10px", color: "#e2e8f0", fontWeight: 600, whiteSpace: "nowrap" }}>서버 {sid}</td>
                    <td style={{ padding: "7px 10px", color: "#e2e8f0", textAlign: "center" }}>{claudeCount}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center" }}>
                      <span style={{ color: zombieProc > 0 ? "#ef4444" : "#64748b" }}>{zombieProc}</span>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center" }}>
                      {sid === "211" ? (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: sd.bridge_alive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: sd.bridge_alive ? "#22c55e" : "#ef4444",
                        }}>
                          {sd.bridge_alive === undefined ? "-" : sd.bridge_alive ? "alive" : "dead"}
                        </span>
                      ) : <span style={{ color: "#4b5563" }}>-</span>}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center" }}>
                      {sid === "211" ? (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: sd.auto_trigger_alive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: sd.auto_trigger_alive ? "#22c55e" : "#ef4444",
                        }}>
                          {sd.auto_trigger_alive === undefined ? "-" : sd.auto_trigger_alive ? "alive" : "dead"}
                        </span>
                      ) : <span style={{ color: "#4b5563" }}>-</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {toKST(latestReport?.generated_at)}
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                      {serverIssues.length === 0 ? (
                        <span style={{ color: "#22c55e", fontSize: 10 }}>정상</span>
                      ) : (
                        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {critIssues > 0 && (
                            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              CRITICAL {critIssues}
                            </span>
                          )}
                          {highIssues > 0 && (
                            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                              HIGH {highIssues}
                            </span>
                          )}
                          {medIssues > 0 && (
                            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "rgba(100,116,139,0.15)", color: "#94a3b8" }}>
                              MEDIUM {medIssues}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Part 4: Recent Cleanup Actions Table */}
      {cleanupLog.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>
            Recent Cleanup Actions ({Math.min(cleanupLog.length, 20)}건)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  {["시각", "서버", "타입", "PID", "결과"].map((h) => (
                    <th key={h} style={{ padding: "5px 10px", textAlign: "left", color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cleanupLog.slice(0, 20).map((action, i) => {
                  const isOk = action.result === "ok" || action.result === "killed";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={{ padding: "5px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{toKST(action.ts)}</td>
                      <td style={{ padding: "5px 10px", color: "#e2e8f0" }}>{action.server || "-"}</td>
                      <td style={{ padding: "5px 10px", color: "#94a3b8" }}>{action.type || action.action || "-"}</td>
                      <td style={{ padding: "5px 10px", color: "#94a3b8", fontFamily: "monospace" }}>{action.pid ?? "-"}</td>
                      <td style={{ padding: "5px 10px" }}>
                        <span style={{
                          display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: isOk ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: isOk ? "#22c55e" : "#ef4444",
                        }}>
                          {action.result || "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {confirmModal && (
        <ConfirmModal
          title={
            confirmModal.type === "cleanup" ? "좀비 프로세스 정리" :
            confirmModal.type === "bridge" ? "Bridge 재시작" : "전체 스캔"
          }
          message={
            confirmModal.type === "cleanup"
              ? `정체된 프로세스 ${zombieCount}개를 정리합니다. 진행하시겠습니까?`
              : confirmModal.type === "bridge"
              ? "서버 211의 bridge.py를 재시작합니다. 진행하시겠습니까?"
              : "전체 서버를 스캔합니다. 정리 없이 최신 상태를 확인합니다."
          }
          onConfirm={handleAction}
          onCancel={() => setConfirmModal(null)}
          loading={actionLoading}
        />
      )}
      {resultModal && (
        <ResultModal
          title={resultModal.title}
          data={resultModal.data}
          onClose={() => setResultModal(null)}
        />
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function PipelineHealthTab() {
  const { health: sseHealth, pipeline: ssePipeline, directives: sseDirectives, claudeWatchdog: sseWatchdog, connected } = useSSE();
  const [fullHealth, setFullHealth] = useState<FullHealthData | null>(null);
  const [processesData, setProcessesData] = useState<ProcessesResponse | null>(null);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchFull = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_URL}/ops/full-health`);
      if (r.ok) setFullHealth(await r.json());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_URL}/ops/claude-processes?limit=5`);
      if (r.ok) setProcessesData(await r.json());
    } catch {} finally {
      setProcessesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFull();
    fetchProcesses();
    const iv1 = setInterval(fetchFull, 30000);
    const iv2 = setInterval(fetchProcesses, 30000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [fetchFull, fetchProcesses]);

  // Part 3: SSE claude_watchdog 이벤트 수신 시 자동 갱신
  useEffect(() => {
    if (sseWatchdog) {
      fetchProcesses();
    }
  }, [sseWatchdog, fetchProcesses]);

  if (loading && !fullHealth) {
    return <div className="text-gray-400 text-sm p-4">Loading health data...</div>;
  }

  const overallStatus = sseHealth?.status || fullHealth?.status || "UNKNOWN";
  const dirSections = fullHealth?.sections?.directives || {} as Record<string, any>;
  const infraSection = (fullHealth?.sections?.infra || {}) as Record<string, any>;
  const consistencySection = (fullHealth?.sections?.consistency || {}) as Record<string, any>;
  const pipelineSection = (fullHealth?.sections?.pipeline || {}) as Record<string, any>;
  const allIssues = fullHealth?.issues || [];

  return (
    <div className="space-y-4">
      {/* Overall Banner */}
      <div className={`rounded-lg p-3 flex items-center justify-between ${
        overallStatus === "HEALTHY" ? "bg-green-900/30 border border-green-700" :
        overallStatus === "DEGRADED" ? "bg-yellow-900/30 border border-yellow-700" :
        "bg-red-900/30 border border-red-700"
      }`}>
        <div className="flex items-center gap-3">
          <StatusDot status={overallStatus} />
          <span className="text-sm font-semibold text-gray-200">
            Pipeline Status: {overallStatus}
          </span>
          <span className="text-xs text-gray-400">
            SSE: {connected ? "connected" : "polling fallback"}
          </span>
        </div>
        {fullHealth?.duration_ms && (
          <span className="text-xs text-gray-500">{fullHealth.duration_ms}ms</span>
        )}
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1) Directives */}
        <Card title="Directives" status={Object.values(dirSections).some((d: any) => !d?.folder_exists) ? "DEGRADED" : "HEALTHY"}>
          <div className="grid grid-cols-4 gap-2">
            {["pending", "running", "done", "archived"].map(s => {
              const d = (dirSections as Record<string, any>)[s] || {};
              return (
                <div key={s} className="text-center">
                  <div className="text-lg font-bold text-gray-200">{d.count ?? "-"}</div>
                  <div className="text-[10px] text-gray-500">{s}</div>
                </div>
              );
            })}
          </div>
          {sseHealth && (
            <div className="mt-2 text-[10px] text-gray-500">
              SSE: pending={sseHealth.pending_folder}, running_folder={sseHealth.running_folder}
            </div>
          )}
        </Card>

        {/* 2) Pipeline Processes */}
        <Card title="Pipeline Processes" status={pipelineSection.overall || "UNKNOWN"}>
          {ssePipeline ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ssePipeline.bridge_running ? "bg-green-500" : "bg-red-500"}`} />
                <span>bridge.py: {ssePipeline.bridge_running ? "running" : "stopped"}</span>
              </div>
              <div>Active sessions: {ssePipeline.active_sessions}</div>
            </>
          ) : (
            <>
              {["bridge_py", "auto_trigger", "session_watchdog"].map(proc => {
                const s211 = (pipelineSection as any).server_211 || {};
                const info = s211[proc] || {};
                return (
                  <div key={proc} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${info.running ? "bg-green-500" : "bg-red-500"}`} />
                    <span>{proc}: {info.running ? `PID ${info.pid || "?"}` : "stopped"}</span>
                  </div>
                );
              })}
            </>
          )}
        </Card>

        {/* 3) Infrastructure */}
        <Card title="Infrastructure" status={infraSection.overall || "UNKNOWN"}>
          {["db", "ssh_211", "ssh_114", "disk_68", "disk_211", "disk_114", "memory_68", "cpu_68"].map(key => {
            const check = (infraSection as Record<string, any>)[key] || {};
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${check.ok ? "bg-green-500" : check.severity === "warning" ? "bg-yellow-500" : "bg-red-500"}`} />
                <span>{key}: {check.ok ? "OK" : (check.error || check.severity || "FAIL")}</span>
                {key.startsWith("disk_") && check.usage_pct != null && (
                  <span className="text-gray-500">({check.usage_pct}%)</span>
                )}
              </div>
            );
          })}
        </Card>

        {/* 4) Consistency */}
        <Card title="Consistency" status={consistencySection.overall || "UNKNOWN"}>
          {["status_md_sync", "pending_sync", "commit_sync", "handover_sync"].map(key => {
            const check = (consistencySection as Record<string, any>)[key] || {};
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${check.ok !== false ? "bg-green-500" : "bg-red-500"}`} />
                <span>{key.replace(/_/g, " ")}: {check.ok !== false ? "OK" : "MISMATCH"}</span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Issues List */}
      {allIssues.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Issues ({allIssues.length})</h3>
          <div className="space-y-1">
            {allIssues.map((issue, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${
                issue.severity === "critical" ? "bg-red-900/30 text-red-300" :
                issue.severity === "warning" ? "bg-yellow-900/30 text-yellow-300" :
                "bg-gray-700 text-gray-300"
              }`}>
                [{issue.severity || "info"}] {issue.type}: {issue.detail}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Claude Bot Status Card (AADS-169 Parts 1-4) */}
      <ClaudeBotStatusCard
        processesData={processesData}
        loading={processesLoading}
        onRefresh={fetchProcesses}
      />

      {/* Recent Directive Changes (from SSE) */}
      {sseDirectives.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Recent Changes (SSE)</h3>
          <div className="space-y-1">
            {sseDirectives.map((d, i) => (
              <div key={i} className="text-xs text-gray-400">
                {d.task_id} [{d.status}] {d.title || d.project}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
