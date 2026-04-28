"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface DocFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  type: string;
  base_path: string;
  label: string;
  full_path?: string;
}

interface ListedDocFile extends DocFile {
  project: string;
}

interface ProjectDocs {
  project: string;
  host: string;
  total: number;
  files: DocFile[];
  delta?: ScanDelta;
}

interface ScanResult {
  total: number;
  projects: ProjectDocs[];
  scanned_at: number;
  cache_hit?: boolean;
  cache_mode?: string;
  cache_age_sec?: number;
  delta?: ScanDelta;
}

interface ScanDelta {
  new: number;
  updated: number;
  removed: number;
  unchanged: number;
}

const MIN_LIST_WIDTH = 320;
const MAX_LIST_WIDTH_RATIO = 0.7;
const DOCS_CACHE_KEY = "aads.docs.scanResult.v1";

const PROJECT_COLORS: Record<string, string> = {
  AADS: "bg-blue-900 text-blue-200",
  KIS: "bg-purple-900 text-purple-200",
  GO100: "bg-yellow-900 text-yellow-200",
  SF: "bg-emerald-900 text-emerald-200",
  NTV2: "bg-pink-900 text-pink-200",
};

const TYPE_LABELS: Record<string, string> = {
  doc: "일반문서",
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

const TYPE_COLORS: Record<string, string> = {
  doc: "bg-gray-700 text-gray-200",
  directive: "bg-rose-900 text-rose-200",
  handover: "bg-orange-900 text-orange-200",
  changelog: "bg-amber-900 text-amber-200",
  report: "bg-blue-900 text-blue-200",
  qa: "bg-lime-900 text-lime-200",
  api: "bg-sky-900 text-sky-200",
  architecture: "bg-violet-900 text-violet-200",
  runbook: "bg-red-900 text-red-200",
  plan: "bg-cyan-900 text-cyan-200",
  status: "bg-yellow-900 text-yellow-200",
  knowledge: "bg-green-900 text-green-200",
  schema: "bg-fuchsia-900 text-fuchsia-200",
  script: "bg-orange-800 text-orange-100",
  config: "bg-slate-700 text-slate-200",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function formatDelta(delta?: ScanDelta): string {
  if (!delta) return "";
  const changed = (delta.new || 0) + (delta.updated || 0) + (delta.removed || 0);
  if (!changed) return "변경 없음";
  return `신규 ${delta.new || 0} · 수정 ${delta.updated || 0} · 삭제 ${delta.removed || 0}`;
}

function buildFullPath(file: DocFile): string {
  if (file.full_path) return file.full_path;
  const base = file.base_path.replace(/\/+$/, "");
  const rel = file.path.replace(/^\/+/, "");
  return `${base}/${rel}`;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto text-sm"><code class="text-green-300">${code.trim()}</code></pre>`,
  );
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-sm text-yellow-200">$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-4 mb-1 text-blue-300">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-2 text-blue-200">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2 text-white border-b border-gray-700 pb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3 text-white">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>');
  html = html.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line.split("|").filter(Boolean);
    if (cells.every((c) => /^[\s-:]+$/.test(c))) return "";
    const row = cells.map((c) => `<td class="border border-gray-700 px-2 py-1 text-sm">${c.trim()}</td>`).join("");
    return `<tr class="hover:bg-gray-800">${row}</tr>`;
  });
  html = html.replace(/(<tr[^>]*>.*<\/tr>\n?)+/g, (m) =>
    `<table class="w-full border-collapse border border-gray-700 my-3">${m}</table>`,
  );
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-blue-500 pl-3 my-2 text-gray-400 italic text-sm">$1</blockquote>');
  html = html.replace(/\n\n/g, '<div class="my-2"></div>');
  html = html.replace(/\n/g, "<br/>");

  return html;
}

export default function DocsPage() {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<ScanResult | null>(null);
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<ListedDocFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "modified" | "size">("modified");
  const [listPaneWidth, setListPaneWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const fetchDocs = useCallback(async (force = false) => {
    setLoading(!dataRef.current);
    setError(null);
    try {
      const r = await api.scanProjectDocs(force);
      setData(r);
      dataRef.current = r;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DOCS_CACHE_KEY, JSON.stringify(r));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "스캔 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(DOCS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as ScanResult;
        if (parsed?.projects?.length) {
          dataRef.current = parsed;
          setData(parsed);
          setLoading(false);
        }
      }
    } catch {
      window.localStorage.removeItem(DOCS_CACHE_KEY);
    }
    fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    const syncViewport = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: MouseEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const maxWidth = Math.max(MIN_LIST_WIDTH, rect.width * MAX_LIST_WIDTH_RATIO);
      setListPaneWidth(clamp(event.clientX - rect.left, MIN_LIST_WIDTH, maxWidth));
    };

    const handleUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing]);

  const openFile = async (project: string, file: ListedDocFile) => {
    setSelectedFile(file);
    setContentLoading(true);
    setFileContent(null);
    try {
      const r = await api.getProjectDocContent(project, file.base_path, file.path);
      setFileContent(r.content || "");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      setFileContent(`⚠️ 파일을 불러올 수 없습니다: ${message}`);
    } finally {
      setContentLoading(false);
    }
  };

  const filteredProjects =
    data?.projects?.filter((project) => selectedProject === "all" || project.project === selectedProject) || [];

  const matchingFiles: ListedDocFile[] = [];
  for (const project of filteredProjects) {
    for (const file of project.files) {
      if (search) {
        const query = search.toLowerCase();
        if (!file.name.toLowerCase().includes(query) && !file.path.toLowerCase().includes(query)) continue;
      }
      matchingFiles.push({ ...file, project: project.project });
    }
  }

  const typeCounts = matchingFiles.reduce<Record<string, number>>((acc, file) => {
    acc[file.type] = (acc[file.type] || 0) + 1;
    return acc;
  }, {});

  const allFiles = matchingFiles.filter((file) => selectedType === "all" || file.type === selectedType);

  allFiles.sort((a, b) => {
    if (sortBy === "modified") return b.modified - a.modified;
    if (sortBy === "size") return b.size - a.size;
    return a.name.localeCompare(b.name);
  });

  const availableTypes = Object.keys(typeCounts).sort((a, b) => {
    const labelA = TYPE_LABELS[a] || a;
    const labelB = TYPE_LABELS[b] || b;
    return labelA.localeCompare(labelB, "ko");
  });

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="📄 프로젝트별 문서 통합" />

      <div ref={layoutRef} className="flex-1 flex overflow-hidden">
        <div
          className="w-full lg:flex-none flex flex-col border-r overflow-hidden"
          style={{
            borderColor: "var(--border)",
            width: isDesktop ? `${listPaneWidth}px` : undefined,
          }}
        >
          <div className="flex flex-col min-w-0 h-full">
            <div className="p-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedProject("all")}
                  className="px-2.5 py-1 text-xs rounded-lg transition-colors"
                  style={
                    selectedProject === "all"
                      ? { background: "var(--accent)", color: "#fff" }
                      : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                  }
                >
                  전체 {data?.total || 0}
                </button>
                {data?.projects?.map((project) => (
                  <button
                    key={project.project}
                    onClick={() => setSelectedProject(project.project)}
                    className="px-2.5 py-1 text-xs rounded-lg transition-colors"
                    style={
                      selectedProject === project.project
                        ? { background: "var(--accent)", color: "#fff" }
                        : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                    }
                  >
                    {project.project} {project.total}
                  </button>
                ))}
                <button
                  onClick={() => fetchDocs(true)}
                  className="ml-auto px-2 py-1 text-xs rounded-lg"
                  style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                  title="강제 재스캔"
                >
                  🔄
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="파일명 또는 경로 검색..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "modified" | "size")}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <option value="modified">최신순</option>
                  <option value="name">이름순</option>
                  <option value="size">크기순</option>
                </select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedType("all")}
                  className="px-2.5 py-1 text-xs rounded-lg transition-colors"
                  style={
                    selectedType === "all"
                      ? { background: "var(--accent)", color: "#fff" }
                      : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                  }
                >
                  전체 유형 {matchingFiles.length}
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className="px-2.5 py-1 text-xs rounded-lg transition-colors"
                    style={
                      selectedType === type
                        ? { background: "var(--accent)", color: "#fff" }
                        : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                    }
                  >
                    {TYPE_LABELS[type] || type} {typeCounts[type] || 0}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-1">
              {loading ? (
                <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
                  스캔 중...
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-400">{error}</div>
              ) : allFiles.length === 0 ? (
                <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
                  조건에 맞는 문서가 없습니다
                </div>
              ) : (
                allFiles.map((file, index) => {
                  const isSelected =
                    selectedFile?.project === file.project &&
                    selectedFile?.base_path === file.base_path &&
                    selectedFile?.path === file.path;

                  return (
                    <button
                      key={`${file.project}-${file.base_path}-${file.path}-${index}`}
                      onClick={() => openFile(file.project, file)}
                      className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: isSelected ? "var(--accent)" : "transparent",
                        color: isSelected ? "#fff" : "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${PROJECT_COLORS[file.project] || "bg-gray-700 text-gray-200"}`}>
                          {file.project}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[file.type] || "bg-gray-700 text-gray-200"}`}>
                          {TYPE_LABELS[file.type] || file.type}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: isSelected ? "rgba(255,255,255,0.3)" : "var(--border)" }}>
                          {file.label}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: isSelected ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}>
                          {formatDate(file.modified)} · {formatSize(file.size)}
                        </span>
                      </div>

                      <div className="text-sm mt-1 font-medium break-all">{file.name}</div>

                      <div
                        className="mt-1 text-xs break-all font-mono"
                        style={{ color: isSelected ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}
                        title={buildFullPath(file)}
                      >
                        {buildFullPath(file)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {data && (
              <div className="px-3 py-2 text-xs flex justify-between" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <span>{allFiles.length}개 문서 · {formatDelta(data.delta)}</span>
                <span>
                  {data.cache_hit ? "캐시" : data.cache_mode === "incremental" ? "증분" : "스캔"}:{" "}
                  {new Date((data.scanned_at || 0) * 1000).toLocaleTimeString("ko-KR")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className="hidden lg:flex w-3 items-stretch cursor-col-resize transition-colors"
          onMouseDown={() => setIsResizing(true)}
          style={{ background: isResizing ? "var(--accent)" : "var(--border)" }}
          title="좌우 폭 조절"
        >
          <div className="mx-auto my-3 w-px bg-white/20" />
        </div>

        <div className="hidden lg:flex flex-1 flex-col overflow-hidden min-w-0">
          {selectedFile ? (
            <>
              <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${PROJECT_COLORS[selectedFile.project] || "bg-gray-700 text-gray-200"}`}>
                    {selectedFile.project}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[selectedFile.type] || "bg-gray-700 text-gray-200"}`}>
                    {TYPE_LABELS[selectedFile.type] || selectedFile.type}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                    {selectedFile.label}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {selectedFile.name}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
                    {formatDate(selectedFile.modified)} · {formatSize(selectedFile.size)}
                  </span>
                </div>

                <div className="text-xs font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                  {buildFullPath(selectedFile)}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-6 py-5">
                {contentLoading ? (
                  <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
                    로딩 중...
                  </div>
                ) : fileContent !== null ? (
                  selectedFile.name.endsWith(".md") ? (
                    <div
                      className="prose prose-invert max-w-none text-sm leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>
                      {fileContent}
                    </pre>
                  )
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-secondary)" }}>
              <div className="text-center">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm">좌측에서 문서를 선택하세요</p>
                <p className="text-xs mt-1">프로젝트별 문서를 한 곳에서 경로와 함께 확인합니다</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
