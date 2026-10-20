"use client";
import type { ReactNode } from "react";
import {
  statusLabel, TONE_LABELS,
  type AagErrorView, type AxisView, type FindingView, type RecoveryView, type Tone,
} from "@/lib/aagOperations";

const TONE_STYLE: Record<Tone, { border: string; text: string; bg: string; mark: string }> = {
  ok: { border: "#22c55e", text: "#bbf7d0", bg: "#052e16", mark: "✓" },
  warn: { border: "#f59e0b", text: "#fde68a", bg: "#3b2606", mark: "!" },
  bad: { border: "#f87171", text: "#fecaca", bg: "#450a0a", mark: "✕" },
  info: { border: "#60a5fa", text: "#bfdbfe", bg: "#0c2447", mark: "i" },
  unknown: { border: "#94a3b8", text: "#e2e8f0", bg: "#1e293b", mark: "?" },
};

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93c5fd]";
export const TOUCH = "min-h-[44px] min-w-[44px]";

export function ToneChip({ tone }: { tone: Tone }) {
  const t = TONE_STYLE[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold"
      style={{ border: `1px solid ${t.border}`, color: t.text, background: t.bg }}
    >
      <span aria-hidden="true">{t.mark}</span>
      {TONE_LABELS[tone]}
    </span>
  );
}

export function SectionCard({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl p-4 sm:p-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function AxisCard({ view }: { view: AxisView }) {
  const t = TONE_STYLE[view.tone];
  return (
    <li
      className="rounded-lg p-3"
      style={{ background: "var(--bg-primary)", border: `1px solid ${t.border}`, listStyle: "none" }}
      data-axis={view.key}
      data-tone={view.tone}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{view.label}</h3>
        <ToneChip tone={view.tone} />
      </div>
      <p className="mt-2 text-base font-semibold break-words" style={{ color: "var(--text-primary)" }}>{view.headline}</p>
      <p className="mt-1 text-sm break-words" style={{ color: "var(--text-secondary)" }}>{view.detail}</p>
    </li>
  );
}

export function ErrorPanel({
  error, onRetry, retrying, loginHref,
}: { error: AagErrorView; onRetry?: () => void; retrying?: boolean; loginHref?: string }) {
  const t = TONE_STYLE[error.kind === "not_scanned" ? "warn" : "bad"];
  return (
    <div
      role="alert"
      data-error-kind={error.kind}
      className="rounded-lg p-4"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text }}
    >
      <p className="text-base font-bold break-words">{error.title}</p>
      <p className="mt-1 text-sm break-words">{error.message}</p>
      <p className="mt-2 text-sm font-semibold break-words">다음 행동: {error.action}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {error.retryable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={`${TOUCH} rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
            style={{ background: "#e2e8f0", color: "#0f172a", opacity: retrying ? 0.6 : 1 }}
          >
            {retrying ? "다시 불러오는 중…" : "다시 시도"}
          </button>
        )}
        {error.loginRequired && loginHref && (
          <a
            href={loginHref}
            className={`${TOUCH} inline-flex items-center rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
            style={{ background: "#e2e8f0", color: "#0f172a" }}
          >
            다시 로그인
          </a>
        )}
      </div>
    </div>
  );
}

export function RecoveryList({ items }: { items: RecoveryView[] }) {
  if (items.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>지금 필요한 복구 안내가 없습니다. (이것이 결함 없음을 뜻하지는 않습니다.)</p>;
  }
  return (
    <ul className="space-y-2 p-0">
      {items.map((a) => (
        <li
          key={`${a.kind}-${a.label}`}
          className="rounded-lg p-3"
          style={{ listStyle: "none", background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          data-recovery-kind={a.kind}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold break-words" style={{ color: "var(--text-primary)" }}>{a.label}</p>
            <span
              className="rounded-full px-2.5 py-0.5 text-sm font-semibold"
              style={{ border: "1px solid #f59e0b", color: "#fde68a", background: "#3b2606" }}
            >
              승인 필요 · 이 화면에서 실행 안 함
            </span>
          </div>
          <p className="mt-1 text-sm break-words" style={{ color: "var(--text-secondary)" }}>{a.reason}</p>
          <p className="mt-1 text-sm break-words" style={{ color: "var(--text-secondary)" }}>{a.note}</p>
        </li>
      ))}
    </ul>
  );
}

const SEVERITY_TONE: Record<string, Tone> = { P0: "bad", P1: "warn", P2: "info", P3: "unknown" };

export function SeverityBadge({ severity }: { severity: string }) {
  const t = TONE_STYLE[SEVERITY_TONE[severity] ?? "unknown"];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-sm font-bold"
      style={{ border: `1px solid ${t.border}`, color: t.text, background: t.bg }}
    >
      {severity}
    </span>
  );
}

export function FindingRow({
  finding, expanded, onToggle,
}: { finding: FindingView; expanded: boolean; onToggle: () => void }) {
  const panelId = `finding-panel-${finding.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return (
    <li style={{ listStyle: "none" }} data-finding-key={finding.key}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`${TOUCH} flex w-full items-start gap-3 rounded-lg p-3 text-left ${FOCUS_RING}`}
        style={{ background: "var(--bg-primary)", border: expanded ? "1px solid #60a5fa" : "1px solid var(--border)", color: "var(--text-primary)" }}
      >
        <SeverityBadge severity={finding.severity} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold break-words">{finding.title}</span>
          <span className="mt-0.5 block text-sm break-all" style={{ color: "var(--text-secondary)" }}>
            {finding.path || "위치 정보 없음"}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm" style={{ color: "var(--text-secondary)" }}>{expanded ? "접기" : "자세히"}</span>
      </button>
      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={`${finding.title} 상세`}
          className="mt-1 rounded-lg p-3"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt style={{ color: "var(--text-secondary)" }}>분류</dt>
            <dd className="break-words">{finding.ruleLabel}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>상태</dt>
            <dd>{statusLabel(finding.status)}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>위치</dt>
            <dd className="break-all">{finding.path || "위치 정보 없음"}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>담당</dt>
            <dd className="break-words">{finding.owners.length ? finding.owners.join(", ") : "지정되지 않음"}</dd>
          </dl>
          <details className="mt-3">
            <summary className={`${TOUCH} flex cursor-pointer items-center text-sm font-semibold underline ${FOCUS_RING}`} style={{ color: "var(--text-primary)" }}>
              근거 상세 (내부 식별자)
            </summary>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt style={{ color: "var(--text-secondary)" }}>stable_finding_key</dt>
              <dd className="font-mono break-all">{finding.key}</dd>
              {finding.evidence.filter(([k]) => k !== "stable_finding_key").map(([k, v]) => (
                <div key={k} className="contents">
                  <dt style={{ color: "var(--text-secondary)" }} className="break-all">{k}</dt>
                  <dd className="font-mono break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </li>
  );
}
