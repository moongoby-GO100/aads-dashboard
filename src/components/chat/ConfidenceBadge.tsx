"use client";
import React from "react";

export type ConfidenceLabel = "db_realtime" | "ai_inference" | "mixed";

interface ConfidenceBadgeProps {
  label: ConfidenceLabel;
}

const BADGE_CONFIG: Record<ConfidenceLabel, { icon: string; text: string; color: string; bg: string }> = {
  db_realtime:  { icon: "📊", text: "DB 실시간", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  ai_inference: { icon: "🤖", text: "AI 추정",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  mixed:        { icon: "📊", text: "DB+AI 혼합", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
};

export default function ConfidenceBadge({ label }: ConfidenceBadgeProps) {
  const cfg = BADGE_CONFIG[label];
  if (!cfg) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "1px 7px",
        borderRadius: "9999px",
        fontSize: "11px",
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}44`,
        verticalAlign: "middle",
        marginLeft: "6px",
      }}
    >
      {cfg.icon} {cfg.text}
    </span>
  );
}
