"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecoveryLog {
  id: number;
  created_at: string;
  issue_type: string;
  affected_server: string;
  affected_task: string | null;
  tier: string;
  action_taken: string;
  result: "success" | "failed" | "escalated";
  duration_seconds: number | null;
  detail: string | null;
  project_id: string | null;
}

interface RecoveryStats {
  by_issue_type: { issue_type: string; total: number; success_count: number; success_rate_pct: number; avg_duration_seconds: number }[];
  by_tier: { tier: string; total: number; success_count: number }[];
  total: number;
  total_success: number;
}

interface CircuitBreakerServer {
  server: string;
  state: "closed" | "open" | "half_open";
  failure_count: number;
  cooldown_until: string | null;
  opened_at: string | null;
  updated_at: string | null;
}

interface CircuitBreakerData {
  servers: CircuitBreakerServer[];
  count: number;
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

function formatDuration(secs: number | null | undefined): string {
  if (secs == null) return "-";
  if (secs < 60) return `${Math.round(secs)}초`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}분 ${s}초`;
}

function resultColor(result: string): string {
  switch (result) {
    case "success": return "var(--success)";
    case "failed": return "var(--danger)";
    case "escalated": return "var(--warning)";
    default: return "var(--text-secondary)";
  }
}

function resultLabel(result: string): string {
  switch (result) {
    case "success": return "성공";
    case "failed": return "실패";
    case "escalated": return "에스컬레이션";
    default: return result;
  }
}

function cbIcon(state: string): string {
  switch (state) {
    case "closed": return "🟢";
    case "open": return "🔴";
    case "half_open": return "🟡";
    default: return "⚪";
  }
}

function cbLabel(state: string): string {
  switch (state) {
    case "closed": return "정상(Closed)";
    case "open": return "차단(Open)";
    case "half_open": return "반개방(Half-Open)";
    default: return state;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecoveryPage() {
  const [logs, setLogs] = useState<RecoveryLog[]>([]);
  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [cb, setCb] = useState<CircuitBreakerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("-");
  const [resettingServer, setResettingServer] = useState<string | null>(null);

  // Filters
  const [filterIssueType, setFilterIssueType] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [filterServer, setFilterServer] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterIssueType !== "all") params.set("issue_type", filterIssueType);
      if (filterResult !== "all") params.set("result", filterResult);
      if (filterServer !== "all") params.set("server", filterServer);
      params.set("limit", "100");
      const qs = params.toString();

      const [logsRes, statsRes, cbRes] = await Promise.allSettled([
        fetch(`/api/v1/ops/recovery-logs?${qs}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("aads_token") || ""}` },
        }).then((r) => r.json()),
        fetch("/api/v1/ops/recovery-logs/stats", {
          headers: { Authorization: `Bearer ${localStorage.getItem("aads_token") || ""}` },
        }).then((r) => r.json()),
        fetch("/api/v1/ops/circuit-breaker", {
          headers: { Authorization: `Bearer ${localStorage.getItem("aads_token") || ""}` },
        }).then((r) => r.json()),
      ]);

      if (logsRes.status === "fulfilled") setLogs(logsRes.value?.items || []);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (cbRes.status === "fulfilled") setCb(cbRes.value);

      setLastUpdated(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterIssueType, filterResult, filterServer]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const handleCbReset = async (server: string) => {
    setResettingServer(server);
    try {
      const token = localStorage.getItem("aads_token") || "";
      await fetch(`/api/v1/ops/circuit-breaker/${server}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setResettingServer(null);
    }
  };

  // Filtered logs (date client-side)
  const filteredLogs = filterDate
    ? logs.filter((l) => l.created_at && l.created_at.startsWith(filterDate))
    : logs;

  // Derived stats
  const totalAttempts = stats?.total ?? 0;
  const totalSuccess = stats?.total_success ?? 0;
  const successRate = totalAttempts > 0 ? ((totalSuccess / totalAttempts) * 100).toFixed(1) : "0.0";
  const avgMttr =
    stats?.by_issue_type && stats.by_issue_type.length > 0
      ? (
          stats.by_issue_type.reduce((s, r) => s + (r.avg_duration_seconds || 0), 0) /
          stats.by_issue_type.length
        ).toFixed(0)
      : "-";
  const topIssue =
    stats?.by_issue_type && stats.by_issue_type.length > 0
      ? stats.by_issue_type[0].issue_type
      : "-";

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="Recovery 복구 이력" />
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>🔄 자기치유 복구 이력</h2>
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

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: "var(--danger)" }}>
            ⚠️ API 오류: {error}
          </div>
        )}

        {/* ─── 섹션 1: 통계 카드 ─── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🔢</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-secondary)" }}>총 복구 시도</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{loading ? "-" : totalAttempts}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-secondary)" }}>성공률</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>{loading ? "-" : `${successRate}%`}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⏱️</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-secondary)" }}>평균 MTTR</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>
                {loading ? "-" : avgMttr === "-" ? "-" : `${avgMttr}초`}
              </div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-secondary)" }}>빈발 이슈 유형</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", wordBreak: "break-all" }}>{loading ? "-" : topIssue}</div>
            </div>
          </div>
        </section>

        {/* ─── 섹션 2: 서킷브레이커 상태 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>⚡ 서킷브레이커 상태</h3>
          {loading ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>로딩 중...</div>
          ) : cb?.servers && cb.servers.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {cb.servers.map((s) => (
                <div
                  key={s.server}
                  style={{
                    background: "var(--bg-hover)",
                    border: `1px solid ${s.state === "closed" ? "rgba(34,197,94,0.3)" : s.state === "open" ? "var(--danger)" : "var(--warning)"}`,
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 22 }}>{cbIcon(s.state)}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 8, color: "var(--text-primary)" }}>
                        서버 {s.server}
                      </span>
                    </div>
                    {s.state !== "closed" && (
                      <button
                        onClick={() => handleCbReset(s.server)}
                        disabled={resettingServer === s.server}
                        style={{
                          background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4,
                          padding: "4px 10px", fontSize: 11, cursor: resettingServer === s.server ? "not-allowed" : "pointer",
                          opacity: resettingServer === s.server ? 0.6 : 1,
                        }}
                      >
                        {resettingServer === s.server ? "리셋 중..." : "수동 리셋"}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--text-secondary)" }}>상태: </span>
                    <span style={{ fontWeight: 600, color: s.state === "closed" ? "var(--success)" : s.state === "open" ? "var(--danger)" : "var(--warning)" }}>
                      {cbLabel(s.state)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    연속 실패: <span style={{ color: s.failure_count > 0 ? "var(--danger)" : "var(--text-primary)", fontWeight: 600 }}>{s.failure_count}회</span>
                  </div>
                  {s.cooldown_until && (
                    <div style={{ fontSize: 12, color: "var(--warning)", marginTop: 4 }}>
                      쿨다운 만료: {toKST(s.cooldown_until)}
                    </div>
                  )}
                  {s.updated_at && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                      최근 갱신: {toKST(s.updated_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              서킷브레이커 데이터 없음 (circuit_breaker_state 테이블 확인 필요)
            </div>
          )}
        </section>

        {/* ─── 섹션 3: Recovery History 테이블 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>📋 복구 이력 테이블</h3>

          {/* 필터 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <select
              value={filterIssueType}
              onChange={(e) => setFilterIssueType(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">전체 이슈 유형</option>
              {Array.from(new Set(logs.map((l) => l.issue_type).filter(Boolean))).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">전체 결과</option>
              <option value="success">성공</option>
              <option value="failed">실패</option>
              <option value="escalated">에스컬레이션</option>
            </select>
            <select
              value={filterServer}
              onChange={(e) => setFilterServer(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">전체 서버</option>
              <option value="68">서버 68</option>
              <option value="211">서버 211</option>
              <option value="114">서버 114</option>
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["시간", "이슈유형", "영향서버", "영향작업", "에스컬레이션 티어", "조치", "결과", "소요시간"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--text-secondary)" }}>
                      {loading ? "로딩 중..." : "복구 이력 없음"}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background:
                          log.result === "failed"
                            ? "rgba(239,68,68,0.05)"
                            : log.result === "escalated"
                            ? "rgba(234,179,8,0.05)"
                            : "transparent",
                      }}
                    >
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{toKST(log.created_at)}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{log.issue_type}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{log.affected_server || "-"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.affected_task || "-"}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{log.tier || "-"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.action_taken || "-"}
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: `${resultColor(log.result)}22`,
                            color: resultColor(log.result),
                          }}
                        >
                          {resultLabel(log.result)}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDuration(log.duration_seconds)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── 섹션 4: 이슈 유형별 통계 ─── */}
        {stats && stats.by_issue_type.length > 0 && (
          <section style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>📊 이슈 유형별 통계</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["이슈 유형", "총 발생", "성공", "성공률", "평균 복구시간"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.by_issue_type.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.issue_type}</td>
                      <td style={{ padding: "6px 8px" }}>{row.total}</td>
                      <td style={{ padding: "6px 8px", color: "var(--success)" }}>{row.success_count}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{ color: Number(row.success_rate_pct) >= 80 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                          {row.success_rate_pct ?? 0}%
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{formatDuration(row.avg_duration_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
