"use client";

/**
 * 승인 대기 레시피 패널.
 *
 * 녹화 직후 state(registrationId)와 무관하게 서버의 pending 목록을 직접 불러온다.
 * 새로고침·레인 전환·채팅에서 등록한 건도 여기서 결정할 수 있다.
 * 결정 주체·자기승인·고위험 확인은 서버가 강제한다 — 이 화면은 그 거부를 읽을 수 있는
 * 문구로 바꿔 보여 줄 뿐이다.
 */

import { useCallback, useEffect, useState } from "react";
import { api, type OhvisRecipeRegistration, type OhvisRecipeStepSummary } from "@/lib/api";

const C = {
  bg: "#0f1117",
  pane: "#151722",
  card: "#1e2130",
  border: "#2d3148",
  borderSoft: "#3d4468",
  text: "#e2e8f0",
  muted: "#7c8db5",
  dim: "#4b5563",
  accent: "#3b82f6",
  ok: "#10b981",
  warn: "#f59e0b",
  blk: "#ef4444",
} as const;

const MONO = "'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";
const POLL_MS = 30000;
const STALE_DAYS = 7;
const RISK_ORDER = ["READ", "WRITE_INTERNAL", "WRITE_EXTERNAL", "IRREVERSIBLE"];
const RISK_LABEL: Record<string, string> = {
  READ: "읽기",
  WRITE_INTERNAL: "내부 쓰기",
  WRITE_EXTERNAL: "외부 쓰기",
  IRREVERSIBLE: "되돌릴 수 없음",
};

function riskRank(risk?: string | null): number {
  const idx = RISK_ORDER.indexOf(String(risk || "").toUpperCase());
  return idx < 0 ? RISK_ORDER.length - 1 : idx;
}

// 위험도를 모르면 가장 높은 것으로 본다 — 서버의 판정 규칙과 같다.
function isHighRisk(risk?: string | null): boolean {
  return riskRank(risk || "IRREVERSIBLE") >= riskRank("WRITE_EXTERNAL");
}

function riskTone(risk?: string | null): { bg: string; color: string } {
  if (isHighRisk(risk)) return { bg: "#4c0519", color: "#fca5a5" };
  if (riskRank(risk) === 1) return { bg: "#3b2000", color: "#fbbf24" };
  return { bg: "#064e3b", color: "#6ee7b7" };
}

function riskText(risk?: string | null): string {
  const key = String(risk || "").toUpperCase();
  return RISK_LABEL[key] ? `${RISK_LABEL[key]} · ${key}` : key || "위험도 미확인";
}

function elapsedLabel(value?: string | null, now = Date.now()): string {
  if (!value) return "요청 시각 없음";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "요청 시각 없음";
  const days = Math.floor((now - time) / 86400000);
  return days <= 0 ? "오늘 요청" : `${days}일 경과`;
}

function isStale(value?: string | null, now = Date.now()): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && now - time > STALE_DAYS * 86400000;
}

function requestedAtLabel(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function safeImageSrc(value?: string | null): string {
  const src = String(value || "").trim();
  return /^(https?:\/\/|\/)/i.test(src) ? src : "";
}

interface DecisionFailure {
  message: string;
  stale: boolean;
  needsHighRiskConfirm: boolean;
}

/** request() 는 실패를 `API error <status>: <본문>` 문자열로 던진다. */
export function explainDecisionError(reason: unknown): DecisionFailure {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (/^401\b/.test(raw)) {
    return {
      message: "로그인이 만료되었습니다. 다시 로그인한 뒤 같은 버튼을 눌러 주세요.",
      stale: false,
      needsHighRiskConfirm: false,
    };
  }
  const matched = raw.match(/^API error (\d+):\s*([\s\S]*)$/);
  const status = matched ? Number(matched[1]) : 0;
  let detail = matched ? matched[2].trim() : raw;
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown };
    if (typeof parsed.detail === "string") detail = parsed.detail;
    else if (parsed.detail) detail = JSON.stringify(parsed.detail);
  } catch {
    /* 본문이 JSON 이 아니면 그대로 쓴다 */
  }

  if (status === 403 && detail === "human_decider_required") {
    return {
      message: "사람 계정으로 로그인해야 결정할 수 있습니다. 자동화·서비스 키로는 승인·반려가 되지 않습니다. 대표님 계정으로 다시 로그인한 뒤 시도해 주세요.",
      stale: false,
      needsHighRiskConfirm: false,
    };
  }
  if (status === 403 && (detail === "self_approval_blocked" || detail === "self_approval_denied")) {
    return {
      message: "요청한 계정은 자기 요청을 승인할 수 없습니다. 요청자와 다른 담당자(대표님 계정)로 로그인해 승인해 주세요. 반려는 가능합니다.",
      stale: false,
      needsHighRiskConfirm: false,
    };
  }
  if (status === 409 && detail === "high_risk_confirmation_required") {
    return {
      message: "외부 쓰기 이상의 위험 작업이라 확인이 한 번 더 필요합니다. 확인 창에서 단계를 읽고 다시 승인해 주세요.",
      stale: false,
      needsHighRiskConfirm: true,
    };
  }
  if (status === 409 && detail.startsWith("registration_already_decided")) {
    const state = detail.split(":")[1];
    const label = state === "approved" ? "승인됨" : state === "rejected" ? "반려됨" : "처리됨";
    return {
      message: `이미 다른 곳에서 ${label} 상태입니다. 목록을 새로 불러왔습니다.`,
      stale: true,
      needsHighRiskConfirm: false,
    };
  }
  if (status === 404) {
    return {
      message: "요청을 찾을 수 없습니다. 이미 삭제되었거나 다른 테넌트의 건입니다. 목록을 새로 불러왔습니다.",
      stale: true,
      needsHighRiskConfirm: false,
    };
  }
  if (status === 409) {
    return {
      message: `서버가 이 레시피의 승인을 거부했습니다(${detail}). 내용을 수정해 다시 등록 요청해야 할 수 있습니다.`,
      stale: false,
      needsHighRiskConfirm: false,
    };
  }
  return {
    message: `처리하지 못했습니다(${status || "연결 오류"}). 잠시 뒤 다시 시도해 주세요. ${detail.slice(0, 160)}`.trim(),
    stale: false,
    needsHighRiskConfirm: false,
  };
}

function badgeStyle(tone: { bg: string; color: string }): React.CSSProperties {
  return { fontSize: 10, padding: "1px 7px", borderRadius: 8, background: tone.bg, color: tone.color, whiteSpace: "nowrap" };
}

function buttonStyle(kind: "approve" | "reject" | "plain", disabled = false): React.CSSProperties {
  const palette = {
    approve: { background: C.ok, color: "#052e1b", border: "none" },
    reject: { background: "#3f3f46", color: "#e4e4e7", border: "none" },
    plain: { background: C.card, color: "#a0aec0", border: `1px solid ${C.borderSoft}` },
  }[kind];
  return {
    ...palette,
    flex: "1 1 96px",
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function StepList({ steps }: { steps: OhvisRecipeStepSummary[] }) {
  if (steps.length === 0) {
    return <p style={{ fontSize: 11, color: C.dim }}>서버가 단계 미리보기를 주지 않았습니다.</p>;
  }
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.map((step, index) => (
        <li
          key={`${step.phase}-${step.seq}-${index}`}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", fontSize: 11, lineHeight: 1.5, minWidth: 0 }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: C.dim }}>{step.phase === "verify" ? "검증" : "단계"} {step.seq}</span>
            <b style={{ color: C.text }}>{step.action || "-"}</b>
            <span style={badgeStyle(riskTone(step.risk))}>{step.risk}</span>
          </div>
          <div style={{ fontFamily: MONO, color: C.muted, wordBreak: "break-all" }}>
            {step.url_host ? `주소 ${step.url_host}` : "주소 없음"}
            {step.selector ? ` · ${step.selector}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}

type Notice = { kind: "ok" | "err"; text: string } | null;

export default function RecipeApprovalPanel() {
  const [items, setItems] = useState<OhvisRecipeRegistration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirming, setConfirming] = useState<OhvisRecipeRegistration | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchReason, setBatchReason] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listOhvisRecipeRegistrations("pending");
      const list = Array.isArray(data?.registrations) ? data.registrations : [];
      setItems(list);
      setSelected((prev) => {
        const alive = new Set(list.map((entry) => entry.id));
        const next = new Set([...prev].filter((id) => alive.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setLoadError(null);
    } catch (reason) {
      setLoadError(explainDecisionError(reason).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const setItemError = (id: string, text: string | null) =>
    setItemErrors((prev) => {
      const next = { ...prev };
      if (text) next[id] = text;
      else delete next[id];
      return next;
    });

  const decide = async (item: OhvisRecipeRegistration, decision: "approve" | "reject", reason: string, confirmHighRisk: boolean) => {
    if (busyId || batchBusy) return;
    setBusyId(item.id);
    setItemError(item.id, null);
    setNotice(null);
    try {
      await api.decideOhvisRecipeRegistration(item.id, decision, reason, confirmHighRisk);
      setNotice({
        kind: "ok",
        text: `${item.name || "레시피"} ${item.version ? `v${item.version} ` : ""}${decision === "approve" ? "승인됨" : "반려됨"}`,
      });
      setConfirming(null);
      setRejecting(null);
      setRejectReason("");
      if (expanded === item.id) setExpanded(null);
      await load();
    } catch (failureReason) {
      const failure = explainDecisionError(failureReason);
      setItemError(item.id, failure.message);
      if (failure.needsHighRiskConfirm) {
        setConfirming(item);
        setConfirmChecked(false);
      } else {
        setConfirming(null);
      }
      if (failure.stale) await load();
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = (item: OhvisRecipeRegistration) => {
    setItemError(item.id, null);
    setRejecting(null);
    if (isHighRisk(item.max_risk)) {
      setConfirming(item);
      setConfirmChecked(false);
      return;
    }
    void decide(item, "approve", "", false);
  };

  const onStartReject = (item: OhvisRecipeRegistration) => {
    setItemError(item.id, null);
    setRejecting(item.id);
    setRejectReason("");
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const batchReject = async () => {
    const reason = batchReason.trim();
    if (busyId || batchBusy || !reason || selected.size === 0) return;
    setBatchBusy(true);
    setNotice(null);
    const failures: string[] = [];
    let done = 0;
    for (const item of (items ?? []).filter((entry) => selected.has(entry.id))) {
      try {
        await api.decideOhvisRecipeRegistration(item.id, "reject", reason, false);
        done += 1;
      } catch (failureReason) {
        failures.push(`${item.name || item.id}: ${explainDecisionError(failureReason).message}`);
      }
    }
    setNotice({
      kind: failures.length === 0 ? "ok" : "err",
      text: failures.length === 0
        ? `${done}건 일괄 반려됨`
        : `${done}건 반려, ${failures.length}건 실패. ${failures.join(" / ").slice(0, 400)}`,
    });
    if (failures.length === 0) setBatchReason("");
    setBatchBusy(false);
    await load();
  };

  const now = Date.now();
  const count = items?.length ?? 0;
  const staleIds = (items ?? []).filter((entry) => isStale(entry.requested_at, now)).map((entry) => entry.id);
  const highSteps = (confirming?.step_summaries ?? []).filter((step) => isHighRisk(step.risk));

  return (
    <section id="recipe-approvals" aria-label="승인 대기 레시피" style={{ scrollMarginTop: 8 }}>
      <div
        style={{
          padding: "9px 14px",
          fontSize: 11,
          fontWeight: 700,
          color: C.muted,
          letterSpacing: ".7px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>
          승인 대기 레시피{" "}
          <span style={{ color: count > 0 ? "#fbbf24" : C.dim }}>{items === null ? "" : `${count}건`}</span>
        </span>
        <button
          type="button"
          onClick={() => void load()}
          style={{ background: "transparent", border: `1px solid ${C.borderSoft}`, color: C.muted, borderRadius: 5, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}
        >
          새로고침
        </button>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            margin: "8px 10px 0",
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 12,
            background: notice.kind === "ok" ? "#052e1b" : "#2a0d0d",
            border: `1px solid ${notice.kind === "ok" ? "#166534" : "#7f1d1d"}`,
            color: notice.kind === "ok" ? "#6ee7b7" : "#fca5a5",
          }}
        >
          {notice.text}
        </div>
      )}
      {loadError && (
        <div role="alert" style={{ margin: "8px 10px 0", padding: "7px 10px", borderRadius: 6, fontSize: 12, background: "#2a0d0d", border: "1px solid #7f1d1d", color: "#fca5a5" }}>
          목록을 불러오지 못했습니다. {loadError}
        </div>
      )}
      {items === null && !loadError && (
        <div style={{ margin: "8px 10px", fontSize: 11, color: C.dim }}>불러오는 중…</div>
      )}
      {items !== null && items.length === 0 && !loadError && (
        <div style={{ margin: "8px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px" }}>
          <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>승인을 기다리는 레시피가 없습니다.</p>
        </div>
      )}

      {count > 0 && (
        <div style={{ margin: "8px 10px 0", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: C.muted }}>
            <span>선택 {selected.size}건</span>
            <button
              type="button"
              onClick={() => setSelected(new Set(items?.map((entry) => entry.id)))}
              disabled={batchBusy}
              style={{ ...buttonStyle("plain", batchBusy), flex: "0 0 auto", minHeight: 32, fontSize: 11 }}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set(staleIds))}
              disabled={batchBusy || staleIds.length === 0}
              style={{ ...buttonStyle("plain", batchBusy || staleIds.length === 0), flex: "0 0 auto", minHeight: 32, fontSize: 11 }}
            >
              {STALE_DAYS}일 넘은 건 선택 ({staleIds.length})
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={batchBusy || selected.size === 0}
              style={{ ...buttonStyle("plain", batchBusy || selected.size === 0), flex: "0 0 auto", minHeight: 32, fontSize: 11 }}
            >
              선택 해제
            </button>
          </div>
          {selected.size > 0 && (
            <>
              <label htmlFor="recipe-batch-reason" style={{ fontSize: 12, color: C.muted }}>
                일괄 반려 사유 (필수, 선택한 건 모두에 같은 사유가 기록됩니다)
              </label>
              <textarea
                id="recipe-batch-reason"
                value={batchReason}
                onChange={(event) => setBatchReason(event.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="예: 오래된 요청이라 다시 녹화하도록 반려"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "7px 9px", color: C.text, fontSize: 13, resize: "vertical" }}
              />
              <button
                type="button"
                onClick={() => void batchReject()}
                disabled={batchBusy || busyId !== null || batchReason.trim().length === 0}
                style={{ ...buttonStyle("reject", batchBusy || busyId !== null || batchReason.trim().length === 0), background: "#b91c1c", color: "#fff" }}
              >
                {batchBusy ? "처리 중…" : `선택 ${selected.size}건 일괄 반려`}
              </button>
            </>
          )}
        </div>
      )}

      {(items ?? []).map((item) => {
        const isOpen = expanded === item.id;
        const steps = item.step_summaries ?? [];
        const image = safeImageSrc(item.screen_evidence_url);
        const busy = busyId === item.id || batchBusy;
        const stale = isStale(item.requested_at, now);
        const high = isHighRisk(item.max_risk);
        const error = itemErrors[item.id];
        return (
          <article key={item.id} style={{ margin: "8px 10px", background: "#1c1008", border: "1px solid #92400e", borderRadius: 8, padding: "9px 11px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  disabled={batchBusy}
                  aria-label={`${item.name || "레시피"} 일괄 반려 대상으로 선택`}
                  style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
                />
              <h4 style={{ fontSize: 13, color: C.text, margin: 0, wordBreak: "break-word", minWidth: 0 }}>
                {item.name || "이름 없는 레시피"}
                {item.version ? <span style={{ color: C.muted, fontWeight: 400 }}> · v{item.version}</span> : null}
              </h4>
              </label>
              <span style={badgeStyle(riskTone(item.max_risk))}>{riskText(item.max_risk)}</span>
            </div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: "3px 0 0", wordBreak: "break-all" }}>
              {item.domain || "도메인 없음"} · {item.step_count ?? steps.length}단계
              {item.verify_count ? ` + 검증 ${item.verify_count}` : ""}
            </p>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0, wordBreak: "break-all" }} title={item.requested_by || ""}>
              요청 세션 {item.requested_by ? String(item.requested_by).slice(0, 40) : "-"} · {requestedAtLabel(item.requested_at)} ·{" "}
              <b style={{ color: "#fbbf24" }}>{elapsedLabel(item.requested_at, now)}</b>
              {stale && <span style={{ ...badgeStyle({ bg: "#451a03", color: "#fdba74" }), marginLeft: 6 }}>오래됨</span>}
            </p>

            {image ? (
              <a href={image} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 7 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={`${item.name || "레시피"} 화면 증거`}
                  loading="lazy"
                  style={{ width: "100%", maxHeight: 120, objectFit: "cover", objectPosition: "top", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg }}
                />
              </a>
            ) : (
              <p style={{ fontSize: 11, color: C.dim, margin: "6px 0 0" }}>화면 증거 없음</p>
            )}

            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              style={{ marginTop: 7, background: "transparent", border: "none", color: C.accent, fontSize: 12, padding: "6px 0", cursor: "pointer", minHeight: 32 }}
            >
              {isOpen ? "단계 접기 ▲" : `단계 미리보기 (${steps.length}) ▼`}
            </button>
            {isOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <StepList steps={steps} />
                <p style={{ fontSize: 10, color: C.dim, fontFamily: MONO, wordBreak: "break-all", margin: 0 }}>등록 요청 ID {item.id}</p>
              </div>
            )}

            {error && (
              <div role="alert" style={{ marginTop: 8, padding: "7px 9px", borderRadius: 6, fontSize: 12, lineHeight: 1.5, background: "#2a0d0d", border: "1px solid #7f1d1d", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            {rejecting === item.id ? (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor={`reject-${item.id}`} style={{ fontSize: 12, color: C.muted }}>
                  반려 사유 (필수)
                </label>
                <textarea
                  id={`reject-${item.id}`}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="무엇이 맞지 않아 반려하는지 적어 주세요"
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "7px 9px", color: C.text, fontSize: 13, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setRejecting(null)} disabled={busy} style={buttonStyle("plain", busy)}>취소</button>
                  <button
                    type="button"
                    onClick={() => void decide(item, "reject", rejectReason.trim(), false)}
                    disabled={busy || rejectReason.trim().length === 0}
                    style={{ ...buttonStyle("reject", busy || rejectReason.trim().length === 0), background: "#b91c1c", color: "#fff" }}
                  >
                    {busy ? "처리 중…" : "반려 확정"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={() => onStartReject(item)} disabled={busy} style={buttonStyle("reject", busy)}>
                  반려
                </button>
                <button type="button" onClick={() => onApprove(item)} disabled={busy} style={buttonStyle("approve", busy)}>
                  {busy ? "처리 중…" : high ? "승인…" : "승인"}
                </button>
              </div>
            )}
          </article>
        );
      })}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="위험 작업 승인 확인"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99, padding: 16 }}
        >
          <div style={{ background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 12, width: 440, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "15px 19px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>⚠️ 위험 작업이 포함된 레시피입니다</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                {confirming.name} {confirming.version ? `v${confirming.version}` : ""} · {riskText(confirming.max_risk)}
              </div>
            </div>
            <div style={{ padding: "14px 19px", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12.5, color: "#fbbf24", lineHeight: 1.6, margin: 0 }}>
                승인하면 이 레시피는 외부 서비스에 값을 쓰거나 되돌릴 수 없는 동작을 실행할 수 있게 됩니다. 아래 단계를 확인했는지 한 번 더 묻습니다.
              </p>
              {highSteps.length > 0 && <StepList steps={highSteps} />}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(event) => setConfirmChecked(event.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }}
                />
                <span>위 위험 단계를 확인했고, 이 레시피를 승인합니다.</span>
              </label>
              {itemErrors[confirming.id] && (
                <div role="alert" style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>{itemErrors[confirming.id]}</div>
              )}
            </div>
            <div style={{ padding: "12px 19px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setConfirming(null)} disabled={busyId !== null} style={buttonStyle("plain", busyId !== null)}>
                취소
              </button>
              <button
                type="button"
                onClick={() => void decide(confirming, "approve", "", true)}
                disabled={busyId !== null || !confirmChecked}
                style={{ ...buttonStyle("approve", busyId !== null || !confirmChecked), background: "#dc2626", color: "#fff" }}
              >
                {busyId !== null ? "처리 중…" : "위험을 확인하고 승인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
