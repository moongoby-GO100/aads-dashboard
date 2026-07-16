"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

const PIPELINE_STAGES = [
  { key: "market_research",    label: "시장조사",      icon: "🔍" },
  { key: "item_selection",     label: "아이템 선택",   icon: "🎯", isCEO: true },
  { key: "tech_evaluation",    label: "기술 평가",     icon: "🔬" },
  { key: "debate_loop",        label: "토론 루프",     icon: "💬" },
  { key: "plan_approval",      label: "기획서 승인",   icon: "✅", isCEO: true },
  { key: "pm",                 label: "PM",            icon: "📋" },
  { key: "architect",          label: "Architect",     icon: "🏗" },
  { key: "developer",          label: "Developer",     icon: "💻" },
  { key: "qa",                 label: "QA",            icon: "🧪" },
  { key: "deployment",         label: "배포",          icon: "🚀" },
];

type StageStatus = "pending" | "running" | "completed" | "error" | "ceo_waiting";

interface Artifact {
  id: number;
  artifact_type: string;
  artifact_name: string;
  content: Record<string, unknown>;
  created_at: string;
}

export default function FullCyclePage() {
  const { id } = useParams<{ id: string }>();
  const [stages, setStages] = useState<Record<string, StageStatus>>({});
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(true);
  const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

  useEffect(() => {
    if (!id) return;
    // Load project status
    fetch(`${API}/projects/${id}/status`)
      .then(r => r.json())
      .then(d => {
        const stage = d.checkpoint_stage || "";
        const newStages: Record<string, StageStatus> = {};
        let found = false;
        PIPELINE_STAGES.forEach(s => {
          if (found) { newStages[s.key] = "pending"; return; }
          if (s.key === stage) {
            newStages[s.key] = d.status === "checkpoint_pending" ? "ceo_waiting" : "running";
            found = true;
          } else {
            newStages[s.key] = "completed";
          }
        });
        setStages(newStages);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load artifacts
    fetch(`${API}/artifacts?project_id=${id}`)
      .then(r => r.json())
      .then(d => setArtifacts(d.artifacts || []))
      .catch(() => {});
  }, [id, API]);

  // SSE stream
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`${API.replace("/api/v1","")}/api/v1/projects/${id}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.checkpoint_stage) {
          const newStages: Record<string, StageStatus> = {};
          let found = false;
          PIPELINE_STAGES.forEach(s => {
            if (found) { newStages[s.key] = "pending"; return; }
            if (s.key === data.checkpoint_stage) {
              newStages[s.key] = data.status === "checkpoint_pending" ? "ceo_waiting" : "running";
              found = true;
            } else {
              newStages[s.key] = "completed";
            }
          });
          setStages(prev => ({...prev, ...newStages}));
        }
      } catch {}
    };
    return () => es.close();
  }, [id, API]);

  const stageColor: Record<StageStatus, string> = {
    pending: "#9ca3af",
    running: "#3b82f6",
    completed: "#16a34a",
    error: "#ef4444",
    ceo_waiting: "#eab308",
  };

  return (
    <div className="flex flex-col h-full">
      <Header title={`풀사이클 진행 상황 #${id?.slice(0,8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600">대시보드</Link> / 
          <Link href="/projects" className="hover:text-blue-600"> Pipeline</Link> / 
          <Link href={`/projects/${id}`} className="hover:text-blue-600"> #{id?.slice(0,8)}</Link> / 풀사이클
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 파이프라인 시각화 */}
          <div className="lg:col-span-2">
            <h2 className="font-semibold mb-4">10단계 파이프라인</h2>
            <div className="relative">
              {PIPELINE_STAGES.map((stage, i) => {
                const status: StageStatus = stages[stage.key] || "pending";
                const color = stageColor[status];
                return (
                  <div key={stage.key} className="flex gap-4 mb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold transition-all"
                        style={{background: color, boxShadow: status === "running" || status === "ceo_waiting" ? `0 0 12px ${color}` : "none"}}>
                        {stage.icon}
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div className="w-0.5 h-6 mt-1" style={{background: status === "completed" ? "#16a34a" : "var(--border)"}} />
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-between pb-4">
                      <div>
                        <span className="font-medium">{stage.label}</span>
                        {stage.isCEO && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{background:"#f59e0b20",color:"#f59e0b"}}>CEO</span>}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{background: color}}>
                        {status === "pending" ? "대기" : status === "running" ? "진행 중" : status === "completed" ? "완료" : status === "error" ? "오류" : "CEO 대기"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 산출물 목록 */}
          <div>
            <h2 className="font-semibold mb-4">산출물 목록 ({artifacts.length}건)</h2>
            {artifacts.length === 0 ? (
              <p className="text-sm text-gray-400">산출물이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {artifacts.map(a => (
                  <div
                    key={a.id}
                    onClick={() => setSelectedArtifact(selectedArtifact?.id === a.id ? null : a)}
                    className="p-3 rounded-lg border cursor-pointer text-sm"
                    style={{
                      borderColor: selectedArtifact?.id === a.id ? "var(--accent)" : "var(--border)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div className="font-medium truncate">{a.artifact_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{a.artifact_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 산출물 상세 뷰어 */}
        {selectedArtifact && (
          <div className="mt-6 p-4 rounded-lg border" style={{borderColor:"var(--border)",background:"var(--bg-card)"}}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">{selectedArtifact.artifact_name}</h3>
              <button onClick={() => setSelectedArtifact(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <pre className="text-xs overflow-auto max-h-96 p-3 rounded" style={{background:"var(--bg-hover)"}}>
              {JSON.stringify(selectedArtifact.content, null, 2)}
            </pre>
          </div>
        )}

        {/* CEO 체크포인트 링크 */}
        <div className="mt-6 flex gap-3 flex-wrap">
          <Link href={`/projects/${id}/select-item`}
            className="px-4 py-2 rounded-lg text-sm text-white" style={{background:"var(--accent)"}}>
            🎯 체크포인트 1: 아이템 선택
          </Link>
          <Link href={`/projects/${id}/approve-plan`}
            className="px-4 py-2 rounded-lg text-sm text-white" style={{background:"#16a34a"}}>
            ✅ 체크포인트 2: 기획서 승인
          </Link>
        </div>
      </div>
    </div>
  );
}
