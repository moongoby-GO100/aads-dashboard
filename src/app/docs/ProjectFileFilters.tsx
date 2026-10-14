"use client";

import type { ReactNode } from "react";

export const CONTRACT_OPEN_KEY = "aads.docs.contractOpen.v1";

export function readStoredFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeStoredFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 접힘 상태 기억만 못 하는 것이라 무시한다.
  }
}

export function summarizeFilters(
  typeLabel: string | null,
  formatLabel: string | null,
): string {
  return ["필터", typeLabel, formatLabel].filter(Boolean).join(" · ");
}

const chipStyle = (active: boolean) =>
  active
    ? { background: "var(--accent)", color: "#fff" }
    : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" };

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="shrink-0 pt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export interface ProjectFileFiltersProps {
  leading?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  selectedType: string;
  selectedFormat: string;
  availableTypes: string[];
  availableFormats: string[];
  typeCounts: Record<string, number>;
  formatCounts: Record<string, number>;
  totalCount: number;
  typeLabels: Record<string, string>;
  formatLabels: Record<string, string>;
  onTypeChange: (type: string) => void;
  onFormatChange: (format: string) => void;
  onReset: () => void;
}

export function ProjectFileFilters({
  leading, expanded, onToggle, selectedType, selectedFormat, availableTypes, availableFormats,
  typeCounts, formatCounts, totalCount, typeLabels, formatLabels, onTypeChange, onFormatChange, onReset,
}: ProjectFileFiltersProps) {
  const typeActive = selectedType !== "all";
  const formatActive = selectedFormat !== "all";
  const summary = summarizeFilters(
    typeActive ? typeLabels[selectedType] || selectedType : null,
    formatActive ? formatLabels[selectedFormat] || selectedFormat : null,
  );

  return (
    <div data-testid="docs-filters">
      <div className="flex items-center gap-1.5">
        {leading}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? "docs-filter-chips" : undefined}
          className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-1 text-left text-xs"
          style={chipStyle(typeActive || formatActive)}
          title={summary}
        >
          {summary} {expanded ? "▴" : "▾"}
        </button>
        {(typeActive || formatActive) && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs"
            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
          >
            초기화
          </button>
        )}
      </div>
      {expanded && (
        <div
          id="docs-filter-chips"
          data-testid="docs-filter-chips"
          className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1"
        >
          <ChipGroup label="유형">
            <button type="button" onClick={() => onTypeChange("all")} className="rounded-lg px-2.5 py-1 text-xs transition-colors" style={chipStyle(!typeActive)}>
              전체 유형 {totalCount}
            </button>
            {availableTypes.map((type) => (
              <button key={type} type="button" onClick={() => onTypeChange(type)} className="rounded-lg px-2.5 py-1 text-xs transition-colors" style={chipStyle(selectedType === type)}>
                {typeLabels[type] || type} {typeCounts[type] || 0}
              </button>
            ))}
          </ChipGroup>
          <ChipGroup label="포맷">
            <button type="button" onClick={() => onFormatChange("all")} className="rounded-lg px-2.5 py-1 text-xs transition-colors" style={chipStyle(!formatActive)}>
              전체 포맷
            </button>
            {availableFormats.map((fmt) => (
              <button key={fmt} type="button" onClick={() => onFormatChange(fmt)} className="rounded-lg px-2.5 py-1 text-xs transition-colors" style={chipStyle(selectedFormat === fmt)}>
                {formatLabels[fmt] || fmt} {formatCounts[fmt] || 0}
              </button>
            ))}
          </ChipGroup>
        </div>
      )}
    </div>
  );
}

export interface PinnedContractFile {
  key: string;
  name: string;
  typeLabel: string;
  typeClassName: string;
  onOpen: () => void;
}

export function PinnedContractCard({
  files, totalCount, expanded, onToggle, onShowAll,
}: {
  files: PinnedContractFile[];
  totalCount: number;
  expanded: boolean;
  onToggle: () => void;
  onShowAll: () => void;
}) {
  return (
    <div
      data-testid="docs-contract-card"
      className="rounded-lg px-2 py-1"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-xs font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <span>전자계약 문서</span>
          <span className="font-normal" style={{ color: "var(--text-secondary)" }}>{totalCount}건</span>
          <span className="ml-auto">{expanded ? "▴" : "▾"}</span>
        </button>
        {expanded && (
          <button type="button" onClick={onShowAll} className="shrink-0 rounded px-2 py-0.5 text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
            전체 보기
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-1 grid gap-1">
          {files.map((file) => (
            <button
              key={file.key}
              type="button"
              onClick={file.onOpen}
              className="w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-primary)" }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs ${file.typeClassName}`}>{file.typeLabel}</span>
                <span className="truncate text-xs">{file.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
