"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  created_at?: string;
}

interface Session {
  session_id: string;
  started_at: string;
  summary: string | null;
  total_cost_usd: number;
  total_turns: number;
  status: string;
}

interface CostSummary {
  today: { turns: number; cost: number };
  this_week: { turns: number; cost: number };
  this_month: { turns: number; cost: number };
  by_model: { flash?: number; sonnet?: number; opus?: number };
}

export default function CeoChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState<string>("auto");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
    loadCostSummary();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadSessions() {
    try {
      const data = await api.getCeoSessions();
      setSessions(data.sessions || []);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }

  async function loadCostSummary() {
    try {
      const data = await api.getCeoCostSummary();
      setCostSummary(data);
    } catch (e) {
      console.error("Failed to load cost summary", e);
    }
  }

  async function loadSession(sid: string) {
    try {
      const data = await api.getCeoSession(sid);
      setMessages(data.messages || []);
      setSessionId(sid);
    } catch (e) {
      console.error("Failed to load session", e);
    }
  }

  async function sendMessage() {
    if (!inputValue.trim() || isLoading) return;
    const userMsg = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    setMessages(prev => [...prev, { role: "user", content: userMsg }]);

    try {
      const data = await api.sendCeoMessage(sessionId, userMsg);
      if (sessionId === "auto" && data.session_id) {
        setSessionId(data.session_id);
      }
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        model_used: data.model_used,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        cost_usd: data.cost_usd,
      }]);
      setActiveTasksCount(data.active_tasks?.length || 0);
      loadSessions();
      loadCostSummary();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `오류 발생: ${errMsg}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  async function newSession() {
    setMessages([]);
    setSessionId("auto");
    setActiveTasksCount(0);
  }

  async function endSession() {
    if (sessionId === "auto") return;
    try {
      await api.endCeoSession(sessionId);
      loadSessions();
      loadCostSummary();
      alert(`세션 ${sessionId} 종료 및 요약 완료`);
    } catch (e) {
      console.error("End session failed", e);
    }
  }

  function getModelLabel(model?: string) {
    if (!model) return "";
    if (model.includes("haiku")) return "Flash";
    if (model.includes("sonnet")) return "Sonnet";
    if (model.includes("opus")) return "Opus";
    return model;
  }

  const monthlyBudget = 63;
  const monthlyUsed = costSummary?.this_month.cost || 0;
  const budgetPct = Math.min((monthlyUsed / monthlyBudget) * 100, 100);

  const totalModelCost = (costSummary?.by_model.flash || 0) + (costSummary?.by_model.sonnet || 0) + (costSummary?.by_model.opus || 0);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-main)", color: "var(--text-primary)" }}>
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">💬</span>
            <div>
              <h1 className="font-bold text-base">CEO Chat v2</h1>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                세션: {sessionId === "auto" ? "신규" : sessionId.slice(0, 8) + "..."}
                {activeTasksCount > 0 && (
                  <span className="ml-2 text-green-400 animate-pulse">● {activeTasksCount}개 작업 실행중</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={newSession}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              새 세션
            </button>
            {sessionId !== "auto" && (
              <button
                onClick={endSession}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                세션 종료
              </button>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs px-2 py-1.5 rounded"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
          </div>
        </div>

        {/* Session selector */}
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <select
            className="text-xs px-2 py-1 rounded w-full max-w-xs"
            style={{ background: "var(--bg-main)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            value={sessionId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "auto") {
                newSession();
              } else {
                loadSession(val);
              }
            }}
          >
            <option value="auto">-- 새 세션 시작 --</option>
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>
                {s.session_id.slice(0, 8)}... | {new Date(s.started_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} | ${Number(s.total_cost_usd).toFixed(4)} | {s.total_turns}턴 [{s.status}]
              </option>
            ))}
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-20" style={{ color: "var(--text-secondary)" }}>
              <p className="text-4xl mb-4">💬</p>
              <p className="text-lg font-medium mb-2">CEO Chat v2</p>
              <p className="text-sm">메시지를 입력하세요. 내용에 따라 최적 모델이 자동 선택됩니다.</p>
              <div className="mt-4 text-xs space-y-1">
                <p>⚡ 상태/확인 → Flash (빠름·저비용)</p>
                <p>🔧 코드/수정 → Sonnet (균형)</p>
                <p>🧠 설계/분석 → Opus (고성능)</p>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[75%]">
                <div
                  className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap"
                  style={msg.role === "user"
                    ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
                    : { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {msg.content}
                </div>
                {msg.role === "assistant" && msg.model_used && (
                  <p className="text-xs mt-1 ml-1" style={{ color: "var(--text-secondary)" }}>
                    [{getModelLabel(msg.model_used)} · {msg.input_tokens?.toLocaleString()}in · {msg.output_tokens?.toLocaleString()}out · ${msg.cost_usd?.toFixed(4)}]
                  </p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <span className="animate-pulse">AI 응답 생성중...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              placeholder="메시지를 입력하세요... (예: shortflow 상태 확인해)"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff", opacity: (isLoading || !inputValue.trim()) ? 0.5 : 1 }}
            >
              전송
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      {sidebarOpen && (
        <div className="w-72 flex flex-col overflow-y-auto" style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-card)" }}>
          {/* Cost Dashboard */}
          <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold mb-3">비용 현황</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>오늘</span>
                <span>${(costSummary?.today.cost || 0).toFixed(4)} ({costSummary?.today.turns || 0}턴)</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>이번주</span>
                <span>${(costSummary?.this_week.cost || 0).toFixed(4)} ({costSummary?.this_week.turns || 0}턴)</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>이번달</span>
                <span>${monthlyUsed.toFixed(4)} / ${monthlyBudget}</span>
              </div>
            </div>
            {/* Budget Progress Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: "var(--text-secondary)" }}>월 예산</span>
                <span style={{ color: budgetPct > 80 ? "#ef4444" : budgetPct > 60 ? "#f59e0b" : "var(--text-secondary)" }}>
                  {budgetPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "var(--bg-main)" }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${budgetPct}%`,
                    background: budgetPct > 80 ? "#ef4444" : budgetPct > 60 ? "#f59e0b" : "var(--accent)"
                  }}
                />
              </div>
            </div>
          </div>

          {/* Model Distribution */}
          {costSummary && totalModelCost > 0 && (
            <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3">모델별 분포 (이번달)</h3>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Flash", key: "flash" as const, color: "#22c55e" },
                  { label: "Sonnet", key: "sonnet" as const, color: "#3b82f6" },
                  { label: "Opus", key: "opus" as const, color: "#8b5cf6" },
                ].map(({ label, key, color }) => {
                  const cost = costSummary.by_model[key] || 0;
                  const pct = totalModelCost > 0 ? (cost / totalModelCost) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between mb-1">
                        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                        <span>{pct.toFixed(0)}% (${cost.toFixed(4)})</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "var(--bg-main)" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Session Info */}
          {sessionId !== "auto" && (
            <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-2">현재 세션</h3>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                ID: {sessionId.slice(0, 12)}...
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                메시지: {messages.length}개
              </p>
            </div>
          )}

          {/* Recent Sessions */}
          <div className="p-4 flex-1">
            <h3 className="text-sm font-semibold mb-3">최근 세션</h3>
            <div className="space-y-2">
              {sessions.slice(0, 8).map(s => (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors"
                  style={s.session_id === sessionId
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "var(--bg-main)", color: "var(--text-secondary)" }
                  }
                >
                  <div className="flex justify-between mb-0.5">
                    <span className="font-medium">{s.session_id.slice(0, 8)}...</span>
                    <span className={s.status === "active" ? "text-green-400" : ""}>{s.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{s.total_turns}턴</span>
                    <span>${Number(s.total_cost_usd).toFixed(4)}</span>
                  </div>
                  {s.summary && <p className="mt-1 truncate opacity-70">{s.summary}</p>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
