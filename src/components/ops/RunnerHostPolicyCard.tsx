"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, RunnerHostPolicyHost, RunnerHostPolicyResponse } from "@/lib/api";

type Draft = { max_concurrent: string; heavy_slots: string; urgent_reserved_slots: string };
type Limits = RunnerHostPolicyResponse["limits"];
type Notice = { kind: "ok" | "error" | "conflict"; text: string };

const DEFAULT_LIMITS: Limits = {
  max_concurrent: { min: 1, max: 200 },
  heavy_slots: { min: 0, max: 64 },
  urgent_reserved_slots: { min: 0, max: 64 },
  low_priority_nice: { min: 0, max: 19 },
};

const HOST_LABELS: [string, string][] = [
  ["contabo116", "콘타보116(AADS)"],
  ["contabo14", "콘타보14(GO100)"],
  ["vmi3267555", "콘타보116(AADS)"],
  ["rfree-0009", "카페24(SF/NTV2/NAS)"],
  ["cafe24", "카페24(SF/NTV2/NAS)"],
  ["jinah244", "진아244(ACCT, 구서버)"],
];

function hostLabel(host: string): string {
  const h = host.toLowerCase();
  return HOST_LABELS.find(([prefix]) => h.startsWith(prefix))?.[1] ?? host;
}

function describeLoadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/API error (\d{3})/);
  if (m) {
    const status = m[1];
    if (status === "503") return "서버 설정 테이블(migration)이 아직 적용되지 않았습니다 · 503";
    if (status === "404") return "설정 API를 찾을 수 없습니다 · 404";
    if (status === "403") return "권한이 없습니다 · 403";
    return `서버 오류 · ${status}`;
  }
  if (msg.startsWith("401")) return "세션이 만료되었습니다";
  if (e instanceof TypeError || /failed to fetch|network|load failed/i.test(msg)) return "네트워크 오류";
  return "알 수 없는 오류";
}

function formatKst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function toDraft(h: RunnerHostPolicyHost): Draft {
  const p = h.policy;
  return {
    max_concurrent: p?.max_concurrent != null ? String(p.max_concurrent) : "",
    heavy_slots: String(p?.heavy_slots ?? 0),
    urgent_reserved_slots: String(p?.urgent_reserved_slots ?? 0),
  };
}

function parseInt10(v: string): number | null {
  return /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : null;
}

export function validateRunnerPolicyDraft(d: Draft, limits: Limits): Partial<Record<keyof Draft, string>> {
  const errs: Partial<Record<keyof Draft, string>> = {};
  const range = (key: keyof Draft, allowBlank: boolean) => {
    const raw = d[key].trim();
    if (raw === "") {
      if (!allowBlank) errs[key] = "숫자를 입력하세요";
      return;
    }
    const n = parseInt10(raw);
    const { min, max } = limits[key];
    if (n === null || n < min || n > max) errs[key] = `${min}~${max} 정수`;
  };
  range("max_concurrent", true);
  range("heavy_slots", false);
  range("urgent_reserved_slots", false);
  if (!errs.heavy_slots && !errs.urgent_reserved_slots) {
    if (Number(d.urgent_reserved_slots) > Number(d.heavy_slots)) {
      errs.urgent_reserved_slots = "무거운 명령 슬롯 이하여야 함";
    }
  }
  return errs;
}

export default function RunnerHostPolicyCard() {
  const [data, setData] = useState<RunnerHostPolicyResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getRunnerHostPolicy();
      setData(res);
      setDrafts(Object.fromEntries(res.hosts.map((h) => [h.host, toDraft(h)])));
    } catch (e) {
      setLoadError(describeLoadError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const limits = data?.limits ?? DEFAULT_LIMITS;
  const hintSec = data?.apply_hint_sec ?? 10;

  const errorsByHost = useMemo(() => {
    const out: Record<string, ReturnType<typeof validateRunnerPolicyDraft>> = {};
    for (const h of data?.hosts ?? []) {
      out[h.host] = validateRunnerPolicyDraft(drafts[h.host] ?? toDraft(h), limits);
    }
    return out;
  }, [data, drafts, limits]);

  const setField = (host: string, key: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [host]: { ...prev[host], [key]: value } }));
    setNotices((prev) => {
      if (!prev[host]) return prev;
      const next = { ...prev };
      delete next[host];
      return next;
    });
  };

  const save = async (h: RunnerHostPolicyHost) => {
    const d = drafts[h.host];
    if (!d || Object.keys(validateRunnerPolicyDraft(d, limits)).length > 0) return;
    setSaving(h.host);
    try {
      const res = await api.putRunnerHostPolicy({
        host: h.host,
        max_concurrent: d.max_concurrent.trim() === "" ? null : Number(d.max_concurrent),
        heavy_slots: Number(d.heavy_slots),
        urgent_reserved_slots: Number(d.urgent_reserved_slots),
        expected_revision: h.policy?.revision ?? null,
      });
      const rev = res.policy?.revision;
      setNotices((prev) => ({
        ...prev,
        [h.host]: {
          kind: "ok",
          text: `저장됨${rev != null ? ` (revision ${rev})` : ""} — 다음 러너 사이클(약 ${res.apply_hint_sec || hintSec}초)에 반영됩니다.`,
        },
      }));
      const fresh = await api.getRunnerHostPolicy();
      setData(fresh);
      setDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(fresh.hosts.filter((x) => x.host === h.host).map((x) => [x.host, toDraft(x)])),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("API error 409")) {
        setNotices((prev) => ({
          ...prev,
          [h.host]: { kind: "conflict", text: "다른 곳에서 바뀌었습니다. 새로고침 후 다시 시도하세요." },
        }));
      } else {
        setNotices((prev) => ({ ...prev, [h.host]: { kind: "error", text: `저장 실패: ${msg}` } }));
      }
    } finally {
      setSaving(null);
    }
  };

  const inputStyle = (bad: boolean): React.CSSProperties => ({
    width: 72,
    padding: "4px 6px",
    fontSize: 13,
    borderRadius: 6,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    border: `1px solid ${bad ? "var(--danger)" : "var(--border)"}`,
  });
  const noticeColor = (k: Notice["kind"]) => (k === "ok" ? "var(--success, #22c55e)" : "var(--danger)");

  return (
    <section
      data-testid="runner-host-policy-card"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 24 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🖥️ 서버별 러너 설정</h3>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
        >
          새로고침
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 12px" }}>
        동시 실행 상한을 비우면 서버 기본값을 씁니다. 대기 수는 서버 담당 프로젝트 기준입니다. 긴급 예약 슬롯은 무거운 명령 슬롯 중 P0/P1 작업 전용입니다.
      </p>

      {loadError && (
        <div
          role="alert"
          style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <span>⚠️ 설정을 불러오지 못했습니다({loadError}) — 다시 시도</span>
          <button
            onClick={load}
            disabled={loading}
            style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 6, padding: "2px 10px", fontSize: 12, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "불러오는 중..." : "다시 시도"}
          </button>
        </div>
      )}
      {!loadError && loading && !data && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>로딩 중...</div>}
      {data && data.hosts.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>등록된 러너 서버가 없습니다.</div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(data?.hosts ?? []).map((h) => {
          const d = drafts[h.host] ?? toDraft(h);
          const errs = errorsByHost[h.host] ?? {};
          const hasErr = Object.keys(errs).length > 0;
          const orig = toDraft(h);
          const dirty =
            d.max_concurrent.trim() !== orig.max_concurrent ||
            d.heavy_slots.trim() !== orig.heavy_slots ||
            d.urgent_reserved_slots.trim() !== orig.urgent_reserved_slots;
          const notice = notices[h.host];
          const warnEqual =
            !hasErr && Number(d.heavy_slots) > 0 && Number(d.urgent_reserved_slots) >= Number(d.heavy_slots);
          return (
            <div
              key={h.host}
              data-testid={`runner-host-${h.host}`}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>
                  <span
                    title={h.alive == null ? "하트비트 없음" : h.alive ? "러너 동작 중" : "하트비트 끊김"}
                    style={{ color: h.alive ? "var(--success, #22c55e)" : h.alive === false ? "var(--danger)" : "var(--text-secondary)" }}
                  >
                    ●
                  </span>{" "}
                  {hostLabel(h.host)}
                  {hostLabel(h.host) !== h.host && (
                    <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 10 }}> {h.host}</span>
                  )}
                </strong>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  실행 {h.running} · 대기 {h.queued}
                  {h.projects.length > 0 && ` · ${h.projects.join(", ")}`}
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                {(
                  [
                    ["max_concurrent", "동시 실행 상한", h.env_max_concurrent != null ? `기본 ${h.env_max_concurrent}` : "기본값"],
                    ["heavy_slots", "무거운 명령 슬롯", "0=제한 없음"],
                    ["urgent_reserved_slots", "긴급 예약 슬롯", ""],
                  ] as [keyof Draft, string, string][]
                ).map(([key, label, ph]) => (
                  <label key={key} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={limits[key].min}
                      max={limits[key].max}
                      step={1}
                      value={d[key]}
                      placeholder={ph}
                      aria-label={`${hostLabel(h.host)} ${label}`}
                      aria-invalid={Boolean(errs[key])}
                      onChange={(e) => setField(h.host, key, e.target.value)}
                      style={inputStyle(Boolean(errs[key]))}
                    />
                    <span style={{ fontSize: 11, color: errs[key] ? "var(--danger)" : "var(--text-secondary)" }}>
                      {errs[key] ?? `${limits[key].min}~${limits[key].max}`}
                    </span>
                  </label>
                ))}
                <div style={{ alignSelf: "center" }}>
                  <button
                    onClick={() => save(h)}
                    disabled={hasErr || !dirty || saving !== null}
                    style={{
                      background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
                      padding: "6px 16px", fontSize: 13, cursor: hasErr || !dirty || saving !== null ? "not-allowed" : "pointer",
                      opacity: hasErr || !dirty || saving !== null ? 0.5 : 1,
                    }}
                  >
                    {saving === h.host ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
                {h.policy
                  ? `revision ${h.policy.revision} · 마지막 수정 ${h.policy.updated_by || "-"} · ${formatKst(h.policy.updated_at)}`
                  : "저장된 설정 없음 (서버 기본값 사용)"}
              </div>
              {warnEqual && (
                <div style={{ fontSize: 11, color: "var(--warning, #f59e0b)", marginTop: 4 }}>
                  긴급 예약 슬롯이 무거운 명령 슬롯과 같으면 일반 작업은 슬롯을 잡지 못하고 대기합니다.
                </div>
              )}
              {notice && (
                <div role="status" style={{ fontSize: 12, marginTop: 6, color: noticeColor(notice.kind) }}>
                  {notice.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
