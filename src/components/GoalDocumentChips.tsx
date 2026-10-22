import { goalDocumentView, type GoalDocument } from "@/lib/goalDocuments";

const CHIP: React.CSSProperties = {
  fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
  color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 260,
};
const BADGE: React.CSSProperties = { fontSize: 10, padding: "0 5px", borderRadius: 4, flexShrink: 0 };

export function GoalDocumentChips({ documents }: { documents: GoalDocument[] }) {
  if (documents.length === 0) {
    return <div data-testid="goal-docs-empty" style={{ marginTop: 14, fontSize: 11, color: "var(--text-secondary)" }}>연결된 문서 없음</div>;
  }
  return (
    <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {documents.map((d) => {
        const v = goalDocumentView(d);
        // 새 탭으로 연다 — 담당과의 대화 맥락을 두고 문서만 본다.
        const body = v.canonical ? (
          <>
            <span aria-hidden>{v.icon}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
            <span style={{ ...BADGE, border: "1px solid var(--border)" }}>{v.kindLabel}</span>
            {v.versionLabel && <span style={{ ...BADGE, border: "1px solid var(--border)" }}>{v.versionLabel}</span>}
            <span data-approved={v.approved ? "true" : "false"}
                  style={{ ...BADGE, color: v.approved ? "#16a34a" : "#d97706", border: `1px solid ${v.approved ? "#16a34a" : "#d97706"}` }}>
              {v.approved ? "승인" : "승인 전"}
            </span>
          </>
        ) : (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.icon} {v.label}{v.versionLabel ? ` · ${v.versionLabel}` : ""}
          </span>
        );
        const dataSource = v.canonical ? "canonical" : "legacy";
        return v.href ? (
          <a key={v.key} href={v.href} target="_blank" rel="noopener noreferrer" title={v.tooltip}
             data-doc-source={dataSource} style={CHIP}>{body}</a>
        ) : (
          <span key={v.key} title={v.tooltip} data-doc-source={dataSource} style={CHIP}>{body}</span>
        );
      })}
    </div>
  );
}
