// 정본 탭 프로젝트 탐색 레지스트리. goals 화면(통합지시)의 프로젝트 목록과 같은 키를 쓴다.
// 접근 권한은 이 목록이 아니라 GET /projects/{key}/documents 의 grant 검사(401/403)가 결정한다.
export const CANONICAL_NAV_PROJECTS: readonly string[] = [
  "AADS", "ACCT", "GO100", "KIS", "SF", "NTV2", "NAS", "FOOD", "LAW", "COM", "DESIGN", "KAKAOBOT",
];

const PROJECT_KEY = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

export function mergeCanonicalProjects(scanned: readonly string[] = []): string[] {
  const extra = scanned.filter((name) => PROJECT_KEY.test(name));
  return [...new Set([...CANONICAL_NAV_PROJECTS, ...extra])];
}

export type CanonicalErrorKind = "auth" | "forbidden" | "conflict" | "network";

export function canonicalErrorKind(error: unknown): CanonicalErrorKind {
  const message = error instanceof Error ? error.message : "";
  const status = /^(?:API error )?(\d{3})\b/.exec(message)?.[1];
  if (status === "401") return "auth";
  if (status === "403") return "forbidden";
  if (status === "409") return "conflict";
  return "network";
}
