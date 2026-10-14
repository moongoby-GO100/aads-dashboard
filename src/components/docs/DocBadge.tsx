import type { CSSProperties, ReactNode } from "react";

export type DocBadgeTone = "kind" | "draft" | "review" | "approved" | "archived";

const TONE: Record<DocBadgeTone, CSSProperties> = {
  kind: { borderColor: "var(--border)", color: "var(--text-secondary)", background: "transparent" },
  draft: { borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-hover)" },
  review: { borderColor: "var(--accent)", color: "var(--text-primary)", background: "transparent" },
  approved: { borderColor: "var(--accent)", color: "var(--text-primary)", background: "color-mix(in srgb, var(--accent) 30%, transparent)", fontWeight: 600 },
  archived: { borderColor: "var(--border)", color: "var(--text-secondary)", background: "transparent", textDecoration: "line-through" },
};

export function statusTone(status: string): DocBadgeTone {
  return status === "review" || status === "approved" || status === "archived" ? status : "draft";
}

export default function DocBadge({ tone, children }: { tone: DocBadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border px-1.5 text-[11px] leading-[18px]" style={TONE[tone]} data-tone={tone}>
      {children}
    </span>
  );
}
