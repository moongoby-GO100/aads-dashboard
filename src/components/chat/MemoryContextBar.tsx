"use client";
import { useState, useEffect, useCallback } from "react";

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

type TabKey = "memory" | "status" | "history";

const HEALTH_MAP: Record<string, { icon: string; label: string; color: string }> = {
  normal:  { icon: "\uD83D\uDFE2", label: "\uC815\uC0C1", color: "#22c55e" },
  warning: { icon: "\uD83D\uDFE1", label: "\uC8FC\uC758", color: "#f59e0b" },
  danger:  { icon: "\uD83D\uDD34", label: "\uC704\uD5D8", color: "#ef4444" },
};

const CATEGORY_LABELS: Record<string, string> = {
  ceo_preference: "CEO \uC120\uD638",
  project_pattern: "\uD504\uB85C\uC81D\uD2B8 \uD328\uD134",
  known_issue: "\uC54C\uB824\uC9C4 \uC774\uC288",
  decision_history: "\uACB0\uC815 \uC774\uB825",
  tool_strategy: "\uB3C4\uAD6C \uC804\uB7B5",
  learning: "\uD559\uC2B5",
  recurring_issue: "\uBC18\uBCF5 \uC774\uC288",
  discovery: "\uBC1C\uACAC",
  decision: "\uACB0\uC815",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MemoryContextBar({ sessionId }: MemoryContextBarProps) {
  const [data, setData] = useState<MemoryContextData | null>(null);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_KEY) === "1";
  });
  const [tab, setTab] = useState<TabKey>("memory");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}/chat/sessions/${sid}/memory-context`, { headers });
      if (!res.ok) { setData(null); return; }
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 세션 변경 시 즉시 fetch + 30초 자동 갱신
  useEffect(() => {
    if (!sessionId) { setData(null); return; }
    fetchData(sessionId);
    const iv = setInterval(() => fetchData(sessionId), 30_000);
    return () => clearInterval(iv);
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
  const compactionIcon = ctx?.compaction_needed ? "\u2705" : "\u274C";

  // ── Collapsed bar ──
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
        border: "1px solid var(--ct-border)",
        marginBottom: "6px",
        userSelect: "none",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ct-accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ct-border)")}
    >
      <span>
        {"\uD83E\uDDE0"} <b style={{ color: "var(--ct-text)" }}>{"\uD604\uC7AC \uB300\uD654 \uB9E5\uB77D"}</b>
        {data && !loading && (
          <span style={{ marginLeft: "8px" }}>
            |&nbsp;&nbsp;{"\uBA54\uBAA8\uB9AC"} {totalMemCount}\uAC74 · {"\uD1A0\uD070"} {totalTokens.toLocaleString()} · Compaction {compactionIcon}
            &nbsp;&nbsp;{healthInfo.icon}
          </span>
        )}
        {loading && <span style={{ marginLeft: "8px" }}>{"\u23F3"}</span>}
      </span>
      <span style={{ fontSize: "11px" }}>{open ? "\u25B2 \uC811\uAE30" : "\u25BC \uD3BC\uCE58\uAE30"}</span>
    </div>
  );

  if (!open || !data) return collapsedBar;

  // ── Tab navigation ──
  const tabs: Array<{ key: TabKey; icon: string; label: string }> = [
    { key: "memory", icon: "\uD83D\uDCCC", label: "\uC8FC\uC785 \uBA54\uBAA8\uB9AC" },
    { key: "status", icon: "\uD83D\uDCAC", label: "\uB9E5\uB77D \uC0C1\uD0DC" },
    { key: "history", icon: "\uD83D\uDDC2\uFE0F", label: "\uC138\uC158 \uC694\uC57D" },
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
            title={"\uC0C8\uB85C\uACE0\uCE68"}
          >
            {"\uD83D\uDD04"}
          </button>
        </div>

        {/* Tab 1: Injected Memory */}
        {tab === "memory" && mem && (
          <div>
            <div style={{ marginBottom: "6px", color: "var(--ct-text2)" }}>
              System Prompt: <b>{mem.system_prompt_tokens}</b> tokens {"\u2705"}
            </div>

            {/* Long-term memory */}
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                {"\uD83D\uDCDA"} {"\uC7A5\uAE30 \uBA54\uBAA8\uB9AC"} ({mem.long_term_memory.count}\uAC74) — {mem.long_term_memory.tokens} tokens
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
                  ... +{mem.long_term_memory.count - 8}\uAC74 \uB354
                </div>
              )}
            </div>

            {/* Observations */}
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                {"\uD83D\uDD0D"} AI Observations ({mem.observations.count}\uAC74) — {mem.observations.tokens} tokens
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
                  ... +{mem.observations.count - 6}\uAC74 \uB354
                </div>
              )}
            </div>

            {/* Session summaries */}
            {mem.session_summaries.count > 0 && (
              <div style={{ marginBottom: "6px" }}>
                <div style={{ fontWeight: 600, marginBottom: "3px" }}>
                  {"\uD83D\uDCDD"} {"\uC774\uC804 \uC138\uC158 \uC694\uC57D"} ({mem.session_summaries.count}\uAC74) — {mem.session_summaries.tokens} tokens
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
                <span>{"\uCD1D \uC8FC\uC785 \uD1A0\uD070"}: <b>{totalTokens.toLocaleString()}</b></span>
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
                ["\uC138\uC158\uBA85", ctx.session_title || "-"],
                ["\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4", data.workspace_name || "-"],
                ["\uCD1D \uBA54\uC2DC\uC9C0 \uD134", `${ctx.message_count}\uD134`],
                ["\uBE44\uC6A9", `$${ctx.total_cost.toFixed(4)}`],
                ["\uD1A0\uD070 In", ctx.tokens_in.toLocaleString()],
                ["\uD1A0\uD070 Out", ctx.tokens_out.toLocaleString()],
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
                  {ctx.compaction_needed ? "\u26A0\uFE0F \uD544\uC694" : "\u2705 \uBD88\uD544\uC694"}
                  <span style={{ fontWeight: 400, color: "var(--ct-text2)", marginLeft: "6px" }}>
                    ({ctx.message_count}/{ctx.compaction_threshold}\uD134)
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>{"\uC138\uC158 \uC694\uC57D"}</div>
                <div style={{ fontWeight: 600 }}>
                  {ctx.has_summary ? "\u2705 \uC788\uC74C" : "\u274C \uC5C6\uC74C"}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "2px" }}>{"\uB9E5\uB77D \uAC74\uAC15\uB3C4"}</div>
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
                {"\uC774 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4\uC5D0 \uB2E4\uB978 \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
              </div>
            )}
            {data.session_history.map((item, i) => (
              <div key={i} style={{
                padding: "8px 10px", marginBottom: "4px", borderRadius: "6px",
                background: "var(--ct-hover, rgba(255,255,255,0.05))",
                border: "1px solid var(--ct-border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 600 }}>{item.title || "\uC81C\uBAA9 \uC5C6\uC74C"}</span>
                  <span style={{ fontSize: "10px", color: "var(--ct-text2)" }}>
                    {item.date} · {item.message_count}{"\uD134"}
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
