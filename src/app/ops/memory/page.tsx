"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MemoryStats {
  total_count: number;
  avg_quality: number;
  today_count: number;
  active_corrections: number;
  daily_trend: { date: string; count: number }[];
  category_distribution: Record<string, number>;
}

interface MemoryEntry {
  id: string;
  source: string;
  category: string;
  key: string;
  content: string;
  quality_score: number;
  project?: string;
  updated_at: string;
}

interface MemoryEntriesResponse {
  entries: MemoryEntry[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toKSTShort(dtStr: string | null | undefined): string {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr.slice(5, 10);
    const kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const m = kst.match(/(\d{1,2})\.\s*(\d{1,2})\./);
    if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}`;
    return dtStr.slice(5, 10);
  } catch {
    return dtStr.slice(5, 10);
  }
}

function qualityColor(score: number): string {
  if (score >= 0.7) return "var(--success)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--danger)";
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#ec4899"];

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
};

const statCardStyle: React.CSSProperties = {
  ...cardStyle,
  textAlign: "center",
  flex: "1 1 0",
  minWidth: 140,
};

// ─── SVG Bar Chart (Daily Trend) ─────────────────────────────────────────────

function DailyBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 20 }}>데이터 없음</div>;
  }
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${Math.max(data.length * 40, 280)} 130`} style={{ width: "100%", minWidth: 280, height: 130 }}>
        {data.map((d, i) => {
          const barH = (d.count / maxVal) * 80;
          const x = i * 40 + 4;
          const y = 90 - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={32} height={barH} rx={3} fill="var(--accent)" opacity={0.85} />
              <text x={x + 16} y={108} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">
                {d.date.slice(5)}
              </text>
              {d.count > 0 && (
                <text x={x + 16} y={y - 3} textAnchor="middle" fontSize={8} fill="var(--text-primary)">
                  {d.count}
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

// ─── SVG Donut Chart (Category Distribution) ─────────────────────────────────

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 20 }}>데이터 없음</div>;
  }
  const R = 40;
  const r = 24;
  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const x1o = 50 + R * Math.cos(startAngle);
    const y1o = 50 + R * Math.sin(startAngle);
    const x2o = 50 + R * Math.cos(cumAngle);
    const y2o = 50 + R * Math.sin(cumAngle);
    const x1i = 50 + r * Math.cos(cumAngle);
    const y1i = 50 + r * Math.sin(cumAngle);
    const x2i = 50 + r * Math.cos(startAngle);
    const y2i = 50 + r * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const pathD = `M ${x1o} ${y1o} A ${R} ${R} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${r} ${r} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
    return { d: pathD, color: COLORS[i % COLORS.length], label: d.label, value: d.value };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width: 110, height: 110, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.85} />)}
        <text x={50} y={53} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">
          {total}
        </text>
      </svg>
      <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MemoryDashboardPage() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ source: string; id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getOpsMemoryStats();
      setStats(data);
    } catch (e) {
      console.error("Memory stats fetch error:", e);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const data: MemoryEntriesResponse = await api.getOpsMemoryEntries({
        category: filterCategory || undefined,
        project: filterProject || undefined,
        search: searchText || undefined,
        page,
        page_size: pageSize,
      });
      setEntries(data.entries || []);
      setTotalEntries(data.total || 0);
    } catch (e) {
      console.error("Memory entries fetch error:", e);
    }
  }, [filterCategory, filterProject, searchText, page, pageSize]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.allSettled([fetchStats(), fetchEntries()]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchEntries]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteOpsMemoryEntry(deleteTarget.source, deleteTarget.id);
      setDeleteTarget(null);
      await fetchEntries();
    } catch (e) {
      alert("삭제 실패: " + String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = () => {
    setSearchText(searchInput);
    setPage(1);
  };

  const handleExportCSV = () => {
    if (entries.length === 0) return;
    const header = "카테고리,키,내용,품질,프로젝트,갱신일\n";
    const rows = entries.map((e) =>
      [e.category, e.key, `"${(e.content || "").replace(/"/g, '""').slice(0, 200)}"`, e.quality_score, e.project || "", toKSTShort(e.updated_at)].join(",")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memory_entries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  const categoryDistData = stats?.category_distribution
    ? Object.entries(stats.category_distribution).map(([label, value]) => ({ label, value }))
    : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="메모리 진화 모니터링" />
      <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>🧠 메모리 진화 모니터링</h2>
        </div>

      {error && (
        <div style={{ ...cardStyle, background: "#7f1d1d22", borderColor: "var(--danger)", marginBottom: 16, color: "var(--danger)", fontSize: 13 }}>
          오류: {error}
        </div>
      )}

      {/* ─── 상단: 통계 카드 4개 ─────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={statCardStyle}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>총 학습량</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>
            {loading ? "..." : (stats?.total_count ?? 0).toLocaleString()}
            <span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>평균 품질</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: qualityColor(stats?.avg_quality ?? 0) }}>
            {loading ? "..." : (stats?.avg_quality ?? 0).toFixed(2)}
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>오늘 학습</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>
            +{loading ? "..." : (stats?.today_count ?? 0)}
            <span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>활성 교정</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>
            {loading ? "..." : (stats?.active_corrections ?? 0)}
            <span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
          </div>
        </div>
      </div>

      {/* ─── 중단: 차트 영역 ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 20 }}>
        <section style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
            📈 일별 학습 추이 (14일)
          </h3>
          <DailyBarChart data={stats?.daily_trend || []} />
        </section>

        <section style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
            📊 카테고리별 분포
          </h3>
          <DonutChart data={categoryDistData} />
        </section>
      </div>

      {/* ─── 하단: 메모리 목록 테이블 ──────────────────────────────── */}
      <section style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
          📋 메모리 목록
        </h3>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
            style={{
              background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none",
            }}
          >
            <option value="">전체 카테고리</option>
            {categoryDistData.map((c) => (
              <option key={c.label} value={c.label}>{c.label}</option>
            ))}
          </select>

          <select
            value={filterProject}
            onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}
            style={{
              background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none",
            }}
          >
            <option value="">전체 프로젝트</option>
            {["AADS", "KIS", "GO100", "SF", "NTV2", "NAS"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              placeholder="검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              style={{
                background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", width: 160,
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
                padding: "6px 12px", fontSize: 12, cursor: "pointer",
              }}
            >
              검색
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            style={{
              background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", marginLeft: "auto",
            }}
          >
            CSV 내보내기
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["카테고리", "키", "내용", "품질", "프로젝트", "갱신일", "액션"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left", padding: "8px 6px", color: "var(--text-secondary)",
                      fontWeight: 600, fontSize: 11, whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                    {loading ? "로딩 중..." : "데이터 없음"}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={`${entry.source}-${entry.id}`}
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 10, fontWeight: 600,
                        background: `${COLORS[Math.abs(hashCode(entry.category)) % COLORS.length]}22`,
                        color: COLORS[Math.abs(hashCode(entry.category)) % COLORS.length],
                      }}>
                        {entry.category}
                      </span>
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.key}
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--text-secondary)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(entry.content || "").slice(0, 200)}
                    </td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 10, fontWeight: 600,
                        background: `${qualityColor(entry.quality_score)}22`,
                        color: qualityColor(entry.quality_score),
                      }}>
                        {(entry.quality_score ?? 0).toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: 11 }}>
                      {entry.project || "-"}
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {toKSTShort(entry.updated_at)}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <button
                        onClick={() => setDeleteTarget({ source: entry.source, id: entry.id })}
                        style={{
                          background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)",
                          borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger)"; e.currentTarget.style.color = "#fff"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--danger)"; }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: page > 1 ? "pointer" : "default",
                opacity: page <= 1 ? 0.4 : 1,
              }}
            >
              &lt;
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    background: p === page ? "var(--accent)" : "var(--bg-hover)",
                    color: p === page ? "#fff" : "var(--text-primary)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: p === page ? 700 : 400,
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: page < totalPages ? "pointer" : "default",
                opacity: page >= totalPages ? 0.4 : 1,
              }}
            >
              &gt;
            </button>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 8 }}>
              총 {totalEntries}건
            </span>
          </div>
        )}
      </section>

      {/* ─── 삭제 확인 모달 ────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            style={{
              ...cardStyle, width: 360, padding: 24,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
              메모리 삭제 확인
            </h4>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
              [{deleteTarget.source}] ID: {deleteTarget.id}<br />
              이 메모리를 정말 삭제하시겠습니까?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "6px 16px", fontSize: 12, cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  background: "var(--danger)", color: "#fff", border: "none",
                  borderRadius: 6, padding: "6px 16px", fontSize: 12, cursor: "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
