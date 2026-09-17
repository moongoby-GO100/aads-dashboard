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
import { buildGoalDocHref } from "@/lib/documentLinks";
import { SESSION_REF_HINT, extractSessionId } from "@/lib/sessionRef";

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

  // 승인 설정. 대표님이 담당과 대화하다 바로 켜고 끄실 수 있어야 한다 —
  // `/goals` 로 옮겨 가면 그 대화 맥락이 끊긴다.
  const [policy, setPolicy] = useState<{
    auto_approve_high: boolean; auto_approve_critical: boolean;
    max_executions: number; used: number;
  } | null>(null);
  const [countDraft, setCountDraft] = useState("200");

  useEffect(() => {
    let alive = true;
    api.getGoalApprovalPolicy(goalId)
      .then((p) => { if (alive) setPolicy(p); })
      .catch(() => { if (alive) setPolicy(null); });
    return () => { alive = false; };
  }, [goalId]);

  useEffect(() => { setCountDraft(String(policy?.max_executions ?? 200)); },
            [policy?.max_executions]);

  const savePolicy = useCallback(async (patch: Partial<{
    auto_approve_high: boolean; auto_approve_critical: boolean; max_executions: number;
  }>) => {
    const next = {
      auto_approve_high: policy?.auto_approve_high ?? false,
      auto_approve_critical: policy?.auto_approve_critical ?? false,
      max_executions: policy?.max_executions || 200,
      ...patch,
    };
    // 주문·자금은 한 번 더 묻는다. 돈이 직접 걸린다.
    if (patch.auto_approve_critical === true &&
        !window.confirm("주문·자금·서비스 재기동까지 이 목표 동안 묻지 않고 통과시킵니다.\n돈이 직접 걸립니다. 계속할까요?")) {
      return;
    }
    try {
      const saved = await api.setGoalApprovalPolicy(goalId, next);
      setPolicy({ ...next, used: saved.used ?? 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "승인 설정을 저장하지 못했습니다.");
    }
  }, [goalId, policy]);

  // 글자마다 저장하면 "200" 이 2 → 20 → 200 으로 세 번 저장된다.
  const commitCount = useCallback(async () => {
    const n = Math.min(5000, Math.max(1, Number(countDraft) || 1));
    setCountDraft(String(n));
    if (n !== policy?.max_executions) await savePolicy({ max_executions: n });
  }, [countDraft, policy, savePolicy]);

  // 주도 직접 등록. 후보 목록(`/goals` 의 "+ 주도 지정")은 이미 붙어 있는
  // 세션이 있어야 워크스페이스를 알 수 있어서, 담당 0명인 목표는 목록이
  // 비고 붙일 길이 없었다 — 2026-09-17 실측으로 활성 목표 11개 중 7개가
  // 그 상태였다. 대표님이 채팅창 주소를 그대로 붙여넣으실 수 있게 한다.
  const [leadDraft, setLeadDraft] = useState("");
  const [leadErr, setLeadErr] = useState("");
  const [leadBusy, setLeadBusy] = useState(false);

  const registerLead = useCallback(async () => {
    // 오타는 여기서 잡는다. 서버까지 한 번 다녀와서 400 을 받는 것보다,
    // 입력칸 옆에서 바로 알려 드리는 편이 빠르다.
    const sid = extractSessionId(leadDraft);
    if (!sid) { setLeadErr(SESSION_REF_HINT); return; }
    setLeadBusy(true); setLeadErr("");
    try {
      const r = await api.addGoalOwner(goalId, { session_ref: sid, as_lead: true });
      setLeadDraft("");
      await load();
      // 역할 프롬프트가 없으면 그 창은 자기가 누구인지 모르는 채로 시작한다.
      // 붙기는 붙었으므로 실패로 처리하지 않고, 패널 위에 남겨 알린다.
      if (r?.warning) setErr(String(r.warning));
    } catch (e) {
      setLeadErr(e instanceof Error ? e.message : "주도를 붙이지 못했습니다.");
    } finally { setLeadBusy(false); }
  }, [goalId, leadDraft, load]);

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
  const lead = board?.owners.find((o) => o.is_lead) ?? null;
  // has_lead 는 서버가 내려주지만, 옛 응답에도 견디게 담당 목록으로 되짚는다.
  const hasLead = !!board && (board.has_lead ?? board.owners.some((o) => o.is_lead));
  const crew = board?.owners.filter((o) => !o.is_lead) ?? [];

  return (
    <aside aria-label="목표 진행" style={{
      // 420px 에서는 마일스톤 제목이 두세 줄로 접혀 목록이 읽히지 않는다
      // (2026-09-17 대표님 "마일스톤 표시 화면이 너무 작게 나온다").
      width: "min(520px, 94vw)", flexShrink: 0, borderLeft: "1px solid var(--border)",
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

      {/* 본문은 마일스톤이다. 승인 설정·담당·문서와 한 스크롤에 섞여 있어서,
          마일스톤이 서너 개만 넘어가도 뒤엣것이 한참 아래로 밀리고 정작
          마일스톤은 화면 윗동강만 보였다 (2026-09-17 대표님 "마일스톤 표시
          화면이 너무 작게 나온다" — 폭은 520px 로 넓혔지만 세로가 남았다).

          패널은 100vh 다(부모가 fixed top:0 bottom:0). 여기서 머리글 ~58px 과
          접힌 부속 줄 ~42px 만 빼므로 평소 마일스톤 몫은 **~88vh** 다.
          부속을 펼치면 그만큼(최대 30vh) 줄지만 그때도 ~60vh 는 남는다.

          높이를 vh 로 **박지 않는다.** 마일스톤 60vh + 부속 30vh + 머리글·요약
          100px 은 1600px 보다 낮은 화면에서 100vh 를 넘어 패널 밖으로 흘러넘친다.
          남는 자리를 flex 가 나눠 갖게 두면 어떤 화면에서도 넘치지 않는다. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "12px 15px" }}>
          {err && <div role="alert" style={{ marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 11.5 }}>{err}</div>}

          {/* 주도 미지정 — 여기서 바로 붙인다. 주도가 있으면 이 칸은 사라지고,
              담당 추가는 기존대로 `/goals` 의 후보 목록에서 한다. */}
          {board && !hasLead && (
            <div style={{ marginBottom: 11, padding: "11px 12px", borderRadius: 9, border: "1px solid #d97706", background: "rgba(217,119,6,.07)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#d97706" }}>⚠ 주도 미지정 — 취합하고 판정할 사람이 없습니다</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                담당이 신고해도 완료 판정이 되지 않습니다. 주도로 세울 채팅창을 열고
                <b> 주소창을 그대로</b> 붙여넣으십시오. 세션 ID 만 적으셔도 됩니다.
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <input value={leadDraft} aria-label="주도 세션 링크"
                  onChange={(e) => { setLeadDraft(e.target.value); if (leadErr) setLeadErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !leadBusy) void registerLead(); }}
                  placeholder="https://aads.newtalk.kr/chat#0a1b2c3d-…"
                  style={{ flex: 1, minWidth: 0, minHeight: 32, padding: "0 10px", borderRadius: 7,
                           border: `1px solid ${leadErr ? "#dc2626" : leadDraft.trim() ? "#d97706" : "var(--border)"}`,
                           background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 11.5 }} />
                <button type="button" disabled={!leadDraft.trim() || leadBusy}
                  onClick={() => void registerLead()}
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 11.5, borderRadius: 7, border: 0,
                           background: leadDraft.trim() && !leadBusy ? "#d97706" : "var(--border)", color: "white",
                           fontWeight: 700, cursor: leadDraft.trim() && !leadBusy ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                  {leadBusy ? "붙이는 중" : "세션 링크 등록"}
                </button>
              </div>
              {leadErr && (
                <div role="alert" style={{ marginTop: 7, fontSize: 11, color: "#dc2626", lineHeight: 1.5 }}>{leadErr}</div>
              )}
            </div>
          )}

          {/* 붙은 주도는 접힌 부속 안이 아니라 여기에 낸다 — 등록 직후 대표님이
              "무엇이 붙었는지" 를 그 자리에서 확인하셔야 한다. */}
          {lead && (
            <button type="button" onClick={() => onOpenSession?.(lead.session_id)}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 11, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--accent)", background: "var(--bg-primary)", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>👑 주도 · {lead.title}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.state}</span>
              </div>
            </button>
          )}

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

        </div>

        {/* 부속 — 승인 설정 · 담당 · 문서. 접어 두되 접힌 줄에 상태를 적는다.
            2026-09-15 에 승인 설정을 담당 목록 안에 두었다가 스크롤 아래로
            묻혀 "안 나온다" 는 지적을 받았다. 접는 것과 묻히는 것은 다르다 —
            접힌 줄은 늘 화면 맨 아래에 붙어 있고 상태가 거기 적힌다. */}
        <details style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <summary style={{ padding: "10px 15px", cursor: "pointer", fontSize: 11.5, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              승인 설정 · 담당 {crew.length}명{board?.documents?.length ? ` · 문서 ${board.documents.length}` : ""}
            </span>
            <span style={{ color: policy?.auto_approve_critical ? "#dc2626" : policy?.auto_approve_high ? "#d97706" : "var(--text-secondary)" }}>
              {policy?.auto_approve_critical ? "주문·자금까지 미리 승인"
                : policy?.auto_approve_high ? "코드 수정 미리 승인"
                : "변경마다 묻습니다"}
            </span>
          </summary>
          {/* 펼쳐도 마일스톤을 밀어내지 않도록 여기까지만 쓴다 — 이 상한이
              곧 마일스톤이 최악의 경우에도 지키는 세로(≈60vh)를 정한다. */}
          <div style={{ maxHeight: "min(30vh, 320px)", overflowY: "auto", padding: "0 15px 13px" }}>
          {/* 승인 설정 — 이 목표 동안 미리 허락해 둘 범위.
              켜 두면 담당이 같은 종류의 변경을 할 때마다 묻지 않는다. */}
          <div style={{ marginTop: 4, padding: "9px 11px", borderRadius: 8,
                        border: `1px solid ${policy?.auto_approve_critical ? "#dc2626" : policy?.auto_approve_high ? "#d97706" : "var(--border)"}`,
                        background: "var(--bg-primary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 11.5, color: "var(--text-primary)" }}>승인 설정</strong>
              <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {policy && (policy.auto_approve_high || policy.auto_approve_critical)
                  ? `사용 ${policy.used}/${policy.max_executions}회`
                  : "변경마다 묻습니다"}
              </span>
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, fontSize: 11, color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={!!policy?.auto_approve_high}
                     onChange={(e) => void savePolicy({ auto_approve_high: e.target.checked })} />
              실매매 <b>코드 수정</b> 미리 승인
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontSize: 11, color: "#dc2626", cursor: "pointer" }}>
              <input type="checkbox" checked={!!policy?.auto_approve_critical}
                     onChange={(e) => void savePolicy({ auto_approve_critical: e.target.checked })} />
              <b>주문·자금</b>까지 미리 승인
            </label>
            <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-secondary)", display: "flex", gap: 5, alignItems: "center" }}>
              허용
              <input type="number" min={1} max={5000} value={countDraft}
                     onChange={(e) => setCountDraft(e.target.value)}
                     onBlur={() => void commitCount()}
                     onKeyDown={(e) => { if (e.key === "Enter") void commitCount(); }}
                     style={{ width: 66, padding: "2px 5px", fontSize: 11, borderRadius: 5,
                              border: "1px solid var(--border)", background: "var(--bg-card)",
                              color: "var(--text-primary)" }} />
              회 — 넘으면 다시 묻습니다
            </div>
          </div>

          {/* 주도는 위(마일스톤 칸)에 이미 내놨다. 여기서 또 내면 같은 창이
              두 번 보여 어느 쪽이 정본인지 헷갈린다. 담당만 적는다. */}
          {crew.length > 0 && (
            <>
              <div style={{ margin: "15px 0 7px", fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                담당 {crew.length}명
              </div>
              {crew.map((o) => (
                <button key={o.session_id} type="button"
                  onClick={() => onOpenSession?.(o.session_id)}
                  style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 5, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                      {o.title}
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
              {board.documents.map((d) => {
                const href = buildGoalDocHref(d.doc_path);
                const icon = d.kind === "plan" ? "📋" : d.kind === "prd" ? "📐" : "🔗";
                const label = (d.title || "").trim() || d.doc_path.split("/").pop() || "문서";
                // 새 탭으로 연다 — 담당과의 대화 맥락을 두고 문서만 본다.
                return (
                  <a key={d.doc_path} href={href || undefined} target="_blank" rel="noopener noreferrer"
                     title={`${label} — ${d.doc_path}`}
                     style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {icon} {label}
                  </a>
                );
              })}
            </div>
          )}
          </div>
        </details>
      </div>
    </aside>
  );
}
