"use client";

import React, { useEffect, useState, useCallback } from "react";

type UsageData = {
  ok?: boolean;
  error?: string;
  detail?: string;
  claude_max?: {
    plan_type: string;
    source?: string;
    primary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
    secondary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
  };
  token_labels?: Record<string, string>;
  window_5h?: Array<{ total_tokens?: number; account_slot?: string }>;
  window_1w?: Array<{ total_tokens?: number; account_slot?: string }>;
  latest_ratelimit?: Array<{ rl_tokens_reset?: string }>;
  generated_at?: string;
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
  error?: string;
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

const CLAUDE_5H_TOKEN_LIMIT = 10_000_000;
const CLAUDE_WEEK_TOKEN_LIMIT = 50_000_000;

function sumTokens(rows?: Array<{ total_tokens?: number }>): number {
  return (rows || []).reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
}

function normalizeClaudeUsage(data: UsageData | null): NonNullable<UsageData["claude_max"]> | null {
  if (!data) return null;
  if (data.claude_max) return data.claude_max;

  const fiveHourTokens = sumTokens(data.window_5h);
  const weeklyTokens = sumTokens(data.window_1w);
  if (!fiveHourTokens && !weeklyTokens && !data.generated_at) return null;

  return {
    plan_type: "max",
    source: "db_snapshot",
    primary: {
      used_percent: Math.min(100, (fiveHourTokens / CLAUDE_5H_TOKEN_LIMIT) * 100),
      window_minutes: 300,
      total_tokens: fiveHourTokens,
      resets_at: data.latest_ratelimit?.[0]?.rl_tokens_reset,
    },
    secondary: {
      used_percent: Math.min(100, (weeklyTokens / CLAUDE_WEEK_TOKEN_LIMIT) * 100),
      window_minutes: 10080,
      total_tokens: weeklyTokens,
    },
  };
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
  const [error, setError] = useState(false);

  const fetchUsage = useCallback(async () => {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const getJson = async (url: string) => {
        const res = await fetch(url, { headers });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: `http_${res.status}`, detail: body?.detail || body?.error || "" };
        return body;
      };
      const [usageRes, codexRes] = await Promise.allSettled([
        getJson(`${BASE}/ops/usage-stats`),
        getJson(`${BASE}/ops/codex-usage`),
      ]);
      if (usageRes.status === "fulfilled") setClaude(usageRes.value);
      if (codexRes.status === "fulfilled") setCodex(codexRes.value);
      setError(false);
    } catch {
      setError(true);
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

  if (error || (!claude && !codex)) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        padding: "3px 14px", borderBottom: "1px solid var(--ct-border)",
        background: "var(--ct-sb)", fontSize: "10px", color: "var(--ct-text3, #999)",
      }}>
        CLI 한도 조회 중...
      </div>
    );
  }

  const cm = normalizeClaudeUsage(claude);
  const cx = codex?.ok ? (codex.limits?.find((lim) => lim.limit_id === "codex") ?? codex.limits?.[0]) : null;
  const isLive = cm?.source === "claude_ai_api" || cm?.source === "db_snapshot";
  const sourceLabel = cm?.source === "claude_ai_api" ? "" : cm?.source === "db_snapshot" ? " (db)" : cm?.source === "anthropic_header" ? " (hdr)" : " (est)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      padding: "3px 14px", borderBottom: "1px solid var(--ct-border)",
      background: "var(--ct-sb)", fontSize: "10px",
    }}>
      {cm && (
        <>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)" }}>
            Claude CLI{isLive ? sourceLabel : " (est)"}
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
      )}
      {claude && !cm && (
        <span
          title={claude.error || claude.detail || "Claude CLI 한도 응답 없음"}
          style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b" }}
        >
          Claude CLI 조회 실패
        </span>
      )}
      {cx && (
        <>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)", marginLeft: "4px" }}>Codex CLI</span>
          <MiniBar
            pct={cx.primary?.used_percent ?? 0}
            label="5h"
            detail={`Codex 5\uc2dc\uac04 \uc794\ub7c9: ${(100 - (cx.primary?.used_percent ?? 0)).toFixed(0)}%`}
            resetIn={formatResetSeconds(cx.primary?.resets_in_sec)}
          />
          <MiniBar
            pct={cx.secondary?.used_percent ?? 0}
            label="1w"
            detail={`Codex 1\uc8fc \uc794\ub7c9: ${(100 - (cx.secondary?.used_percent ?? 0)).toFixed(0)}%`}
            resetIn={formatResetSeconds(cx.secondary?.resets_in_sec)}
          />
        </>
      )}
      {codex && !cx && (
        <span
          title={codex.error || "Codex CLI 한도 응답 없음"}
          style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b", marginLeft: "4px" }}
        >
          Codex CLI 조회 실패
        </span>
      )}
    </div>
  );
}
