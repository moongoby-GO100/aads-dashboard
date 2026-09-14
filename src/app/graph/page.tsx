"use client";

/**
 * 지식 그래프 — 무엇이 무엇과 이어져 있나.
 *
 * 2026-09-14 신설. 벡터 검색(문서함의 "내용으로 찾기")은 "그 문장이 있는
 * 문단" 을 준다. 그래프는 "그래서 뭐가 어떻게 됐나" 를 이어서 준다.
 *
 * 답하기 어려웠던 두 질문에 답한다.
 *   - 이 파일을 고치면 뭐가 영향받나
 *   - 이 파일에 대한 문서가 어디 있나
 *
 * 그래프는 구조화된 기록(오류 사전·변경 원장·배포 원장)에서 만든다.
 * 추측이 아니라 기계가 남긴 사실이다.
 */

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface Rel {
  relation_type: string;
  label: string;
  id: number;
  entity_type: string;
  name: string;
  description: string;
  evidence: string;
  weight: number;
}
interface Match { id: number; type: string; name: string; degree: number }
interface TraceResult {
  query: string;
  found: boolean;
  matches: Match[];
  node: { id: number; type: string; name: string; description: string; project: string } | null;
  outgoing: Rel[];
  incoming: Rel[];
}
interface Stats {
  nodes: { type: string; count: number }[];
  relations: { type: string; label: string; count: number }[];
  total_nodes: number;
  total_relations: number;
}

// 개체 종류를 사람 말로. 대표가 읽는 화면이다.
const TYPE_LABEL: Record<string, string> = {
  file: "파일", doc: "문서", commit: "커밋", deploy: "배포",
  error: "오류", tool: "도구", service: "서비스", project: "프로젝트", table: "표",
};
const TYPE_ICON: Record<string, string> = {
  file: "📄", doc: "📘", commit: "🔖", deploy: "🚀",
  error: "⚠️", tool: "🔧", service: "⚙️", project: "📦", table: "🗄️",
};

export default function GraphPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getKgStats().then((s) => setStats(s as Stats)).catch(() => setStats(null));
  }, []);

  const run = useCallback(async (query: string) => {
    const term = query.trim();
    if (term.length < 2) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      setResult((await api.traceKg(term)) as TraceResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회하지 못했습니다");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const card: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: 12, padding: 14,
  };

  const relRow = (r: Rel, dir: "out" | "in") => (
    <button
      key={`${dir}-${r.id}-${r.relation_type}`}
      onClick={() => { setQ(r.name); void run(r.name); }}
      style={{
        display: "block", width: "100%", textAlign: "left", background: "none",
        border: "none", borderBottom: "1px solid var(--border)", padding: "7px 0", cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: dir === "out" ? "#2563eb" : "#16a34a", minWidth: 96 }}>
          {dir === "out" ? "──" : "◀──"} {r.label}
        </span>
        <span style={{ fontSize: 12 }}>{TYPE_ICON[r.entity_type] || "•"}</span>
        <span style={{ fontSize: 12.5, color: "var(--text-primary)", wordBreak: "break-all" }}>
          {r.name}
        </span>
      </div>
      {r.description && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 104, marginTop: 2, lineHeight: 1.5 }}>
          {r.description.slice(0, 110)}
        </div>
      )}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page, #0b0b0c)" }}>
      <Header title="지식 그래프" />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
          무엇이 무엇과 이어져 있나
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
          파일·커밋·오류·문서가 어떻게 연결돼 있는지 따라갑니다.
          오류 기록·변경 기록·배포 기록에서 <b>자동으로 만든 연결</b>이며 추측이 아닙니다.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(q); }}
            placeholder="파일 이름, 커밋, 오류 키 — 예: chat_service.py"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none",
              background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)",
            }}
          />
          <button onClick={() => void run(q)}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, border: "none",
                     background: "#2563eb", color: "#fff" }}>
            따라가기
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {["chat_service.py", "page.tsx", "local_embedding_bridge.py"].map((s) => (
            <button key={s} onClick={() => { setQ(s); void run(s); }}
              style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11,
                       border: "1px solid var(--border)", background: "var(--bg-card)",
                       color: "var(--text-secondary)" }}>
              {s}
            </button>
          ))}
        </div>

        {stats && !result && (
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>
              연결 {stats.total_relations.toLocaleString()}개 · 대상 {stats.total_nodes.toLocaleString()}개
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
              {stats.nodes.map((n) => (
                <span key={n.type}>
                  {TYPE_ICON[n.type] || "•"} {TYPE_LABEL[n.type] || n.type} {n.count.toLocaleString()}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {stats.relations.map((r) => (
                <span key={r.type} style={{ marginRight: 14 }}>
                  {r.label} {r.count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && <div style={{ ...card, color: "var(--text-secondary)" }}>따라가는 중...</div>}
        {error && <div style={{ ...card, color: "#ef4444" }}>{error}</div>}

        {!loading && result && !result.found && (
          <div style={{ ...card, color: "var(--text-secondary)", fontSize: 13 }}>
            <b>{result.query}</b> 는 아직 연결된 기록이 없습니다.
            <div style={{ fontSize: 12, marginTop: 6 }}>
              파일 이름은 경로 일부만 넣어도 됩니다. 오류 키는 <code>영역.증상</code> 꼴입니다.
            </div>
          </div>
        )}

        {!loading && result?.found && result.node && (
          <>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {TYPE_ICON[result.node.type] || "•"} {TYPE_LABEL[result.node.type] || result.node.type}
                {result.node.project && ` · ${result.node.project}`}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)",
                            marginTop: 3, wordBreak: "break-all" }}>
                {result.node.name}
              </div>
              {result.node.description && (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.6 }}>
                  {result.node.description}
                </div>
              )}
              {result.matches.length > 1 && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>비슷한 이름:</span>
                  {result.matches.slice(1, 6).map((m) => (
                    <button key={m.id} onClick={() => { setQ(m.name); void run(m.name); }}
                      style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999,
                               border: "1px solid var(--border)", background: "none",
                               color: "var(--text-secondary)", cursor: "pointer" }}>
                      {m.name.split("/").pop()} ({m.degree})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {result.outgoing.length === 0 && result.incoming.length === 0 && (
              <div style={{ ...card, color: "var(--text-secondary)", fontSize: 13 }}>
                이 대상에 연결된 기록이 아직 없습니다.
              </div>
            )}

            {result.outgoing.length > 0 && (
              <div style={{ ...card, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  여기서 나가는 연결 ({result.outgoing.length})
                </div>
                {result.outgoing.map((r) => relRow(r, "out"))}
              </div>
            )}

            {result.incoming.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  여기로 들어오는 연결 ({result.incoming.length})
                </div>
                {result.incoming.map((r) => relRow(r, "in"))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
