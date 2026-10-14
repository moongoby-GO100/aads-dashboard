export interface DocFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  type: string;
  base_path: string;
  label: string;
  full_path?: string;
  format?: string;
}

export interface ListedDocFile extends DocFile {
  project: string;
}

export interface DocFileMeta {
  encoding: string;
  mime_type: string;
  is_binary: boolean;
  format?: string;
  converted_from?: string;
  source_mime_type?: string;
}

export const TYPE_LABELS: Record<string, string> = {
  doc: "일반문서",
  contract: "계약/전자계약",
  directive: "지시문",
  handover: "인수인계",
  changelog: "변경이력",
  report: "리포트",
  qa: "QA/검증",
  api: "API",
  architecture: "아키텍처",
  runbook: "운영/배포",
  plan: "기획/계획",
  status: "상태/이슈",
  knowledge: "가이드/지식",
  schema: "스키마",
  script: "스크립트",
  config: "설정",
};

export const FORMAT_LABELS: Record<string, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "텍스트",
  pdf: "PDF",
  image: "이미지",
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
  "powerpoint-text": "PowerPoint 텍스트",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  csv: "CSV",
  "excel-csv": "Excel CSV",
  "word-text": "Word 텍스트",
  "office-text": "Office 텍스트",
  binary: "바이너리",
  python: "Python",
  shell: "Shell",
  sql: "SQL",
  javascript: "JavaScript",
  typescript: "TypeScript",
  css: "CSS",
  config: "설정파일",
  log: "로그",
  rst: "reStructuredText",
  other: "기타",
};

export function detectFormat(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
  const map: Record<string, string> = {
    md: "markdown", txt: "text", html: "html", htm: "html", rst: "rst", pdf: "pdf",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", csv: "csv",
    py: "python", sh: "shell", sql: "sql",
    js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript",
    css: "css", ini: "config", cfg: "config", conf: "config", log: "log",
    png: "image", jpg: "image", jpeg: "image", gif: "image",
    svg: "image", webp: "image", bmp: "image", ico: "image",
    docx: "word", odt: "word",
    xlsx: "excel", ods: "excel",
    pptx: "powerpoint", odp: "powerpoint",
  };
  return map[ext] || "other";
}

export function buildFullPath(file: DocFile): string {
  if (file.full_path) return file.full_path;
  const base = file.base_path.replace(/\/+$/, "");
  const rel = file.path.replace(/^\/+/, "");
  return `${base}/${rel}`;
}
