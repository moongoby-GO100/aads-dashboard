"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemoryItem {
  key: string;
  category: string;
  summary: string;
}

interface SessionSummaryItem {
  date: string;
  summary: string;
}

interface SessionHistoryItem {
  date: string;
  title: string;
  summary: string;
  message_count: number;
}

interface MemoryContextData {
  session_id: string;
  workspace_name: string;
  injected_memory: {
    system_prompt_tokens: number;
    long_term_memory: { count: number; tokens: number; items: MemoryItem[] };
    observations: { count: number; tokens: number; items: MemoryItem[] };
    session_summaries: { count: number; tokens: number; items: SessionSummaryItem[] };
    total_memory_count: number;
    total_injected_tokens: number;
  };
  context_status: {
    session_title: string;
    message_count: number;
    total_cost: number;
    tokens_in: number;
    tokens_out: number;
    compaction_needed: boolean;
    compaction_threshold: number;
    has_summary: boolean;
    health: "normal" | "warning" | "danger";
  };
  session_history: SessionHistoryItem[];
}

interface MemoryContextBarProps {
  sessionId: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const MAX_CONTEXT_TOKENS = 200_000;
const LS_KEY = "aads_memory_bar_open";
const MEMORY_CONTEXT_CACHE_TTL_MS = 60_000;

type TabKey = "memory" | "status" | "history";
type FetchError = "auth" | "forbidden" | "network" | "notfound" | "server" | null;
type MemoryContextCacheEntry = { data: MemoryContextData; fetchedAt: number };

const memoryContextCache = new Map<string, MemoryContextCacheEntry>();

const HEALTH_MAP: Record<string, { icon: string; label: string; color: string }> = {
  normal:  { icon: "🟢", label: "정상", color: "#22c55e" },
  warning: { icon: "🟡", label: "주의", color: "#f59e0b" },
  danger:  { icon: "🔴", label: "위험", color: "#ef4444" },
};

const CATEGORY_LABELS: Record<string, string> = {
  ceo_preference: "CEO 선호",
  project_pattern: "프로젝트 패턴",
  known_issue: "알려진 이슈",
  decision_history: "결정 이력",
  tool_strategy: "도구 전략",
  learning: "학습",
  recurring_issue: "반복 이슈",
  discovery: "발견",
  decision: "결정",
};

// ─── Token refresh helper (P0-2) ────────────────────────────────────────────

async function tryRefreshAndGetToken(): Promise<string | null> {
  try {
    const { refreshAuthToken } = await import("@/lib/auth");
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    if (!token) return null;
    return await refreshAuthToken(token);
  } catch {
    return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MemoryContextBar({ sessionId }: MemoryContextBarProps) {
  const [data, setData] = useState<MemoryContextData | null>(null);
  const [fetchError, setFetchError] = useState<FetchError>(null);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_KEY) === "1";
  });
  const [tab, setTab] = useState<TabKey>("memory");
  const [loading, setLoading] = useState(false);
  const lastFetchStartedAtRef = useRef(0);

  const fetchData = useCallback(async (sid: string, options?: { force?: boolean }) => {
    const cached = memoryContextCache.get(sid);
    if (!options?.force && cached && Date.now() - cached.fetchedAt < MEMORY_CONTEXT_CACHE_TTL_MS) {
      setData(cached.data);
      setFetchError(null);
      setLoading(false);
      return;
    }
    const now = Date.now();
    if (options?.force && now - lastFetchStartedAtRef.current < 5_000) return;
    lastFetchStartedAtRef.current = now;
    setLoading(true);
    setFetchError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}/chat/sessions/${sid}/memory-context`, { headers });

      // P0-2: 401 시 토큰 리프레시 후 1회 재시도
      if (res.status === 401) {
        const newToken = await tryRefreshAndGetToken();
        if (newToken) {
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${newToken}`,
          };
          const retry = await fetch(`${BASE_URL}/chat/sessions/${sid}/memory-context`, { headers: retryHeaders });
          if (retry.ok) {
            const json = await retry.json();
            memoryContextCache.set(sid, { data: json, fetchedAt: Date.now() });
            setData(json);
            setFetchError(null);
            return;
          }
        }
        setData(null);
        setFetchError("auth");
        return;
      }

      if (!res.ok) {
        setData(null);
        if (res.status === 403) {
          setFetchError("forbidden");
        } else if (res.status === 404) {
          setFetchError("notfound");
        } else if (res.status >= 500) {
          setFetchError("server");
        } else {
          setFetchError("network");
        }
        return;
      }

      const json = await res.json();
      memoryContextCache.set(sid, { data: json, fetchedAt: Date.now() });
      setData(json);
      setFetchError(null);
    } catch {
      setData(null);
      setFetchError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) { setData(null); setFetchError(null); return; }
    fetchData(sessionId);
    const onVisible = () => {
      if (!document.hidden && sessionId) fetchData(sessionId, { force: true });
    };
    const onFocus = () => {
      if (sessionId) fetchData(sessionId, { force: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [sessionId, fetchData]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(LS_KEY, next ? "1" : "0");
  };

  if (!sessionId) return null;

  const mem = data?.injected_memory;
  const ctx = data?.context_status;
  const totalMemCount = mem?.total_memory_count ?? 0;
  const totalTokens = mem?.total_injected_tokens ?? 0;
  const healthInfo = HEALTH_MAP[ctx?.health ?? "normal"];
  const compactionIcon = ctx?.compaction_needed ? "✅" : "❌";

  // P0-1: 에러 상태별 접힌 바 표시
  const errorLabel = fetchError === "auth"
    ? "⚠️ 인증 만료"
    : fetchError === "forbidden"
      ? "⚠️ 권한 없음"
      : fetchError === "notfound"
        ? "⚠️ 세션 없음"
        : fetchError === "server"
          ? "⚠️ 서버 오류"
          : fetchError === "network"
            ? "⚠️ 네트워크 오류"
            : null;

  const collapsedBar = (
    <div
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: "12px",
        color: "var(--ct-text2)",
        background: "var(--ct-card, var(--ct-sb))",
        borderRadius: "8px",
        border: `1px solid ${fetchError ? "rgba(239,68,68,0.4)" : "var(--ct-border)"}`,
        marginBottom: "6px",
        userSelect: "none",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = fetchError ? "rgba(239,68,68,0.6)" : "var(--ct-accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = fetchError ? "rgba(239,68,68,0.4)" : "var(--ct-border)")}
    >
      <span>
        {"🧠"} <b style={{ color: "var(--ct-text)" }}>{"현재 대화 맥락"}</b>
        {data && !loading && (
          <span style={{ marginLeft: "8px" }}>
            |&nbsp;&nbsp;{"메모리"} {totalMemCount}{"건"} · {"토큰"} {totalTokens.toLocaleString()} · Compaction {compactionIcon}
            &nbsp;&nbsp;{healthInfo.icon}
          </span>
        )}
        {!data && !loading && errorLabel && (
          <span style={{ marginLeft: "8px", color: "#ef4444", fontSize: "11px" }}>
            {errorLabel}
          </span>
        )}
        {loading && <span style={{ marginLeft: "8px" }}>{"⏳"}</span>}
      </span>
      <span style={{ fontSize: "11px" }}>{open ? "▲ 접기" : "▼ 펼치기"}</span>
    </div>
  );

  // P0-1: 에러 시 펼치면 에러 메시지 + 재시도 버튼 표시
  if (!open) return collapsedBar;
  if (!data && fetchError) {
    return (
      <div style={{ marginBottom: "6px" }}>
        {collapsedBar}
        <div style={{
          background: "var(--ct-card, var(--ct-sb))",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "12px",
          color: "var(--ct-text2)",
          textAlign: "center",
        }}>
          <div style={{ marginBottom: "8px", fontSize: "13px", color: "#ef4444" }}>
            {fetchError === "auth"
              ? "⚠️ 인증이 만료되었습니다"
              : fetchError === "forbidden"
                ? "⚠️ 이 세션을 볼 권한이 없습니다"
                : fetchError === "notfound"
                  ? "⚠️ 세션을 찾을 수 없습니다"
                  : fetchError === "server"
                    ? "⚠️ 서버 오류로 맥락 정보를 불러오지 못했습니다"
                    : "⚠️ 네트워크 오류로 맥락 정보를 불러오지 못했습니다"}
          </div>
          <div style={{ marginBottom: "10px", fontSize: "11px", lineHeight: "1.5" }}>
            {fetchError === "auth"
              ? "페이지를 새로고침하거나 아래 버튼을 눌러 재시도해 주세요."
              : fetchError === "forbidden"
                ? "현재 계정 또는 워크스페이스 권한으로 접근할 수 없는 세션입니다."
                : fetchError === "notfound"
                  ? "삭제되었거나 존재하지 않는 세션입니다."
                  : fetchError === "server"
                    ? "잠시 후 다시 시도해 주세요. 반복되면 서버 로그 확인이 필요합니다."
                    : "인터넷 연결 또는 API 연결 상태를 확인하고 재시도해 주세요."}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (sessionId) fetchData(sessionId);
            }}
            style={{
              padding: "6px 16px",
              fontSize: "12px",
              background: "var(--ct-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"🔄 재시도"}
          </button>
        </div>
      </div>
    );
  }
  if (!data) return collapsedBar;

  // ── Tab navigation ──
  const tabs: Array<{ key: TabKey; icon: string; label: string }> = [
    { key: "memory", icon: "📌", label: "주입 메모리" },
    { key: "status", icon: "💬", label: "맥락 상태" },
    { key: "history", icon: "🗂️", label: "세션 요약" },
  ];

  const tokenPct = Math.min(100, Math.round((totalTokens / MAX_CONTEXT_TOKENS) * 100));

  return (
    <div style={{ marginBottom: "6px" }}>
      {collapsedBar}

      <div style={{
        background: "var(--ct-card, var(--ct-sb))",
        border: "1px solid var(--ct-border)",
        borderRadius: "8px",
        padding: "8px 10px",
        fontSize: "12px",
        color: "var(--ct-text)",
        maxHeight: "280px",
        overflowY: "auto",
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "8px", borderBottom: "1px solid var(--ct-border)", paddingBottom: "6px" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: tab === t.key ? 700 : 400,
                background: tab === t.key ? "var(--ct-accent)" : "transparent",
                color: tab === t.key ? "#fff" : "var(--ct-text2)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
          {/* Refresh */}
          <button
            onClick={() => sessionId && fetchData(sessionId)}
            style={{
              marginLeft: "auto", padding: "4px 8px", fontSize: "11px",
              background: "transparent", border: "1px solid var(--ct-border)",
              borderRadius: "6px", cursor: "pointer", color: "var(--ct-text2)",
            }}
            title={"새로고침"}
          >
            {"🔄"}
          </button>
        </div>

        {/* Tab 1: Injected Memory */}
        {tab === "memory" && mem && (
          <div>
            <div style={{ marginBottom: "6px", color: "var(--ct-text2)" }}>
              System Prompt: <b>{mem.system_prompt_tokens}</b> tokens {"✅"}
            </div>

            {/* Long-term memory */}
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                {"📚"} {"장기 메모리"} ({mem.long_term_memory.count}{"건"}) — {mem.long_term_memory.tokens} tokens
              </div>
              {mem.long_term_memory.items.slice(0, 8).map((item, i) => (
                <div key={i} style={{
                  padding: "3px 8px", marginBottom: "2px", borderRadius: "4px",
                  background: "var(--ct-hover, rgba(255,255,255,0.05))",
                  fontSize: "11px", lineHeight: "1.4",
                }}>
                  <span style={{ color: "var(--ct-accent)", fontWeight: 600 }}>
                    [{CATEGORY_LABELS[item.category] || item.category}]
                  </span>{" "}
                  <span style={{ color: "var(--ct-text2)" }}>{item.key}:</span>{" "}
                  {item.summary}
                </div>
              ))}
              {mem.long_term_memory.count > 8 && (
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", padding: "2px 8px" }}>
                  ... +{mem.long_term_memory.count - 8}{"건 더"}
                </div>
              )}
            </div>

            {/* Observations */}
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                {"🔍"} AI Observations ({mem.observations.count}{"건"}) — {mem.observations.tokens} tokens
              </div>
              {mem.observations.items.slice(0, 6).map((item, i) => (
                <div key={i} style={{
                  padding: "3px 8px", marginBottom: "2px", borderRadius: "4px",
                  background: "var(--ct-hover, rgba(255,255,255,0.05))",
                  fontSize: "11px", lineHeight: "1.4",
                }}>
                  <span style={{ color: "var(--ct-accent)", fontWeight: 600 }}>
                    [{CATEGORY_LABELS[item.category] || item.category}]
                  </span>{" "}
                  {item.summary}
                </div>
              ))}
              {mem.observations.count > 6 && (
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", padding: "2px 8px" }}>
                  ... +{mem.observations.count - 6}{"건 더"}
                </div>
              )}
            </div>

            {/* Session summaries */}
            {mem.session_summaries.count > 0 && (
              <div style={{ marginBottom: "6px" }}>
                <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                  {"📝"} {"이전 세션 요약"} ({mem.session_summaries.count}{"건"}) — {mem.session_summaries.tokens} tokens
                </div>
                {mem.session_summaries.items.map((item, i) => (
                  <div key={i} style={{
                    padding: "3px 8px", marginBottom: "2px", borderRadius: "4px",
                    background: "var(--ct-hover, rgba(255,255,255,0.05))",
                    fontSize: "11px",
                  }}>
                    <span style={{ color: "var(--ct-text2)" }}>[{item.date}]</span> {item.summary}
                  </div>
                ))}
              </div>
            )}

            {/* Token progress bar */}
            <div style={{ marginTop: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                <span>{"총 주입 토큰"}: <b>{totalTokens.toLocaleString()}</b></span>
                <span>{totalTokens.toLocaleString()} / {MAX_CONTEXT_TOKENS.toLocaleString()} ({tokenPct}%)</span>
              </div>
              <div style={{
                height: "6px", borderRadius: "3px",
                background: "var(--ct-border)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: "3px",
                  width: `${tokenPct}%`,
                  background: tokenPct > 80 ? "#ef4444" : tokenPct > 50 ? "#f59e0b" : "var(--ct-accent)",
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Context Status */}
        {tab === "status" && ctx && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {[
                ["세션명", ctx.session_title || "-"],
                ["워크스페이스", data.workspace_name || "-"],
                ["총 메시지 턴", `${ctx.message_count}턴`],
                ["비용", `$${ctx.total_cost.toFixed(4)}`],
                ["토큰 In", ctx.tokens_in.toLocaleString()],
                ["토큰 Out", ctx.tokens_out.toLocaleString()],
              ].map(([label, value], i) => (
                <div key={i} style={{
                  padding: "6px 8px", borderRadius: "6px",
                  background: "var(--ct-hover, rgba(255,255,255,0.05))",
                }}>
                  <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{
              display: "flex", gap: "8px", marginTop: "8px", padding: "8px",
              borderRadius: "6px", background: "var(--ct-hover, rgba(255,255,255,0.05))",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>Compaction</div>
                <div style={{ fontWeight: 600 }}>
                  {ctx.compaction_needed ? "⚠️ 필요" : "✅ 불필요"}
                  <span style={{ fontWeight: 400, color: "var(--ct-text2)", marginLeft: "6px" }}>
                    ({ctx.message_count}/{ctx.compaction_threshold}{"턴"})
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>{"세션 요약"}</div>
                <div style={{ fontWeight: 600 }}>
                  {ctx.has_summary ? "✅ 있음" : "❌ 없음"}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>{"맥락 건강도"}</div>
                <div style={{ fontWeight: 600, color: healthInfo.color }}>
                  {healthInfo.icon} {healthInfo.label}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Session History */}
        {tab === "history" && (
          <div>
            {data.session_history.length === 0 && (
              <div style={{ color: "var(--ct-text2)", padding: "12px", textAlign: "center" }}>
                {"이 워크스페이스에 다른 세션이 없습니다."}
              </div>
            )}
            {data.session_history.map((item, i) => (
              <div key={i} style={{
                padding: "8px 10px", marginBottom: "4px", borderRadius: "6px",
                background: "var(--ct-hover, rgba(255,255,255,0.05))",
                border: "1px solid var(--ct-border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600 }}>{item.title || "제목 없음"}</span>
                  <span style={{ fontSize: "10px", color: "var(--ct-text2)" }}>
                    {item.date} · {item.message_count}{"턴"}
                  </span>
                </div>
                {item.summary && (
                  <div style={{ fontSize: "11px", color: "var(--ct-text2)", lineHeight: "1.4" }}>
                    {item.summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
