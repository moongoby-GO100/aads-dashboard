"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HealthData {
  pipeline_healthy: boolean;
  completed_today: number;
  running_count: number;
  stalled_count: number;
  error_count: number;
  checks: Record<string, CheckResult>;
  checked_at?: string;
}

interface CheckResult {
  ok: boolean;
  count: number;
  label?: string;
  detail?: string;
  items?: unknown[];
}

interface LifecycleItem {
  task_id: string;
  project: string;
  title: string;
  created_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  wait_seconds: number | null;
  status: string;
  stalled?: boolean;
}

interface CostSummary {
  today_total: number;
  cumulative_total: number;
  daily: { date: string; cost: number }[];
  by_project: { project: string; cost: number }[];
  by_model: { model: string; calls: number; tokens: number; cost: number }[];
}

interface EnvHistoryData {
  server_id: number | string;
  snapshots: { ts: string; disk_pct: number; services: Record<string, boolean> }[];
  latest_services?: Record<string, boolean>;
}

interface BridgeLogItem {
  id: number;
  category: string;
  content: string;
  created_at: string;
  blocked?: boolean;
  blocked_reason?: string;
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

function formatDuration(secs: number | null | undefined): string {
  if (secs == null) return "-";
  if (secs < 60) return `${Math.round(secs)}초`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}분 ${s}초`;
}

function safeNum(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

// ─── Status Color Helpers ─────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "var(--success)";
    case "running": return "var(--accent)";
    case "queued": return "var(--warning)";
    case "error": return "var(--danger)";
    case "requeued": return "#f97316";
    default: return "var(--text-secondary)";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed": return "완료";
    case "running": return "실행중";
    case "queued": return "대기";
    case "error": return "오류";
    case "requeued": return "재큐";
    default: return status;
  }
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 0.01);
  const w = 100 / data.length;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${Math.max(data.length * 40, 280)} 120`} style={{ width: "100%", minWidth: 280, height: 120 }}>
        {data.map((d, i) => {
          const barH = (d.value / maxVal) * 80;
          const x = i * 40 + 4;
          const y = 90 - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={32} height={barH} rx={3} fill="var(--accent)" opacity={0.85} />
              <text x={x + 16} y={108} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">
                {d.label.slice(5)}
              </text>
              {d.value > 0 && (
                <text x={x + 16} y={y - 3} textAnchor="middle" fontSize={7} fill="var(--text-primary)">
                  ${(d.value ?? 0).toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={0} y1={90} x2={data.length * 40} y2={90} stroke="var(--border)" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ─── SVG Pie Chart ────────────────────────────────────────────────────────────

function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316"];
  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const startAngle = cumAngle;
    cumAngle += angle;
    const x1 = 50 + 40 * Math.cos(startAngle);
    const y1 = 50 + 40 * Math.sin(startAngle);
    const x2 = 50 + 40 * Math.cos(cumAngle);
    const y2 = 50 + 40 * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { d: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`, color: COLORS[i % COLORS.length], label: d.label, value: d.value };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width: 100, height: 100, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.85} />)}
      </svg>
      <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${(s.value ?? 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SVG Line Chart (disk usage) ──────────────────────────────────────────────

function LineChart({ points, warningPct = 80 }: { points: { ts: string; disk_pct: number }[]; warningPct?: number }) {
  if (!points || points.length === 0) {
    return <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 20 }}>데이터 없음</div>;
  }
  const W = 400;
  const H = 100;
  const maxY = 100;
  const xs = points.map((_, i) => (i / Math.max(points.length - 1, 1)) * W);
  const ys = points.map((p) => H - (p.disk_pct / maxY) * H);
  const pathD = points.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const warnY = H - (warningPct / maxY) * H;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: "100%", minWidth: 280, height: H + 20 }}>
        <line x1={0} y1={warnY} x2={W} y2={warnY} stroke="var(--danger)" strokeWidth={1} strokeDasharray="4 3" />
        <text x={W - 2} y={warnY - 3} textAnchor="end" fontSize={8} fill="var(--danger)">{warningPct}%</text>
        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={ys[i]} r={2.5} fill={p.disk_pct >= warningPct ? "var(--danger)" : "var(--accent)"} />
        ))}
        {[0, Math.floor(points.length / 2), points.length - 1].filter((idx) => idx < points.length).map((idx) => (
          <text key={idx} x={xs[idx]} y={H + 16} textAnchor="middle" fontSize={7} fill="var(--text-secondary)">
            {points[idx].ts.slice(11, 16)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Validation Check Card ────────────────────────────────────────────────────

const CHECK_META: Record<string, { label: string; okText: (n: number) => string; unit: string }> = {
  queue_stall: { label: "큐 정체 감지", okText: (n) => `정체 ${n}건`, unit: "건" },
  bridge_integrity: { label: "브릿지 정합성", okText: (n) => `불일치 ${n}건`, unit: "건" },
  commit_integrity: { label: "커밋 정합성", okText: (n) => `누락 ${n}건`, unit: "건" },
  cost_tracking: { label: "비용 추적", okText: (n) => `미기록 ${n}건`, unit: "건" },
  env_trend: { label: "환경 트렌드", okText: (n) => `경고 ${n}건`, unit: "건" },
  manager_response: { label: "매니저 응답", okText: (n) => `무응답 ${n}건`, unit: "건" },
  pipeline_flow: { label: "파이프라인 흐름", okText: (n) => `30분내 완료 ${n}건`, unit: "건" },
};

const CHECK_ORDER = ["queue_stall", "bridge_integrity", "commit_integrity", "cost_tracking", "env_trend", "manager_response", "pipeline_flow"];

interface CheckCardModalProps {
  checkKey: string;
  result: CheckResult;
  onClose: () => void;
}

function CheckCardModal({ checkKey, result, onClose }: CheckCardModalProps) {
  const meta = CHECK_META[checkKey] || { label: checkKey, okText: (n: number) => `${n}건`, unit: "건" };
  const items = result.items as string[] | undefined;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 480, width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{result.ok ? "✅" : "❌"} {meta.label}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          {result.ok ? "이상 없음" : `문제 ${result.count}${meta.unit} 발견`}
        </p>
        {!result.ok && items && items.length > 0 && (
          <ul style={{ listStyle: "disc", paddingLeft: 18, fontSize: 12, color: "var(--danger)" }}>
            {items.map((item, i) => <li key={i}>{String(item)}</li>)}
          </ul>
        )}
        {result.detail && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>{result.detail}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleItem[]>([]);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [envHistory, setEnvHistory] = useState<EnvHistoryData | null>(null);
  const [bridgeLog, setBridgeLog] = useState<BridgeLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("-");

  // Filters for lifecycle table
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  // Modal state for check cards
  const [modalCheck, setModalCheck] = useState<{ key: string; result: CheckResult } | null>(null);

  // Bridge log collapsed
  const [bridgeExpanded, setBridgeExpanded] = useState(false);

  // Server tab for env
  const [activeServer, setActiveServer] = useState<number | string>(68);

  const fetchAll = useCallback(async () => {
    try {
      const [healthData, lifecycleData, costData, envData, bridgeData] = await Promise.allSettled([
        api.getOpsHealthCheck(),
        api.getOpsDirectiveLifecycle(20),
        api.getOpsCostSummary(),
        api.getOpsEnvHistory(activeServer),
        api.getOpsBridgeLog(30),
      ]);

      if (healthData.status === "fulfilled") setHealth(healthData.value);
      if (lifecycleData.status === "fulfilled") {
        const items = lifecycleData.value?.items || lifecycleData.value?.directives || lifecycleData.value || [];
        setLifecycle(Array.isArray(items) ? items : []);
      }
      if (costData.status === "fulfilled") setCostSummary(costData.value);
      if (envData.status === "fulfilled") setEnvHistory(envData.value);
      if (bridgeData.status === "fulfilled") {
        const items = bridgeData.value?.items || bridgeData.value || [];
        setBridgeLog(Array.isArray(items) ? items : []);
      }

      setLastUpdated(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeServer]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Lifecycle table filter
  const projects = Array.from(new Set(lifecycle.map((l) => l.project).filter(Boolean)));
  const filteredLifecycle = lifecycle.filter((l) => {
    if (filterProject !== "all" && l.project !== filterProject) return false;
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterDate && l.created_at && !l.created_at.startsWith(filterDate)) return false;
    return true;
  });

  // Cost chart data
  const dailyCost = costSummary?.daily?.slice(-7) || [];
  const barData = dailyCost.map((d) => ({ label: d.date, value: d.cost }));

  // Env snapshots
  const snapshots = envHistory?.snapshots || [];
  const latestServices = envHistory?.latest_services || (snapshots.length > 0 ? snapshots[snapshots.length - 1].services : {});

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="운영 현황 대시보드" />
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Page Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>📊 운영 현황 대시보드</h2>
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
            ⚠️ 일부 API 오류: {error}
          </div>
        )}

        {/* ─── 섹션 1: 파이프라인 건전성 헤더 카드 ─── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {/* 파이프라인 상태 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{health?.pipeline_healthy ? "🟢" : "🔴"}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>파이프라인</div>
              <div style={{ fontSize: 13, color: health?.pipeline_healthy ? "var(--success)" : "var(--danger)" }}>
                {loading ? "로딩..." : health?.pipeline_healthy ? "정상" : "이상"}
              </div>
            </div>
            {/* 오늘 완료 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>오늘 완료</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>
                {loading ? "-" : safeNum(health?.completed_today)}건
              </div>
            </div>
            {/* 현재 실행중 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>현재 실행중</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>
                {loading ? "-" : safeNum(health?.running_count)}건
              </div>
            </div>
            {/* 정체/오류 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🚨</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>정체/오류</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: (safeNum(health?.stalled_count) + safeNum(health?.error_count)) > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                {loading ? "-" : safeNum(health?.stalled_count) + safeNum(health?.error_count)}건
              </div>
            </div>
          </div>
        </section>

        {/* ─── 섹션 2: 지시서 라이프사이클 타임라인 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>📋 지시서 라이프사이클 타임라인</h3>
          {/* 필터 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">전체 프로젝트</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">전체 상태</option>
              <option value="completed">완료</option>
              <option value="running">실행중</option>
              <option value="queued">대기</option>
              <option value="error">오류</option>
              <option value="requeued">재큐</option>
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
                  {["Task ID", "프로젝트", "제목", "생성", "시작", "완료", "소요시간", "대기시간", "상태"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLifecycle.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 20, color: "var(--text-secondary)" }}>데이터 없음</td></tr>
                ) : filteredLifecycle.map((item) => (
                  <tr
                    key={item.task_id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: item.stalled ? "rgba(239,68,68,0.08)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "6px 8px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {item.stalled && <span style={{ marginRight: 4 }}>⚠️</span>}
                      {item.task_id}
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{item.project || "-"}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{toKST(item.created_at)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{toKST(item.started_at)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{toKST(item.completed_at)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDuration(item.duration_seconds)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDuration(item.wait_seconds)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: `${statusColor(item.status)}22`,
                        color: statusColor(item.status),
                        animation: item.status === "running" ? "pulse 1.5s infinite" : "none",
                      }}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── 섹션 3: 교차검증 결과 패널 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>🔍 교차검증 결과</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {CHECK_ORDER.map((key) => {
              const result: CheckResult = health?.checks?.[key] || { ok: true, count: 0 };
              const meta = CHECK_META[key] || { label: key, okText: (n: number) => `${n}건`, unit: "건" };
              return (
                <div
                  key={key}
                  onClick={() => setModalCheck({ key, result })}
                  style={{
                    background: result.ok ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.1)",
                    border: `1px solid ${result.ok ? "rgba(34,197,94,0.3)" : "var(--danger)"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                    {result.ok ? "✅" : "❌"} {meta.label}
                  </div>
                  <div style={{ fontSize: 12, color: result.ok ? "var(--success)" : "var(--danger)" }}>
                    {meta.okText(safeNum(result.count))}
                  </div>
                  {!result.ok && (
                    <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>CEO 확인 필요</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── 섹션 4: 비용 트래커 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>💰 비용 트래커</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
            <div style={{ background: "var(--bg-hover)", borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>오늘 총 비용</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>
                ${(safeNum(costSummary?.today_total)).toFixed(2)}
              </div>
            </div>
            <div style={{ background: "var(--bg-hover)", borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>누적 총 비용</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
                ${(safeNum(costSummary?.cumulative_total)).toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flexWrap: "wrap" } as React.CSSProperties}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>일별 비용 (최근 7일)</div>
              {barData.length > 0 ? <BarChart data={barData} /> : <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>데이터 없음</div>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>프로젝트별 비용</div>
              {costSummary?.by_project && costSummary.by_project.length > 0
                ? <PieChart data={costSummary.by_project.map((d) => ({ label: d.project, value: d.cost }))} />
                : <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>데이터 없음</div>}
            </div>
          </div>

          {costSummary?.by_model && costSummary.by_model.length > 0 && (
            <div style={{ marginTop: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>모델별 비용</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["모델명", "호출수", "토큰수", "비용"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costSummary.by_model.map((m, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px" }}>{m.model}</td>
                      <td style={{ padding: "6px 8px" }}>{(m.calls ?? 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 8px" }}>{(m.tokens ?? 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", color: "var(--accent)", fontWeight: 600 }}>${(m.cost ?? 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── 섹션 5: 서버 환경 트렌드 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>🖥️ 서버 환경 트렌드</h3>
          {/* Server Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[68, 211, 114].map((sid) => (
              <button
                key={sid}
                onClick={() => setActiveServer(sid)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  background: activeServer === sid ? "var(--accent)" : "var(--bg-hover)",
                  color: activeServer === sid ? "#fff" : "var(--text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                서버 {sid}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
              디스크 사용량 (최근 24h)
            </div>
            <LineChart points={snapshots} warningPct={80} />
          </div>

          {/* Services status */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>서비스 상태 (최신)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.keys(latestServices).length === 0
                ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>데이터 없음</span>
                : Object.entries(latestServices).map(([svc, ok]) => (
                    <span key={svc} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "var(--danger)"}`,
                      borderRadius: 20, padding: "3px 10px", fontSize: 12,
                    }}>
                      {ok ? "✅" : "❌"} {svc}
                    </span>
                  ))
              }
            </div>
          </div>
        </section>

        {/* ─── 섹션 6: 브릿지 활동 로그 ─── */}
        <section style={{ ...cardStyle, marginBottom: 24 }}>
          <button
            onClick={() => setBridgeExpanded(!bridgeExpanded)}
            style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", padding: 0,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🔗 브릿지 활동 로그</h3>
            <span style={{ fontSize: 18, color: "var(--text-secondary)" }}>{bridgeExpanded ? "▲" : "▼"}</span>
          </button>

          {bridgeExpanded && (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              {bridgeLog.length === 0 ? (
                <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 12 }}>데이터 없음</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["#", "분류", "내용", "시각", "차단"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bridgeLog.map((item, i) => {
                      const catIcon: Record<string, string> = {
                        directive: "📋",
                        report: "📊",
                        conversation: "💬",
                        blocked: "🚫",
                      };
                      const icon = catIcon[item.category] || "📄";
                      return (
                        <tr
                          key={item.id ?? i}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: item.blocked ? "rgba(239,68,68,0.08)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>{i + 1}</td>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{icon} {item.category}</td>
                          <td style={{ padding: "6px 8px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.content}</td>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{toKST(item.created_at)}</td>
                          <td style={{ padding: "6px 8px", color: "var(--danger)", fontSize: 11 }}>
                            {item.blocked ? `🚫 ${item.blocked_reason || "차단됨"}` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {modalCheck && (
        <CheckCardModal
          checkKey={modalCheck.key}
          result={modalCheck.result}
          onClose={() => setModalCheck(null)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 640px) {
          .ops-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
