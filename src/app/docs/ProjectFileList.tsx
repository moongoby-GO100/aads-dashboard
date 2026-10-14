"use client";

import type { ReactNode } from "react";
import DocBadge from "@/components/docs/DocBadge";
import DocListRow from "@/components/docs/DocListRow";
import DocListSkeleton from "@/components/docs/DocListSkeleton";
import { folderOf, formatDateSize, listSummaryText } from "@/lib/docFileView";
import { buildFullPath, detectFormat, FORMAT_LABELS, TYPE_LABELS, type ListedDocFile } from "./docFileTypes";

export const SKELETON_ROWS = 14;

const chipStyle = (active: boolean) =>
  active
    ? { background: "var(--accent)", color: "#fff" }
    : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" };

export function ProjectChipRow({ total, projects, selected, onSelect, onRefresh, refreshTitle }: {
  total: number;
  projects: { project: string; total: number }[];
  selected: string;
  onSelect: (project: string) => void;
  onRefresh: () => void;
  refreshTitle: string;
}) {
  const chip = "inline-flex h-[30px] shrink-0 items-center rounded-lg px-2.5 text-xs transition-colors max-[599px]:h-9";
  return (
    <div className="flex items-center gap-1.5" data-testid="docs-project-chips">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => onSelect("all")} aria-pressed={selected === "all"} className={chip} style={chipStyle(selected === "all")}>
          전체 {total.toLocaleString("en-US")}
        </button>
        {projects.map((item) => (
          <button key={item.project} type="button" onClick={() => onSelect(item.project)} aria-pressed={selected === item.project} className={chip} style={chipStyle(selected === item.project)}>
            {item.project} {item.total.toLocaleString("en-US")}
          </button>
        ))}
      </div>
      <button type="button" onClick={onRefresh} title={refreshTitle} aria-label="강제 재스캔"
        className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-sm max-[599px]:h-9 max-[599px]:w-9"
        style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
        🔄
      </button>
    </div>
  );
}

export function FileListSummary({ count, scannedAt, detail }: { count: number; scannedAt?: number | null; detail?: string }) {
  return (
    <div data-testid="docs-list-summary" className="flex h-5 items-center px-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }} title={detail || undefined}>
      <span className="truncate">{listSummaryText(count, scannedAt)}</span>
    </div>
  );
}

export function fileRowKey(file: ListedDocFile, index: number): string {
  return `${file.project}-${file.base_path}-${file.path}-${index}`;
}

export function ProjectFileRows({ files, selectedFile, showProject, onOpen }: {
  files: ListedDocFile[];
  selectedFile: ListedDocFile | null;
  showProject: boolean;
  onOpen: (file: ListedDocFile) => void;
}) {
  return (
    <>
      {files.map((file, index) => {
        const fmt = file.format || detectFormat(file.name);
        const selected =
          selectedFile?.project === file.project && selectedFile?.base_path === file.base_path && selectedFile?.path === file.path;
        return (
          <DocListRow
            key={fileRowKey(file, index)}
            variant="file"
            title={file.name}
            folder={folderOf(file.path)}
            badges={(
              <>
                {showProject && <DocBadge tone="project">{file.project}</DocBadge>}
                <DocBadge tone="kind">{TYPE_LABELS[file.type] || file.type}</DocBadge>
                <DocBadge tone="kind">{FORMAT_LABELS[fmt] || fmt}</DocBadge>
              </>
            )}
            label={file.label}
            metaText={formatDateSize(file.modified, file.size)}
            selected={selected}
            tooltip={`${buildFullPath(file)} · ${file.label}`}
            onClick={() => onOpen(file)}
          />
        );
      })}
    </>
  );
}

function StateBox({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-8 text-center" role="status">
      <div className="text-3xl" aria-hidden="true">{icon}</div>
      <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {children}
    </div>
  );
}

const stateBtn = "inline-flex h-9 items-center rounded-lg px-4 text-[13px]";

export type FileListState = "loading" | "error" | "empty" | "list";

export function fileListState(input: { loading: boolean; error: string | null; count: number }): FileListState {
  if (input.loading) return "loading";
  if (input.error) return "error";
  return input.count === 0 ? "empty" : "list";
}

export function FileListNotice({ state, error, search, filtered, onRetry, onResetFilters, onClearSearch }: {
  state: Exclude<FileListState, "list">;
  error: string | null;
  search: string;
  filtered: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onClearSearch: () => void;
}) {
  if (state === "loading") return <DocListSkeleton variant="file" rows={SKELETON_ROWS} />;
  if (state === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-2.5 px-4 py-8 text-center">
        <div className="text-3xl" aria-hidden="true">⚠️</div>
        <h3 className="text-[15px] font-semibold text-red-400">파일 목록을 불러오지 못했습니다</h3>
        <p className="max-w-[340px] break-words text-xs" style={{ color: "var(--text-secondary)" }}>{error}</p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>이미 열어 둔 문서는 계속 볼 수 있습니다.</p>
        <button type="button" onClick={onRetry} className={stateBtn} style={{ background: "var(--accent)", color: "#fff" }}>다시 시도</button>
      </div>
    );
  }
  return (
    <StateBox icon="🗂️" title="조건에 맞는 파일이 없습니다">
      {search && <p className="max-w-[340px] break-words text-xs" style={{ color: "var(--text-secondary)" }}>검색어: {search}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {filtered && <button type="button" onClick={onResetFilters} className={stateBtn} style={{ background: "var(--accent)", color: "#fff" }}>필터 초기화</button>}
        {search && <button type="button" onClick={onClearSearch} className={stateBtn} style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>검색어 지우기</button>}
      </div>
    </StateBox>
  );
}
