"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Candidate {
  id: string;
  title?: string;
  description?: string;
  tam?: number;
  sam?: number;
  som?: number;
  mvp_cost?: number;
  competitive_advantage?: string;
  risk?: string;
  score?: number;
}

interface StrategyReport {
  id: number;
  direction: string;
  candidates: Candidate[];
  recommendation?: string;
  strategy_report?: Record<string, unknown>;
  created_at: string;
}

export default function SelectItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [reports, setReports] = useState<StrategyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [newDirection, setNewDirection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/strategy-reports?project_id=${id}`)
      .then(r => r.json())
      .then(d => { setReports(d.reports || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, API]);

  const doSelect = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/projects/${id}/checkpoint/select-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: selected }),
      });
      const d = await r.json();
      setMsg(r.ok ? "✅ 선택 완료! 다음 단계로 진행합니다." : `❌ 오류: ${JSON.stringify(d)}`);
      if (r.ok) setTimeout(() => router.push(`/projects/${id}`), 2000);
    } catch(e) { setMsg(`❌ 네트워크 오류`); }
    setSubmitting(false);
  };

  const doRevise = async () => {
    if (!newDirection.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/projects/${id}/checkpoint/revise-direction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_direction: newDirection }),
      });
      const d = await r.json();
      setMsg(r.ok ? "✅ 방향 수정 요청 완료" : `❌ ${JSON.stringify(d)}`);
    } catch(e) { setMsg("❌ 오류"); }
    setSubmitting(false);
  };

  const doResearch = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/projects/${id}/checkpoint/research-more`, { method: "POST" });
      const d = await r.json();
      setMsg(r.ok ? "✅ 추가 조사 요청 완료" : `❌ ${JSON.stringify(d)}`);
    } catch(e) { setMsg("❌ 오류"); }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title={`체크포인트 1 — 아이템 선택 #${id?.slice(0,8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600">대시보드</Link> / 
          <Link href="/projects" className="hover:text-blue-600"> Pipeline</Link> / 
          <Link href={`/projects/${id}`} className="hover:text-blue-600"> #{id?.slice(0,8)}</Link> / 아이템 선택
        </div>

        {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 text-blue-700">{msg}</div>}

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : reports.length === 0 ? (
          <div className="text-center text-gray-500 py-12">전략 보고서가 없습니다. 프로젝트가 full_cycle 모드로 실행 중인지 확인하세요.</div>
        ) : (
          <>
            {reports.map(report => (
              <div key={report.id} className="mb-6">
                <div className="mb-4 p-4 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
                  <h2 className="font-semibold text-lg mb-1">방향: {report.direction}</h2>
                  <p className="text-xs text-gray-400">{new Date(report.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
                  {report.recommendation && <p className="mt-2 text-sm text-blue-600">추천: {report.recommendation}</p>}
                </div>

                {/* 후보 카드 목록 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(report.candidates || []).map((c, i) => (
                    <div
                      key={c.id || i}
                      onClick={() => setSelected(c.id || String(i))}
                      className="p-4 rounded-lg border cursor-pointer transition-all"
                      style={{
                        borderColor: selected === (c.id || String(i)) ? "var(--accent)" : "var(--border)",
                        background: selected === (c.id || String(i)) ? "var(--accent)20" : "var(--bg-card)",
                        outline: selected === (c.id || String(i)) ? "2px solid var(--accent)" : "none",
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium">{c.title || `후보 ${i+1}`}</h3>
                        {c.score !== undefined && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:"var(--accent)",color:"#fff"}}>
                            {(c.score * 100).toFixed(0)}점
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{c.description}</p>
                      {(c.tam || c.sam || c.som) && (
                        <div className="space-y-1 mb-3">
                          {[["TAM", c.tam], ["SAM", c.sam], ["SOM", c.som]].map(([label, val]) => (
                            val && <div key={label as string} className="flex items-center gap-2 text-xs">
                              <span className="w-8 text-gray-400">{label}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full" style={{width:`${Math.min(100,(val as number)/1000000000*100)}%`,background:"var(--accent)"}}/>
                              </div>
                              <span className="text-gray-500">{val ? `$${(val as number/1e8).toFixed(0)}억` : "-"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {c.competitive_advantage && <p className="text-xs text-green-600 mb-1">✓ {c.competitive_advantage}</p>}
                      {c.risk && <p className="text-xs text-red-500">⚠ {c.risk}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 액션 버튼 */}
            <div className="mt-6 flex flex-col gap-4 max-w-2xl">
              <button
                onClick={doSelect}
                disabled={!selected || submitting}
                className="px-6 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{background:"var(--accent)"}}
              >
                {submitting ? "처리 중..." : "✅ 선택한 아이템으로 진행"}
              </button>

              <div className="flex gap-2">
                <input
                  value={newDirection}
                  onChange={e => setNewDirection(e.target.value)}
                  placeholder="새로운 방향 입력 (예: B2B SaaS 모델로 변경)"
                  className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  style={{borderColor:"var(--border)",background:"var(--bg-card)"}}
                />
                <button
                  onClick={doRevise}
                  disabled={!newDirection.trim() || submitting}
                  className="px-4 py-2 rounded-lg text-sm border disabled:opacity-50"
                  style={{borderColor:"var(--border)"}}
                >
                  방향 수정
                </button>
              </div>

              <button
                onClick={doResearch}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{borderColor:"var(--border)"}}
              >
                🔍 추가 조사 요청
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
