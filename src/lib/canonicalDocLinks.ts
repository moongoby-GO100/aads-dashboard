// 정본(canonical) 문서 열람 링크 계약 — AADS-RDOC-ARTIFACT-CLICK-RECOVERY-20261006
//
// 백엔드 AADS-RDOC-UNIFIED-STORAGE(9c2214d2)가 주는 참조는 {project, document_key, revision} 이며
// 본문은 인증이 필요한 `GET /projects/{P}/documents/{key}/content` 로만 읽는다.
// 파일 경로·인증 없는 raw API 주소는 링크로 쓰지 않는다. 채팅 링크는 아래 형태 하나다.
//
//   /docs?tab=canonical&project=AADS&document_key=<key>[&revision=<n>][&approved_only=1]

export type CanonicalDocRef = {
  project: string;
  documentKey: string;
  revision?: number;
  approvedOnly?: boolean;
};

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function buildCanonicalDocHref(ref: CanonicalDocRef): string {
  const q = new URLSearchParams();
  q.set("tab", "canonical");
  q.set("project", ref.project.toUpperCase());
  q.set("document_key", ref.documentKey);
  if (ref.revision !== undefined) q.set("revision", String(ref.revision));
  if (ref.approvedOnly) q.set("approved_only", "1");
  return `/docs?${q.toString()}`;
}

export function parseCanonicalDocHref(href: string): CanonicalDocRef | null {
  if (!href.startsWith("/docs?")) return null;
  const query = href.slice(href.indexOf("?") + 1).split("#", 1)[0];
  const q = new URLSearchParams(query);
  // 파일 링크(base_path/file_path)는 기존 처리 경로로 보낸다.
  if (q.has("file_path") || q.has("base_path")) return null;
  const project = (q.get("project") || "").trim();
  const documentKey = (q.get("document_key") || "").trim();
  if (!PROJECT_RE.test(project) || !KEY_RE.test(documentKey)) return null;
  const rawRevision = q.get("revision");
  let revision: number | undefined;
  if (rawRevision !== null && rawRevision !== "") {
    if (!/^[1-9][0-9]{0,8}$/.test(rawRevision)) return null;
    revision = Number(rawRevision);
  }
  const approvedFlag = (q.get("approved_only") || "").toLowerCase();
  return {
    project: project.toUpperCase(),
    documentKey,
    revision,
    approvedOnly: approvedFlag === "1" || approvedFlag === "true" || undefined,
  };
}

export function canonicalContentPath(ref: CanonicalDocRef): string {
  const base = `/projects/${encodeURIComponent(ref.project)}/documents/${encodeURIComponent(ref.documentKey)}`;
  const query: string[] = [];
  if (ref.revision !== undefined) query.push(`revision=${ref.revision}`);
  if (ref.approvedOnly) query.push("approved_only=true");
  return `${base}/content${query.length ? `?${query.join("&")}` : ""}`;
}

export function canonicalDetailPath(ref: CanonicalDocRef): string {
  const base = `/projects/${encodeURIComponent(ref.project)}/documents/${encodeURIComponent(ref.documentKey)}`;
  return ref.approvedOnly ? `${base}?approved_only=true` : base;
}

export type CanonicalContentResponse = {
  project?: string;
  document_key?: string;
  content?: string;
  mime_type?: string;
  format?: string;
  canonical?: {
    document_key?: string;
    revision?: number;
    revision_id?: string;
    version?: string;
    status?: string;
    authoritative?: boolean;
    title?: string;
    source_path?: string | null;
  };
};

export type CanonicalDetailResponse = {
  revision: {
    revision?: number;
    id?: string;
    version?: string;
    title?: string;
    content?: string;
    source_path?: string | null;
  } | null;
  status?: string;
  authoritative?: boolean;
};

/** 구버전 서버(`/content` 미배포)의 상세 응답을 `/content` 응답 모양으로 맞춘다. 요청 개정과 다르면 null. */
export function contentFromDetail(
  ref: CanonicalDocRef,
  detail: CanonicalDetailResponse,
): CanonicalContentResponse | null {
  const row = detail.revision;
  if (!row) return null;
  if (ref.revision !== undefined && row.revision !== ref.revision) return null;
  return {
    project: ref.project,
    document_key: ref.documentKey,
    content: row.content || "",
    mime_type: "text/markdown",
    format: "markdown",
    canonical: {
      document_key: ref.documentKey,
      revision: row.revision,
      revision_id: row.id,
      version: row.version,
      status: detail.status,
      authoritative: detail.authoritative,
      title: row.title,
      source_path: row.source_path ?? null,
    },
  };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "초안", review: "검토", approved: "승인", archived: "보관",
};

export function canonicalStatusLabel(status?: string, authoritative?: boolean): string {
  if (authoritative) return "승인됨";
  return STATUS_LABEL[status || "draft"] || status || "초안";
}

/** 표시 제목: 저장된 한글 제목을 그대로 쓰고, 없을 때만 문서 키를 쓴다(원문·키는 바꾸지 않는다). */
export function canonicalDisplayTitle(ref: CanonicalDocRef, response: CanonicalContentResponse): string {
  const title = (response.canonical?.title || "").trim();
  return title || ref.documentKey;
}
