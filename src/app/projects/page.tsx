"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const STAGE_ORDER = ["requirements", "design", "development", "testing", "judging", "deployment"];
const AGENT_LABELS: Record<string, string> = {
  pm: "PM",
  architect: "Architect",
  developer: "Developer",
  qa: "QA",
  judge: "Judge",
  devops: "DevOps",
};

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    checkpoint_pending: "var(--warning)",
    running: "var(--accent)",
    completed: "var(--success)",
    error: "var(--danger)",
  };
  const color = colorMap[status] || "var(--text-secondary)";
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold"
      style={{ background: `${color}22`, color, border: `1px solid ${color}` }}>
      {status}
    </span>
  );
}

export default function PipelinePage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [costView, setCostView] = useState<Record<string, any>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const r = await api.getProjects();
      setProjects(Array.isArray(r.projects) ? r.projects : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!description.trim()) return;
    setCreating(true);
    try {
      await api.createProject(description);
      setDescription("");
      await fetchProjects();
    } catch (e: any) {
      alert("생성 실패: " + (e.message || "알 수 없는 오류"));
    }
    setCreating(false);
  };

  const handleAutoRun = async (id: string) => {
    try {
      await api.autoRunProject(id);
      await fetchProjects();
    } catch (e: any) {
      alert("자동 실행 실패: " + (e.message || "알 수 없는 오류"));
    }
  };

  const handleResume = async (id: string, approved: boolean) => {
    const feedback = feedbackMap[id] || (approved ? "승인" : "반려");
    try {
      await api.resumeProject(id, approved, feedback);
      setFeedbackMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
      await fetchProjects();
    } catch (e: any) {
      alert("처리 실패: " + (e.message || "알 수 없는 오류"));
    }
  };

  const handleViewCosts = async (id: string) => {
    if (costView[id]) {
      setCostView((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    try {
      const r = await api.getProjectCosts(id);
      setCostView((prev) => ({ ...prev, [id]: r.costs ?? r }));
    } catch (e: any) {
      alert("비용 조회 실패: " + (e.message || "알 수 없는 오류"));
    }
  };

  return (
    <div style={{ background: "var(--bg-primary)" }} className="flex flex-col h-full">
      <Header title="Pipeline — 프로젝트 개발" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 프로젝트 생성 폼 */}
        <div className="rounded-xl p-4 mb-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            새 프로젝트 생성
          </h2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="만들고 싶은 프로젝트를 설명하세요... (예: 계산기 앱, TODO 리스트 등)"
            className="w-full rounded-lg p-3 text-sm mb-3 resize-none h-24"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !description.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {creating ? "생성 중..." : "🚀 프로젝트 생성"}
          </button>
        </div>

        {/* 프로젝트 목록 */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl p-8 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            아직 생성된 파이프라인 프로젝트가 없습니다. 위에서 프로젝트를 생성해보세요.
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((p: any) => {
              const id = p.project_id || p.id || p.name;
              const stage = p.checkpoint_stage || "";
              const progress = p.progress_percent ?? 0;
              const currentAgent = p.current_agent || "";
              const cost = p.total_cost_usd ?? p.cost ?? null;
              const llmCalls = p.llm_calls ?? p.api_calls ?? null;
              const isInterrupted = stage === "interrupted" || p.status === "checkpoint_pending";
              const costs = costView[id];

              return (
                <div key={id} className="rounded-xl p-4"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

                  {/* 헤더: ID + 상태 */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                        {p.name || id}
                      </h3>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        ({id})
                      </span>
                    </div>
                    <StatusBadge status={p.status || stage || "unknown"} />
                  </div>

                  {/* 현재 에이전트 */}
                  {currentAgent && (
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {["pm", "architect", "developer", "qa", "judge", "devops"].map((ag) => (
                        <span key={ag}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: currentAgent.toLowerCase().includes(ag) ? "var(--accent)" : "var(--bg-hover)",
                            color: currentAgent.toLowerCase().includes(ag) ? "#fff" : "var(--text-secondary)",
                          }}>
                          {AGENT_LABELS[ag] || ag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 진행 단계 바 */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                      <span>진행률</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full mb-1" style={{ background: "var(--bg-hover)" }}>
                      <div className="h-2 rounded-full transition-all"
                        style={{ background: "var(--accent)", width: `${progress}%` }} />
                    </div>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {STAGE_ORDER.map((s) => {
                        const active = stage && stage.toLowerCase().includes(s.split("ing")[0]);
                        return (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              background: active ? "var(--accent)" : "var(--bg-hover)",
                              color: active ? "#fff" : "var(--text-secondary)",
                            }}>
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* LLM 호출 / 비용 */}
                  <div className="flex items-center gap-4 text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                    {llmCalls !== null && <span>LLM 호출: {llmCalls}회</span>}
                    {cost !== null && <span>비용: ${typeof cost === "number" ? cost.toFixed(4) : cost}</span>}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleAutoRun(id)}
                      className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      ▶ 자동 실행
                    </button>

                    {isInterrupted && (
                      <>
                        <button
                          onClick={() => handleResume(id, true)}
                          className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors"
                          style={{ background: "var(--success)", color: "#fff" }}>
                          ✅ 승인
                        </button>
                        <input
                          type="text"
                          placeholder="반려 사유 입력..."
                          value={feedbackMap[id] || ""}
                          onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [id]: e.target.value }))}
                          className="flex-1 min-w-[120px] px-2 py-1 text-xs rounded-lg"
                          style={{
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <button
                          onClick={() => handleResume(id, false)}
                          className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors"
                          style={{ background: "var(--danger)", color: "#fff" }}>
                          ❌ 반려
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleViewCosts(id)}
                      className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                      style={{
                        background: costs ? "var(--bg-hover)" : "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                      }}>
                      {costs ? "비용 닫기" : "💰 비용 상세"}
                    </button>
                  </div>

                  {/* 비용 상세 */}
                  {costs && (
                    <div className="mt-3 p-3 rounded-lg text-xs"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(costs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
