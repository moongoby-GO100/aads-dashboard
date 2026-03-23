"use client";
import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

/* ── helpers ── */
function toKSTShort(dtStr: string | null | undefined): string {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr.slice(5, 10);
    return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).replace(/\.\s*/g, "/").replace(/\/$/, "");
  } catch { return "-"; }
}

function qualityColor(score: number): string {
  if (score >= 0.7) return "var(--success)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--danger)";
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#ec4899"];

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

/* ── SVG Bar Chart (14-day trend) ── */
function DailyBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 20 }}>데이터 없음</div>;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const W = Math.max(data.length * 40, 280);
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} 130`} style={{ width: "100%", minWidth: 280, height: 130 }}>
        {data.map((d, i) => {
          const barH = (d.count / maxVal) * 80;
          const x = i * 40 + 4;
          const y = 90 - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={32} height={barH} rx={3} fill="var(--accent)" opacity={0.85} />
              <text x={x + 16} y={108} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">{d.date.slice(5)}</text>
              {d.count > 0 && <text x={x + 16} y={y - 3} textAnchor="middle" fontSize={8} fill="var(--text-primary)">{d.count}</text>}
            </g>
          );
        })}
        <line x1={0} y1={90} x2={W} y2={90} stroke="var(--border)" strokeWidth={1} />
      </svg>
    </div>
  );
}

/* ── SVG Donut Chart (category distribution) ── */
function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: 20 }}>데이터 없음</div>;
  const R = 40, r = 24;
  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const x1o = 50 + R * Math.cos(startAngle), y1o = 50 + R * Math.sin(startAngle);
    const x2o = 50 + R * Math.cos(cumAngle), y2o = 50 + R * Math.sin(cumAngle);
    const x1i = 50 + r * Math.cos(cumAngle), y1i = 50 + r * Math.sin(cumAngle);
    const x2i = 50 + r * Math.cos(startAngle), y2i = 50 + r * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { d: `M ${x1o} ${y1o} A ${R} ${R} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${r} ${r} 0 ${largeArc} 0 ${x2i} ${y2i} Z`, color: COLORS[i % COLORS.length], label: d.label, value: d.value };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width: 110, height: 110, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.85} />)}
        <text x={50} y={53} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">{total}</text>
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

/* ── Main Page ── */
export default function MemoryDashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);

  const [filterCategory, setFilterCategory] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ source: string; id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deduplicating, setDeduplicating] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getOpsMemoryStats();
      setStats(data);
    } catch (e) { console.error("Memory stats error:", e); }
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const data = await api.getOpsMemoryEntries({
        category: filterCategory || undefined,
        project: filterProject || undefined,
        search: searchText || undefined,
        page,
        page_size: pageSize,
      });
      setEntries(data.items || data.entries || []);
      setTotalEntries(data.total || 0);
    } catch (e) { console.error("Memory entries error:", e); }
  }, [filterCategory, filterProject, searchText, page]);

  const fetchAll = useCallback(async () => {
    await Promise.allSettled([fetchStats(), fetchEntries()]);
    setLoading(false);
  }, [fetchStats, fetchEntries]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchStats, 60000);
    return () => clearInterval(t);
  }, [fetchAll, fetchStats]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteOpsMemoryEntry(deleteTarget.source, String(deleteTarget.id));
      setDeleteTarget(null);
      await fetchAll();
    } catch (e) { alert("삭제 실패: " + String(e)); }
    finally { setDeleting(false); }
  };

  const handleSearch = () => { setSearchText(searchInput); setPage(1); };

  const handleDeduplicate = async () => {
    if (!confirm("메모리 중복 정리를 실행하시겠습니까?\n중복 항목은 아카이브에 백업 후 삭제됩니다.")) return;
    setDeduplicating(true);
    try {
      const result = await api.deduplicateOpsMemory();
      alert(`중복 정리 완료: ${result.removed ?? 0}건 제거, ${result.kept ?? 0}건 유지`);
      await fetchAll();
    } catch (e) { alert("중복 정리 실패: " + String(e)); }
    finally { setDeduplicating(false); }
  };

  const handleExportCSV = () => {
    if (entries.length === 0) return;
    const header = "카테고리,키,내용,품질,프로젝트,갱신일\n";
    const rows = entries.map((e) =>
      [e.category, e.key, `"${(e.value || e.content || "").replace(/"/g, '""').slice(0, 200)}"`, e.confidence ?? e.quality_score ?? "", e.project || "", toKSTShort(e.updated_at || e.created_at)].join(",")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `memory_entries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Derive from API response structure
  const totalCount = (stats?.total_observations ?? 0) + (stats?.total_session_notes ?? 0) + (stats?.total_meta_memory ?? 0);
  const avgQuality = stats?.avg_confidence ?? 0;
  const todayCount = stats?.today_learned ?? 0;
  const qualityDist = stats?.quality_distribution ?? {};
  const activeLow = qualityDist.low ?? 0;
  const activeCorrections = qualityDist.medium ?? 0;

  const dailyTrend: { date: string; count: number }[] = stats?.daily_trend || [];
  const categoryDistData: { label: string; value: number }[] = (stats?.categories || []).map((c: { name: string; count: number }) => ({ label: c.name, value: c.count }));
  const categoryNames: string[] = (stats?.categories || []).map((c: { name: string }) => c.name);
  const projectNames: string[] = (stats?.projects || []).map((p: { project: string }) => p.project);

  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="메모리 진화 모니터링" />
      <div style={{ padding: "24px 16px", maxWidth: 1280, margin: "0 auto" }}>

        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>🧠 메모리 진화 대시보드</h2>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>자동 새로고침: 60초</span>
        </div>

        {/* ── 상단: 통계 카드 4개 ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>총 학습량</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>
              {loading ? "..." : totalCount.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>평균 품질</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: qualityColor(avgQuality) }}>
              {loading ? "..." : avgQuality.toFixed(2)}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>오늘 학습</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>
              +{loading ? "..." : todayCount}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>활성 교정</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>
              {loading ? "..." : (activeCorrections + activeLow)}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
            </div>
          </div>
        </div>

        {/* ── 중단: 차트 영역 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <section style={{ ...cardStyle, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>일별 학습 추이 (14일)</h3>
            <DailyBarChart data={dailyTrend} />
          </section>
          <section style={{ ...cardStyle, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>카테고리별 분포</h3>
            <DonutChart data={categoryDistData} />
          </section>
        </div>

        {/* ── 하단: 메모리 목록 테이블 ── */}
        <section style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>메모리 목록</h3>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none" }}>
              <option value="">전체 카테고리</option>
              {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none" }}>
              <option value="">전체 프로젝트</option>
              {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <div style={{ display: "flex", gap: 4 }}>
              <input type="text" placeholder="검색..." value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", width: 160 }}
              />
              <button onClick={handleSearch}
                style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                검색
              </button>
            </div>

            <button onClick={handleDeduplicate} disabled={deduplicating}
              style={{ background: "var(--warning)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: deduplicating ? "default" : "pointer", opacity: deduplicating ? 0.6 : 1, marginLeft: "auto" }}>
              {deduplicating ? "정리 중..." : "중복 정리"}
            </button>
            <button onClick={handleExportCSV}
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["카테고리", "키", "내용 (200자 미리보기)", "품질", "갱신일", "액션"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 6px", color: "var(--text-secondary)", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>{loading ? "로딩 중..." : "데이터 없음"}</td></tr>
                ) : entries.map((entry) => {
                  const conf = entry.confidence ?? entry.quality_score ?? 0;
                  return (
                    <tr key={`${entry.source}-${entry.id}`} style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: `${COLORS[Math.abs(hashCode(entry.category || "")) % COLORS.length]}22`,
                          color: COLORS[Math.abs(hashCode(entry.category || "")) % COLORS.length] }}>
                          {entry.category || "-"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.key || entry.id || "-"}
                      </td>
                      <td style={{ padding: "8px 6px", color: "var(--text-secondary)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(entry.value || entry.content || "").slice(0, 200)}
                      </td>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: `${qualityColor(conf)}22`, color: qualityColor(conf) }}>
                          {conf.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {toKSTShort(entry.updated_at || entry.created_at)}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <button onClick={() => setDeleteTarget({ source: entry.source, id: String(entry.id) })}
                          style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger)"; e.currentTarget.style.color = "#fff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--danger)"; }}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: page > 1 ? "pointer" : "default", opacity: page <= 1 ? 0.4 : 1 }}>
                &lt;
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ background: p === page ? "var(--accent)" : "var(--bg-hover)", color: p === page ? "#fff" : "var(--text-primary)",
                      border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: p === page ? 700 : 400 }}>
                    {p}
                  </button>
                );
              })}
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: page < totalPages ? "pointer" : "default", opacity: page >= totalPages ? 0.4 : 1 }}>
                &gt;
              </button>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 8 }}>총 {totalEntries}건</span>
            </div>
          )}
        </section>

        {/* ── 삭제 확인 모달 ── */}
        {deleteTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => !deleting && setDeleteTarget(null)}>
            <div style={{ ...cardStyle, width: 360, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>메모리 삭제 확인</h4>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
                [{deleteTarget.source}] ID: {deleteTarget.id}<br />이 메모리를 정말 삭제하시겠습니까?
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 16px", fontSize: 12, cursor: "pointer" }}>
                  취소
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 12, cursor: "pointer", opacity: deleting ? 0.6 : 1 }}>
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 반응형: 모바일에서 차트 1열 */}
      <style>{`@media(max-width:768px){div[style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
