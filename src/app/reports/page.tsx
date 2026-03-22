"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/Header";

interface StrategyReport {
  id: number;
  project_id?: string;
  direction: string;
  recommendation?: string;
  cost_usd: number;
  created_at: string;
}

interface Plan {
  id: number;
  project_id?: string;
  selected_candidate_id: string;
  status: string;
  cost_usd: number;
  created_at: string;
}

interface Artifact {
  id: number;
  project_id: string;
  artifact_type: string;
  artifact_name: string;
  content: Record<string, unknown>;
  created_at: string;
}

type ListItem = { type: "strategy"; data: StrategyReport } | { type: "plan"; data: Plan } | { type: "artifact"; data: Artifact };

export default function ReportsPage() {
  const [reports, setReports] = useState<StrategyReport[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"strategy"|"plans"|"artifacts">("strategy");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const listRef = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

  useEffect(() => {
    Promise.all([
      fetch(`${API}/strategy-reports`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/project-plans`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/artifacts`).then(r => r.json()).catch(() => ({})),
    ]).then(([r, p, a]) => {
      setReports(r.reports || []);
      setPlans(p.plans || []);
      setArtifacts(a.artifacts || []);
      setLoading(false);
    });
  }, [API]);

  const filteredReports = reports.filter(r =>
    r.direction.toLowerCase().includes(search.toLowerCase()) ||
    (r.project_id || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredPlans = plans.filter(p =>
    (p.project_id || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredArtifacts = artifacts.filter(a =>
    (typeFilter === "all" || a.artifact_type === typeFilter) &&
    (a.artifact_name.toLowerCase().includes(search.toLowerCase()) ||
     a.project_id.toLowerCase().includes(search.toLowerCase()))
  );
  const artifactTypes = ["all", ...new Set(artifacts.map(a => a.artifact_type))];

  const currentList: ListItem[] =
    tab === "strategy" ? filteredReports.map(d => ({ type: "strategy", data: d })) :
    tab === "plans" ? filteredPlans.map(d => ({ type: "plan", data: d })) :
    filteredArtifacts.map(d => ({ type: "artifact", data: d }));

  // 탭/검색 변경 시 선택 초기화
  useEffect(() => { setSelectedIdx(0); }, [tab, search, typeFilter]);

  // 키보드 네비게이션
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, currentList.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
  }, [currentList.length]);

  // 선택 항목이 목록 뷰포트에 보이도록 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  const selected = currentList[selectedIdx];

  const fmtDate = (s: string) => new Date(s).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const renderDetail = () => {
    if (!selected) return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-secondary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📄</div>
          <div>항목을 선택하세요</div>
        </div>
      </div>
    );

    if (selected.type === "strategy") {
      const r = selected.data;
      return (
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>{r.direction}</h2>
          {r.recommendation && <div style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(59,130,246,0.08)", color: "#3b82f6", marginBottom: "16px", fontSize: "14px" }}>💡 추천: {r.recommendation}</div>}
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>💰 ${r.cost_usd?.toFixed(4)}</span>
            <span>📅 {fmtDate(r.created_at)}</span>
            {r.project_id && <span>🔗 #{r.project_id.slice(0,8)}</span>}
          </div>
        </div>
      );
    }

    if (selected.type === "plan") {
      const p = selected.data;
      return (
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>기획서 #{p.id}</h2>
          <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "20px", color: "#fff", fontSize: "12px", fontWeight: 600, background: p.status === "approved" ? "#16a34a" : "#6366f1", marginBottom: "16px" }}>{p.status}</div>
          <div style={{ fontSize: "14px", marginBottom: "12px" }}>후보 ID: <code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: "4px" }}>{p.selected_candidate_id}</code></div>
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-secondary)" }}>
            <span>💰 ${p.cost_usd?.toFixed(4)}</span>
            <span>📅 {fmtDate(p.created_at)}</span>
          </div>
        </div>
      );
    }

    if (selected.type === "artifact") {
      const a = selected.data;
      const contentStr = typeof a.content === "object" ? JSON.stringify(a.content, null, 2) : String(a.content);
      return (
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{a.artifact_type}</span>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{a.artifact_name}</h2>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
            <span>🔗 #{a.project_id.slice(0,8)}</span>
            <span>📅 {fmtDate(a.created_at)}</span>
          </div>
          <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", fontSize: "12px", lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "calc(100vh - 300px)" }}>{contentStr}</pre>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: "none" }}>
      <Header title="보고서 열람" />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 좌측: 목록 (35%) */}
        <div style={{ width: "35%", minWidth: "280px", maxWidth: "420px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
          {/* 검색 + 필터 */}
          <div style={{ padding: "12px", borderBottom: "1px solid var(--border)" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="검색..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "13px" }}
            />
            {tab === "artifacts" && (
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "12px", marginTop: "8px" }}
              >
                {artifactTypes.map(t => <option key={t} value={t}>{t === "all" ? "전체 유형" : t}</option>)}
              </select>
            )}
          </div>

          {/* 탭 */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {([
              { key: "strategy" as const, label: "시장조사", icon: "📊", count: reports.length },
              { key: "plans" as const, label: "기획서", icon: "📄", count: plans.length },
              { key: "artifacts" as const, label: "산출물", icon: "📦", count: artifacts.length },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: "10px 4px", fontSize: "11px", fontWeight: 600,
                  border: "none", background: "none", cursor: "pointer",
                  color: tab === t.key ? "#6366f1" : "var(--text-secondary)",
                  borderBottom: tab === t.key ? "2px solid #6366f1" : "2px solid transparent",
                }}
              >
                {t.icon} {t.label} ({t.count})
              </button>
            ))}
          </div>

          {/* 목록 */}
          <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>로딩 중...</div>
            ) : currentList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>데이터 없음</div>
            ) : (
              currentList.map((item, idx) => {
                const isSelected = idx === selectedIdx;
                const title = item.type === "strategy" ? item.data.direction
                  : item.type === "plan" ? `기획서 #${item.data.id}`
                  : item.data.artifact_name;
                const sub = item.type === "strategy" ? item.data.recommendation
                  : item.type === "plan" ? `후보: ${item.data.selected_candidate_id.slice(0,12)}`
                  : item.data.artifact_type;
                const date = fmtDate(item.data.created_at);

                return (
                  <div
                    key={`${item.type}-${item.data.id}`}
                    data-idx={idx}
                    onClick={() => setSelectedIdx(idx)}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      background: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                      borderLeft: isSelected ? "3px solid #6366f1" : "3px solid transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.04)"; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: isSelected ? 600 : 500, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                    {sub && <div style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
                    <div style={{ fontSize: "10px", color: "var(--text-secondary)", opacity: 0.7, marginTop: "4px" }}>{date}</div>
                  </div>
                );
              })
            )}
          </div>

          {/* 네비게이션 힌트 */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: "10px", color: "var(--text-secondary)", textAlign: "center" }}>
            ↑↓ 키보드 · 클릭 선택 · {currentList.length}건
          </div>
        </div>

        {/* 우측: 본문 (65%) */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-main, #fff)" }}>
          {renderDetail()}
        </div>
      </div>
    </div>
  );
}
