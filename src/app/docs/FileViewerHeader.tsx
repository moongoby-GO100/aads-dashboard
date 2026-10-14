"use client";

import { useEffect, useRef, useState } from "react";
import DocBadge from "@/components/docs/DocBadge";
import { formatFileSize, formatKstFull } from "@/lib/docFileView";
import { buildFullPath, detectFormat, FORMAT_LABELS, TYPE_LABELS, type ListedDocFile } from "./docFileTypes";

export function viewerMetaText(file: Pick<ListedDocFile, "modified" | "size">): string {
  const modified = formatKstFull(file.modified);
  return [modified && `수정 ${modified}`, formatFileSize(file.size)].filter(Boolean).join(" · ");
}

export function buildDocViewerUrl(project: string, file: Pick<ListedDocFile, "base_path" | "path">): string {
  const q = new URLSearchParams();
  q.set("project", project);
  q.set("base_path", file.base_path);
  q.set("file_path", file.path);
  return `/docs?${q.toString()}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

const actionClass = "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-medium min-[1024px]:min-h-8";
const actionStyle = { background: "var(--bg-hover)", color: "var(--text-primary)" } as const;

export default function FileViewerHeader({ file, onBack }: { file: ListedDocFile; onBack?: () => void }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fullPath = buildFullPath(file);
  const fmt = file.format || detectFormat(file.name);
  const meta = viewerMetaText(file);

  const onCopy = async () => {
    setCopied((await copyText(fullPath)) ? "done" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 1800);
  };

  return (
    <div data-testid="doc-viewer-header" className="shrink-0 px-3 py-2 min-[600px]:px-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className={actionClass} style={actionStyle}>← 목록</button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-6" style={{ color: "var(--text-primary)" }} title={file.name}>{file.name}</h2>
        <a href={buildDocViewerUrl(file.project, file)} target="_blank" rel="noopener noreferrer" className={actionClass} style={actionStyle}>직접 열기</a>
        <button type="button" onClick={onCopy} className={actionClass} style={actionStyle} aria-live="polite">
          {copied === "done" ? "복사됨" : copied === "failed" ? "복사 실패" : "경로 복사"}
        </button>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <DocBadge tone="project">{file.project}</DocBadge>
        <DocBadge tone="kind">{TYPE_LABELS[file.type] || file.type}</DocBadge>
        <DocBadge tone="kind">{FORMAT_LABELS[fmt] || fmt}</DocBadge>
        {file.label && <DocBadge tone="kind">{file.label}</DocBadge>}
        {meta && <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>{meta}</span>}
      </div>
      <div data-testid="doc-viewer-path" className="mt-1 line-clamp-2 break-all font-mono text-[11px] leading-4" style={{ color: "var(--text-secondary)" }}>{fullPath}</div>
    </div>
  );
}
