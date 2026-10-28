import React from "react";
import {
  activeVersionView, effectiveAllowedTools, formatCost, formatLatency, formatTime, hasRollbackTarget, referenceVersion,
  runStatusColor, runStatusLabel, skillActions, versionActions, versionStatusLabel,
  type SkillAction, type SkillDetail as SkillDetailData, type SkillPermissions, type VersionAction,
} from "@/lib/skillCatalog";
import { SkillBadges } from "./SkillList";
import { BADGE, BUTTON_DANGER, BUTTON_PLAIN, BUTTON_PRIMARY, CARD, MUTED } from "./skillStyles";

const ACTION_LABEL: Record<SkillAction, string> = { execute: "실행", rollback: "되돌리기", disable: "비활성" };
const VERSION_ACTION_LABEL: Record<VersionAction, string> = { validate: "검증", promote: "승격" };

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} style={{ ...CARD }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p style={{ margin: 0, fontSize: 13, ...MUTED }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>
      {items.map((item, i) => <li key={`${i}-${item}`} style={{ overflowWrap: "anywhere" }}>{item}</li>)}
    </ul>
  );
}

export function SkillDetailView({
  detail, perms, busy, onAction, onVersionAction, onBack,
}: {
  detail: SkillDetailData;
  perms: SkillPermissions;
  busy: boolean;
  onAction: (action: SkillAction) => void;
  onVersionAction: (version: string, action: VersionAction) => void;
  onBack?: () => void;
}) {
  const actions = skillActions(detail, perms, hasRollbackTarget(detail));
  const reference = referenceVersion(detail);
  const active = activeVersionView(detail);
  const rules = reference?.manifest;
  return (
    <div data-testid="skill-detail" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {onBack && (
        <button type="button" data-testid="skill-detail-back" onClick={onBack} className="md:hidden" style={{ ...BUTTON_PLAIN, alignSelf: "flex-start" }}>
          ← 목록으로
        </button>
      )}
      <div style={{ ...CARD }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{detail.title}</h2>
        <p style={{ margin: "2px 0 8px", fontSize: 12, ...MUTED, overflowWrap: "anywhere" }}>{detail.slug}</p>
        <SkillBadges skill={detail} />
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
          {detail.description || "설명이 없습니다."}
        </p>
        <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 12, rowGap: 4, fontSize: 13, lineHeight: 1.5 }}>
          <dt style={MUTED}>프로젝트</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{detail.projects.length ? detail.projects.join(", ") : "-"}</dd>
          <dt style={MUTED}>활성 버전</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>{detail.activeVersion ?? "없음"}</dd>
          {detail.filePath && (
            <>
              <dt style={MUTED}>원본 파일</dt>
              <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{detail.filePath}</dd>
            </>
          )}
        </dl>
        {actions.length > 0 && (
          <div data-testid="skill-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                data-testid={`skill-action-${action}`}
                disabled={busy}
                onClick={() => onAction(action)}
                style={{ ...(action === "execute" ? BUTTON_PRIMARY : action === "disable" ? BUTTON_DANGER : BUTTON_PLAIN), flex: "1 1 110px", opacity: busy ? 0.55 : 1 }}
              >
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        )}
        {detail.riskTier === "read" && perms.canExecute && detail.enabled && !detail.activeVersion && (
          <p style={{ margin: "10px 0 0", fontSize: 13, ...MUTED }}>활성 버전이 없어 실행할 수 없습니다.</p>
        )}
        {detail.riskTier !== "read" && perms.canExecute && (
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, ...MUTED }}>조회 외 등급의 스킬은 이 화면에서 실행할 수 없습니다.</p>
        )}
      </div>

      <Section title="허용 도구" testId="skill-section-tools">
        <BulletList items={effectiveAllowedTools(detail)} empty="등록된 허용 도구가 없습니다." />
      </Section>

      <Section title="검증 규칙" testId="skill-section-rules">
        {rules ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div><div style={{ fontSize: 12, ...MUTED }}>실행 전 조건</div><BulletList items={rules.preconditions} empty="없음" /></div>
            <div><div style={{ fontSize: 12, ...MUTED }}>실행 후 확인</div><BulletList items={rules.postconditions} empty="없음" /></div>
            <div><div style={{ fontSize: 12, ...MUTED }}>남겨야 할 증거</div><BulletList items={rules.evidence} empty="없음" /></div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, ...MUTED }}>등록된 버전이 없습니다.</p>
        )}
      </Section>

      <Section title={`버전 이력 (${detail.versions.length})`} testId="skill-section-versions">
        {detail.versions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, ...MUTED }}>등록된 버전이 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {detail.versions.map((v) => {
              const vActions = versionActions(v.status, perms);
              const isActive = v.status === "active";
              return (
                <li key={v.versionId || v.version} data-testid="skill-version-row" style={{ listStyle: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{v.version}</span>
                    <span style={{ ...BADGE, color: isActive ? "var(--success)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--success)" : "var(--border)"}` }}>
                      {versionStatusLabel(v.status)}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, ...MUTED }}>
                    등록 {formatTime(v.createdAt)}
                    {v.promotedAt ? ` · 승격 ${formatTime(v.promotedAt)}${v.promotedBy ? ` (${v.promotedBy})` : ""}` : ""}
                  </div>
                  {vActions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {vActions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          data-testid={`skill-version-${action}`}
                          disabled={busy}
                          onClick={() => onVersionAction(v.version, action)}
                          style={{ ...(action === "promote" ? BUTTON_PRIMARY : BUTTON_PLAIN), flex: "1 1 100px", opacity: busy ? 0.55 : 1 }}
                        >
                          {VERSION_ACTION_LABEL[action]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {active && <p style={{ margin: "8px 0 0", fontSize: 12, ...MUTED }}>현재 사용 중인 버전: {active.version}</p>}
      </Section>

      <Section title={`최근 실행 (${detail.runs.length}건)`} testId="skill-section-runs">
        {detail.runs.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, ...MUTED }}>실행 기록이 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {detail.runs.map((run) => (
              <li key={run.runId} data-testid="skill-run-row" style={{ listStyle: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: runStatusColor(run.status) }}>{runStatusLabel(run.status)}</span>
                  <span style={MUTED}>{formatTime(run.startedAt)}{run.version ? ` · ${run.version}` : ""}</span>
                </div>
                <div style={MUTED}>비용 {formatCost(run.costUsd)} · 지연 {formatLatency(run.latencyMs)}</div>
                {run.error && <div style={{ color: "var(--danger)", overflowWrap: "anywhere" }}>오류: {run.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
