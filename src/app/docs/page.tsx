"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { normalizeDocumentRouteParams } from "@/lib/documentLinks";
import { parseCanonicalDocHref } from "@/lib/canonicalDocLinks";
import { parseCanonicalHitPath, type CanonicalHitRef } from "@/lib/canonicalHitPath";
import {
  clampListWidth,
  defaultListWidth,
  DEFAULT_LIST_WIDTH,
  readStoredListWidth,
  UNKNOWN_FILE_SIZE,
  writeStoredListWidth,
} from "@/lib/docFileView";
import Link from "next/link";
import CanonicalDocuments from "./CanonicalDocuments";
import DocContentViewer from "./DocContentViewer";
import {
  detectFormat,
  FORMAT_LABELS,
  TYPE_LABELS,
  type DocFile,
  type DocFileMeta,
  type ListedDocFile,
} from "./docFileTypes";
import FileViewerHeader, { buildDocViewerUrl } from "./FileViewerHeader";
import {
  FileListNotice,
  fileListState,
  FileListSummary,
  ProjectChipRow,
  ProjectFileRows,
} from "./ProjectFileList";
import {
  CONTRACT_OPEN_KEY,
  PinnedContractCard,
  ProjectFileFilters,
  readStoredFlag,
  writeStoredFlag,
} from "./ProjectFileFilters";

interface DocSearchHit {
  path: string;
  name: string;
  project: string;
  title: string;
  heading: string;
  snippet: string;
  similarity: number;
}

interface DocSearchIndex {
  docs: number;
  chunks: number;
  searchable: number;
  coverage_pct: number;
}

interface DocContentResponse {
  content: string;
  encoding?: "text" | "base64";
  mime_type?: string;
  is_binary?: boolean;
  format?: string;
  converted_from?: string;
  source_mime_type?: string;
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
const DOCS_CACHE_KEY = "aads.docs.scanResult.v1";

const TYPE_COLORS: Record<string, string> = {
  doc: "bg-gray-700 text-gray-200",
  contract: "bg-teal-900 text-teal-100",
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

function formatDelta(delta?: ScanDelta): string {
  if (!delta) return "";
  const changed = (delta.new || 0) + (delta.updated || 0) + (delta.removed || 0);
  if (!changed) return "변경 없음";
  return `신규 ${delta.new || 0} · 수정 ${delta.updated || 0} · 삭제 ${delta.removed || 0}`;
}

function isElectronicContractFile(file: ListedDocFile): boolean {
  const haystack = `${file.name} ${file.path} ${file.full_path || ""}`.toLowerCase();
  return (
    haystack.includes("전자계약") ||
    haystack.includes("근로계약") ||
    haystack.includes("입점계약") ||
    haystack.includes("프리랜서") ||
    haystack.includes("contracts/")
  );
}

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<"canonical" | "files">("files");
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<ScanResult | null>(null);
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [canonicalProject, setCanonicalProject] = useState<string>("AADS");
  const [canonicalDeepKey, setCanonicalDeepKey] = useState<string | null>(null);
  const [canonicalHitRevision, setCanonicalHitRevision] = useState<CanonicalHitRef | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [search, setSearch] = useState("");
  // 파일명 검색과 내용 검색을 나눈다. 파일명 검색은 무엇을 찾는지 이미
  // 알고 있을 때만 쓸 수 있는데, 문서가 823건이고 이름이 대부분
  // `20260914_AADS_..._REPORT.md` 꼴이라 그럴 일이 드물다.
  const [searchMode, setSearchMode] = useState<"name" | "content">("name");
  const [contentHits, setContentHits] = useState<DocSearchHit[] | null>(null);
  const [contentSearching, setContentSearching] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [indexInfo, setIndexInfo] = useState<DocSearchIndex | null>(null);
  const [selectedFile, setSelectedFile] = useState<ListedDocFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<DocFileMeta | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "modified" | "size">("modified");
  const [listPaneWidth, setListPaneWidth] = useState(DEFAULT_LIST_WIDTH);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const listPaneWidthRef = useRef(DEFAULT_LIST_WIDTH);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const savedListScroll = useRef(0);
  const [selectedFormat, setSelectedFormat] = useState<string>("all");
  const [isDesktop, setIsDesktop] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const openedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    setContractOpen(readStoredFlag(CONTRACT_OPEN_KEY));
  }, []);

  const toggleContractOpen = () => {
    writeStoredFlag(CONTRACT_OPEN_KEY, !contractOpen);
    setContractOpen(!contractOpen);
  };

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
    // 최초 진입은 서버의 5분 캐시를 쓴다. 강제 스캔은 새로고침 버튼에서만.
    fetchDocs(false);
  }, [fetchDocs]);

  useEffect(() => {
    setListPaneWidth(readStoredListWidth(window.localStorage) ?? defaultListWidth(window.innerWidth));
  }, []);

  useEffect(() => {
    listPaneWidthRef.current = listPaneWidth;
  }, [listPaneWidth]);

  useEffect(() => {
    const syncViewport = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setContainerWidth(layoutRef.current?.getBoundingClientRect().width ?? 0);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [activeTab]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      setListPaneWidth(clampListWidth(event.clientX - rect.left, rect.width));
    };

    const handleUp = () => {
      setIsResizing(false);
      writeStoredListWidth(window.localStorage, listPaneWidthRef.current);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isResizing]);

  const nudgeListWidth = (delta: number) => {
    const next = clampListWidth(listPaneWidthRef.current + delta, containerWidth || window.innerWidth);
    setListPaneWidth(next);
    writeStoredListWidth(window.localStorage, next);
  };

  const openFile = useCallback(async (project: string, file: ListedDocFile, options?: { updateUrl?: boolean }) => {
    setSelectedFile(file);
    setContentLoading(true);
    setFileContent(null);
    setFileMeta(null);
    if (options?.updateUrl !== false && typeof window !== "undefined") {
      window.history.replaceState(null, "", buildDocViewerUrl(project, file));
    }
    try {
      const r = (await api.getProjectDocContent(project, file.base_path, file.path)) as DocContentResponse;
      setFileContent(r.content || "");
      setFileMeta({
        encoding: r.encoding || "text",
        mime_type: r.mime_type || "text/plain",
        is_binary: !!r.is_binary,
        format: r.format,
        converted_from: r.converted_from,
        source_mime_type: r.source_mime_type,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      setFileContent(`⚠️ 파일을 불러올 수 없습니다: ${message}`);
      setFileMeta(null);
    } finally {
      setContentLoading(false);
    }
  }, []);

  // 검색 결과의 절대경로를 스캔 목록의 파일과 맞춘다. 서버는 절대경로만
  // 주는데 뷰어는 base_path + 상대경로를 요구한다. API 를 바꾸는 대신
  // 이미 받아 둔 목록에서 찾는다.
  const findScannedFile = useCallback((absPath: string): { project: string; file: ListedDocFile } | null => {
    const snapshot = dataRef.current;
    if (!snapshot?.projects) return null;
    for (const project of snapshot.projects) {
      for (const file of project.files) {
        const full = file.full_path || `${file.base_path}/${file.path}`;
        if (full === absPath || absPath.endsWith(`/${file.path}`)) {
          return { project: project.project, file: { ...file, project: project.project } };
        }
      }
    }
    return null;
  }, []);

  const openCanonicalHit = useCallback((ref: CanonicalHitRef) => {
    setCanonicalProject(ref.project);
    setCanonicalDeepKey(ref.documentKey);
    setCanonicalHitRevision(ref);
    setActiveTab("canonical");
  }, []);

  const runContentSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setContentHits(null);
      setContentError(null);
      return;
    }
    setContentSearching(true);
    setContentError(null);
    try {
      const r = (await api.searchProjectDocs(q, 20)) as {
        results?: DocSearchHit[];
        index?: DocSearchIndex;
      };
      setContentHits(r.results || []);
      setIndexInfo(r.index || null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      // 503 은 임베딩 경로가 죽었다는 뜻이다. 거짓 결과를 보여주느니
      // 못 찾는다고 말하는 편이 낫다.
      setContentError(message.includes("503")
        ? "내용 검색을 지금 쓸 수 없습니다. 파일명 검색을 사용하세요."
        : message);
      setContentHits([]);
    } finally {
      setContentSearching(false);
    }
  }, []);

  // 내용 검색은 타자마다 부르지 않는다 — 질문 하나가 임베딩 한 번이다.
  useEffect(() => {
    if (searchMode !== "content") return;
    const t = setTimeout(() => { void runContentSearch(search); }, 450);
    return () => clearTimeout(t);
  }, [search, searchMode, runContentSearch]);

  const handleOpenFile = useCallback((project: string, file: ListedDocFile) => {
    void openFile(project, file);
  }, [openFile]);
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

  const formatCounts = matchingFiles.reduce<Record<string, number>>((acc, file) => {
    const fmt = file.format || detectFormat(file.name);
    acc[fmt] = (acc[fmt] || 0) + 1;
    return acc;
  }, {});

  const availableFormats = Object.keys(formatCounts).sort((a, b) => {
    const labelA = FORMAT_LABELS[a] || a;
    const labelB = FORMAT_LABELS[b] || b;
    return labelA.localeCompare(labelB, "ko");
  });

  const allFiles = matchingFiles
    .filter((file) => selectedType === "all" || file.type === selectedType)
    .filter((file) => selectedFormat === "all" || (file.format || detectFormat(file.name)) === selectedFormat);

  allFiles.sort((a, b) => {
    if (sortBy === "modified") return b.modified - a.modified;
    if (sortBy === "size") return b.size - a.size;
    return a.name.localeCompare(b.name);
  });

  const electronicContractAll = matchingFiles
    .filter(isElectronicContractFile)
    .sort((a, b) => b.modified - a.modified);
  const electronicContractFiles = electronicContractAll.slice(0, 5);

  const availableTypes = Object.keys(typeCounts).sort((a, b) => {
    const labelA = TYPE_LABELS[a] || a;
    const labelB = TYPE_LABELS[b] || b;
    return labelA.localeCompare(labelB, "ko");
  });

  // 채팅의 정본 문서 링크(/docs?tab=canonical&project=…&document_key=…)를 새 탭/직접 접근으로 열 때.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = parseCanonicalDocHref(`/docs${window.location.search}`);
    if (ref) {
      setActiveTab("canonical");
      setCanonicalProject(ref.project);
      setCanonicalDeepKey(ref.documentKey);
    } else if (new URLSearchParams(window.location.search).get("tab") === "canonical") {
      setActiveTab("canonical");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const normalizedRoute = normalizeDocumentRouteParams({
      project: params.get("project") || "",
      basePath: params.get("base_path") || "",
      filePath: params.get("file_path") || "",
    });
    const project = normalizedRoute.project;
    const basePath = normalizedRoute.basePath;
    const filePath = normalizedRoute.filePath;
    if (!project || !basePath || !filePath) return;
    if (
      project !== (params.get("project") || "") ||
      basePath !== (params.get("base_path") || "") ||
      filePath !== (params.get("file_path") || "")
    ) {
      const q = new URLSearchParams();
      q.set("project", project);
      q.set("base_path", basePath);
      q.set("file_path", filePath);
      window.history.replaceState(null, "", `/docs?${q.toString()}`);
    }

    const key = `${project}\n${basePath}\n${filePath}`;
    if (openedDeepLinkRef.current === key) return;

    const projectDocs = data?.projects?.find((item) => item.project === project);
    const scannedFile = projectDocs?.files.find((item) => item.base_path === basePath && item.path === filePath);
    const name = filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
    const file: DocFile = scannedFile || {
      name,
      path: filePath,
      size: UNKNOWN_FILE_SIZE,
      modified: 0,
      type: "doc",
      base_path: basePath,
      label: "직접 열기",
      format: detectFormat(name),
    };

    openedDeepLinkRef.current = key;
    setActiveTab("files");
    setSelectedProject(project);
    setSelectedType("all");
    setSelectedFormat("all");
    setSearch("");
    void openFile(project, { ...file, project }, { updateUrl: false });
  }, [data, openFile]);


  // 직접 열기로 먼저 연 파일은 크기·수정 시각을 몰랐다가, 스캔 결과가 도착하면 채운다.
  useEffect(() => {
    if (!selectedFile || selectedFile.size !== UNKNOWN_FILE_SIZE) return;
    const scanned = data?.projects
      ?.find((item) => item.project === selectedFile.project)
      ?.files.find((item) => item.base_path === selectedFile.base_path && item.path === selectedFile.path);
    if (scanned) setSelectedFile({ ...scanned, project: selectedFile.project });
  }, [data, selectedFile]);

  const mobileViewer = activeTab === "files" && !isDesktop && selectedFile !== null;

  // 폰에서 문서를 열면 목록은 숨기기만 하고 살려 둔다. 숨기면 스크롤 위치가 사라지므로 돌아올 때 되돌린다.
  useLayoutEffect(() => {
    if (!mobileViewer && listScrollRef.current) listScrollRef.current.scrollTop = savedListScroll.current;
  }, [mobileViewer]);

  const closeViewer = () => {
    setSelectedFile(null);
    setFileContent(null);
    setFileMeta(null);
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/docs");
  };

  const filtersActive = selectedType !== "all" || selectedFormat !== "all";
  const scanDetail = data
    ? [
        "강제 재스캔",
        formatDelta(data.delta),
        `${data.cache_hit ? "캐시" : data.cache_mode === "incremental" ? "증분" : "스캔"} ${new Date((data.scanned_at || 0) * 1000).toLocaleTimeString("ko-KR")}`,
      ].filter(Boolean).join(" · ")
    : "강제 재스캔";
  const listState = fileListState({ loading, error, count: allFiles.length });
  const tabClass = "min-h-9 rounded-lg px-4 text-sm font-medium max-[599px]:min-h-10";

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-primary)" }}>
      <Header title={mobileViewer ? "📄 문서 보기" : "📄 프로젝트별 문서 통합"} />

      {!mobileViewer && (
        <div className="flex shrink-0 items-center gap-2 px-3 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex gap-1.5" role="tablist" aria-label="문서 화면">
            <button type="button" role="tab" aria-selected={activeTab === "canonical"} onClick={() => { setCanonicalHitRevision(null); setActiveTab("canonical"); }}
              className={tabClass}
              style={activeTab === "canonical" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>문서 정본</button>
            <button type="button" role="tab" aria-selected={activeTab === "files"} onClick={() => setActiveTab("files")}
              className={tabClass}
              style={activeTab === "files" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>프로젝트 파일</button>
          </div>
          <Link
            href="/handovers"
            className="ml-auto whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            DB 핸드오버
          </Link>
        </div>
      )}

      {activeTab === "canonical" ? (
        <>
          {canonicalHitRevision && canonicalHitRevision.project === canonicalProject
            && canonicalHitRevision.documentKey === canonicalDeepKey && (
            <div className="px-3 py-1.5 text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              검색 결과에서 연 문서: {canonicalHitRevision.documentKey}
              {canonicalHitRevision.revisionId && ` (검색된 개정 ${canonicalHitRevision.revisionId.slice(0, 8)})`}
              {canonicalHitRevision.revision !== undefined && ` (검색된 개정 r${canonicalHitRevision.revision})`}
              {" · 해당 개정이 아니라 최신/승인본이 열립니다"}
            </div>
          )}
          <CanonicalDocuments project={canonicalProject} initialKey={canonicalDeepKey}
            projects={data?.projects?.map((item) => item.project) || []}
            onProjectChange={setCanonicalProject} />
        </>
      ) : (
        <div ref={layoutRef} className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={`${mobileViewer ? "hidden" : "flex"} w-full min-w-0 flex-col overflow-hidden border-r lg:flex lg:flex-none`}
            style={{
              borderColor: "var(--border)",
              width: isDesktop ? `${containerWidth ? clampListWidth(listPaneWidth, containerWidth) : listPaneWidth}px` : undefined,
            }}
            data-testid="docs-list-pane"
          >
            <div className="flex shrink-0 flex-col gap-1 p-1.5 max-[599px]:p-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <ProjectChipRow
                total={data?.total || 0}
                projects={data?.projects?.map((item) => ({ project: item.project, total: item.total })) || []}
                selected={selectedProject}
                onSelect={setSelectedProject}
                onRefresh={() => fetchDocs(true)}
                refreshTitle={scanDetail}
              />

              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder={searchMode === "content"
                    ? "무엇이 궁금한가요? 예: 채팅이 왜 느려졌지"
                    : "파일명 또는 경로 검색..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none aads-focus-border max-[599px]:h-10"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "modified" | "size")}
                  className="h-8 shrink-0 rounded-lg px-2 text-xs outline-none max-[599px]:h-10"
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

              <ProjectFileFilters
                leading={(
                  <div className="flex shrink-0 gap-1">
                    {([["name", "파일명", "파일명과 경로에서 찾습니다"], ["content", "내용", "내용 검색은 비슷한 뜻도 찾습니다"]] as const).map(([mode, label, hint]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSearchMode(mode)}
                        title={hint}
                        aria-pressed={searchMode === mode}
                        className="whitespace-nowrap rounded-lg px-2.5 py-1 text-xs"
                        style={{
                          background: searchMode === mode ? "var(--accent, #2563eb)" : "var(--bg-card)",
                          color: searchMode === mode ? "#fff" : "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                expanded={filtersOpen}
                onToggle={() => setFiltersOpen((open) => !open)}
                selectedType={selectedType}
                selectedFormat={selectedFormat}
                availableTypes={availableTypes}
                availableFormats={availableFormats}
                typeCounts={typeCounts}
                formatCounts={formatCounts}
                totalCount={matchingFiles.length}
                typeLabels={TYPE_LABELS}
                formatLabels={FORMAT_LABELS}
                onTypeChange={setSelectedType}
                onFormatChange={setSelectedFormat}
                onReset={() => {
                  setSelectedType("all");
                  setSelectedFormat("all");
                }}
              />

              {searchMode === "content" && indexInfo && indexInfo.coverage_pct < 99 && (
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  색인 {indexInfo.coverage_pct}% — 아직 채우는 중입니다
                </div>
              )}

              {electronicContractFiles.length > 0 && (
                <PinnedContractCard
                  totalCount={electronicContractAll.length}
                  files={electronicContractFiles.map((file) => ({
                    key: `pinned-${file.project}-${file.base_path}-${file.path}`,
                    name: file.name,
                    typeLabel: TYPE_LABELS[file.type] || file.type,
                    typeClassName: TYPE_COLORS[file.type] || "bg-gray-700 text-gray-200",
                    onOpen: () => handleOpenFile(file.project, file),
                  }))}
                  expanded={contractOpen}
                  onToggle={toggleContractOpen}
                  onShowAll={() => {
                    setSelectedProject("AADS");
                    setSelectedType("all");
                    setSelectedFormat("all");
                    setSearch("전자계약");
                  }}
                />
              )}

              {searchMode === "name" && listState !== "loading" && listState !== "error" && (
                <FileListSummary count={allFiles.length} scannedAt={data?.scanned_at} detail={scanDetail} />
              )}
            </div>

            <div
              ref={listScrollRef}
              onScroll={(e) => { if (!mobileViewer) savedListScroll.current = e.currentTarget.scrollTop; }}
              className="min-h-0 flex-1 overflow-auto"
              data-testid="docs-list-scroll"
            >
              {searchMode === "content" ? (
                <div className="space-y-0.5 p-1.5">
                  {contentSearching ? (
                    <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
                      찾는 중...
                    </div>
                  ) : contentError ? (
                    <div className="text-center py-12 text-red-400 text-sm px-4">{contentError}</div>
                  ) : contentHits === null ? (
                    <div className="text-center py-12 text-sm px-6" style={{ color: "var(--text-secondary)" }}>
                      문장으로 물어보세요. 파일 이름을 몰라도 됩니다.
                      <br />
                      <span className="text-xs">예: &quot;채팅이 왜 느려졌지&quot;, &quot;배포 절차&quot;</span>
                    </div>
                  ) : contentHits.length === 0 ? (
                    <div className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
                      찾지 못했습니다
                      {indexInfo && indexInfo.coverage_pct < 99 && (
                        <div className="text-xs mt-2">
                          색인이 {indexInfo.coverage_pct}% 만 채워져 있어 아직 못 찾는 문서가 있습니다
                        </div>
                      )}
                    </div>
                  ) : (
                    contentHits.map((hit, index) => {
                      const canonicalRef = parseCanonicalHitPath(hit.path);
                      const scanned = canonicalRef ? null : findScannedFile(hit.path);
                      const openable = !!canonicalRef || !!scanned;
                      return (
                        <button
                          key={`${hit.path}-${index}`}
                          onClick={() => {
                            if (canonicalRef) openCanonicalHit(canonicalRef);
                            else if (scanned) handleOpenFile(scanned.project, scanned.file);
                          }}
                          disabled={!openable}
                          className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            cursor: openable ? "pointer" : "default",
                            opacity: openable ? 1 : 0.7,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                              {hit.title || hit.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: "var(--bg-hover, rgba(127,127,127,.15))", color: "var(--text-secondary)" }}>
                              {hit.project}
                            </span>
                          </div>
                          {hit.heading && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              › {hit.heading}
                            </div>
                          )}
                          <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                            {hit.snippet}
                          </div>
                          <div className="text-[10px] mt-1 truncate" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                            {hit.name}
                            {canonicalRef && " · 정본 문서 열기"}
                            {!openable && " · 목록에 없어 열 수 없습니다"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : listState === "list" ? (
                <ProjectFileRows
                  files={allFiles}
                  selectedFile={selectedFile}
                  showProject={selectedProject === "all"}
                  onOpen={(file) => handleOpenFile(file.project, file)}
                />
              ) : (
                <FileListNotice
                  state={listState}
                  error={error}
                  search={search}
                  filtered={filtersActive}
                  onRetry={() => fetchDocs(false)}
                  onResetFilters={() => { setSelectedType("all"); setSelectedFormat("all"); }}
                  onClearSearch={() => setSearch("")}
                />
              )}
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="목록 폭 조절"
            aria-valuemin={320}
            aria-valuenow={containerWidth ? clampListWidth(listPaneWidth, containerWidth) : listPaneWidth}
            tabIndex={0}
            className="hidden w-1.5 shrink-0 cursor-col-resize items-stretch outline-none transition-colors focus-visible:ring-2 lg:flex"
            onPointerDown={(event) => { event.preventDefault(); setIsResizing(true); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); nudgeListWidth(-16); }
              if (event.key === "ArrowRight") { event.preventDefault(); nudgeListWidth(16); }
            }}
            style={{ background: isResizing ? "var(--accent)" : "var(--border)", touchAction: "none" }}
            title="좌우 폭 조절 (드래그 또는 ← →)"
          />

          <section className={`${mobileViewer ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`} data-testid="docs-viewer-pane">
            {selectedFile ? (
              <>
                <FileViewerHeader file={selectedFile} onBack={mobileViewer ? closeViewer : undefined} />
                <DocContentViewer
                  selectedFile={selectedFile}
                  fileContent={fileContent}
                  fileMeta={fileMeta}
                  contentLoading={contentLoading}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center" style={{ color: "var(--text-secondary)" }}>
                <div className="text-center">
                  <div className="mb-3 text-4xl">📄</div>
                  <p className="text-sm">좌측에서 문서를 선택하세요</p>
                  <p className="mt-1 text-xs">프로젝트별 문서를 한 곳에서 경로와 함께 확인합니다</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
