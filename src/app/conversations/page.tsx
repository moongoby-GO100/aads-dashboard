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

interface ChatTurn {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
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
  GO100: "#8b5cf6",
};

function channelColor(name: string): string {
  return CHANNEL_COLORS[name.toUpperCase()] ?? "#6b7280";
}

// ─── Snapshot Parser ───────────────────────────────────────────────────────

const UI_HEADER_LINES = new Set([
  "New", "AI Chat", "Home", "Inbox", "Hub", "Saved", "Sparks",
  "Library", "AI Drive", "Share", "Load older messages",
]);

const TOOL_MARKER = "Using Tool";
const MODEL_PATTERNS = [
  "Claude Opus", "Claude Sonnet", "Claude Haiku",
  "GPT-5", "GPT-4", "Gemini", "o1", "o3",
];

function parseSnapshot(snapshot: string): ChatTurn[] {
  if (!snapshot) return [];
  const rawLines = snapshot.split("\n");

  // Strip UI header lines at the top
  let startIdx = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === "" || UI_HEADER_LINES.has(trimmed)) {
      startIdx = i + 1;
      continue;
    }
    break;
  }
  const lines = rawLines.slice(startIdx);
  if (lines.length === 0) return [];

  const turns: ChatTurn[] = [];
  let currentRole: "user" | "assistant" | "tool" = "user";
  let buffer: string[] = [];
  let toolBuffer: string[] = [];
  let inToolBlock = false;

  const flushBuffer = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      turns.push({ role: currentRole, content: text });
    }
    buffer = [];
  };

  const flushToolBuffer = () => {
    const text = toolBuffer.join("\n").trim();
    if (text) {
      turns.push({ role: "tool", content: text });
    }
    toolBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip "For better performance" system lines
    if (trimmed.startsWith("For better performance")) {
      continue;
    }

    // Skip trailing model name (last non-empty line)
    if (i === lines.length - 1 || (i === lines.length - 2 && lines[lines.length - 1].trim() === "")) {
      if (MODEL_PATTERNS.some(p => trimmed.startsWith(p))) {
        continue;
      }
    }

    // Detect tool use blocks
    if (trimmed === TOOL_MARKER) {
      if (!inToolBlock) {
        // Entering tool block — flush current buffer first
        if (currentRole === "user") {
          flushBuffer();
          currentRole = "assistant";
        }
        flushBuffer();
        inToolBlock = true;
        toolBuffer = [trimmed];
      }
      continue;
    }

    if (inToolBlock) {
      if (trimmed === "|" || trimmed === "View") {
        toolBuffer.push(trimmed);
        continue;
      }
      if (trimmed.startsWith("Read") || trimmed.startsWith("Search") ||
          trimmed.startsWith("Navigate") || trimmed.startsWith("Screenshot") ||
          trimmed.startsWith("Click") || trimmed.startsWith("Fill") ||
          trimmed.startsWith("Fetch") || trimmed.startsWith("Query")) {
        toolBuffer.push(trimmed);
        continue;
      }
      // URL line right after tool action
      if (toolBuffer.length > 0 && (trimmed.startsWith("http") || trimmed.startsWith("/"))) {
        toolBuffer.push(trimmed);
        continue;
      }
      // End of tool block
      flushToolBuffer();
      inToolBlock = false;
    }

    // Detect "Thinking..." blocks
    if (trimmed.startsWith("Thinking...")) {
      continue;
    }

    // If we haven't assigned any role yet and this looks like user text
    if (turns.length === 0 && currentRole === "user") {
      buffer.push(line);
      // Check if next line suggests AI response
      const nextIdx = i + 1;
      if (nextIdx < lines.length) {
        const nextTrimmed = lines[nextIdx].trim();
        if (nextTrimmed === TOOL_MARKER || nextTrimmed.startsWith("Thinking...") ||
            // Long formal Korean response starting
            (buffer.join("").length > 5 && buffer.join("").length < 200 &&
             nextTrimmed.length > 50 && !nextTrimmed.match(/[해줘봐야지거든]/))) {
          // Likely end of user message
          flushBuffer();
          currentRole = "assistant";
        }
      }
      continue;
    }

    // Default: add to current buffer
    buffer.push(line);
  }

  // Flush remaining
  if (inToolBlock) flushToolBuffer();
  flushBuffer();

  // If we only got one big assistant block, try to split user/assistant
  if (turns.length === 1 && turns[0].role === "user") {
    const text = turns[0].content;
    const allLines = text.split("\n");
    // Find first substantial break between short user text and long AI response
    for (let i = 0; i < Math.min(allLines.length, 10); i++) {
      const soFar = allLines.slice(0, i + 1).join("\n").trim();
      const rest = allLines.slice(i + 1).join("\n").trim();
      if (soFar.length > 3 && soFar.length < 300 && rest.length > soFar.length * 2) {
        return [
          { role: "user", content: soFar },
          { role: "assistant", content: rest },
        ];
      }
    }
    // Fallback: just show as assistant
    turns[0].role = "assistant";
  }

  // Merge consecutive same-role turns
  const merged: ChatTurn[] = [];
  for (const t of turns) {
    if (merged.length > 0 && merged[merged.length - 1].role === t.role) {
      merged[merged.length - 1].content += "\n" + t.content;
    } else {
      merged.push({ ...t });
    }
  }

  return merged;
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

function ToolBlock({ content }: { content: string }) {
  // Parse tool lines to extract action and URL
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  let action = "";
  let target = "";
  for (const l of lines) {
    if (l === "Using Tool" || l === "|" || l === "View") continue;
    if (l.startsWith("Read") || l.startsWith("Search") || l.startsWith("Navigate") ||
        l.startsWith("Fetch") || l.startsWith("Query") || l.startsWith("Screenshot") ||
        l.startsWith("Click") || l.startsWith("Fill")) {
      action = l;
    } else if (l.startsWith("http") || l.startsWith("/")) {
      target = l;
    }
  }

  return (
    <div className="flex items-center gap-2 py-1 px-3 rounded-lg text-xs my-1 max-w-[85%]"
      style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
      <span style={{ color: "#818cf8" }}>
        {action.startsWith("Read") ? "📖" :
         action.startsWith("Search") ? "🔍" :
         action.startsWith("Navigate") ? "🌐" :
         action.startsWith("Screenshot") ? "📸" :
         action.startsWith("Fetch") ? "📡" :
         action.startsWith("Query") ? "🗄️" : "🔧"}
      </span>
      <span style={{ color: "#a5b4fc" }}>{action}</span>
      {target && (
        <span className="truncate max-w-[300px]" style={{ color: "var(--text-secondary)" }}>
          {target}
        </span>
      )}
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "tool") {
    return (
      <div className="flex justify-start">
        <ToolBlock content={turn.content} />
      </div>
    );
  }

  const isUser = turn.role === "user";
  const lines = turn.content.split("\n");
  const isLong = lines.length > 15;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={isUser ? "max-w-[75%]" : "max-w-[85%]"}>
        <div
          className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words"
          style={isUser
            ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
            : { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }
          }
        >
          {isLong && !expanded ? (
            <>
              {lines.slice(0, 12).join("\n")}
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                className="block mt-2 text-xs underline"
                style={{ color: isUser ? "rgba(255,255,255,0.7)" : "var(--accent)" }}
              >
                ... 더 보기 ({lines.length - 12}줄 더)
              </button>
            </>
          ) : (
            <>
              {turn.content}
              {isLong && expanded && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                  className="block mt-2 text-xs underline"
                  style={{ color: isUser ? "rgba(255,255,255,0.7)" : "var(--accent)" }}
                >
                  접기
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationView({ msg, isOpen, onToggle }: {
  msg: Message;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const turns = isOpen ? parseSnapshot(msg.snapshot) : [];

  return (
    <div className="mb-3">
      {/* Conversation header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left rounded-lg px-4 py-3 transition-colors flex items-center gap-2"
        style={{
          background: isOpen ? "var(--bg-card)" : "var(--bg-hover)",
          border: isOpen ? "1px solid var(--accent)" : "1px solid var(--border)",
        }}
      >
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
        <span className="ml-auto text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
          {!isOpen && (
            <span className="truncate max-w-[200px]">
              {(msg.snapshot || "").split("\n").filter(l => l.trim() && !UI_HEADER_LINES.has(l.trim())).slice(0, 1).join("").slice(0, 60)}
              {msg.snapshot && msg.snapshot.length > 60 ? "..." : ""}
            </span>
          )}
          {isOpen ? "▲ 접기" : "▼ 펼치기"}
        </span>
      </button>

      {/* Chat view — expanded */}
      {isOpen && (
        <div
          className="rounded-b-lg px-4 py-4 space-y-3 max-h-[600px] overflow-y-auto"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: "none" }}
        >
          {turns.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary)" }}>
              내용 없음
            </p>
          ) : (
            turns.map((turn, idx) => <ChatBubble key={idx} turn={turn} />)
          )}
        </div>
      )}
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
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
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
    setOpenKeys(new Set());
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

  // ── Toggle ────────────────────────────────────────────────────────────────

  const toggleOpen = (key: string) => {
    setOpenKeys((prev) => {
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
                  &quot;{searchQuery}&quot; 검색 결과 {searchResults.length}건
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
                      <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                        {r.snippet}
                      </p>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  {activeChannel === "ALL" ? "전체" : activeChannel} 채널 — 총 {total.toLocaleString()}건
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
                      <ConversationView
                        key={msg.key}
                        msg={msg}
                        isOpen={openKeys.has(msg.key)}
                        onToggle={() => toggleOpen(msg.key)}
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
