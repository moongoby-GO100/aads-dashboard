"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AgentStatus from "@/components/AgentStatus";
import Header from "@/components/Header";
import type {
  HealthResponse,
  ConversationStatsResponse,
  PublicSummaryResponse,
  Conversation,
} from "@/types";

const PROJECT_BADGE_COLORS: Record<string, string> = {
  aads: "bg-blue-600",
  kis: "bg-green-600",
  sf: "bg-purple-600",
  sales: "bg-orange-600",
  go100: "bg-red-600",
  nas: "bg-yellow-600",
  ntv2: "bg-cyan-600",
};

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<PublicSummaryResponse | null>(null);
  const [convStats, setConvStats] = useState<ConversationStatsResponse | null>(null);
  const [recentConvs, setRecentConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getHealth().then(setHealth).catch(() => {}),
      api.getPublicSummary().then(setSummary).catch(() => {}),
      api.getConversationStats().then(setConvStats).catch(() => {}),
      api
        .getConversations(undefined, undefined, 3)
        .then((r) => setRecentConvs(r.conversations ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentCount = summary ? (summary.data?.agents ?? []).length : 0;
  const totalCategories = summary?.total_categories ?? 0;
  const totalConvs = convStats?.total_conversations ?? 0;
  const healthOk = health?.status === "ok";

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <Header title="AADS 대시보드" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 4개 스탯 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">시스템 상태</p>
            <p className={`text-2xl font-bold ${health === null ? "text-gray-500" : healthOk ? "text-green-400" : "text-red-400"}`}>
              {health === null ? "—" : healthOk ? "OK" : "Error"}
            </p>
            {health && (
              <p className="text-xs text-gray-500 mt-1">
                Graph: {health.graph_ready ? "ready" : "loading"}
              </p>
            )}
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">에이전트 수</p>
            <p className="text-2xl font-bold text-blue-400">{loading ? "—" : agentCount}</p>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">메모리 카테고리</p>
            <p className="text-2xl font-bold text-purple-400">{loading ? "—" : totalCategories}</p>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">대화 총 건수</p>
            <p className="text-2xl font-bold text-green-400">{loading ? "—" : totalConvs}</p>
          </div>
        </div>

        {/* 중단: 프로젝트별 대화 뱃지 */}
        {convStats && convStats.projects.length > 0 && (
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">프로젝트별 대화</h2>
            <div className="flex flex-wrap gap-2">
              {convStats.projects.map((p) => {
                const colorClass = PROJECT_BADGE_COLORS[p.project.toLowerCase()] ?? "bg-gray-600";
                return (
                  <span
                    key={p.project}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white font-semibold ${colorClass}`}
                  >
                    {p.project.toUpperCase()}
                    <span className="bg-black/25 px-1.5 py-0.5 rounded text-xs">{p.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* 하단: 최근 대화 + 8-agent 파이프라인 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 하단 좌: 최근 대화 3건 */}
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">최근 대화 (3건)</h2>
            {loading ? (
              <div className="text-gray-400 text-sm py-4 text-center">로딩 중...</div>
            ) : recentConvs.length === 0 ? (
              <div className="text-gray-500 text-sm py-4 text-center">저장된 대화가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {recentConvs.map((c) => {
                  const colorClass = PROJECT_BADGE_COLORS[c.project.toLowerCase()] ?? "bg-gray-600";
                  return (
                    <div key={c.id} className="border-l-2 border-blue-700 pl-3 py-1">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] text-white font-semibold ${colorClass}`}>
                          {c.project.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-gray-500">{c.logged_at || c.updated_at}</span>
                        {c.char_count > 0 && (
                          <span className="text-[10px] text-gray-600">{c.char_count.toLocaleString()}자</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{c.snapshot || "(내용 없음)"}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 하단 우: 8-agent 파이프라인 */}
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <AgentStatus currentAgent={null} progress={0} />
          </div>
        </div>

      </div>
    </div>
  );
}
