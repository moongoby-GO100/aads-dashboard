"use client";

/**
 * 승인 대기 — 실매매 조건 변경을 CEO 가 결정한다.
 *
 * 2026-09-14 CEO 지시 — "실매매조건은 나의 승인후 진행해야지".
 *
 * 담당 세션이 실매매 경로를 바꾸려 하면 `live_trading_guard` 가 도구 실행
 * 전에 막고 여기에 요청을 남긴다. 승인하기 전까지 아무것도 바뀌지 않는다.
 *
 * 승인은 **사람만** 한다. 이 화면은 CEO 인증으로 API 를 직접 부르고,
 * 채팅 에이전트에게는 승인 도구를 주지 않았다 — 에이전트가 자기 요청을
 * 스스로 승인할 수 있으면 게이트가 없는 것과 같다.
 */

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface Pending {
  id: string;
  tool: string;
  summary: string;
  risk: string;
  requested_by: string;
  work_key: string;
  at: string;
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await api.getPendingApprovals()) as { pending: Pending[] };
      setItems(r.pending || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load();
    }, 20_000);
    return () => clearInterval(iv);
  }, [load]);

  const decide = useCallback(async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await api.decideApproval(id, decision);
      setDone((p) => ({ ...p, [id]: decision }));
      setItems((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다");
    } finally {
      setBusy(null);
    }
  }, []);

  const card: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: 12, padding: 16,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page, #0b0b0c)" }}>
      <Header title="승인 대기" />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
          승인 대기
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.7 }}>
          담당이 <b>실매매 조건</b>을 바꾸려 하면 여기에 올라옵니다.
          승인하기 전까지 <b>아무것도 바뀌지 않습니다</b> — 요청만 남고 실행은 막혀 있습니다.
          <br />
          조사·분석·백테스트·읽기는 승인 없이 그대로 돕니다.
        </p>

        {Object.keys(done).length > 0 && (
          <div style={{ ...card, marginBottom: 14, borderColor: "#16a34a" }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
              방금 처리: {Object.entries(done).map(([id, d]) =>
                `${id.slice(0, 8)} ${d === "approved" ? "승인" : "거절"}`).join(" · ")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              승인은 2시간 동안 유효합니다. 담당이 그 안에 실행하지 않으면 다시 요청해야 합니다.
            </div>
          </div>
        )}

        {loading && items.length === 0 && (
          <div style={{ ...card, color: "var(--text-secondary)" }}>불러오는 중...</div>
        )}
        {error && <div style={{ ...card, color: "#ef4444", marginBottom: 12 }}>{error}</div>}

        {!loading && items.length === 0 && !error && (
          <div style={{ ...card, color: "var(--text-secondary)", fontSize: 14 }}>
            대기 중인 승인 요청이 없습니다.
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              담당들이 조사·분석을 하는 중이거나, 아직 실매매 변경까지 가지 않았습니다.
            </div>
          </div>
        )}

        {items.map((it) => (
          <div key={it.id} style={{ ...card, marginBottom: 12, borderLeft: "4px solid #D6353B" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 999,
                background: "rgba(214,53,59,.12)", color: "#D6353B", fontWeight: 600,
              }}>
                실매매 · {it.risk}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {it.tool}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{it.at}</span>
            </div>

            <pre style={{
              margin: "10px 0 0", padding: "10px 12px", borderRadius: 6,
              background: "var(--bg-hover, rgba(127,127,127,.08))",
              fontSize: 12, lineHeight: 1.6, color: "var(--text-primary)",
              whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 180, overflowY: "auto",
            }}>{it.summary}</pre>

            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
              요청 세션 <code>{it.requested_by.slice(0, 8)}</code>
              {" · "}
              <a href={`/chat#${it.requested_by}`} style={{ color: "#2563C7" }}>
                그 대화 열기
              </a>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => void decide(it.id, "approved")}
                disabled={busy === it.id}
                style={{
                  padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "none", background: "#16a34a", color: "#fff",
                  cursor: busy === it.id ? "default" : "pointer", opacity: busy === it.id ? .6 : 1,
                }}
              >
                {busy === it.id ? "처리 중..." : "승인"}
              </button>
              <button
                onClick={() => void decide(it.id, "rejected")}
                disabled={busy === it.id}
                style={{
                  padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "1px solid var(--border)", background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  cursor: busy === it.id ? "default" : "pointer", opacity: busy === it.id ? .6 : 1,
                }}
              >
                거절
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
