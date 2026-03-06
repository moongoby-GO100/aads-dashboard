"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  created_at: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<StrategyReport[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState<"strategy"|"plans"|"artifacts">("strategy");
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

  const artifactTypes = ["all", ...new Set(artifacts.map(a => a.artifact_type))];

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

  return (
    <div className="flex flex-col h-full">
      <Header title="보고서 열람" />
      <div className="flex-1 p-6 overflow-auto">
        {/* 검색 + 필터 */}
        <div className="mb-4 flex gap-3 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색..."
            className="px-3 py-2 rounded-lg border text-sm"
            style={{borderColor:"var(--border)",background:"var(--bg-card)",minWidth:200}}
          />
          {tab === "artifacts" && (
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{borderColor:"var(--border)",background:"var(--bg-card)"}}
            >
              {artifactTypes.map(t => <option key={t} value={t}>{t === "all" ? "전체 유형" : t}</option>)}
            </select>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-4">
          {(["strategy","plans","artifacts"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={tab === t ? {background:"var(--accent)",color:"#fff"} : {background:"var(--bg-card)",color:"var(--text-secondary)",border:"1px solid var(--border)"}}
            >
              {t === "strategy" ? `📊 시장조사 보고서 (${reports.length})` : t === "plans" ? `📄 기획서 (${plans.length})` : `📦 산출물 (${artifacts.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : (
          <>
            {tab === "strategy" && (
              <div className="space-y-3">
                {filteredReports.length === 0 ? <p className="text-gray-400">데이터 없음</p> :
                  filteredReports.map(r => (
                    <div key={r.id} className="p-4 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{r.direction}</h3>
                          {r.recommendation && <p className="text-sm text-blue-600 mt-0.5">추천: {r.recommendation}</p>}
                          {r.project_id && (
                            <Link href={`/projects/${r.project_id}`} className="text-xs text-gray-400 hover:text-blue-500 mt-1 block">
                              프로젝트 #{r.project_id.slice(0,8)}
                            </Link>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <div>${r.cost_usd?.toFixed(4)}</div>
                          <div>{new Date(r.created_at).toLocaleString("ko-KR")}</div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
            {tab === "plans" && (
              <div className="space-y-3">
                {filteredPlans.length === 0 ? <p className="text-gray-400">데이터 없음</p> :
                  filteredPlans.map(p => (
                    <div key={p.id} className="p-4 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">기획서 #{p.id}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">후보 ID: {p.selected_candidate_id}</p>
                          {p.project_id && (
                            <Link href={`/projects/${p.project_id}/approve-plan`} className="text-xs text-blue-500 hover:underline mt-1 block">
                              승인 페이지 →
                            </Link>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          <span className="px-2 py-0.5 rounded-full text-white" style={{background: p.status === "approved" ? "#16a34a" : "var(--accent)"}}>
                            {p.status}
                          </span>
                          <div className="text-gray-400 mt-1">{new Date(p.created_at).toLocaleString("ko-KR")}</div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
            {tab === "artifacts" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredArtifacts.length === 0 ? <p className="text-gray-400">데이터 없음</p> :
                  filteredArtifacts.map(a => (
                    <div key={a.id} className="p-3 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
                      <div className="text-xs px-2 py-0.5 rounded inline-block mb-2" style={{background:"var(--accent)20",color:"var(--accent)"}}>
                        {a.artifact_type}
                      </div>
                      <h3 className="font-medium text-sm">{a.artifact_name}</h3>
                      <Link href={`/projects/${a.project_id}`} className="text-xs text-gray-400 hover:text-blue-500 block mt-1">
                        프로젝트 #{a.project_id.slice(0,8)}
                      </Link>
                      <p className="text-xs text-gray-400 mt-1">{new Date(a.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                  ))
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
