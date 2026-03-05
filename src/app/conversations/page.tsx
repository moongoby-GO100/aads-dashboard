"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

const PROJECT_COLORS: Record<string, string> = {
  aads: "bg-blue-600",
  kis: "bg-green-600",
  sf: "bg-purple-600",
  sales: "bg-orange-600",
  go100: "bg-red-600",
  nas: "bg-yellow-600",
  ntv2: "bg-cyan-600",
};

const ALL_PROJECTS = ["ALL", "KIS", "GO100", "AADS", "SF", "NAS", "NTV2", "SALES"];

interface Conversation {
  id: string;
  project: string;
  source: string;
  snapshot: string;
  full_text: string;
  logged_at: string;
  char_count: number;
  updated_at: string;
}

interface Stats {
  total_conversations: number;
  projects: { project: string; count: number; last_updated: string }[];
}

function ProjectBadge({ project }: { project: string }) {
  const colorClass = PROJECT_COLORS[project.toLowerCase()] ?? "bg-gray-500";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs text-white font-semibold ${colorClass}`}>
      {project.toUpperCase()}
    </span>
  );
}

function ConversationCard({ conv }: { conv: Conversation }) {
  const [expanded, setExpanded] = useState(false);
  const text = expanded ? conv.full_text : conv.snapshot;

  return (
    <div
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-500 transition-colors"
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <ProjectBadge project={conv.project} />
        <span className="text-xs text-gray-400">{conv.logged_at || conv.updated_at}</span>
        <span className="text-xs text-gray-500">출처: {conv.source}</span>
        {conv.char_count > 0 && (
          <span className="text-xs text-gray-500">{conv.char_count.toLocaleString()}자</span>
        )}
        <span className="ml-auto text-xs text-gray-500">{expanded ? "접기 ▲" : "펼치기 ▼"}</span>
      </div>
      <p
        className={`text-sm text-gray-300 whitespace-pre-wrap break-words ${
          !expanded ? "line-clamp-3" : ""
        }`}
      >
        {text || "(내용 없음)"}
      </p>
    </div>
  );
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [inputKeyword, setInputKeyword] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [total, setTotal] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/conversations/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (activeProject !== "ALL") params.set("project", activeProject.toLowerCase());
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/v1/conversations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
        setTotal(data.total ?? 0);
        setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
      }
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [activeProject, keyword]);

  useEffect(() => {
    fetchStats();
    fetchConversations();
  }, [fetchStats, fetchConversations]);

  const handleRefresh = () => {
    fetchStats();
    fetchConversations();
  };

  const handleSearch = () => {
    setKeyword(inputKeyword);
  };

  const getProjectCount = (proj: string): number => {
    if (!stats) return 0;
    if (proj === "ALL") return stats.total_conversations;
    const found = stats.projects.find((p) => p.project.toLowerCase() === proj.toLowerCase());
    return found ? found.count : 0;
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="대화창 저장 내용" />
      <div className="flex-1 p-6 overflow-auto">
        {/* 부제 + 새로고침 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm text-gray-400">
            genspark_bridge 자동 수집 · 최근 갱신:{" "}
            <span className="text-gray-300">{lastRefreshed || "-"}</span>
          </p>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            새로고침
          </button>
        </div>

        {/* 키워드 검색 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={inputKeyword}
            onChange={(e) => setInputKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="키워드 검색 (예: 연구보고서, CEO, 매출...)"
            className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            검색
          </button>
        </div>

        {/* 프로젝트 필터 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_PROJECTS.map((proj) => {
            const count = getProjectCount(proj);
            const isActive = activeProject === proj;
            return (
              <button
                key={proj}
                onClick={() => setActiveProject(proj)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "border border-gray-600 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {proj}
                {count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? "bg-blue-800" : "bg-gray-700"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 총 건수 */}
        {!loading && (
          <p className="text-xs text-gray-500 mb-3">
            총 {total}건 표시 중 (최대 50건)
          </p>
        )}

        {/* 대화 목록 */}
        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
            저장된 대화가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <ConversationCard key={conv.id} conv={conv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
