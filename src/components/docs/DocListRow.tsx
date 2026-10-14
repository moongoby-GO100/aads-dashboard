import type { ReactNode, Ref } from "react";
import DocBadge, { statusTone } from "./DocBadge";

interface DocListRowBase {
  title: string;
  selected?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  tooltip?: string;
  onClick: () => void;
}

export interface DocCardRowProps extends DocListRowBase {
  variant?: "card";
  kindLabel: string;
  status: string;
  statusLabel: string;
  revision?: number | null;
  updatedLabel: string;
  keyTail?: string;
}

// 파일 목록용 2줄 행: 1줄 파일명+폴더, 2줄 배지+라벨+날짜·크기. 경로와 라벨은 툴팁에만 두지 않고 글자로 보인다.
export interface DocFileRowProps extends DocListRowBase {
  variant: "file";
  folder?: string;
  badges: ReactNode;
  label?: string;
  metaText: string;
}

export type DocListRowProps = DocCardRowProps | DocFileRowProps;

function FileRow({ title, folder, badges, label, metaText, selected = false, buttonRef, tooltip, onClick }: DocFileRowProps) {
  const secondary = selected ? "var(--text-primary)" : "var(--text-secondary)";
  return (
    <button ref={buttonRef} type="button" onClick={onClick} aria-current={selected ? "true" : undefined} title={tooltip}
      data-testid="doc-file-row"
      className="flex h-[52px] w-full min-w-0 flex-col justify-center py-[3px] pl-2.5 pr-2.5 text-left min-[600px]:h-11"
      style={{
        background: selected ? "var(--bg-hover)" : "transparent",
        borderBottom: "1px solid var(--border)",
        borderLeft: `3px solid ${selected ? "var(--accent)" : "transparent"}`,
        color: "var(--text-primary)",
      }}>
      <span className="flex min-w-0 items-baseline gap-1.5 leading-5">
        <span className="min-w-0 truncate text-sm font-semibold min-[600px]:text-[13px]">{title || "제목 없음"}</span>
        {folder && <span data-part="folder" className="max-w-[45%] shrink-0 truncate text-[11px]" style={{ color: secondary }}>{folder}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs leading-4 min-[600px]:text-[11px]" style={{ color: secondary }}>
        {badges}
        {label && <span data-part="label" className="hidden min-w-0 truncate min-[600px]:inline">{label}</span>}
        {metaText && <span className="ml-auto shrink-0">{metaText}</span>}
      </span>
    </button>
  );
}

function CardRow({ title, kindLabel, status, statusLabel, revision, updatedLabel, keyTail, selected = false, buttonRef, tooltip, onClick }: DocCardRowProps) {
  return (
    <button ref={buttonRef} type="button" onClick={onClick} aria-current={selected ? "true" : undefined} title={tooltip}
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

export default function DocListRow(props: DocListRowProps) {
  return props.variant === "file" ? <FileRow {...props} /> : <CardRow {...props} />;
}
