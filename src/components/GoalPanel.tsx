/**
 * 목표 패널 — 채팅창을 떠나지 않고 목표를 본다.
 *
 * 2026-09-14 대표님 제안: "각 채팅창에 골 진행사항을 띠로 보이게하고
 * 우측 아티팩트를 활용하면 어때?"
 *
 * 원안은 검토하려면 `/goals` 로 화면을 옮겨야 했다. 담당과 대화하다가
 * "이 근거가 맞나" 를 보려면 창을 떠나고, 돌아오면 대화 맥락이 끊긴다.
 *
 * 이 패널은 **왼쪽이 그 담당의 창**이라는 것이 가장 큰 값이다. 근거를
 * 보고 "이거 낙폭은 어떻게 되나" 를 그 자리에서 바로 물을 수 있다.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Milestone = {
  id: string; title: string; status: string; sequence_order: number;
  variant: string | null; completion_criteria: string | null;
  evidence: Record<string, unknown> | string | null;
  dispatch_note: string | null; owner_role_key: string;
  review_ask_count: number; open_notes: number;
};
type Owner = {
  session_id: string; role_key: string; title: string; state: string;
  milestone: string | null; is_lead?: boolean; paused?: boolean;
  paused_reason?: string | null; dispatch_count: number; open_notes?: number;
};
type Board = {
  goal: { id?: string; title: string; status: string; progress: number };
  halted: boolean; owners: Owner[]; milestones: Milestone[];
  documents?: Array<{ kind: string; doc_path: string; title: string | null }>;
  missing_design?: string[]; has_lead?: boolean;
};

const MARK: Record<string, { icon: string; color: string }> = {
  completed: { icon: "✓", color: "#16a34a" },
  in_progress: { icon: "●", color: "#2563eb" },
  review: { icon: "◐", color: "#7c3aed" },
  failed: { icon: "✗", color: "#d97706" },
  blocked: { icon: "■", color: "#dc2626" },
  pending: { icon: "○", color: "#94a3b8" },
};

function evidenceText(ev: Milestone["evidence"]): string {
  if (!ev) return "";
  const o = typeof ev === "string" ? (() => { try { return JSON.parse(ev); } catch { return {}; } })() : ev;
  const parts: string[] = [];
  if (o.summary) parts.push(String(o.summary));
  if (o.numbers) parts.push(JSON.stringify(o.numbers));
  if (Array.isArray(o.refs) && o.refs.length) parts.push(o.refs.join(", "));
  return parts.join("\n");
}

export function GoalPanel({ goalId, onClose, onOpenSession }: {
  goalId: string;
  onClose: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setBoard(await api.getGoalBoard(goalId)); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "목표를 불러오지 못했습니다."); }
  }, [goalId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load();
    }, 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  const judge = useCallback(async (m: Milestone, ok: boolean) => {
    // 반려는 사유 없이 받지 않는다. 담당이 왜 반려됐는지 모르면 같은 것을
    // 다시 올린다.
    let reason = "";
    if (!ok) {
      reason = window.prompt(`'${m.title}' 을(를) 반려합니다.\n무엇이 부족한지 적어 주십시오. 담당에게 전달됩니다.`)?.trim() || "";
      if (!reason) return;
    }
    setBusy(m.id);
    try {
      await api.confirmMilestone(m.id, ok, reason);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally { setBusy(null); }
  }, [load]);

  const done = board?.milestones.filter((m) => m.status === "completed").length ?? 0;
  const total = board?.milestones.length ?? 0;

  return (
    <aside aria-label="목표 진행" style={{
      width: "min(420px, 92vw)", flexShrink: 0, borderLeft: "1px solid var(--border)",
      background: "var(--bg-card)", display: "flex", flexDirection: "column", height: "100%",
    }}>
      <header style={{ padding: "13px 15px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-primary)" }}>
            🎯 {board?.goal.title || "목표"}
          </div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--text-secondary)" }}>
            {total > 0 ? `마일스톤 ${done}/${total}` : "마일스톤 없음"}
            {board?.halted && <span style={{ marginLeft: 8, color: "#dc2626", fontWeight: 700 }}>전체 정지 중</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기"
          style={{ minHeight: 30, minWidth: 30, border: 0, background: "transparent", color: "var(--text-secondary)", fontSize: 17, cursor: "pointer" }}>✕</button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 15px" }}>
        {err && <div role="alert" style={{ marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 11.5 }}>{err}</div>}

        {board && total === 0 && (
          <div style={{ padding: "14px 12px", borderRadius: 9, border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
            아직 마일스톤이 없습니다. 주도가 세워 대표님 승인을 받으면
            여기에 나옵니다. 그 전까지는 자동 진행이 시작되지 않습니다.
          </div>
        )}

        {board?.milestones.map((m) => {
          const mk = MARK[m.status] || MARK.pending;
          const ev = evidenceText(m.evidence);
          return (
            <div key={m.id} style={{ marginBottom: 9, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border)", borderLeft: `3px solid ${mk.color}`, background: "var(--bg-primary)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: mk.color, fontWeight: 800, fontSize: 12 }}>{mk.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                  {m.sequence_order}{m.variant || ""} {m.title}
                </span>
                {m.owner_role_key && <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{m.owner_role_key}</span>}
              </div>

              {m.completion_criteria && (
                <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  완료 기준 · {m.completion_criteria}
                </div>
              )}

              {m.status === "review" && ev && (
                <div style={{ marginTop: 7, padding: "7px 9px", borderRadius: 7, background: "rgba(124,58,237,.08)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#7c3aed" }}>신고한 근거</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{ev}</div>
                  <div style={{ marginTop: 7, display: "flex", gap: 6 }}>
                    <button type="button" disabled={busy === m.id} onClick={() => void judge(m, true)}
                      style={{ minHeight: 29, padding: "0 11px", fontSize: 11.5, borderRadius: 6, border: 0, background: "#16a34a", color: "white", fontWeight: 700, cursor: "pointer" }}>승인</button>
                    <button type="button" disabled={busy === m.id} onClick={() => void judge(m, false)}
                      style={{ minHeight: 29, padding: "0 11px", fontSize: 11.5, borderRadius: 6, border: "1px solid #dc2626", background: "transparent", color: "#dc2626", fontWeight: 700, cursor: "pointer" }}>반려</button>
                  </div>
                </div>
              )}

              {m.dispatch_note && (
                <div style={{ marginTop: 5, fontSize: 11, color: "#dc2626" }}>■ {m.dispatch_note}</div>
              )}
              {(m.open_notes || 0) > 0 && (
                <div style={{ marginTop: 5, fontSize: 11, color: "#d97706" }}>✏ 의견·수정 요청 {m.open_notes}건 — 응답 대기</div>
              )}
            </div>
          );
        })}

        {board && board.owners.length > 0 && (
          <>
            <div style={{ margin: "15px 0 7px", fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
              담당 {board.owners.length}명
            </div>
            {board.owners.map((o) => (
              <button key={o.session_id} type="button"
                onClick={() => onOpenSession?.(o.session_id)}
                style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 5, padding: "7px 10px", borderRadius: 8, border: o.is_lead ? "1px solid var(--accent)" : "1px solid var(--border)", background: "var(--bg-primary)", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {o.is_lead ? "👑 " : ""}{o.title}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{o.state}</span>
                </div>
                {o.paused && o.paused_reason && (
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "var(--text-secondary)" }}>멈춤 — {o.paused_reason}</div>
                )}
              </button>
            ))}
          </>
        )}

        {board?.documents && board.documents.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {board.documents.map((d) => (
              <a key={d.doc_path} href={`/docs?path=${encodeURIComponent(d.doc_path)}`}
                 style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none" }}>
                {d.kind === "plan" ? "📋 기획서" : d.kind === "prd" ? "📐 PRD" : "🔗 문서"}
              </a>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
