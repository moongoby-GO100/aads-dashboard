"use client";

import React, { useEffect, useState, useCallback } from "react";

type ClaudeSlotUsage = {
  slot: string;
  label?: string;
  source?: string;
  sampled_at?: string | null;
  primary: { used_percent: number | null; window_minutes: number; resets_at?: string | null };
  secondary: { used_percent: number | null; window_minutes: number; resets_at?: string | null };
};

type TokenLabel = {
  label?: string;
  key_name?: string;
  priority?: number;
  slot?: string;
};

type UsageData = {
  claude_slots?: ClaudeSlotUsage[];
  token_labels?: TokenLabel[];
  claude_max?: {
    plan_type: string;
    source?: string;
    primary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
    secondary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
  };
};

type CodexLimit = {
  limit_id?: string;
  plan_type?: string;
  primary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number; resets_at_iso?: string };
  secondary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number; resets_at_iso?: string };
};

type CodexData = {
  ok?: boolean;
  plan_type?: string;
  limits?: CodexLimit[];
};

type RelayAcquireMetric = {
  attempts?: number;
  successes?: number;
  timeouts?: number;
  wait_attempts?: number;
  waited_successes?: number;
  wait_success_rate_pct?: number;
  avg_success_wait_sec?: number;
  max_wait_sec?: number;
};

type RelayCapacity = {
  status: "ok" | "unavailable";
  max_concurrent: number;
  desired_max_concurrent?: number;
  capacity_transition_pending?: boolean;
  capacity_transition_blocked_by_active_leases?: number;
  used: number;
  available: number;
  usage_percent: number;
  active_leases: { claude?: number; codex?: number; antigravity?: number };
  acquire_metrics?: Record<string, RelayAcquireMetric>;
  sampled_at?: string;
  stale?: boolean;
  stale_age_sec?: number;
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function barColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 50) return "#f59e0b";
  return "#22c55e";
}

function formatResetTime(isoStr?: string): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = Date.now();
    const diffMin = Math.max(0, Math.round((d.getTime() - now) / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d${h % 24}h`;
  } catch {
    return "";
  }
}

function formatResetSeconds(seconds?: number): string {
  if (seconds == null || seconds <= 0) return "";
  const totalMin = Math.max(0, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const hours = h % 24;
  return hours > 0 ? `${days}d${hours}h` : `${days}d`;
}

function MiniBar({ pct, label, detail, resetIn }: { pct: number; label: string; detail: string; resetIn?: string }) {
  const clampedPct = Math.min(pct, 100);
  const remaining = (100 - clampedPct).toFixed(0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }} title={detail}>
      <span style={{ fontSize: "10px", color: "var(--ct-text2)", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
      <div style={{
        width: "48px", height: "6px", borderRadius: "3px",
        background: "var(--ct-border)", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          width: `${clampedPct}%`, height: "100%", borderRadius: "3px",
          background: barColor(clampedPct), transition: "width 0.3s",
        }} />
      </div>
      <span style={{ fontSize: "10px", color: barColor(clampedPct), fontWeight: 600, whiteSpace: "nowrap" }}>
        {remaining}%
      </span>
      {resetIn && (
        <span style={{ fontSize: "9px", color: "var(--ct-text3, #999)", whiteSpace: "nowrap" }}>
          ({resetIn})
        </span>
      )}
    </div>
  );
}

export default function UsageBar() {
  const [claude, setClaude] = useState<UsageData | null>(null);
  const [codex, setCodex] = useState<CodexData | null>(null);
  const [relay, setRelay] = useState<RelayCapacity | null>(null);
  const [relayStale, setRelayStale] = useState(false);
  const [error, setError] = useState(false);

  const fetchUsage = useCallback(async () => {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const [usageRes, codexRes] = await Promise.allSettled([
        fetch(`${BASE}/ops/usage-stats`, { headers }).then((r) => r.json()),
        fetch(`${BASE}/ops/codex-usage`, { headers }).then((r) => r.json()),
      ]);
      if (usageRes.status === "fulfilled") setClaude(usageRes.value);
      if (codexRes.status === "fulfilled") setCodex(codexRes.value);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // 계정 전환은 상단 칩에서 바로 한다. 하단에 따로 토글을 두면 사용률을 보고도
  // 다른 곳으로 내려가 눌러야 해서, 어느 계정이 여유 있는지 모른 채 바꾸게 된다.
  const switchPrimary = useCallback(async (keyName: string, label: string, exhausted: boolean) => {
    if (!keyName || switching) return;
    if (exhausted && !window.confirm(`${label} 계정도 주간 한도를 모두 썼습니다. 그래도 1순위로 바꿀까요?`)) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    setSwitching(keyName);
    setSwitchError(null);
    try {
      const res = await fetch(`${BASE}/settings/auth-keys`, {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ primary: keyName }),
      });
      if (!res.ok) {
        // 옛 구현은 실패를 통째로 삼켜서 버튼이 그냥 안 먹는 것처럼 보였다.
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status} ${detail.slice(0, 120)}`);
      }
      await fetchUsage();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "전환 실패");
    } finally {
      setSwitching(null);
    }
  }, [switching, fetchUsage]);

  const fetchRelayCapacity = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    try {
      const response = await fetch(`${BASE}/health/relay-capacity`, { cache: "no-store" });
      if (!response.ok) throw new Error(`relay capacity ${response.status}`);
      const data = await response.json() as RelayCapacity;
      setRelay(data);
      setRelayStale(data.status !== "ok" || data.stale === true);
    } catch {
      setRelayStale(true);
    }
  }, []);

  useEffect(() => {
    const run = () => {
      void fetchUsage();
    };
    const initial = window.setTimeout(run, 0);
    const iv = window.setInterval(run, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(iv);
    };
  }, [fetchUsage]);

  useEffect(() => {
    const run = () => {
      void fetchRelayCapacity();
    };
    const initial = window.setTimeout(run, 0);
    const iv = window.setInterval(run, 2_000);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", run);
    };
  }, [fetchRelayCapacity]);

  if (error && !relay) return null;
  if (!claude && !codex && !relay) return null;

  const cm = claude?.claude_max;
  const cxAll = codex?.ok ? (codex.limits ?? []) : [];
  const slots = claude?.claude_slots ?? [];
  const tokenLabels = claude?.token_labels ?? [];
  const slotMeta = (slot: string) => tokenLabels.find((t) => String(t.slot ?? "") === slot);
  // priority 1 이 릴레이가 먼저 고르는 계정이다.
  const activeSlot = tokenLabels.reduce<string | null>(
    (best, t) => (t.priority === 1 && t.slot ? String(t.slot) : best), null);
  const isLive = cm?.source === "claude_ai_api" || cm?.source === "db_snapshot";
  const sourceLabel = cm?.source === "claude_ai_api" ? "" : cm?.source === "db_snapshot" ? " (db)" : cm?.source === "anthropic_header" ? " (hdr)" : " (est)";
  const relayMetrics = relay ? Object.values(relay.acquire_metrics ?? {}) : [];
  const waitAttempts = relayMetrics.reduce((sum, metric) => sum + (metric.wait_attempts ?? 0), 0);
  const waitedSuccesses = relayMetrics.reduce((sum, metric) => sum + (metric.waited_successes ?? 0), 0);
  const waitSuccessPct = waitAttempts > 0 ? (100 * waitedSuccesses / waitAttempts) : null;
  const desiredRelayMax = relay?.desired_max_concurrent ?? 15;
  const relayTransitionPending = relay
    ? (relay.capacity_transition_pending ?? relay.max_concurrent !== desiredRelayMax)
    : false;
  const relayTransitionBlockers = relay?.capacity_transition_blocked_by_active_leases
    ?? Object.values(relay?.active_leases ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);
  const relayColor = relayStale || relay?.status !== "ok"
    ? "#94a3b8"
    : (relay?.usage_percent ?? 0) >= 90
      ? "#ef4444"
      : (relay?.usage_percent ?? 0) >= 70
        ? "#f59e0b"
        : "#22c55e";
  const relayTitle = relay?.status === "ok"
    ? [
        `릴레이 점유 ${relay.used}/${relay.max_concurrent} · 가용 ${relay.available}`,
        relayTransitionPending
          ? `목표 ${desiredRelayMax} · 활성 ${relayTransitionBlockers}건 종료 후 무중단 전환`
          : `적용 용량 ${relay.max_concurrent}`,
        `Claude ${relay.active_leases.claude ?? 0} · Codex ${relay.active_leases.codex ?? 0}`,
        waitSuccessPct == null
          ? "슬롯 대기 표본 없음"
          : `슬롯 대기 성공 ${waitedSuccesses}/${waitAttempts} (${waitSuccessPct.toFixed(1)}%)`,
        relay.sampled_at ? `측정 ${new Date(relay.sampled_at).toLocaleTimeString()}` : "",
        relay.stale ? `최근 정상값 (${(relay.stale_age_sec ?? 0).toFixed(1)}초 전)` : "",
      ].filter(Boolean).join("\n")
    : "릴레이 상태를 불러오지 못했습니다. 2초마다 자동 재시도합니다.";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      padding: "3px 14px", borderBottom: "1px solid var(--ct-border)",
      background: "var(--ct-sb)", fontSize: "10px",
    }}>
      {relay && (
        <span
          data-relay-capacity="true"
          title={relayTitle}
          style={{
            display: "inline-flex", alignItems: "center", gap: "5px", minHeight: "18px",
            padding: "1px 7px", border: `1px solid ${relayColor}55`, borderRadius: "9px",
            color: "var(--ct-text2)", whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: relayColor }} />
          <strong style={{ color: relayColor }}>
            Relay {relay.status === "ok"
              ? `${relay.used}/${relay.max_concurrent}${relayTransitionPending ? ` → 목표 ${desiredRelayMax}` : ""}`
              : "확인 중"}
          </strong>
          {relay.status === "ok" && (
            <>
              {relayTransitionPending && (
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                  전환대기 {relayTransitionBlockers}
                </span>
              )}
              <span>여유 {relay.available}</span>
              <span>C {relay.active_leases.claude ?? 0}</span>
              <span>X {relay.active_leases.codex ?? 0}</span>
              <span>대기성공 {waitSuccessPct == null ? "표본없음" : `${waitSuccessPct.toFixed(0)}%`}</span>
            </>
          )}
        </span>
      )}
      {slots.length > 0 ? (
        slots.map((sl) => {
          const name = sl.label || `slot ${sl.slot}`;
          const dot = sl.slot === "1" ? "\uD83D\uDD35" : "\uD83D\uDFE2";
          const seen = sl.secondary.used_percent == null && sl.primary.used_percent == null;
          const keyName = slotMeta(sl.slot)?.key_name ?? "";
          const isActive = activeSlot === sl.slot;
          const exhausted = (sl.secondary.used_percent ?? 0) >= 100;
          return (
            <React.Fragment key={`claude-slot-${sl.slot}`}>
              <button
                type="button"
                disabled={isActive || !keyName || switching !== null}
                onClick={() => void switchPrimary(keyName, name, exhausted)}
                title={[
                  isActive ? "\uD604\uC7AC 1\uC21C\uC704 \uACC4\uC815" : keyName ? `\uD074\uB9AD\uD558\uBA74 ${name} \uC744(\uB97C) 1\uC21C\uC704\uB85C` : "",
                  sl.sampled_at ? `\uCE21\uC815 ${new Date(sl.sampled_at).toLocaleTimeString()} (${sl.source || "-"})` : "\uC544\uC9C1 \uCE21\uC815\uAC12 \uC5C6\uC74C",
                  exhausted ? "\uC8FC\uAC04 \uD55C\uB3C4 \uC18C\uC9C4" : "",
                ].filter(Boolean).join("\n")}
                style={{
                  fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
                  padding: "1px 7px", borderRadius: "9px",
                  border: `1px solid ${isActive ? "#22c55e88" : "var(--ct-border)"}`,
                  background: isActive ? "#22c55e18" : "transparent",
                  color: exhausted ? "var(--ct-text3, #999)" : "var(--ct-text2)",
                  opacity: switching === keyName ? 0.5 : exhausted && !isActive ? 0.6 : 1,
                  cursor: isActive || !keyName || switching !== null ? "default" : "pointer",
                }}
              >
                {dot} {name}{isActive ? " \u25CF" : ""}
              </button>
              {seen ? (
                <span style={{ fontSize: "10px", color: "var(--ct-text3, #999)" }}>\uCE21\uC815 \uB300\uAE30</span>
              ) : (
                <>
                  <MiniBar
                    pct={sl.primary.used_percent ?? 0}
                    label="5h"
                    detail={`${name} 5\uc2dc\uac04 \uc794\ub7c9: ${(100 - (sl.primary.used_percent ?? 0)).toFixed(0)}%`}
                    resetIn={formatResetTime(sl.primary.resets_at ?? undefined)}
                  />
                  <MiniBar
                    pct={sl.secondary.used_percent ?? 0}
                    label="1w"
                    detail={`${name} 1\uc8fc \uc794\ub7c9: ${(100 - (sl.secondary.used_percent ?? 0)).toFixed(0)}%`}
                    resetIn={formatResetTime(sl.secondary.resets_at ?? undefined)}
                  />
                </>
              )}
            </React.Fragment>
          );
        })
      ) : cm ? (
        <>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)" }}>
            Claude{isLive ? sourceLabel : " (est)"}
          </span>
          <MiniBar
            pct={cm.primary.used_percent}
            label="5h"
            detail={`5\uc2dc\uac04 \uc794\ub7c9: ${(100 - cm.primary.used_percent).toFixed(0)}% | ${formatTokens(cm.primary.total_tokens)} tok \uc0ac\uc6a9`}
            resetIn={formatResetTime(cm.primary.resets_at)}
          />
          <MiniBar
            pct={cm.secondary.used_percent}
            label="1w"
            detail={`1\uc8fc \uc794\ub7c9: ${(100 - cm.secondary.used_percent).toFixed(0)}% | ${formatTokens(cm.secondary.total_tokens)} tok \uc0ac\uc6a9`}
            resetIn={formatResetTime(cm.secondary.resets_at)}
          />
        </>
      ) : null}
      {switchError && (
        <span style={{ fontSize: "10px", color: "#ef4444", whiteSpace: "nowrap" }}
              title={switchError}>
          \uACC4\uC815 \uC804\uD658 \uC2E4\uD328
        </span>
      )}
      {cxAll.map((cx, i) => {
        const cname = cx.limit_id && cx.limit_id !== "codex" ? `Codex:${cx.limit_id.replace(/^codex_/, "")}` : "Codex";
        return (
          <React.Fragment key={`codex-${cx.limit_id || i}`}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)", marginLeft: "4px" }}>{cname}</span>
            <MiniBar
              pct={cx.primary?.used_percent ?? 0}
              label="5h"
              detail={`${cname} 5\uc2dc\uac04 \uc794\ub7c9: ${(100 - (cx.primary?.used_percent ?? 0)).toFixed(0)}%`}
              resetIn={formatResetSeconds(cx.primary?.resets_in_sec)}
            />
            <MiniBar
              pct={cx.secondary?.used_percent ?? 0}
              label="1w"
              detail={`${cname} 1\uc8fc \uc794\ub7c9: ${(100 - (cx.secondary?.used_percent ?? 0)).toFixed(0)}%`}
              resetIn={formatResetSeconds(cx.secondary?.resets_in_sec)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
