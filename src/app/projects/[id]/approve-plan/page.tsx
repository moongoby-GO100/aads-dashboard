"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Phase { name: string; duration?: string; deliverables?: string[] }
interface Plan {
  id: number;
  project_id: string;
  prd: Record<string, unknown>;
  architecture: Record<string, unknown>;
  phase_plan: Phase[];
  debate_log: {round?: number; proposer?: string; argument?: string}[];
  status: string;
  created_at: string;
}

export default function ApprovePlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeTab, setActiveTab] = useState<"prd"|"arch"|"phase"|"debate">("prd");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/project-plans?project_id=${id}`)
      .then(r => r.json())
      .then(d => { setPlans(d.plans || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, API]);

  const plan = plans[0];

  const doApprove = async () => {
    if (!plan) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/project-plans/${plan.id}/approve`, { method: "PATCH" });
      const d = await r.json();
      setMsg(r.ok ? "✅ 기획서 승인 완료! 개발 단계로 진행합니다." : `❌ ${JSON.stringify(d)}`);
      if (r.ok) setTimeout(() => router.push(`/projects/${id}`), 2000);
    } catch(e) { setMsg("❌ 오류"); }
    setSubmitting(false);
  };

  const doRevise = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/projects/${id}/checkpoint/revise-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const d = await r.json();
      setMsg(r.ok ? "✅ 수정 요청 완료" : `❌ ${JSON.stringify(d)}`);
    } catch(e) { setMsg("❌ 오류"); }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title={`체크포인트 2 — 기획서 승인 #${id?.slice(0,8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600">대시보드</Link> / 
          <Link href="/projects" className="hover:text-blue-600"> Pipeline</Link> / 
          <Link href={`/projects/${id}`} className="hover:text-blue-600"> #{id?.slice(0,8)}</Link> / 기획서 승인
        </div>

        {msg && <div className="mb-4 p-3 rounded-lg text-sm bg-blue-50 text-blue-700">{msg}</div>}

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : !plan ? (
          <div className="text-center text-gray-500 py-12">기획서가 없습니다.</div>
        ) : (
          <div className="space-y-6">
            {/* 탭 네비게이션 */}
            <div className="flex gap-2 flex-wrap">
              {(["prd","arch","phase","debate"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={activeTab === tab ? {background:"var(--accent)",color:"#fff"} : {background:"var(--bg-card)",color:"var(--text-secondary)",border:"1px solid var(--border)"}}
                >
                  {tab === "prd" ? "📄 PRD" : tab === "arch" ? "🏗 아키텍처" : tab === "phase" ? "📅 Phase 계획" : "💬 토론 이력"}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-4 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
              {activeTab === "prd" && (
                <div>
                  <h2 className="font-semibold text-lg mb-4">PRD (Product Requirements Document)</h2>
                  {Object.entries(plan.prd || {}).map(([k,v]) => (
                    <details key={k} className="mb-3 border rounded-lg overflow-hidden" style={{borderColor:"var(--border)"}}>
                      <summary className="px-4 py-2 cursor-pointer font-medium" style={{background:"var(--bg-hover)"}}>{k}</summary>
                      <div className="px-4 py-3 text-sm text-gray-600 whitespace-pre-wrap">
                        {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {activeTab === "arch" && (
                <div>
                  <h2 className="font-semibold text-lg mb-4">아키텍처</h2>
                  {Object.entries(plan.architecture || {}).map(([k,v]) => (
                    <details key={k} className="mb-3 border rounded-lg overflow-hidden" style={{borderColor:"var(--border)"}}>
                      <summary className="px-4 py-2 cursor-pointer font-medium" style={{background:"var(--bg-hover)"}}>{k}</summary>
                      <div className="px-4 py-3 text-sm text-gray-600 whitespace-pre-wrap">
                        {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {activeTab === "phase" && (
                <div>
                  <h2 className="font-semibold text-lg mb-4">Phase 계획</h2>
                  <div className="relative">
                    {(plan.phase_plan || []).map((phase, i) => (
                      <div key={i} className="flex gap-4 mb-6">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{background:"var(--accent)"}}>{i+1}</div>
                          {i < (plan.phase_plan||[]).length-1 && <div className="w-0.5 flex-1 mt-1" style={{background:"var(--border)"}}/>}
                        </div>
                        <div className="flex-1 pb-4">
                          <h3 className="font-medium">{phase.name}</h3>
                          {phase.duration && <p className="text-xs text-gray-400">{phase.duration}</p>}
                          {(phase.deliverables||[]).map((d,j) => <p key={j} className="text-sm text-gray-500">• {d}</p>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === "debate" && (
                <div>
                  <h2 className="font-semibold text-lg mb-4">토론 이력</h2>
                  {(plan.debate_log || []).length === 0 ? (
                    <p className="text-gray-400">토론 이력 없음</p>
                  ) : (
                    <div className="space-y-3">
                      {plan.debate_log.map((log, i) => (
                        <div key={i} className="p-3 rounded-lg text-sm" style={{background:"var(--bg-hover)"}}>
                          <span className="font-medium text-xs text-gray-400">라운드 {log.round} · {log.proposer}</span>
                          <p className="mt-1">{log.argument}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 승인/수정 액션 */}
            <div className="flex flex-col gap-3 max-w-2xl">
              <button
                onClick={doApprove}
                disabled={submitting || plan.status === "approved"}
                className="px-6 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{background:"#16a34a"}}
              >
                {plan.status === "approved" ? "✅ 이미 승인됨" : submitting ? "처리 중..." : "✅ 기획서 승인"}
              </button>
              <div className="flex gap-2">
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="수정 요청 내용 입력 (예: 경쟁사 분석 보강, B2B 전략 구체화)"
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm resize-none"
                  style={{borderColor:"var(--border)",background:"var(--bg-card)"}}
                />
                <button
                  onClick={doRevise}
                  disabled={!feedback.trim() || submitting}
                  className="px-4 py-2 rounded-lg text-sm border self-stretch disabled:opacity-50"
                  style={{borderColor:"var(--border)"}}
                >
                  수정 요청
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
