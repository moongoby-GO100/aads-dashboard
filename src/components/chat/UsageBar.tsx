"use client";

import React, { useEffect, useState, useCallback } from "react";

type UsageData = {
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
  primary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number };
  secondary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number };
};

type CodexData = {
  ok?: boolean;
  plan_type?: string;
  limits?: CodexLimit[];
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

  useEffect(() => {
    fetchUsage();
    const iv = setInterval(fetchUsage, 30_000);
    return () => clearInterval(iv);
  }, [fetchUsage]);

  if (error || (!claude && !codex)) return null;

  const cm = claude?.claude_max;
  const cx = codex?.ok ? codex.limits?.[0] : null;
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
      )}
      {cx && (
        <>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)", marginLeft: "4px" }}>Codex</span>
          <MiniBar
            pct={cx.primary?.used_percent ?? 0}
            label="5h"
            detail={`Codex 5\uc2dc\uac04 \uc794\ub7c9: ${(100 - (cx.primary?.used_percent ?? 0)).toFixed(0)}%`}
          />
          <MiniBar
            pct={cx.secondary?.used_percent ?? 0}
            label="1w"
            detail={`Codex 1\uc8fc \uc794\ub7c9: ${(100 - (cx.secondary?.used_percent ?? 0)).toFixed(0)}%`}
          />
        </>
      )}
    </div>
  );
}
