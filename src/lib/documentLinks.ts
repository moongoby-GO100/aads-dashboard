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
  filePattern: RegExp;
};

type PublicPathMapping = {
  prefix: string;
  publicPrefix: string;
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
];

const PROJECT_HINT_MAPPINGS: ProjectHintMapping[] = [
  {
    project: "GO100",
    basePath: "/root/kis-autotrade-v4/reports",
    prefixes: ["docs/reports/", "reports/"],
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

  // 0. 사이트 URL로 잘못 감싸인 파일시스템 경로 복원
  //    예: https://aads.newtalk.kr/root/aads/aads-server/보고서.xlsx → /root/aads/aads-server/보고서.xlsx
  for (const origin of SITE_ORIGINS) {
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
      return buildDocsHref(mapping.project, mapping.basePath, normalizeProjectHintPath(filePath), line, hash);
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

/** 링크가 파일 다운로드 API로 연결되는지 여부 (UI에서 다운로드 아이콘 표기용) */
export function isFileDownloadHref(href: string): boolean {
  return href.startsWith(DOWNLOAD_API);
}
