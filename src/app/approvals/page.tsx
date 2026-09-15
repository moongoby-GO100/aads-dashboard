"use client";

/**
 * 승인 — 되돌릴 수 없고 돈이 걸린 것만 여기서 결정한다.
 *
 * 2026-09-14 CEO 지시 — "실매매조건은 나의 승인후 진행해야지".
 * 2026-09-15 CEO 지시 — "완전 진짜 내 승인을 받아야하는것만 승인 받게".
 *
 * 그 전에는 읽기 명령·문서 작성·목표 정리까지 전부 `[실매매] high` 로
 * 올라왔다. 대기 8건 중 진짜 승인 대상은 2건이었다. 오탐이 여섯이면
 * 다음번엔 내용을 안 보고 누르게 되고, 그때 진짜 하나가 같이 통과한다.
 *
 * 그래서 화면을 둘로 나눈다.
 *   ⛔ 승인 필요 — 막혀 있다. 결정해야 움직인다.
 *   🔔 알림     — 막지 않았다. 아니다 싶으면 되돌리면 된다.
 *
 * 승인은 **사람만** 한다. 채팅 에이전트에게는 승인 도구를 주지 않았다 —
 * 에이전트가 자기 요청을 스스로 승인할 수 있으면 게이트가 없는 것과 같다.
 */

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface Pending {
  id: string;
  tool: string;
  summary: string;
  risk: string;
  gate_source?: string;
  tier?: string;
  requested_by: string;
  work_key: string;
  at: string;
  expires_in_min?: number;
}

interface Notification {
  id: string;
  tool: string;
  summary: string;
  risk: string;
  gate_source?: string;
  requested_by: string;
  at: string;
}

interface GateStatus {
  live_trading_gate: boolean;
  direction_guard: boolean;
  waiting: number;
  unread_notifications: number;
}

const RISK_STYLE: Record<string, { color: string; label: string }> = {
  critical: { color: "#D6353B", label: "주문·자금" },
  high: { color: "#e07a1f", label: "실매매 코드" },
  medium: { color: "#c9a227", label: "방향 변경" },
};

function riskOf(risk: string) {
  return RISK_STYLE[risk] || { color: "#8a8a8a", label: risk || "기타" };
}

function remaining(min?: number): string {
  if (min == null) return "";
  if (min < 60) return `${min}분 남음`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 남음` : `${Math.floor(h / 24)}일 남음`;
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<Pending[]>([]);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, n, g] = await Promise.allSettled([
        api.getPendingApprovals() as Promise<{ pending: Pending[] }>,
        api.getApprovalNotifications() as Promise<{ notifications: Notification[] }>,
        api.getApprovalGateStatus() as Promise<GateStatus>,
      ]);
      if (p.status === "fulfilled") setItems(p.value.pending || []);
      else throw p.reason;
      if (n.status === "fulfilled") setNotes(n.value.notifications || []);
      if (g.status === "fulfilled") setGate(g.value);
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

  // 미션 승인의 유효 시간·횟수. 고정값이면 목표마다 맞지 않는다 —
  // 하루 한 번으로 끝내실 때와 자주 확인하실 때가 다르다.
  // 브라우저에 남겨 다음에도 같은 값으로 시작한다.
  const [grantHours, setGrantHours] = useState(12);
  const [grantCount, setGrantCount] = useState(20);

  useEffect(() => {
    try {
      const h = Number(localStorage.getItem("aads_grant_hours"));
      const c = Number(localStorage.getItem("aads_grant_count"));
      if (h >= 1 && h <= 24) setGrantHours(h);
      if (c >= 1 && c <= 500) setGrantCount(c);
    } catch { /* 사생활 보호 모드면 기본값으로 간다 */ }
  }, []);

  const rememberGrant = useCallback((h: number, c: number) => {
    setGrantHours(h); setGrantCount(c);
    try {
      localStorage.setItem("aads_grant_hours", String(h));
      localStorage.setItem("aads_grant_count", String(c));
    } catch { /* 저장 못 해도 이번 조작은 그대로 먹는다 */ }
  }, []);

  const decide = useCallback(async (
    id: string,
    decision: "approved" | "rejected",
    scope: "single" | "mission" = "single",
  ) => {
    setBusy(id);
    try {
      await api.decideApproval(id, decision, "", {
        scope, hours: grantHours,
        maxExecutions: scope === "mission" ? grantCount : 1,
      });
      setDone((p) => ({ ...p, [id]: decision === "rejected" ? "거부" : scope === "mission" ? "미션 승인" : "승인" }));
      setItems((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다");
    } finally {
      setBusy(null);
    }
  }, [grantHours, grantCount]);

  const ackAll = useCallback(async () => {
    setBusy("ack-all");
    try {
      await api.acknowledgeAllApprovalNotifications();
      setNotes([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인 처리하지 못했습니다");
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
      <Header title="승인" />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
          승인
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.7 }}>
          <b>되돌릴 수 없고 돈이 걸린 것</b>만 막습니다 — 주문 경로, 실매매 스위치,
          배정금액, 실매매 서비스 재기동, 진입·청산 파라미터.
          <br />
          되돌릴 수 있는 변경(목표·프롬프트, 실매매 주변 코드)은 막지 않고 아래 알림에만 남습니다.
          읽기·백테스트·문서는 아무것도 하지 않습니다.
        </p>

        {gate && !gate.live_trading_gate && (
          <div style={{ ...card, marginBottom: 14, borderColor: "#D6353B", background: "rgba(214,53,59,.08)" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#D6353B" }}>
              🚫 실매매 게이트가 꺼져 있습니다
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              지금은 아무것도 막지 않습니다. <code>LIVE_TRADING_GATE_ENABLED=true</code> 로 다시 켜야 합니다.
            </div>
          </div>
        )}

        {Object.keys(done).length > 0 && (
          <div style={{ ...card, marginBottom: 14, borderColor: "#16a34a" }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
              방금 처리: {Object.entries(done).map(([id, d]) => `${id.slice(0, 8)} ${d}`).join(" · ")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              미션 승인은 12시간·20회까지 유효합니다. 그 안에는 같은 일로 다시 묻지 않습니다.
            </div>
          </div>
        )}

        {error && <div style={{ ...card, color: "#ef4444", marginBottom: 12 }}>{error}</div>}
        {loading && items.length === 0 && notes.length === 0 && (
          <div style={{ ...card, color: "var(--text-secondary)" }}>불러오는 중...</div>
        )}

        {/* ── 승인 필요 ─────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      gap: 10, flexWrap: "wrap", margin: "18px 0 10px" }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            ⛔ 승인 필요 {items.length > 0 && `${items.length}건`}
          </h2>
          {/* 미션 승인의 유효 범위. 고정값이면 목표마다 맞지 않는다. */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5,
                        color: "var(--text-secondary)" }}>
            미션 승인
            <input type="number" min={1} max={24} value={grantHours}
                   onChange={(e) => rememberGrant(
                     Math.min(24, Math.max(1, Number(e.target.value) || 1)), grantCount)}
                   style={{ width: 54, padding: "3px 6px", fontSize: 11.5, borderRadius: 6,
                            border: "1px solid var(--border)", background: "var(--bg-card)",
                            color: "var(--text-primary)" }} />
            시간 ·
            <input type="number" min={1} max={500} value={grantCount}
                   onChange={(e) => rememberGrant(
                     grantHours, Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                   style={{ width: 64, padding: "3px 6px", fontSize: 11.5, borderRadius: 6,
                            border: "1px solid var(--border)", background: "var(--bg-card)",
                            color: "var(--text-primary)" }} />
            회
          </div>
        </div>

        {!loading && items.length === 0 && !error && (
          <div style={{ ...card, color: "var(--text-secondary)", fontSize: 14 }}>
            대기 중인 승인이 없습니다.
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              담당들은 조사·분석·코드 수정을 승인 없이 계속하고 있습니다.
            </div>
          </div>
        )}

        {items.map((it) => {
          const rk = riskOf(it.risk);
          return (
            <div key={it.id} style={{ ...card, marginBottom: 12, borderLeft: `4px solid ${rk.color}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  background: `${rk.color}22`, color: rk.color, fontWeight: 700,
                }}>
                  {rk.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  {it.tool}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{it.at}</span>
                {it.expires_in_min != null && (
                  <span style={{ fontSize: 11.5, color: "var(--text-secondary)", marginLeft: "auto" }}>
                    {remaining(it.expires_in_min)}
                  </span>
                )}
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
                <a href={`/chat#${it.requested_by}`} style={{ color: "#2563C7" }}>그 대화 열기</a>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => void decide(it.id, "approved", "single")}
                  disabled={busy === it.id}
                  style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "none", background: "#16a34a", color: "#fff",
                    cursor: busy === it.id ? "default" : "pointer", opacity: busy === it.id ? .6 : 1,
                  }}
                >
                  {busy === it.id ? "처리 중..." : "이번 건만"}
                </button>
                <button
                  onClick={() => void decide(it.id, "approved", "mission")}
                  disabled={busy === it.id}
                  style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "1px solid #16a34a", background: "transparent", color: "#16a34a",
                    cursor: busy === it.id ? "default" : "pointer", opacity: busy === it.id ? .6 : 1,
                  }}
                >
                  이 미션 동안 ({grantHours}h·{grantCount}회)
                </button>
                <button
                  onClick={() => void decide(it.id, "rejected")}
                  disabled={busy === it.id}
                  style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                    color: "var(--text-secondary)",
                    cursor: busy === it.id ? "default" : "pointer", opacity: busy === it.id ? .6 : 1,
                  }}
                >
                  거부
                </button>
              </div>
            </div>
          );
        })}

        {/* ── 알림 ─────────────────────────────────────────────── */}
        {notes.length > 0 && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: "24px 0 6px" }}>
              🔔 알림 {notes.length}건
            </h2>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
              막지 않았습니다. 아니다 싶으면 되돌리세요.
            </p>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              {notes.map((n, i) => {
                const rk = riskOf(n.risk);
                return (
                  <div key={n.id} style={{
                    padding: "10px 14px", display: "flex", gap: 10, alignItems: "baseline",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)", flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 11, color: rk.color, fontWeight: 700, minWidth: 64 }}>
                      {rk.label}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--text-primary)", flex: 1, minWidth: 0,
                                   overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.summary.split("\n")[0]}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{n.at}</span>
                  </div>
                );
              })}
              <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
                <button
                  onClick={() => void ackAll()}
                  disabled={busy === "ack-all"}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                    color: "var(--text-secondary)",
                    cursor: busy === "ack-all" ? "default" : "pointer",
                  }}
                >
                  {busy === "ack-all" ? "처리 중..." : `${notes.length}건 모두 확인`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
