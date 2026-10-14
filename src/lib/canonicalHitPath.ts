import { KEY_RE, PROJECT_RE } from "./canonicalDocLinks";

export type CanonicalHitRef = {
  project: string;
  documentKey: string;
  revisionId?: string;
  revision?: number;
};

const SCHEME = "canonical://";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_REVISION_RE = /^[1-9][0-9]{0,8}$/;

// 내용 검색 히트 경로: canonical://PROJECT/KEY@<revision UUID> (숫자 개정·생략 허용). 형식이 어긋나면 null.
export function parseCanonicalHitPath(path: string | null | undefined): CanonicalHitRef | null {
  if (typeof path !== "string" || !path.startsWith(SCHEME)) return null;
  const rest = path.slice(SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const project = rest.slice(0, slash);
  let documentKey = rest.slice(slash + 1);
  let revisionId: string | undefined;
  let revision: number | undefined;
  const at = documentKey.lastIndexOf("@");
  if (at >= 0) {
    const rawRevision = documentKey.slice(at + 1);
    if (UUID_RE.test(rawRevision)) revisionId = rawRevision.toLowerCase();
    else if (NUMERIC_REVISION_RE.test(rawRevision)) revision = Number(rawRevision);
    else return null;
    documentKey = documentKey.slice(0, at);
  }
  if (!PROJECT_RE.test(project) || !KEY_RE.test(documentKey)) return null;
  return { project: project.toUpperCase(), documentKey, revisionId, revision };
}
