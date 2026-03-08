"use client";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Channel {
  name: string;
  category: string;
  count: number;
  last_message: string | null;
}

interface ChannelMessage {
  id: number;
  key: string;
  channel: string;
  source: string;
  snapshot: string;
  chunk: string;
  created_at: string;
}

interface ChatTurn {
  role: "user" | "assistant" | "tool";
  content: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  AADS: "#6366f1", KIS: "#0ea5e9", SALES: "#10b981",
  SHORTFLOW: "#f59e0b", NEWTALK: "#ec4899", GO100: "#8b5cf6", NAS: "#ef4444",
};

function channelColor(name: string): string {
  return CHANNEL_COLORS[name.toUpperCase()] ?? "#6b7280";
}

function toKST(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return dateStr;
  }
}

function toDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toTimeStr(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(11, 16);
  } catch {
    return "";
  }
}

// ─── Snapshot Parser ───────────────────────────────────────────────────────

const UI_HEADER_LINES = new Set([
  "New", "AI Chat", "Home", "Inbox", "Hub", "Saved", "Sparks",
  "Library", "AI Drive", "Share", "Load older messages",
]);

const MODEL_PATTERNS = [
  "Claude Opus", "Claude Sonnet", "Claude Haiku",
  "GPT-5", "GPT-4", "Gemini", "o1", "o3",
];

function getSnippet(snapshot: string): string {
  if (!snapshot) return "(내용 없음)";
  const lines = snapshot.split("\n")
    .map(l => l.trim())
    .filter(l => l && !UI_HEADER_LINES.has(l));
  return lines.slice(0, 2).join(" ").slice(0, 100) || "(내용 없음)";
}

function parseSnapshot(snapshot: string): ChatTurn[] {
  if (!snapshot) return [];
  const rawLines = snapshot.split("\n");

  let startIdx = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === "" || UI_HEADER_LINES.has(trimmed)) { startIdx = i + 1; continue; }
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
    if (text) turns.push({ role: currentRole, content: text });
    buffer = [];
  };
  const flushToolBuffer = () => {
    const text = toolBuffer.join("\n").trim();
    if (text) turns.push({ role: "tool", content: text });
    toolBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("For better performance")) continue;
    if (i === lines.length - 1 || (i === lines.length - 2 && lines[lines.length - 1].trim() === "")) {
      if (MODEL_PATTERNS.some(p => trimmed.startsWith(p))) continue;
    }
    if (trimmed === "Using Tool") {
      if (!inToolBlock) {
        if (currentRole === "user") { flushBuffer(); currentRole = "assistant"; }
        flushBuffer();
        inToolBlock = true;
        toolBuffer = [trimmed];
      }
      continue;
    }
    if (inToolBlock) {
      if (trimmed === "|" || trimmed === "View") { toolBuffer.push(trimmed); continue; }
      if (["Read", "Search", "Navigate", "Screenshot", "Click", "Fill", "Fetch", "Query"].some(a => trimmed.startsWith(a))) {
        toolBuffer.push(trimmed); continue;
      }
      if (toolBuffer.length > 0 && (trimmed.startsWith("http") || trimmed.startsWith("/"))) {
        toolBuffer.push(trimmed); continue;
      }
      flushToolBuffer();
      inToolBlock = false;
    }
    if (trimmed.startsWith("Thinking...")) continue;
    if (turns.length === 0 && currentRole === "user") {
      buffer.push(line);
      const nextIdx = i + 1;
      if (nextIdx < lines.length) {
        const nextTrimmed = lines[nextIdx].trim();
        if (nextTrimmed === "Using Tool" || nextTrimmed.startsWith("Thinking...") ||
            (buffer.join("").length > 5 && buffer.join("").length < 200 &&
             nextTrimmed.length > 50 && !nextTrimmed.match(/[해줘봐야지거든]/))) {
          flushBuffer();
          currentRole = "assistant";
        }
      }
      continue;
    }
    buffer.push(line);
  }
  if (inToolBlock) flushToolBuffer();
  flushBuffer();

  if (turns.length === 1 && turns[0].role === "user") {
    const text = turns[0].content;
    const allLines = text.split("\n");
    for (let i = 0; i < Math.min(allLines.length, 10); i++) {
      const soFar = allLines.slice(0, i + 1).join("\n").trim();
      const rest = allLines.slice(i + 1).join("\n").trim();
      if (soFar.length > 3 && soFar.length < 300 && rest.length > soFar.length * 2) {
        return [{ role: "user", content: soFar }, { role: "assistant", content: rest }];
      }
    }
    turns[0].role = "assistant";
  }

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

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ConversationsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>}>
      <ConversationsPage />
    </Suspense>
  );
}

function ConversationsPage() {
  const searchParams = useSearchParams();
  const managerParam = searchParams.get("manager");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // ── Load channels ─────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getConversationChannels();
        const chs = (data as any).channels ?? [];
        setChannels(chs);
        // URL ?manager= 파라미터가 있으면 해당 채널 자동 선택
        if (managerParam) {
          const match = chs.find((c: Channel) => c.name.toUpperCase() === managerParam.toUpperCase());
          setActiveChannel(match ? match.name : chs[0]?.name ?? null);
        } else if (chs.length > 0) {
          setActiveChannel(chs[0].name);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [managerParam]);

  // ── Load messages ─────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (channel: string, off = 0) => {
    setMsgLoading(true);
    try {
      const data = await api.getConversationMessages(channel, LIMIT, off) as any;
      const msgs: ChannelMessage[] = data.messages ?? [];
      if (off === 0) {
        setMessages(msgs);
      } else {
        setMessages(prev => [...prev, ...msgs]);
      }
      setTotal(data.total ?? 0);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    setMessages([]);
    setOffset(0);
    setExpandedKey(null);
    fetchMessages(activeChannel, 0);
  }, [activeChannel, fetchMessages]);

  const loadMore = () => {
    if (!activeChannel || msgLoading) return;
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchMessages(activeChannel, newOffset);
  };

  // ── Group messages by date (newest date first, within date newest first) ──

  const dateGroups: { date: string; items: ChannelMessage[] }[] = [];
  const dateMap = new Map<string, ChannelMessage[]>();
  for (const msg of messages) {
    const d = toDateLabel(msg.created_at);
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d)!.push(msg);
  }
  for (const [date, items] of dateMap) {
    dateGroups.push({ date, items });
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-main)", color: "var(--text-primary)" }}>
      <Header title="Conversations" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar: Managers ── */}
        {sidebarOpen && (
          <div className="w-56 flex flex-col overflow-y-auto flex-shrink-0"
            style={{ borderRight: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold">매니저</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {channels.reduce((sum, c) => sum + c.count, 0).toLocaleString()}개 대화
              </p>
            </div>
            <div className="flex-1 p-2 space-y-1">
              {loading ? (
                <p className="text-xs px-2 py-4 text-center" style={{ color: "var(--text-secondary)" }}>로딩...</p>
              ) : (
                channels.map(ch => {
                  const isActive = activeChannel === ch.name;
                  return (
                    <button
                      key={ch.name}
                      onClick={() => setActiveChannel(ch.name)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors"
                      style={isActive
                        ? { background: channelColor(ch.name), color: "#fff" }
                        : { background: "transparent", color: "var(--text-primary)" }
                      }
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{ch.name}</span>
                        <span className="text-xs px-1.5 rounded-full"
                          style={{
                            background: isActive ? "rgba(0,0,0,0.25)" : "var(--bg-hover)",
                            color: isActive ? "#fff" : "var(--text-secondary)",
                          }}>
                          {ch.count}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Main Area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-xs px-2 py-1.5 rounded"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                {sidebarOpen ? "◀" : "▶"}
              </button>
              {activeChannel && (
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full"
                    style={{ background: channelColor(activeChannel) }} />
                  <h1 className="font-bold text-base">{activeChannel} 매니저 대화</h1>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {total.toLocaleString()}개
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Date-grouped conversation list */}
          <div className="flex-1 overflow-y-auto p-4">
            {msgLoading && messages.length === 0 ? (
              <div className="text-center py-20" style={{ color: "var(--text-secondary)" }}>
                <p className="text-sm">로딩 중...</p>
              </div>
            ) : messages.length === 0 && !msgLoading ? (
              <div className="text-center py-20" style={{ color: "var(--text-secondary)" }}>
                <p className="text-sm">저장된 대화가 없습니다.</p>
              </div>
            ) : (
              <>
                {dateGroups.map(({ date, items }) => (
                  <div key={date} className="mb-6">
                    {/* Date header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                      <span className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                        {date}
                      </span>
                      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    </div>

                    {/* Conversation list for this date */}
                    <div className="space-y-2">
                      {items.map(msg => {
                        const msgKey = msg.key || String(msg.id);
                        const isExpanded = expandedKey === msgKey;
                        const turns = isExpanded ? parseSnapshot(msg.snapshot) : [];

                        return (
                          <div key={msgKey}>
                            {/* List item — clickable */}
                            <button
                              onClick={() => setExpandedKey(isExpanded ? null : msgKey)}
                              className="w-full text-left px-4 py-3 rounded-lg transition-colors"
                              style={{
                                background: isExpanded ? "var(--bg-card)" : "transparent",
                                border: isExpanded ? "1px solid var(--accent)" : "1px solid var(--border)",
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--accent)" }}>
                                  {toTimeStr(msg.created_at)}
                                </span>
                                <span className="text-sm truncate flex-1" style={{ color: "var(--text-primary)" }}>
                                  {getSnippet(msg.snapshot)}
                                </span>
                                <span className="text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </div>
                            </button>

                            {/* Expanded chat view */}
                            {isExpanded && (
                              <div className="mt-1 rounded-b-lg p-4 space-y-4"
                                style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderTop: "none" }}>
                                {turns.length === 0 ? (
                                  <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary)" }}>
                                    파싱 가능한 내용 없음
                                  </p>
                                ) : (
                                  turns.map((turn, idx) => {
                                    if (turn.role === "tool") {
                                      const toolLines = turn.content.split("\n").map(l => l.trim()).filter(Boolean);
                                      let action = "";
                                      let target = "";
                                      for (const l of toolLines) {
                                        if (l === "Using Tool" || l === "|" || l === "View") continue;
                                        if (["Read", "Search", "Navigate", "Fetch", "Query", "Screenshot", "Click", "Fill"].some(a => l.startsWith(a))) action = l;
                                        else if (l.startsWith("http") || l.startsWith("/")) target = l;
                                      }
                                      return (
                                        <div key={idx} className="flex justify-start">
                                          <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs"
                                            style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                                            <span style={{ color: "#818cf8" }}>
                                              {action.startsWith("Read") ? "📖" : action.startsWith("Search") ? "🔍" :
                                               action.startsWith("Navigate") ? "🌐" : action.startsWith("Screenshot") ? "📸" :
                                               action.startsWith("Fetch") ? "📡" : action.startsWith("Query") ? "🗄️" : "🔧"}
                                            </span>
                                            <span style={{ color: "#a5b4fc" }}>{action || "Tool"}</span>
                                            {target && <span className="truncate max-w-[300px]" style={{ color: "var(--text-secondary)" }}>{target}</span>}
                                          </div>
                                        </div>
                                      );
                                    }

                                    const isUser = turn.role === "user";
                                    return (
                                      <div key={idx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                        <div className="max-w-[75%]">
                                          <div
                                            className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap"
                                            style={isUser
                                              ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
                                              : { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }
                                            }
                                          >
                                            {turn.content}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Load more */}
                {messages.length < total && (
                  <div className="text-center py-4">
                    <button
                      onClick={loadMore}
                      disabled={msgLoading}
                      className="px-4 py-2 text-sm rounded-lg"
                      style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                    >
                      {msgLoading ? "로딩 중..." : `더 보기 (${total - messages.length}건 남음)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
