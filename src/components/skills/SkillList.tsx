import React from "react";
import {
  hasActiveFilter, latestRunText, SHARED_LABEL, RISK_TIERS, riskColor, riskLabel, runStatusColor,
  type EnabledFilter, type SkillFilters, type SkillSummary, type SourceFilter,
} from "@/lib/skillCatalog";
import { BADGE, CARD, INPUT, MUTED } from "./skillStyles";

export function FilterBar({
  filters, projects, onChange,
}: { filters: SkillFilters; projects: string[]; onChange: (next: SkillFilters) => void }) {
  const set = <K extends keyof SkillFilters>(key: K, value: SkillFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <div data-testid="skill-filters" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
      <input
        type="search"
        aria-label="스킬 검색"
        placeholder="업무명·설명 검색"
        value={filters.query}
        onChange={(e) => set("query", e.target.value)}
        style={{ ...INPUT, gridColumn: "1 / -1" }}
        data-testid="skill-filter-query"
      />
      <select aria-label="프로젝트" value={filters.project} onChange={(e) => set("project", e.target.value)} style={INPUT} data-testid="skill-filter-project">
        <option value="">프로젝트 전체</option>
        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select aria-label="위험등급" value={filters.risk} onChange={(e) => set("risk", e.target.value)} style={INPUT} data-testid="skill-filter-risk">
        <option value="">등급 전체</option>
        {RISK_TIERS.map((tier) => <option key={tier} value={tier}>{riskLabel(tier)}</option>)}
      </select>
      <select aria-label="사용 여부" value={filters.enabled} onChange={(e) => set("enabled", e.target.value as EnabledFilter)} style={INPUT} data-testid="skill-filter-enabled">
        <option value="all">사용 여부 전체</option>
        <option value="on">사용 중</option>
        <option value="off">사용 안 함</option>
      </select>
      <select aria-label="출처" value={filters.source} onChange={(e) => set("source", e.target.value as SourceFilter)} style={INPUT} data-testid="skill-filter-source">
        <option value="all">출처 전체</option>
        <option value="db">DB</option>
        <option value="file">파일</option>
      </select>
    </div>
  );
}

export function SkillBadges({ skill }: { skill: Pick<SkillSummary, "riskTier" | "enabled" | "source" | "fileDrift"> & Partial<Pick<SkillSummary, "readOnly" | "ownerLabel">> }) {
  const color = riskColor(skill.riskTier);
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {skill.readOnly && (
        <span data-testid="skill-shared-badge" style={{ ...BADGE, color: "var(--accent)", border: "1px solid var(--accent)" }}>
          {skill.ownerLabel || SHARED_LABEL}
        </span>
      )}
      <span data-testid="skill-risk-badge" style={{ ...BADGE, color, border: `1px solid ${color}` }}>{riskLabel(skill.riskTier)}</span>
      {!skill.enabled && <span style={{ ...BADGE, ...MUTED, border: "1px solid var(--border)" }}>사용 안 함</span>}
      <span style={{ ...BADGE, ...MUTED, border: "1px solid var(--border)" }}>{skill.source === "file" ? "파일" : "DB"}</span>
      {skill.fileDrift && (
        <span data-testid="skill-drift-badge" style={{ ...BADGE, color: "var(--warning)", border: "1px solid var(--warning)" }}>파일과 다름</span>
      )}
    </span>
  );
}

export function SkillListItem({
  skill, selected, onSelect,
}: { skill: SkillSummary; selected: boolean; onSelect: (skillId: string) => void }) {
  return (
    <li style={{ listStyle: "none" }}>
      <button
        type="button"
        data-testid="skill-list-item"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(skill.skillId)}
        style={{
          ...CARD, width: "100%", minHeight: 44, textAlign: "left", cursor: "pointer", display: "block",
          border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
          opacity: skill.enabled ? 1 : 0.7,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
            {skill.title}
          </span>
          <SkillBadges skill={skill} />
        </div>
        {skill.description && (
          <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, ...MUTED, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {skill.description}
          </p>
        )}
        <dl style={{ margin: "8px 0 0", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 10, rowGap: 2, fontSize: 12, lineHeight: 1.5 }}>
          <dt style={MUTED}>프로젝트</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{skill.projects.length ? skill.projects.join(", ") : "-"}</dd>
          <dt style={MUTED}>활성 버전</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>{skill.activeVersion ?? "없음"}</dd>
          <dt style={MUTED}>최근 실행</dt>
          <dd style={{ margin: 0, color: skill.latestRun ? runStatusColor(skill.latestRun.status) : "var(--text-primary)" }}>
            {latestRunText(skill.latestRun)}
          </dd>
          <dt style={MUTED}>실행 수</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)" }}>{skill.runCount}회</dd>
        </dl>
      </button>
    </li>
  );
}

export function SkillList({
  skills, totalCount, filters, selectedId, onSelect, onResetFilters,
}: {
  skills: SkillSummary[]; totalCount: number; filters: SkillFilters; selectedId: string | null;
  onSelect: (skillId: string) => void; onResetFilters: () => void;
}) {
  if (totalCount === 0) {
    return <p role="status" data-testid="skill-empty" style={{ fontSize: 14, lineHeight: 1.5, ...MUTED }}>등록된 스킬이 아직 없습니다.</p>;
  }
  if (skills.length === 0) {
    return (
      <div role="status" data-testid="skill-empty-filtered" style={{ fontSize: 14, lineHeight: 1.5, ...MUTED }}>
        <p style={{ margin: "0 0 8px" }}>조건에 맞는 스킬이 없습니다.</p>
        {hasActiveFilter(filters) && (
          <button type="button" onClick={onResetFilters} style={{ minHeight: 44, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            필터 초기화
          </button>
        )}
      </div>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {skills.map((skill) => (
        <SkillListItem key={skill.skillId} skill={skill} selected={skill.skillId === selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}
