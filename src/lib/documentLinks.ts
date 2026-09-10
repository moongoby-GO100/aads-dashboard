"use client";

type DocPathMapping = {
  hostPrefix: string;
  project: string;
  basePath: string;
};

const DOC_PATH_MAPPINGS: DocPathMapping[] = [
  { hostPrefix: "/root/aads/aads-server/docs", project: "AADS", basePath: "/app/docs" },
  { hostPrefix: "/root/aads/aads-server/reports", project: "AADS", basePath: "/app/reports" },
  { hostPrefix: "/root/aads/aads-server/app/static/docs", project: "AADS", basePath: "/app/app/static/docs" },
  { hostPrefix: "/root/aads/aads-server/app/static/reports", project: "AADS", basePath: "/app/app/static/reports" },
  { hostPrefix: "/root/aads/aads-server/app/static/preview", project: "AADS", basePath: "/app/app/static/preview" },
  { hostPrefix: "/root/aads/aads-server/app/static/gallery", project: "AADS", basePath: "/app/app/static/gallery" },
  { hostPrefix: "/root/aads/aads-docs/docs", project: "AADS", basePath: "/root/aads/aads-docs/docs" },
  { hostPrefix: "/root/aads/aads-docs/reports", project: "AADS", basePath: "/root/aads/aads-docs/reports" },
  { hostPrefix: "/root/aads/aads-dashboard/docs", project: "AADS", basePath: "/root/aads/aads-dashboard/docs" },
  { hostPrefix: "/root/aads/aads-dashboard/reports", project: "AADS", basePath: "/root/aads/aads-dashboard/reports" },
  { hostPrefix: "/root/aads/aads-dashboard/public/reports", project: "AADS", basePath: "/root/aads/aads-dashboard/public/reports" },
  { hostPrefix: "/root/aads/aads-dashboard/public/exports", project: "AADS", basePath: "/root/aads/aads-dashboard/public/exports" },
  { hostPrefix: "/root/aads/aads-core/docs", project: "AADS", basePath: "/root/aads/aads-core/docs" },
  { hostPrefix: "/root/aads/aads-core/reports", project: "AADS", basePath: "/root/aads/aads-core/reports" },
  { hostPrefix: "/root/kis-autotrade-v4/docs", project: "KIS", basePath: "/root/kis-autotrade-v4/docs" },
  { hostPrefix: "/root/kis-autotrade-v4/report", project: "GO100", basePath: "/root/kis-autotrade-v4/report" },
  { hostPrefix: "/root/kis-autotrade-v4/reports", project: "GO100", basePath: "/root/kis-autotrade-v4/reports" },
  { hostPrefix: "/root/kis-autotrade-v4/docs/go100", project: "GO100", basePath: "/root/kis-autotrade-v4/docs/go100" },
  { hostPrefix: "/root/kis-autotrade-v4/docs/technical", project: "GO100", basePath: "/root/kis-autotrade-v4/docs/technical" },
  { hostPrefix: "/data/shortflow/docs", project: "SF", basePath: "/data/shortflow/docs" },
  { hostPrefix: "/srv/newtalk-v2/docs", project: "NTV2", basePath: "/srv/newtalk-v2/docs" },
];

type RelativeMapping = {
  prefix: string;
  project: string;
  basePath: string;
  stripPrefix: string;
};

type ProjectHintMapping = {
  project: string;
  basePath: string;
  prefixes: string[];
  filePathPrefix?: string;
  filePattern: RegExp;
};

type PublicPathMapping = {
  prefix: string;
  publicPrefix: string;
};

export type DocumentRouteParams = {
  project: string;
  basePath: string;
  filePath: string;
};

const PUBLIC_PATH_MAPPINGS: PublicPathMapping[] = [
  { prefix: "/root/aads/aads-dashboard/public/reports/", publicPrefix: "/reports/" },
  { prefix: "/root/aads/aads-dashboard/public/exports/", publicPrefix: "/exports/" },
  { prefix: "public/reports/", publicPrefix: "/reports/" },
  { prefix: "public/exports/", publicPrefix: "/exports/" },
];

const RELATIVE_DOC_MAPPINGS: RelativeMapping[] = [
  { prefix: "/app/app/static/docs/", project: "AADS", basePath: "/app/app/static/docs", stripPrefix: "/app/app/static/docs/" },
  { prefix: "/app/app/static/reports/", project: "AADS", basePath: "/app/app/static/reports", stripPrefix: "/app/app/static/reports/" },
  { prefix: "/app/app/static/preview/", project: "AADS", basePath: "/app/app/static/preview", stripPrefix: "/app/app/static/preview/" },
  { prefix: "/app/app/static/gallery/", project: "AADS", basePath: "/app/app/static/gallery", stripPrefix: "/app/app/static/gallery/" },
  { prefix: "/app/docs/", project: "AADS", basePath: "/app/docs", stripPrefix: "/app/docs/" },
  { prefix: "/app/reports/", project: "AADS", basePath: "/app/reports", stripPrefix: "/app/reports/" },
  { prefix: "app/static/docs/", project: "AADS", basePath: "/app/app/static/docs", stripPrefix: "app/static/docs/" },
  { prefix: "app/static/reports/", project: "AADS", basePath: "/app/app/static/reports", stripPrefix: "app/static/reports/" },
  { prefix: "app/static/preview/", project: "AADS", basePath: "/app/app/static/preview", stripPrefix: "app/static/preview/" },
  { prefix: "app/static/gallery/", project: "AADS", basePath: "/app/app/static/gallery", stripPrefix: "app/static/gallery/" },
  { prefix: "docs/", project: "AADS", basePath: "/app/docs", stripPrefix: "docs/" },
  { prefix: "reports/", project: "AADS", basePath: "/app/reports", stripPrefix: "reports/" },
  { prefix: "scripts/", project: "AADS", basePath: "/app", stripPrefix: "" },
  { prefix: "tests/", project: "AADS", basePath: "/app", stripPrefix: "" },
  { prefix: "migrations/", project: "AADS", basePath: "/app", stripPrefix: "" },
  { prefix: "app/", project: "AADS", basePath: "/app/app", stripPrefix: "app/" },
  { prefix: "api/", project: "AADS", basePath: "/app/app", stripPrefix: "" },
  { prefix: "routers/", project: "AADS", basePath: "/app/app", stripPrefix: "" },
  { prefix: "services/", project: "AADS", basePath: "/app/app", stripPrefix: "" },
  { prefix: "src/", project: "AADS", basePath: "/root/aads/aads-dashboard/src", stripPrefix: "src/" },
  { prefix: "components/", project: "AADS", basePath: "/root/aads/aads-dashboard/src", stripPrefix: "" },
  { prefix: "hooks/", project: "AADS", basePath: "/root/aads/aads-dashboard/src", stripPrefix: "" },
  { prefix: "lib/", project: "AADS", basePath: "/root/aads/aads-dashboard/src", stripPrefix: "" },
  { prefix: "styles/", project: "AADS", basePath: "/root/aads/aads-dashboard/src", stripPrefix: "" },
];

const PROJECT_HINT_MAPPINGS: ProjectHintMapping[] = [
  {
    project: "GO100",
    basePath: "/root/kis-autotrade-v4/docs",
    prefixes: ["docs/reports/"],
    filePathPrefix: "reports/",
    filePattern: /^(GO100[-_]|GO100\b|#?\d+.*GO100|.*상한가|.*백억)/i,
  },
  {
    project: "GO100",
    basePath: "/root/kis-autotrade-v4/reports",
    prefixes: ["reports/"],
    filePattern: /^(GO100[-_]|GO100\b|#?\d+.*GO100|.*상한가|.*백억)/i,
  },
  {
    project: "KIS",
    basePath: "/root/kis-autotrade-v4/docs",
    prefixes: ["docs/", "reports/"],
    filePattern: /^(KIS[-_]|KIS\b|.*자동매매)/i,
  },
  {
    project: "SF",
    basePath: "/data/shortflow/docs",
    prefixes: ["docs/", "reports/"],
    filePattern: /^(SF[-_]|ShortFlow\b|.*shortflow|.*숏폼)/i,
  },
  {
    project: "NTV2",
    basePath: "/srv/newtalk-v2/docs",
    prefixes: ["docs/", "reports/"],
    filePattern: /^(NTV2[-_]|NT[-_]|NewTalk\b|.*newtalk)/i,
  },
];

// AADS-FILES(2026-08-18): 파일시스템 경로 링크가 https://aads.newtalk.kr/root/... 로 새어나가
// 404가 나던 문제를 막기 위해 다운로드/열람 API로 연결한다.
const DOWNLOAD_API = "/api/v1/files/download";

const SITE_ORIGINS = [
  "https://aads.newtalk.kr",
  "https://www.newtalk.kr",
  "https://newtalk.kr",
  "http://localhost:3000",
  "http://localhost:3001",
];

function siteOrigins(): string[] {
  if (typeof window === "undefined") return SITE_ORIGINS;
  return Array.from(new Set([...SITE_ORIGINS, window.location.origin]));
}

// 서버 파일시스템 경로로 간주할 루트
const FS_ROOT_PREFIXES = ["/root/", "/app/", "/data/", "/srv/", "/tmp/", "/var/", "/opt/", "/mnt/", "/home/"];

// /docs 텍스트 뷰어가 읽을 수 있는 확장자 (그 외는 곧바로 다운로드 API로 보낸다)
const DOCS_VIEWER_EXTS = new Set([
  "md", "markdown", "txt", "json", "yaml", "yml", "py", "ts", "tsx", "js", "jsx",
  "sql", "sh", "css", "scss", "html", "htm", "xml", "toml", "ini", "log", "csv", "conf",
]);

// 브라우저에서 바로 볼 수 있는 확장자 (inline=1)
const INLINE_EXTS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
  "txt", "md", "csv", "json", "log", "html", "htm",
]);

function getExt(path: string): string {
  const name = path.split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isFilesystemPath(path: string): boolean {
  return FS_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * 퍼센트 인코딩된 파일시스템 경로를 되돌린다.
 * `%2Ftmp%2Freview.md`(경로 전체), `/tmp/a%20b.md`(공백만), `%252F…`(이중 인코딩)를 모두 다룬다.
 * 호출부는 결과가 파일시스템 경로일 때만 채택한다.
 */
function decodeFilesystemPath(value: string): string {
  let decoded = value;
  for (let i = 0; i < 2; i += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return decoded;
    }
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function buildDownloadHref(filePath: string): string {
  const q = new URLSearchParams();
  q.set("path", filePath);
  if (INLINE_EXTS.has(getExt(filePath))) q.set("inline", "1");
  return `${DOWNLOAD_API}?${q.toString()}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildDocsHref(project: string, basePath: string, filePath: string, line?: string, hash?: string): string {
  const q = new URLSearchParams();
  q.set("project", project);
  q.set("base_path", basePath);
  q.set("file_path", filePath.replace(/^\/+/, ""));
  if (line) q.set("line", line);
  return `/docs?${q.toString()}${hash || ""}`;
}

function buildPublicHref(publicPrefix: string, filePath: string, hash?: string): string {
  const encodedPath = filePath
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${publicPrefix}${encodedPath}${hash || ""}`;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function parseDocsHref(href: string): DocumentRouteParams | null {
  if (!href.startsWith("/docs?")) return null;
  const query = href.slice(href.indexOf("?") + 1).split("#", 1)[0];
  const q = new URLSearchParams(query);
  const project = q.get("project") || "";
  const basePath = q.get("base_path") || "";
  const filePath = q.get("file_path") || "";
  if (!project || !basePath || !filePath) return null;
  return { project, basePath, filePath };
}

function normalizeProjectHintPath(filePath: string): string {
  return filePath
    .replace(/^docs\/reports\//, "")
    .replace(/^reports\//, "")
    .replace(/^docs\//, "");
}

function splitPathSuffix(path: string): { filePath: string; line?: string; hash?: string } {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const lineMatch = pathWithoutHash.match(/^(.*?)(:\d+)?$/);
  return {
    filePath: lineMatch?.[1] || pathWithoutHash,
    line: lineMatch?.[2]?.slice(1),
    hash,
  };
}

export function isUnsafeLink(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:");
}

export function normalizeDocumentHref(href: string): string {
  let raw = href.trim();
  if (!raw || isUnsafeLink(raw)) return "";
  raw = raw.replace(/\\/g, "/");
  // Old messages sometimes contain a fully URL-encoded filesystem path rather
  // than an encoded path segment. Decode it only when it becomes a known local
  // path; arbitrary encoded URLs must retain their original meaning.
  // AADS-CHATFILE(2026-09-10): `/tmp/a%20b.md` 처럼 경로 일부만 인코딩된 링크와
  // `%252F…` 이중 인코딩 링크까지 넓혔다. 인코딩된 채로 다운로드 API 쿼리에 넣으면
  // 이중 인코딩되어 서버가 파일을 찾지 못한다. `..` 가 드러나면 원문을 유지한다.
  if (raw.includes("%") && !/^https?:\/\//i.test(raw)) {
    const decoded = decodeFilesystemPath(raw);
    if (decoded !== raw && isFilesystemPath(decoded) && !decoded.split("/").includes("..")) {
      raw = decoded;
    }
  }
  raw = raw.replace(/^\.\//, "");
  if (raw.startsWith("../aads-dashboard/")) raw = raw.replace(/^\.\.\/aads-dashboard\//, "");
  if (raw.startsWith("../aads-server/")) raw = raw.replace(/^\.\.\/aads-server\//, "");

  // 0. 사이트 URL로 잘못 감싸인 파일시스템 경로 복원
  //    예: https://aads.newtalk.kr/root/aads/aads-server/보고서.xlsx → /root/aads/aads-server/보고서.xlsx
  for (const origin of siteOrigins()) {
    if (raw.startsWith(`${origin}/`)) {
      const rest = raw.slice(origin.length);
      let decoded = rest;
      try {
        decoded = decodeURI(rest);
      } catch {
        decoded = rest;
      }
      if (isFilesystemPath(decoded)) {
        raw = decoded;
      }
      break;
    }
  }

  // 0-1. 같은 사이트의 문서 뷰어 URL은 내부 라우트로 정규화한다.
  //      채팅 파일칩이 https://aads.newtalk.kr/docs?... 를 외부 URL로 보아 "복사" 처리하는 것을 막는다.
  for (const origin of siteOrigins()) {
    if (raw.startsWith(`${origin}/docs?`)) {
      raw = raw.slice(origin.length);
      break;
    }
  }

  // 외부 URL은 그대로 둔다
  if (/^https?:\/\//i.test(raw)) return raw;

  // 1. Next.js가 직접 서빙하는 public 자산
  for (const mapping of PUBLIC_PATH_MAPPINGS) {
    if (raw.startsWith(mapping.prefix)) {
      const remainder = raw.slice(mapping.prefix.length);
      const { filePath, hash } = splitPathSuffix(remainder);
      if (!filePath || filePath.includes("..")) return raw;
      return buildPublicHref(mapping.publicPrefix, filePath, hash);
    }
  }

  // 2. 텍스트 뷰어가 못 여는 형식(xlsx/pptx/zip/이미지 등)은 바로 다운로드 API로 보낸다
  if (isFilesystemPath(raw)) {
    const { filePath } = splitPathSuffix(raw);
    if (filePath && !filePath.includes("..") && !DOCS_VIEWER_EXTS.has(getExt(filePath))) {
      return buildDownloadHref(filePath);
    }
  }

  // 3. 절대 호스트 경로 매핑 (/root/aads/...) → /docs 뷰어
  const mappings = [...DOC_PATH_MAPPINGS].sort((a, b) => b.hostPrefix.length - a.hostPrefix.length);
  for (const mapping of mappings) {
    const prefix = trimTrailingSlash(mapping.hostPrefix);
    if (raw === prefix || raw.startsWith(`${prefix}/`)) {
      const { filePath, line, hash } = splitPathSuffix(raw.slice(prefix.length).replace(/^\/+/, ""));
      if (!filePath || filePath.includes("..")) return raw;
      return buildDocsHref(mapping.project, mapping.basePath, filePath, line, hash);
    }
  }

  // 4. 상대/컨테이너 경로 매핑 (docs/..., /app/docs/...)
  for (const mapping of PROJECT_HINT_MAPPINGS) {
    const matchedPrefix = mapping.prefixes.find((prefix) => raw.startsWith(prefix));
    if (!matchedPrefix) continue;
    const remainder = raw.slice(matchedPrefix.length);
    const { filePath, line, hash } = splitPathSuffix(remainder);
    if (!filePath || filePath.includes("..")) return raw;
    if (mapping.filePattern.test(basename(filePath))) {
      return buildDocsHref(
        mapping.project,
        mapping.basePath,
        `${mapping.filePathPrefix || ""}${normalizeProjectHintPath(filePath)}`,
        line,
        hash,
      );
    }
  }

  for (const mapping of RELATIVE_DOC_MAPPINGS) {
    if (raw.startsWith(mapping.prefix)) {
      const remainder = raw.slice(mapping.stripPrefix.length);
      const { filePath, line, hash } = splitPathSuffix(remainder);
      if (!filePath || filePath.includes("..")) return raw;
      return buildDocsHref(mapping.project, mapping.basePath, filePath, line, hash);
    }
  }

  // 5. 매핑되지 않은 파일시스템 경로 → 다운로드 API (404 방지 최종 안전망)
  if (isFilesystemPath(raw)) {
    const { filePath } = splitPathSuffix(raw);
    if (filePath && !filePath.includes("..")) return buildDownloadHref(filePath);
  }

  return raw;
}

export function normalizeDocumentRouteParams(params: DocumentRouteParams): DocumentRouteParams {
  const project = params.project.trim();
  const basePath = params.basePath.trim().replace(/\/+$/, "");
  const filePath = params.filePath.trim().replace(/^\/+/, "");
  const original = { project, basePath, filePath };

  if (!project || !basePath || !filePath || filePath.includes("..")) return original;

  // Legacy chat links often encoded every relative document as AADS /app/docs or /app/reports.
  // Re-run those routes through the same project-hint mapper used for markdown links.
  const legacyPrefix =
    project === "AADS" && basePath === "/app/docs"
      ? "docs/"
      : project === "AADS" && basePath === "/app/reports"
        ? "reports/"
        : "";
  if (!legacyPrefix) return original;

  const repaired = parseDocsHref(normalizeDocumentHref(`${legacyPrefix}${filePath}`));
  if (!repaired) return original;
  return repaired;
}

/** 링크가 파일 다운로드 API로 연결되는지 여부 (UI에서 다운로드 아이콘 표기용) */
export function isFileDownloadHref(href: string): boolean {
  return href.startsWith(DOWNLOAD_API);
}

// ── 아티팩트 패널 미리보기 판정 (채팅 파일 링크 공통 처리기) ─────────────────────
// 링크 표기가 절대/상대/호스트/컨테이너/tmp/URL 인코딩 중 무엇이든
// normalizeDocumentHref 를 거치면 아래 내부 경로 중 하나가 된다.
// 이 함수는 "그 경로의 내용을 우측 아티팩트 패널이 직접 그릴 수 있는가"만 판정한다.
// 판정을 MarkdownRenderer 와 chat page 가 각각 해석하면 "링크는 패널용으로 보이는데
// 패널은 열지 못하는" 불일치가 생기므로 여기 한 곳에서만 정의한다.

/** 아티팩트 패널이 내용을 직접 렌더링할 수 있는 확장자 (텍스트 뷰어 + 브라우저 인라인) */
const ARTIFACT_PREVIEW_EXTS = new Set<string>([...DOCS_VIEWER_EXTS, ...INLINE_EXTS]);

/** 정적으로 서빙되는 문서 경로 (nginx/Next 라우트) */
const ARTIFACT_PREVIEW_PATH_PREFIXES = [
  "/reports/",
  "/exports/",
  "/static/reports/",
  "/static/docs/",
  "/static/preview/",
  "/static/gallery/",
];

/**
 * 파일명/경로만 보고 "텍스트로 읽어 그릴 수 있는 문서"인지 판정한다.
 * Content-Type 은 신뢰할 수 없다 — 예를 들어 `.ts` 는 서버 mimetypes 가 `video/mp2t` 로 추정해
 * 정상적인 TypeScript 문서를 이진 파일로 오인하게 만든다.
 */
export function isPreviewableTextFile(nameOrPath: string): boolean {
  return DOCS_VIEWER_EXTS.has(getExt(nameOrPath.split(/[?#]/)[0]));
}

function currentSiteOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://aads.newtalk.kr";
}

/** 파일 다운로드 API 링크를 패널에서 열 수 있는지 (inline 플래그 또는 확장자 기준) */
function isPreviewableDownloadHref(href: string): boolean {
  try {
    const url = new URL(href, currentSiteOrigin());
    if (url.searchParams.get("inline") === "1") return true;
    return ARTIFACT_PREVIEW_EXTS.has(getExt(url.searchParams.get("path") || ""));
  } catch {
    return href.includes("inline=1");
  }
}

/**
 * 링크를 클릭했을 때 우측 아티팩트 패널에서 열어야 하는지 판정한다.
 * `false`면 호출부는 기존 동작(다운로드/복사)을 유지한다.
 */
export function isArtifactPreviewHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/docs?")) return true;
  if (href.startsWith(DOWNLOAD_API)) return isPreviewableDownloadHref(href);
  if (ARTIFACT_PREVIEW_PATH_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    return ARTIFACT_PREVIEW_EXTS.has(getExt(href.split(/[?#]/)[0]));
  }
  try {
    const origin = currentSiteOrigin();
    const url = new URL(href, origin);
    if (url.origin !== origin) return false;
    // 현재 배포 호스트로 절대 URL이 적힌 문서 뷰어 링크도 패널 대상으로 본다.
    if (url.pathname === "/docs" && url.searchParams.has("file_path")) return true;
    if (url.pathname === DOWNLOAD_API) return isPreviewableDownloadHref(url.pathname + url.search);
    if (ARTIFACT_PREVIEW_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return ARTIFACT_PREVIEW_EXTS.has(getExt(url.pathname));
    }
  } catch {
    /* 파싱 불가 링크는 기존 보수적 동작을 유지한다 */
  }
  return false;
}
