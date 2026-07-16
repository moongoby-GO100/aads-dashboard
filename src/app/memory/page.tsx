"use client";
import { useState, useEffect, useCallback } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface MemoryItem {
  key: string;
  category: string;
  summary: string;
}

interface SessionSummaryItem {
  date: string;
  summary: string;
}

interface MemoryData {
  meta_memory: MemoryItem[];
  observations: MemoryItem[];
  session_notes: SessionSummaryItem[];
}

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

const CATEGORY_COLORS: Record<string, string> = {
  ceo_preference: "#6C5CE7",
  project_pattern: "#00b894",
  known_issue: "#e17055",
  decision_history: "#0984e3",
  tool_strategy: "#fdcb6e",
  learning: "#00cec9",
  recurring_issue: "#d63031",
  discovery: "#a29bfe",
  decision: "#74b9ff",
};

export default function MemoryPage() {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // 임의 세션으로 memory-context API 호출 대신 전체 메모리 목록 조회
      // 현재는 첫 세션의 memory-context를 가져와서 전체 메모리로 표시
      const wsRes = await fetch(`${BASE_URL}/chat/workspaces`, { headers });
      if (!wsRes.ok) throw new Error("workspaces fetch failed");
      const workspaces = await wsRes.json();
      const ws = (workspaces?.workspaces || workspaces)?.[0];
      if (!ws) { setData(null); return; }

      const sessRes = await fetch(`${BASE_URL}/chat/sessions?workspace_id=${ws.id}`, { headers });
      if (!sessRes.ok) throw new Error("sessions fetch failed");
      const sessions = await sessRes.json();
      const sess = (sessions?.sessions || sessions)?.[0];
      if (!sess) { setData(null); return; }

      const sid = sess.session_id || sess.id;
      const mcRes = await fetch(`${BASE_URL}/chat/sessions/${sid}/memory-context`, { headers });
      if (!mcRes.ok) throw new Error("memory-context fetch failed");
      const mc = await mcRes.json();

      setData({
        meta_memory: mc.injected_memory?.long_term_memory?.items || [],
        observations: mc.injected_memory?.observations?.items || [],
        session_notes: mc.injected_memory?.session_summaries?.items || [],
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMemory(); }, [fetchMemory]);

  const allItems = [
    ...(data?.meta_memory || []).map((m) => ({ ...m, source: "meta_memory" as const })),
    ...(data?.observations || []).map((m) => ({ ...m, source: "observation" as const })),
  ];

  const categories = Array.from(new Set(allItems.map((i) => i.category)));
  const filtered = filter === "all" ? allItems : allItems.filter((i) => i.category === filter);

  return (
    <div style={{ minHeight: "100vh", background: "#0F0F0F", color: "#E5E5E5", padding: "24px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
              🧠 AI Memory
            </h1>
            <p style={{ fontSize: "13px", color: "#999" }}>
              AI가 대화에 주입하는 장기 기억과 관찰 데이터
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={fetchMemory}
              style={{
                padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                background: "#6C5CE7", color: "#fff", border: "none", borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              🔄 새로고침
            </button>
            <a
              href="/chat"
              style={{
                padding: "8px 16px", fontSize: "13px",
                background: "#2A2A2A", color: "#E5E5E5", border: "1px solid #3A3A3A",
                borderRadius: "8px", textDecoration: "none", display: "inline-flex", alignItems: "center",
              }}
            >
              💬 채팅으로
            </a>
          </div>
        </div>

        {/* Stats */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "장기 메모리", count: data.meta_memory.length, icon: "📚" },
              { label: "AI Observations", count: data.observations.length, icon: "🔍" },
              { label: "세션 노트", count: data.session_notes.length, icon: "📝" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "16px", borderRadius: "10px",
                background: "#1A1A1A", border: "1px solid #2A2A2A",
              }}>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>{s.icon} {s.count}</div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "4px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer",
              background: filter === "all" ? "#6C5CE7" : "#2A2A2A",
              color: filter === "all" ? "#fff" : "#999",
              border: "1px solid " + (filter === "all" ? "#6C5CE7" : "#3A3A3A"),
            }}
          >
            전체 ({allItems.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: "4px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer",
                background: filter === cat ? (CATEGORY_COLORS[cat] || "#6C5CE7") : "#2A2A2A",
                color: filter === cat ? "#fff" : "#999",
                border: "1px solid " + (filter === cat ? (CATEGORY_COLORS[cat] || "#6C5CE7") : "#3A3A3A"),
              }}
            >
              {CATEGORY_LABELS[cat] || cat} ({allItems.filter((i) => i.category === cat).length})
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>⏳ 로딩 중...</div>
        )}

        {/* Memory Items */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>메모리 항목이 없습니다.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((item, i) => (
            <div key={i} style={{
              padding: "12px 16px", borderRadius: "8px",
              background: "#1A1A1A", border: "1px solid #2A2A2A",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{
                  padding: "2px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px",
                  background: (CATEGORY_COLORS[item.category] || "#6C5CE7") + "30",
                  color: CATEGORY_COLORS[item.category] || "#6C5CE7",
                }}>
                  {CATEGORY_LABELS[item.category] || item.category}
                </span>
                <span style={{ fontSize: "11px", color: "#999", fontFamily: "monospace" }}>{item.key}</span>
                <span style={{
                  fontSize: "10px", color: "#666", marginLeft: "auto",
                  padding: "1px 6px", borderRadius: "3px", background: "#252525",
                }}>
                  {item.source === "meta_memory" ? "meta" : "obs"}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#ccc", lineHeight: "1.5" }}>
                {item.summary}
              </div>
            </div>
          ))}
        </div>

        {/* Session Notes */}
        {data && data.session_notes.length > 0 && (
          <div style={{ marginTop: "24px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>📝 세션 노트</h2>
            {data.session_notes.map((note, i) => (
              <div key={i} style={{
                padding: "12px 16px", marginBottom: "8px", borderRadius: "8px",
                background: "#1A1A1A", border: "1px solid #2A2A2A",
              }}>
                <span style={{ fontSize: "11px", color: "#999" }}>[{note.date}]</span>{" "}
                <span style={{ fontSize: "13px" }}>{note.summary}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
