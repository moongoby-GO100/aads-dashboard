"use client";
import React from "react";

interface TaskStep {
  label: string;
  status?: string;
}

interface TaskCardData {
  title: string;
  status: string;
  task_type: string;
  steps: TaskStep[];
  runner_job_id?: string;
  result?: Record<string, unknown>;
  ohvis_judgement?: string;
}

const STATUS_CFG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  pending: { emoji: "⏳", label: "대기", color: "#eab308", bg: "rgba(234,179,8,0.08)" },
  running: { emoji: "🔄", label: "진행중", color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
  done: { emoji: "✅", label: "완료", color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  error: { emoji: "❌", label: "실패", color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
  awaiting_approval: { emoji: "🔍", label: "승인대기", color: "#a855f7", bg: "rgba(168,85,247,0.08)" },
};

export default function TaskCard({ content }: { content: string }) {
  let data: TaskCardData;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{content}</pre>;
  }

  const cfg = STATUS_CFG[data.status] || STATUS_CFG.pending;
  const steps = data.steps || [];
  const doneSteps = steps.filter((s) => s.status === "done").length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  return (
    <div style={{ border: `1px solid ${cfg.color}33`, borderRadius: 12, padding: 16, background: cfg.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
          color: cfg.color, background: `${cfg.color}22`, border: `1px solid ${cfg.color}44`,
        }}>
          {cfg.emoji} {cfg.label}
        </span>
        {data.task_type && data.task_type !== "general" && (
          <span style={{ fontSize: 11, color: "var(--ct-text-sub)", opacity: 0.7 }}>{data.task_type}</span>
        )}
        {data.runner_job_id && (
          <span style={{ fontSize: 11, color: "var(--ct-text-sub)", opacity: 0.5, marginLeft: "auto", fontFamily: "monospace" }}>
            {data.runner_job_id.slice(0, 14)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: totalSteps > 0 || data.ohvis_judgement ? 12 : 0, color: "var(--ct-text)", lineHeight: 1.4 }}>
        {data.title}
      </div>
      {totalSteps > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ct-text-sub)", marginBottom: 4 }}>
            <span>{doneSteps}/{totalSteps} 단계</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--ct-border)" }}>
            <div style={{ height: "100%", borderRadius: 3, background: cfg.color, width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}
      {totalSteps > 0 && totalSteps <= 10 && (
        <div style={{ marginBottom: data.ohvis_judgement ? 12 : 0 }}>
          {steps.map((step, i) => {
            const sd = step.status === "done";
            const sr = step.status === "running";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0", color: sd ? "var(--ct-text-sub)" : "var(--ct-text)", opacity: sd ? 0.6 : 1 }}>
                <span style={{ color: sr ? cfg.color : undefined }}>{sd ? "✓" : sr ? "●" : "○"}</span>
                <span style={{ textDecoration: sd ? "line-through" : "none" }}>{step.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {data.ohvis_judgement && (
        <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "var(--ct-input-bg)", fontSize: 13, lineHeight: 1.5, borderLeft: `3px solid ${cfg.color}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: cfg.color, marginBottom: 4 }}>
            {"오비스 판단"}
          </div>
          <div style={{ color: "var(--ct-text)" }}>{data.ohvis_judgement}</div>
        </div>
      )}
    </div>
  );
}
