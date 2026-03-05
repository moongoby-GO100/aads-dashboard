"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Channel {
  name: string;
  category: string;
  count: number;
  last_message: string | null;
  status?: string;
}

interface Message {
  id: number;
  key: string;
  channel: string;
  project: string;
  source: string;
  snapshot: string;
  chunk: string;
  created_at: string;
}

interface Stats {
  total: number;
  today: number;
  channels: { name: string; total: number; today: number; last_active: string }[];
}

interface SearchResult {
  id: number;
  channel: string;
  key: string;
  snippet: string;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const KST_OFFSET = 9 * 60 * 60 * 1000;

function toKST(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const kst = new Date(d.getTime() + KST_OFFSET);
    return kst.toISOString().replace("T", " ").slice(0, 16) + " KST";
  } catch {
    return dateStr;
  }
}

const CHANNEL_COLORS: Record<string, string> = {
  AADS: "#6366f1",
  KIS: "#0ea5e9",
  SALES: "#10b981",
  SHORTFLOW: "#f59e0b",
  NEWTALK: "#ec4899",
};

function channelColor(name: string): string {
  return CHANNEL_COLORS[name.toUpperCase()] ?? "#6b7280";
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ChannelBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white"
      style={{ background: channelColor(name) }}
    >
      {name}
    </span>
  );
}

function MessageCard({ msg, expanded, onToggle }: {
  msg: Message;
  expanded: boolean;
  onToggle: () => void;
}) {
  const text = msg.snapshot || "(내용 없음)";
  return (
    <div
      className="rounded-lg p-4 cursor-pointer transition-colors mb-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <ChannelBadge name={msg.channel || msg.project} />
        <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
          {toKST(msg.created_at)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {msg.source}
        </span>
        {msg.chunk && msg.chunk !== "1/1" && (
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
            {msg.chunk}
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>
          {expanded ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </div>
      <p
        className={`text-sm whitespace-pre-wrap break-words ${!expanded ? "line-clamp-3" : ""}`}
        style={{ color: "var(--text-primary)" }}
      >
        {text}
      </p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>("ALL");
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState("");
  const LIMIT = 30;

  // ── Init ──────────────────────────────────────────────────────────────────

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const [chData, stData] = await Promise.allSettled([
        api.getConversationChannels(),
        api.getConversationStats(),
      ]);
      if (chData.status === "fulfilled") setChannels((chData.value as any).channels ?? []);
      if (stData.status === "fulfilled") setStats(stData.value as unknown as Stats);
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      setLastRefreshed(kst.toISOString().replace("T", " ").slice(11, 19) + " KST");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    const _id = setInterval(() => fetchChannels(), 30_000);
    return () => clearInterval(_id);
  }, [fetchChannels]);

  // ── Messages ──────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (channel: string, off = 0) => {
    if (channel === "ALL") {
      // ALL: use existing list endpoint
      setMsgLoading(true);
      try {
        const data = await api.getConversations(undefined, undefined, LIMIT, off) as any;
        const msgs = (data.conversations ?? []).map((c: any) => ({
          id: 0,
          key: c.id,
          channel: c.project.toUpperCase(),
          project: c.project,
          source: c.source,
          snapshot: c.full_text || c.snapshot,
          chunk: "",
          created_at: c.updated_at,
        }));
        if (off === 0) {
          setMessages(msgs);
        } else {
          setMessages((prev) => [...prev, ...msgs]);
        }
        setTotal(data.total ?? 0);
      } finally {
        setMsgLoading(false);
      }
    } else {
      setMsgLoading(true);
      try {
        const data = await api.getConversationMessages(channel, LIMIT, off) as any;
        if (off === 0) {
          setMessages(data.messages ?? []);
        } else {
          setMessages((prev) => [...prev, ...(data.messages ?? [])]);
        }
        setTotal(data.total ?? 0);
      } finally {
        setMsgLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    setExpandedKeys(new Set());
    setSearchResults(null);
    setSearchInput("");
    setSearchQuery("");
    fetchMessages(activeChannel, 0);
  }, [activeChannel, fetchMessages]);

  const loadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchMessages(activeChannel, newOffset);
  };

  // ── Search ────────────────────────────────────────────────────────────────

  const doSearch = async () => {
    if (!searchInput.trim()) {
      setSearchResults(null);
      setSearchQuery("");
      return;
    }
    setSearchQuery(searchInput);
    setSearchLoading(true);
    try {
      const data = await api.searchConversations(searchInput, activeChannel) as any;
      setSearchResults(data.results ?? []);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
    setSearchInput("");
    setSearchQuery("");
  };

  // ── Expand toggle ─────────────────────────────────────────────────────────

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Channel stats ─────────────────────────────────────────────────────────

  const getChannelCount = (name: string): number => {
    if (name === "ALL") return stats?.total ?? 0;
    const ch = channels.find((c) => c.name.toUpperCase() === name.toUpperCase());
    return ch?.count ?? 0;
  };

  const getChannelToday = (name: string): number => {
    if (!stats) return 0;
    const ch = stats.channels?.find((c) => c.name.toUpperCase() === name.toUpperCase());
    return ch?.today ?? 0;
  };

  // ── Sidebar channels ──────────────────────────────────────────────────────

  const sideChannels = [
    { name: "ALL", label: "전체", count: stats?.total ?? 0, inactive: false },
    ...channels.map((c) => ({ name: c.name, label: c.name, count: c.count, inactive: c.count === 0 })),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Conversations" />

      {/* Stats bar */}
      {stats && (
        <div className="px-4 py-2 flex gap-4 text-xs border-b flex-wrap"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <span>총 <b style={{ color: "var(--text-primary)" }}>{stats.total.toLocaleString()}</b>건</span>
          <span>오늘 <b style={{ color: "var(--text-primary)" }}>{stats.today}</b>건</span>
          <span>최근 갱신: <b style={{ color: "var(--text-primary)" }}>{lastRefreshed || "-"}</b></span>
          <button
            onClick={fetchChannels}
            className="ml-auto text-xs px-2 py-0.5 rounded transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
          >
            새로고침
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-40 md:w-48 flex-shrink-0 overflow-y-auto border-r p-2"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <p className="text-xs font-semibold mb-2 px-1" style={{ color: "var(--text-secondary)" }}>
            채널
          </p>
          {loading ? (
            <p className="text-xs px-1" style={{ color: "var(--text-secondary)" }}>로딩...</p>
          ) : (
            sideChannels.map((ch) => {
              const count = ch.count ?? getChannelCount(ch.name);
              const isActive = activeChannel === ch.name;
              const isInactive = ch.inactive && ch.name !== "ALL";
              return (
                <button
                  key={ch.name}
                  onClick={() => setActiveChannel(ch.name)}
                  className="w-full text-left px-2 py-2 rounded-lg mb-1 text-sm flex items-center justify-between transition-colors"
                  style={
                    isActive
                      ? { background: channelColor(ch.name), color: "#fff" }
                      : isInactive
                      ? { color: "var(--text-secondary)", background: "var(--bg-hover)", opacity: 0.6 }
                      : { color: "var(--text-primary)", background: "transparent" }
                  }
                >
                  <span className="font-medium">{ch.label}</span>
                  {isInactive ? (
                    <span className="text-xs px-1.5 rounded" style={{ background: "#374151", color: "#9CA3AF", fontSize: "10px" }}>
                      미설정
                    </span>
                  ) : count > 0 ? (
                    <span
                      className="text-xs px-1.5 rounded-full"
                      style={{
                        background: isActive ? "rgba(0,0,0,0.25)" : "var(--bg-hover)",
                        color: isActive ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex gap-2 p-3 border-b" style={{ borderColor: "var(--border)" }}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder={`${activeChannel === "ALL" ? "전체" : activeChannel} 채널 검색...`}
              className="flex-1 px-3 py-1.5 text-sm rounded-lg focus:outline-none"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={doSearch}
              className="px-3 py-1.5 text-sm rounded-lg text-white"
              style={{ background: "var(--accent)" }}
            >
              검색
            </button>
            {searchResults !== null && (
              <button
                onClick={clearSearch}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Messages or Search results */}
          <div className="flex-1 overflow-y-auto p-3">
            {searchResults !== null ? (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  "{searchQuery}" 검색 결과 {searchResults.length}건
                </p>
                {searchLoading ? (
                  <p className="text-center py-8" style={{ color: "var(--text-secondary)" }}>검색 중...</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-center py-8" style={{ color: "var(--text-secondary)" }}>검색 결과 없음</p>
                ) : (
                  searchResults.map((r) => (
                    <div key={r.id} className="rounded-lg p-3 mb-2"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelBadge name={r.channel} />
                        <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                          {toKST(r.created_at)}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {r.snippet}
                      </p>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  {activeChannel === "ALL" ? "전체" : activeChannel} 채널 — 총 {total.toLocaleString()}건 (최대 {LIMIT}건씩)
                </p>
                {msgLoading && messages.length === 0 ? (
                  <p className="text-center py-8" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 rounded-lg"
                    style={{ color: "var(--text-secondary)", border: "1px dashed var(--border)" }}>
                    저장된 대화가 없습니다.
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageCard
                        key={msg.key}
                        msg={msg}
                        expanded={expandedKeys.has(msg.key)}
                        onToggle={() => toggleExpand(msg.key)}
                      />
                    ))}
                    {messages.length < total && (
                      <div className="text-center py-4">
                        <button
                          onClick={loadMore}
                          disabled={msgLoading}
                          className="px-4 py-2 text-sm rounded-lg transition-colors"
                          style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                        >
                          {msgLoading ? "로딩 중..." : `더 보기 (${total - messages.length}건 남음)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
