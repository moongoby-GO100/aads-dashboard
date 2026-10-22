import { buildCanonicalDocHref, KEY_RE, PROJECT_RE } from "@/lib/canonicalDocLinks";
import { buildGoalDocHref } from "@/lib/documentLinks";

export type GoalDocument = {
  id?: number; kind: string; doc_path?: string | null; title: string | null;
  document_key?: string; version: string; status?: string; is_latest?: boolean;
  change_summary?: string | null; version_count?: number;
  source?: "canonical" | "legacy" | string; project_key?: string | null; approved?: boolean | null;
};

export type GoalDocumentView = {
  key: string;
  canonical: boolean;
  label: string;
  icon: string;
  kindLabel: string;
  versionLabel: string;
  approved: boolean;
  href: string;
  tooltip: string;
};

const KIND_LABEL: Record<string, string> = {
  plan: "기획", prd: "PRD", spec: "명세", design: "설계", architecture: "구조",
  contract: "계약", tasks: "작업", report: "보고", reference: "참고",
};

export function goalDocumentKindLabel(kind: string | null | undefined): string {
  return KIND_LABEL[(kind || "").trim().toLowerCase()] || "문서";
}

function versionNumber(version: string | null | undefined): string {
  return (version || "").trim().replace(/^v/i, "");
}

export function isCanonicalGoalDoc(doc: GoalDocument): boolean {
  return doc.source === "canonical";
}

export function buildGoalCanonicalHref(doc: Pick<GoalDocument, "project_key" | "document_key">): string {
  const project = (doc.project_key || "").trim();
  const documentKey = (doc.document_key || "").trim();
  if (!PROJECT_RE.test(project) || !KEY_RE.test(documentKey)) return "";
  return buildCanonicalDocHref({ project, documentKey });
}

export function goalDocumentView(doc: GoalDocument): GoalDocumentView {
  const version = versionNumber(doc.version);
  if (isCanonicalGoalDoc(doc)) {
    const label = (doc.title || "").trim() || (doc.document_key || "").trim() || "문서";
    return {
      key: `canonical:${doc.project_key || ""}:${doc.document_key || doc.id || label}`,
      canonical: true,
      label,
      icon: "📘",
      kindLabel: goalDocumentKindLabel(doc.kind),
      versionLabel: version ? `v${version}` : "",
      approved: doc.approved === true,
      href: buildGoalCanonicalHref(doc),
      tooltip: label,
    };
  }
  const path = (doc.doc_path || "").trim();
  const label = (doc.title || "").trim() || path.split("/").pop() || "문서";
  const icon = doc.kind === "plan" ? "📋" : doc.kind === "prd" ? "📐" : doc.kind === "design" ? "🛠" : "🔗";
  return {
    key: `legacy:${doc.id || path}`,
    canonical: false,
    label,
    icon,
    kindLabel: goalDocumentKindLabel(doc.kind),
    versionLabel: version ? `최신 v${version}` : "",
    approved: false,
    href: buildGoalDocHref(path),
    tooltip: `${label} — ${path}`,
  };
}
