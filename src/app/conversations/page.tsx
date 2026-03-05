"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

const ALL_PROJECTS = ["ALL", "aads", "sf", "sales", "kis", "go100", "nas", "ntv2"];

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

function ConversationCard({ conv }: { conv: Conversation }) {
  const [expanded, setExpanded] = useState(false);
  const text = expanded ? conv.full_text : conv.snapshot;

  return (
    <div
      className="rounded-lg p-4 cursor-pointer transition-colors"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="inline-block px-2 py-0.5 rounded text-xs text-white font-semibold bg-blue-600">
          {conv.project?.toUpperCase()}
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{conv.logged_at || conv.updated_at}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>출처: {conv.source}</span>
        {conv.char_count > 0 && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{conv.char_count.toLocaleString()}자</span>
        )}
        <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>{expanded ? "접기 ▲" : "펼치기 ▼"}</span>
      </div>
      <p
        className={`text-sm whitespace-pre-wrap break-words ${!expanded ? "line-clamp-3" : ""}`}
        style={{ color: "var(--text-primary)" }}
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, convsData] = await Promise.allSettled([
        api.getConversationStats(),
        api.getConversations(
          activeProject !== "ALL" ? activeProject : undefined,
          keyword || undefined,
          50
        ),
      ]);
      if (statsData.status === "fulfilled") setStats(statsData.value as Stats);
      if (convsData.status === "fulfilled") {
        const d = convsData.value as any;
        setConversations(d.conversations ?? []);
        setTotal(d.total ?? 0);
        setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
      }
    } finally {
      setLoading(false);
    }
  }, [activeProject, keyword]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getProjectCount = (proj: string): number => {
    if (!stats) return 0;
    if (proj === "ALL") return stats.total_conversations;
    const found = stats.projects.find((p) => p.project.toLowerCase() === proj.toLowerCase());
    return found ? found.count : 0;
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Conversations" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            최근 갱신: <span style={{ color: "var(--text-primary)" }}>{lastRefreshed || "-"}</span>
          </p>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
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
            onKeyDown={(e) => e.key === "Enter" && setKeyword(inputKeyword)}
            placeholder="키워드 검색..."
            className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={() => setKeyword(inputKeyword)}
            className="px-4 py-2 text-sm rounded-lg text-white"
            style={{ background: "var(--accent)" }}
          >
            검색
          </button>
        </div>

        {/* 프로젝트 탭 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {ALL_PROJECTS.map((proj) => {
            const count = getProjectCount(proj);
            const isActive = activeProject === proj;
            return (
              <button
                key={proj}
                onClick={() => setActiveProject(proj)}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1"
                style={isActive
                  ? { background: "var(--accent)", color: "#fff" }
                  : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                }
              >
                {proj.toUpperCase()}
                {count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: isActive ? "rgba(0,0,0,0.3)" : "var(--bg-hover)" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!loading && (
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            총 {total}건 (최대 50건)
          </p>
        )}

        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 rounded-lg" style={{ color: "var(--text-secondary)", border: "1px dashed var(--border)" }}>
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
