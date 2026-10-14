import type { Ref } from "react";
import DocBadge, { statusTone } from "./DocBadge";

export interface DocListRowProps {
  title: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  revision?: number | null;
  updatedLabel: string;
  keyTail?: string;
  selected?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick: () => void;
}

export default function DocListRow({ title, kindLabel, status, statusLabel, revision, updatedLabel, keyTail, selected = false, buttonRef, onClick }: DocListRowProps) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick} aria-current={selected ? "true" : undefined}
      className="block min-h-11 w-full min-w-0 rounded-md py-2 pl-3 pr-2.5 text-left"
      style={{
        background: selected ? "var(--bg-hover)" : "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${selected ? "var(--accent)" : "transparent"}`,
        color: "var(--text-primary)",
      }}>
      <span className="line-clamp-2 break-words text-sm font-bold leading-snug">{title || "제목 없음"}</span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <DocBadge tone="kind">{kindLabel}</DocBadge>
        <DocBadge tone={statusTone(status)}>{statusLabel}</DocBadge>
        {revision != null && <span>r{revision}</span>}
        <span>{updatedLabel}</span>
        {keyTail && <span className="min-w-0 truncate opacity-60" title={keyTail}>{keyTail}</span>}
      </span>
    </button>
  );
}
