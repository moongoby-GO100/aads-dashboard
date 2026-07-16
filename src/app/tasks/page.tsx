"use client";
import React from "react";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import PipelineHealthTab from "@/components/PipelineHealthCard";
import { api } from "@/lib/api";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { TaskTable } from "@/components/tasks/TaskTable";
import type { CrossDirective } from "@/services/taskApi";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Directive {
  task_id: string;
  title: string;
  status: string;
  project: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  file_path: string;
  error_type?: string;
  summary?: string;
}

// ─── Helper: Safe Render ──────────────────────────────────────────────────────
function safeRender(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ─── Helper: KST Time Display ─────────────────────────────────────────────────
function toKST(dtStr: string | null | undefined, len = 16): string {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr.slice(0, len);
    const kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    // "2026. 3. 5. 16:39:00" → "2026-03-05 16:39"
    const m = kst.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
    if (m) {
      const [, y, mo, day, h, min] = m;
      const full = `${y}-${mo.padStart(2,"0")}-${day.padStart(2,"0")} ${h.padStart(2,"0")}:${min}`;
      return full.slice(0, len);
    }
    return dtStr.slice(0, len);
  } catch {
    return dtStr.slice(0, len);
  }
}

interface DirectiveSummary {
  total: number;
  running: number;
  completed: number;
  error: number;
  error_breakdown?: Record<string, number>;
  by_project?: Record<string, number>;
  directives: Directive[];
}

interface Report {
  task_id: string;
  filename: string;
  status: string;
  completed_at: string;
  project: string;
  github_url: string;
  summary: string;
  cost_usd?: number;
}


interface Document {
  id: string;
  type: string;
  title: string;
  filename: string;
  created_at: string;
  source_session: string;
  summary: string;
  tags: string[];
}

interface TaskHistory {
  task_id: string;
  server: string;
  status: string;
  started_at: string;
  finished_at: string;
  from_agent: string;
  memory_type: string;
}

interface RemoteServer {
  name: string;
  health: string;
  last_ping: string | null;
  status?: string;
  monitoring_projects?: string[];
}

type TabType = "directives" | "reports" | "pipeline" | "remote" | "analytics" | "docs";
type DirectiveFilter = "all" | "running" | "completed" | "error";
type ProjectFilter = "all" | "AADS" | "KIS" | "ShortFlow" | "NewTalk" | "GO100" | "NAS";

const PROJECT_FILTERS: ProjectFilter[] = ["all", "AADS", "KIS", "ShortFlow", "NewTalk", "GO100", "NAS"];

// ─── Analytics Types ──────────────────────────────────────────────────────────
interface AnalyticsSummary {
  total_tasks: number;
  completed_tasks: number;
  error_tasks: number;
  total_conversations: number;
  total_cost_usd: number;
  cost_status?: string;
  cost_message?: string;
  total_tokens: number;
  avg_task_duration_min: number;
  active_servers: number;
}
interface ByProject { project: string; conversations: number; cost_usd: number; tokens: number; last_activity: string; completed?: number; error?: number; total?: number; }
interface ByServer { server: string; tasks: number; status: string; last_report: string; }
interface DailyTrend { date: string; tasks: number; cost_usd: number; }
interface ErrorDist { error_type: string; count: number; }
interface Analytics {
  summary: AnalyticsSummary;
  by_project: ByProject[];
  by_server: ByServer[];
  daily_trend: DailyTrend[];
  error_distribution?: ErrorDist[];
}

// ─── Helper: Project Badge ─────────────────────────────────────────────────────
function projectBadgeClass(project: string): string {
  const p = (project || "").toUpperCase();
  if (p === "AADS") return "bg-blue-900 text-blue-200";
  if (p === "KIS") return "bg-purple-900 text-purple-200";
  if (p === "SHORTFLOW") return "bg-orange-900 text-orange-200";
  if (p === "NEWTALK") return "bg-green-900 text-green-200";
  if (p === "GO100") return "bg-yellow-900 text-yellow-200";
  if (p === "NAS") return "bg-pink-900 text-pink-200";
  return "bg-gray-700 text-gray-300";
}

function ProjectBadge({ project }: { project: string }) {
  if (!project) return <span className="text-gray-500">-</span>;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${projectBadgeClass(project)}`}>
      {project}
    </span>
  );
}

// ─── Helper: Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: unknown }) {
  // T-072: status가 객체인 경우 안전 처리 (React Error #31 방지)
  const statusStr = typeof status === 'object' && status !== null
    ? (status as Record<string, string>).label || (status as Record<string, string>).value || '확인중'
    : String(status || '');
  const s = statusStr.toLowerCase();
  let cls = "bg-gray-700 text-gray-300";
  if (s === "running") cls = "bg-green-900 text-green-300";
  else if (s === "completed" || s === "success") cls = "bg-blue-900 text-blue-300";
  else if (s === "error" || s === "failed" || s === "fail") cls = "bg-red-900 text-red-300";
  else if (s === "online") cls = "bg-emerald-900 text-emerald-300";
  else if (s === "offline") cls = "bg-red-900 text-red-300";
  else if (s === "reported") cls = "bg-blue-900 text-blue-300";
  else if (s === "active") cls = "bg-green-900 text-green-300";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{statusStr}</span>;
}

// ─── Helper: Remote Task Status Badge ─────────────────────────────────────────
function RemoteStatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let cls = "bg-gray-700 text-gray-300";
  if (s === "active") cls = "bg-green-900 text-green-300";
  else if (s === "reported") cls = "bg-blue-900 text-blue-300";
  else if (s === "completed") cls = "bg-gray-700 text-gray-400";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{status || "unknown"}</span>;
}

// ─── Helper: Project Filter Bar ────────────────────────────────────────────────
function ProjectFilterBar({
  active,
  onChange,
  counts,
}: {
  active: ProjectFilter;
  onChange: (p: ProjectFilter) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {PROJECT_FILTERS.map((p) => {
        const cnt = p !== "all" && counts ? (counts[p] ?? counts[p.toUpperCase()] ?? 0) : null;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1 ${
              active === p
                ? p === "all"
                  ? "bg-white text-gray-900"
                  : projectBadgeClass(p) + " ring-1 ring-white/30"
                : "border border-gray-600 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {p === "all" ? "전체" : p}
            {cnt !== null && cnt > 0 && (
              <span className={`inline-block text-xs font-bold rounded-full px-1.5 py-0 leading-5 ${
                active === p ? "bg-white/20" : "bg-gray-600 text-gray-200"
              }`}>
                {cnt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab: Directives ──────────────────────────────────────────────────────────
// AADS-181: 전체 프로젝트 통합 (3서버) + 기존 AADS DB 데이터 하위 호환
type CrossStatusFilter = "all" | "running" | "done" | "pending" | "archived";

function DirectivesTab() {
  // ── 기존 AADS DB 데이터 (하위 호환) ──────────────────────────────────────
  const [data, setData] = useState<DirectiveSummary | null>(null);
  const [aadsLoading, setAadsLoading] = useState(true);
  const [completeLoading, setCompleteLoading] = useState(false);

  // ── 크로스서버 데이터 (AADS-181) ────────────────────────────────────────
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [crossStatusFilter, setCrossStatusFilter] = useState<CrossStatusFilter>("all");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // useTaskPolling: 전체 프로젝트 크로스서버 데이터
  const {
    data: crossData,
    loading: crossLoading,
    refresh: crossRefresh,
    lastUpdated,
  } = useTaskPolling({ status: "all", project: "all", enabled: true });

  // 기존 AADS DB 데이터 로드 (AADS 탭 전용 + 하위 호환)
  const loadAads = useCallback(async () => {
    setAadsLoading(true);
    try {
      const res = await api.getDirectives(undefined);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setAadsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAads();
    const _id = setInterval(() => loadAads(), 30_000);
    return () => clearInterval(_id);
  }, [loadAads]);

  const handleProjectChange = (p: ProjectFilter) => {
    setProjectFilter(p);
    setExpandedTask(null);
    setTaskDetail("");
  };

  const handleCompleteAll = async () => {
    if (!window.confirm("진행중인 모든 태스크를 완료 처리하시겠습니까?")) return;
    setCompleteLoading(true);
    try {
      const res = await api.completeRunning(projectFilter === "all" ? undefined : projectFilter);
      alert(res.message || "완료 처리되었습니다.");
      loadAads();
    } catch {
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setCompleteLoading(false);
    }
  };

  const handleExpandCross = async (d: CrossDirective) => {
    if (expandedTask === d.task_id) {
      setExpandedTask(null);
      setTaskDetail("");
      return;
    }
    setExpandedTask(d.task_id);
    setDetailLoading(true);
    try {
      const res = await api.getDirectiveDetail(d.task_id);
      setTaskDetail(res.content || "내용 없음");
    } catch {
      setTaskDetail("원격 서버 파일: 직접 조회 불가");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExpandAads = async (d: Directive) => {
    if (expandedTask === d.task_id) {
      setExpandedTask(null);
      setTaskDetail("");
      return;
    }
    setExpandedTask(d.task_id);
    if (d.summary) { setTaskDetail(d.summary); return; }
    setDetailLoading(true);
    try {
      const res = await api.getDirectiveDetail(d.task_id);
      setTaskDetail(res.content || "내용 없음");
    } catch {
      setTaskDetail("내용을 불러올 수 없습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  // ── 크로스서버 데이터 필터링 ───────────────────────────────────────────
  const allCrossDirectives = crossData?.directives ?? [];

  const crossFiltered = allCrossDirectives
    .filter((d) => {
      const projOk =
        projectFilter === "all" ||
        d.project.toUpperCase() === projectFilter.toUpperCase() ||
        // ShortFlow/NewTalk 별칭 처리
        (projectFilter === "ShortFlow" && d.project.toUpperCase() === "SF") ||
        (projectFilter === "NewTalk" && (d.project.toUpperCase() === "NTV2" || d.project.toUpperCase() === "NT"));
      const statusOk = crossStatusFilter === "all" || d.status === crossStatusFilter;
      const refDate = (d.started_at || "").slice(0, 10);
      const fromOk = dateFrom ? refDate >= dateFrom : true;
      const toOk = dateTo ? refDate <= dateTo : true;
      const searchOk =
        searchQuery.trim() === "" ||
        d.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.title || "").toLowerCase().includes(searchQuery.toLowerCase());
      return projOk && statusOk && fromOk && toOk && searchOk;
    })
    .sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (b.status === "running" && a.status !== "running") return 1;
      return (b.started_at || "").localeCompare(a.started_at || "");
    });

  // ── 요약 카드 수치 ────────────────────────────────────────────────────
  // 전체 탭: 크로스서버 합산. 개별 탭: 해당 프로젝트 크로스서버 필터
  const counts = crossData?.counts ?? {};
  const crossByServer = crossData?.by_server ?? {};
  const totalCount = projectFilter === "all"
    ? (counts.pending ?? 0) + (counts.running ?? 0) + (counts.done ?? 0)
    : crossFiltered.length;
  const runningCount = projectFilter === "all"
    ? (counts.running ?? 0)
    : crossFiltered.filter((d) => d.status === "running").length;
  const doneCount = projectFilter === "all"
    ? (counts.done ?? 0)
    : crossFiltered.filter((d) => d.status === "done").length;
  const pendingCount = projectFilter === "all"
    ? (counts.pending ?? 0)
    : crossFiltered.filter((d) => d.status === "pending").length;

  // AADS DB 에러 카운트 (AADS 탭 전용)
  const aadsError = data?.error ?? 0;

  // ── 표시 모드: "all" 탭이거나 비AADS 프로젝트 → 크로스서버, "AADS" 탭 → DB 기반
  const useCrossServerView = projectFilter !== "AADS";

  // project counts for tab badges
  const projectCounts: Record<string, number> = {};
  allCrossDirectives.forEach((d) => {
    const p = d.project.toUpperCase();
    projectCounts[p] = (projectCounts[p] ?? 0) + 1;
  });

  const isStalled = (d: CrossDirective) =>
    d.status === "running" && !!d.started_at && Date.now() - new Date(d.started_at).getTime() > 3_600_000;

  return (
    <div>
      {/* ── KPI 카드 (AADS-181: 전체 프로젝트 합산) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl p-4 border border-gray-600 bg-gray-900">
          <div className="text-2xl font-bold text-white">{totalCount}</div>
          <div className="text-xs mt-1 text-gray-400">
            전체{projectFilter === "all" ? " (3서버)" : ""}
          </div>
          {projectFilter === "all" && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {Object.entries(crossByServer).map(([sid, sdata]) => (
                <span
                  key={sid}
                  className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                    sid === "68" ? "bg-blue-900 text-blue-300" :
                    sid === "211" ? "bg-purple-900 text-purple-300" :
                    "bg-orange-900 text-orange-300"
                  } ${!(sdata as { reachable?: boolean }).reachable ? "opacity-50 line-through" : ""}`}
                  title={`서버 ${sid}: ${(sdata as { total?: number }).total ?? 0}건`}
                >
                  {sid}:{(sdata as { total?: number }).total ?? 0}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl p-4 border border-yellow-700 bg-gray-900">
          <div className="text-2xl font-bold text-yellow-300">{pendingCount}</div>
          <div className="text-xs mt-1 text-gray-400">대기중</div>
        </div>
        <div className="rounded-xl p-4 border border-green-700 bg-gray-900">
          <div className="text-2xl font-bold text-green-300">{runningCount}</div>
          <div className="text-xs mt-1 text-gray-400">진행중</div>
        </div>
        <div className="rounded-xl p-4 border border-blue-700 bg-gray-900">
          <div className="text-2xl font-bold text-blue-300">{doneCount}</div>
          <div className="text-xs mt-1 text-gray-400">완료</div>
          {projectFilter === "AADS" && aadsError > 0 && (
            <div className="text-xs mt-1 text-red-400">에러 {aadsError}건</div>
          )}
        </div>
      </div>

      {/* ── 프로젝트 탭 필터 ── */}
      <ProjectFilterBar
        active={projectFilter}
        onChange={handleProjectChange}
        counts={projectFilter === "all" ? projectCounts : data?.by_project ?? undefined}
      />

      {/* ── 검색창 + 날짜 필터 ── */}
      <div className="mb-3 space-y-2">
        <input
          type="text"
          placeholder="Task ID, 제목 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 whitespace-nowrap">기간</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-gray-500">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg whitespace-nowrap">초기화</button>
          )}
        </div>
      </div>

      {/* ── 상태 필터 + 새로고침 ── */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {(["all", "running", "pending", "done", "archived"] as CrossStatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setCrossStatusFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              crossStatusFilter === f ? "bg-blue-600 text-white" : "border border-gray-600 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {f === "all" ? "전체" : f === "running" ? "진행중" : f === "pending" ? "대기중" : f === "done" ? "완료" : "보관"}
          </button>
        ))}
        {runningCount > 0 && projectFilter === "AADS" && (
          <button
            onClick={handleCompleteAll}
            disabled={completeLoading}
            className="px-3 py-1.5 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg font-semibold"
          >
            {completeLoading ? "처리중..." : `✅ 완료 처리 (${runningCount}건)`}
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {useCrossServerView ? crossFiltered.length : (data?.directives ?? []).length}건
          {lastUpdated && (
            <span className="ml-2 text-gray-600">
              갱신: {lastUpdated.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}
            </span>
          )}
        </span>
        <button
          onClick={() => { crossRefresh(); if (projectFilter === "AADS") loadAads(); }}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
        >
          새로고침
        </button>
      </div>

      {/* ── 테이블: 크로스서버 뷰 (전체/비AADS) ── */}
      {useCrossServerView ? (
        crossLoading ? (
          <div className="text-center text-gray-400 py-12">3서버 스캔 중...</div>
        ) : (
          <TaskTable
            directives={crossFiltered}
            expandedTask={expandedTask}
            onExpand={handleExpandCross}
            taskDetail={taskDetail}
            detailLoading={detailLoading}
            isStalled={isStalled}
          />
        )
      ) : (
        /* ── AADS 전용: 기존 DB 기반 테이블 (하위 호환) ── */
        aadsLoading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left p-3">Task ID</th>
                  <th className="text-left p-3">제목</th>
                  <th className="text-left p-3 hidden md:table-cell">서버</th>
                  <th className="text-left p-3">상태</th>
                  <th className="text-left p-3 hidden md:table-cell">에러유형</th>
                  <th className="text-left p-3 hidden lg:table-cell">시작</th>
                  <th className="text-left p-3 hidden lg:table-cell">완료</th>
                </tr>
              </thead>
              <tbody>
                {(data?.directives ?? [])
                  .filter((d) => {
                    const statusOk =
                      crossStatusFilter === "all" ||
                      (crossStatusFilter === "running" && d.status === "running") ||
                      (crossStatusFilter === "done" && (d.status === "completed" || d.status === "done")) ||
                      (crossStatusFilter === "pending" && d.status === "pending");
                    const searchOk =
                      searchQuery.trim() === "" ||
                      d.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (d.title || "").toLowerCase().includes(searchQuery.toLowerCase());
                    return statusOk && searchOk;
                  })
                  .sort((a, b) => {
                    if (a.status === "running" && b.status !== "running") return -1;
                    if (b.status === "running" && a.status !== "running") return 1;
                    return (b.started_at || b.created_at || "").localeCompare(a.started_at || a.created_at || "");
                  })
                  .map((d, i) => {
                    const isStld = d.status === "running" && d.started_at && Date.now() - new Date(d.started_at).getTime() > 3_600_000;
                    return (
                      <React.Fragment key={i}>
                        <tr
                          className={`border-b border-gray-700 last:border-0 hover:bg-gray-750 cursor-pointer ${expandedTask === d.task_id ? "bg-gray-750" : ""} ${isStld ? "bg-red-900/30" : ""}`}
                          onClick={() => handleExpandAads(d)}
                        >
                          <td className="p-3 text-white font-medium font-mono">
                            <span className="mr-1 text-gray-500 text-xs">{expandedTask === d.task_id ? "▲" : "▶"}</span>
                            {isStld && <span className="mr-1 text-red-400" title="stalled">⚠</span>}
                            {safeRender(d.task_id)}
                          </td>
                          <td className="p-3 text-gray-200 max-w-xs"><span className="block truncate">{safeRender(d.title)}</span></td>
                          <td className="p-3 hidden md:table-cell">
                            <span className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-blue-900 text-blue-200 border border-blue-700">
                              68 (AADS)
                            </span>
                          </td>
                          <td className="p-3"><StatusBadge status={safeRender(d.status)} /></td>
                          <td className="p-3 hidden md:table-cell">
                            {d.error_type ? (
                              <span className={`px-1.5 py-0.5 rounded text-xs ${safeRender(d.error_type) === "auth_expired" ? "bg-gray-700 text-gray-400" : "bg-red-900 text-red-300"}`}>
                                {safeRender(d.error_type)}
                              </span>
                            ) : <span className="text-gray-600">-</span>}
                          </td>
                          <td className="p-3 text-gray-500 hidden lg:table-cell">{toKST(d.started_at || d.created_at)}</td>
                          <td className="p-3 text-gray-500 hidden lg:table-cell">{toKST(d.completed_at)}</td>
                        </tr>
                        {expandedTask === d.task_id && (
                          <tr className="bg-gray-900 border-b border-gray-700">
                            <td colSpan={7} className="p-4">
                              {detailLoading ? (
                                <div className="text-gray-400 text-xs">로딩 중...</div>
                              ) : (
                                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-800 p-3 rounded-lg max-h-96 overflow-y-auto">
                                  {taskDetail || d.summary || "내용 없음"}
                                </pre>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Tab: Reports ─────────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [byProject, setByProject] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (proj: ProjectFilter = projectFilter) => {
    setLoading(true);
    try {
      const res = await api.getReports(proj === "all" ? undefined : proj);
      // 중복 제거 (filename 기준) + 최근시간순 정렬
      const seen = new Set<string>();
      const unique = (res.reports || [])
        .filter((r: Report) => {
          if (seen.has(r.filename)) return false;
          seen.add(r.filename);
          return true;
        })
        .sort((a: Report, b: Report) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      setReports(unique);
      setByProject(res.by_project || {});
    } catch {
      setReports([]);
      setByProject({});
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => { load(); const _id = setInterval(() => load(), 30_000); return () => clearInterval(_id); }, [load]);

  const handleProjectChange = (p: ProjectFilter) => {
    setProjectFilter(p);
    load(p);
  };

  const handleExpand = async (filename: string) => {
    if (expanded === filename) {
      setExpanded(null);
      setDetail("");
      return;
    }
    setExpanded(filename);
    setDetailLoading(true);
    setDetail("");
    try {
      const res = await api.getReportDetail(filename);
      setDetail(res.content || "");
    } catch {
      setDetail("보고서를 불러올 수 없습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const successCount = reports.filter((r) => r.status === "success" || r.status === "completed").length;
  const errorCount = reports.filter((r) => r.status === "error" || r.status === "failed" || r.status === "fail").length;

  return (
    <div>
      {/* 프로젝트 필터 */}
      <ProjectFilterBar active={projectFilter} onChange={handleProjectChange} counts={byProject} />

      {/* 검색창 + 날짜 필터 */}
      <div className="mb-3 space-y-2">
        <input
          type="text"
          placeholder="Task ID, 제목, 요약 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 whitespace-nowrap">기간</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-gray-500">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg whitespace-nowrap">초기화</button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-3 text-xs">
          <span className="text-gray-400">총 <span className="text-white font-semibold">{reports.length}</span>건</span>
          <span className="text-green-400">성공 <span className="font-semibold">{successCount}</span></span>
          <span className="text-red-400">에러 <span className="font-semibold">{errorCount}</span></span>
          {(() => { const tc = reports.reduce((sum, r) => sum + (r.cost_usd || 0), 0); return tc > 0 ? <span className="text-yellow-400">비용 <span className="font-semibold">${tc.toFixed(2)}</span></span> : null; })()}
        </div>
        <button onClick={() => load()} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">로딩 중...</div>
      ) : reports.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
          {projectFilter !== "all"
            ? "이 프로젝트의 작업 기록이 없습니다. 원격 서버에서 수집 대기중입니다."
            : "보고서가 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.filter((r) => {
            const refDate = (r.completed_at || "").slice(0, 10);
            const fromOk = dateFrom ? refDate >= dateFrom : true;
            const toOk = dateTo ? refDate <= dateTo : true;
            return fromOk && toOk && (
              searchQuery.trim() === "" ? true :
                r.task_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (r.filename || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (r.summary || "").toLowerCase().includes(searchQuery.toLowerCase())
            );
          }).map((r, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full text-left p-3 hover:bg-gray-750 transition-colors"
                onClick={() => handleExpand(r.filename)}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white font-mono text-xs font-semibold">{r.task_id}</span>
                  <ProjectBadge project={r.project} />
                  <span className="text-gray-300 text-xs flex-1 min-w-0 truncate">{r.filename}</span>
                  <StatusBadge status={r.status} />
                  {(r.cost_usd ?? 0) > 0 && (
                    <span className="text-yellow-400 text-xs font-mono">${(r.cost_usd ?? 0).toFixed(2)}</span>
                  )}
                  <span className="text-gray-500 text-xs hidden md:inline">{r.completed_at || "-"}</span>
                  {r.github_url && (
                    <a
                      href={r.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-blue-400 text-xs rounded border border-gray-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      GitHub ↗
                    </a>
                  )}
                  <span className="text-gray-500 text-xs">{expanded === r.filename ? "▲" : "▼"}</span>
                </div>
                <div className="text-gray-500 text-xs mt-1 truncate">{r.summary}</div>
              </button>

              {expanded === r.filename && (
                <div className="border-t border-gray-700 p-3">
                  {detailLoading ? (
                    <div className="text-gray-400 text-xs py-4 text-center">로딩 중...</div>
                  ) : (
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-96 overflow-auto font-mono leading-relaxed">
                      {detail}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Remote Tasks ────────────────────────────────────────────────────────
function RemoteTab() {
  const [data, setData] = useState<{ tasks: TaskHistory[]; remote_servers: RemoteServer[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTaskHistory();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const _id = setInterval(() => load(), 30_000); return () => clearInterval(_id); }, [load]);

  // REMOTE_211, REMOTE_114 우선 표시
  const priorityServers = ["REMOTE_211", "REMOTE_114"];
  const sortedServers = data?.remote_servers
    ? [
        ...data.remote_servers.filter((s) => priorityServers.includes(s.name)),
        ...data.remote_servers.filter((s) => !priorityServers.includes(s.name)),
      ]
    : [];

  return (
    <div>
      {/* 원격 서버 상태 카드 */}
      {sortedServers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {sortedServers.map((s) => (
            <div
              key={s.name}
              className={`rounded-xl border p-4 ${
                s.health === "online"
                  ? "border-emerald-700 bg-emerald-950"
                  : "border-red-700 bg-red-950"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.health === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className={`font-bold text-sm ${s.health === "online" ? "text-emerald-200" : "text-red-200"}`}>
                  {s.name}
                </span>
                <StatusBadge status={s.health} />
              </div>
              {s.last_ping && (
                <div className="text-xs text-gray-400 mb-1">
                  최근 보고: <span className="text-gray-300">{toKST(s.last_ping, 19)}</span>
                </div>
              )}
              {s.monitoring_projects && s.monitoring_projects.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {s.monitoring_projects.map((p) => (
                    <ProjectBadge key={p} project={p} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 space-y-2">
        <input type="text" placeholder="Task ID, 서버, 에이전트 검색..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 whitespace-nowrap">기간</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-gray-500">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg whitespace-nowrap">초기화</button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-300">총 {data?.total ?? 0}건</span>
        <button onClick={load} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">로딩 중...</div>
      ) : !data || data.tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
          원격 작업 이력이 없습니다.
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-3">Task ID</th>
                <th className="text-left p-3 hidden md:table-cell">서버</th>
                <th className="text-left p-3">상태</th>
                <th className="text-left p-3 hidden lg:table-cell">시작시각</th>
                <th className="text-left p-3 hidden lg:table-cell">완료시각</th>
                <th className="text-left p-3 hidden md:table-cell">에이전트</th>
              </tr>
            </thead>
            <tbody>
              {[...data.tasks]
                .filter((t) => {
                  const refDate = (t.started_at || "").slice(0, 10);
                  const fromOk = dateFrom ? refDate >= dateFrom : true;
                  const toOk = dateTo ? refDate <= dateTo : true;
                  return fromOk && toOk && (
                    searchQuery.trim() === "" ? true :
                      (t.task_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (t.server || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (t.from_agent || "").toLowerCase().includes(searchQuery.toLowerCase())
                  );
                })
                .sort((a, b) => (b.started_at || "").localeCompare(a.started_at || "")).map((t, i) => (
                <tr key={i} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                  <td className="p-3 text-white font-mono font-medium">{t.task_id}</td>
                  <td className="p-3 text-gray-400 hidden md:table-cell">{t.server || "-"}</td>
                  <td className="p-3"><RemoteStatusBadge status={t.status} /></td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">{toKST(t.started_at, 19)}</td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">{toKST(t.finished_at, 19)}</td>
                  <td className="p-3 text-gray-400 hidden md:table-cell">{t.from_agent || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── MarkdownRenderer ────────────────────────────────────────────────────────
function renderInline(text: string, key?: number): React.ReactNode {
  // Parse **bold**, *italic*, `code`, and plain text
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last, m.index)}</span>);
    if (m[2]) parts.push(<strong key={`b${key}-${idx++}`} className="text-white font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={`i${key}-${idx++}`} className="italic text-gray-200">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={`c${key}-${idx++}`} className="px-1 py-0.5 bg-gray-700 text-yellow-300 rounded text-xs font-mono">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`t${key}-${idx++}`}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const isMermaid = lang === "mermaid";
      elements.push(
        <div key={`cb${i}`} className={`my-2 rounded-lg overflow-hidden border ${isMermaid ? "border-blue-700" : "border-gray-600"}`}>
          {lang && (
            <div className={`px-3 py-1 text-xs font-mono ${isMermaid ? "bg-blue-900 text-blue-300" : "bg-gray-700 text-gray-400"}`}>
              {isMermaid ? "diagram (mermaid)" : lang}
            </div>
          )}
          <pre className={`p-3 text-xs font-mono leading-relaxed overflow-auto max-h-[400px] whitespace-pre ${isMermaid ? "bg-blue-950 text-blue-200" : "bg-gray-900 text-gray-300"}`}>
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!/^[-:| ]+$/.test(lines[i].trim())) tableRows.push(row);
        i++;
      }
      elements.push(
        <div key={`tbl${i}`} className="my-2 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-700">
                {tableRows[0]?.map((cell, ci) => (
                  <th key={ci} className="border border-gray-600 px-2 py-1 text-left text-gray-200 font-semibold">{renderInline(cell, ci)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-gray-800" : "bg-gray-750"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-600 px-2 py-1 text-gray-300">{renderInline(cell, ci * 100 + ri)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const cls = level === 1 ? "text-xl font-bold text-white mt-4 mb-2 border-b border-gray-600 pb-1"
        : level === 2 ? "text-base font-bold text-white mt-3 mb-1"
        : level === 3 ? "text-sm font-semibold text-gray-200 mt-2 mb-1"
        : "text-xs font-semibold text-gray-300 mt-2 mb-0.5";
      elements.push(<div key={`h${i}`} className={cls}>{renderInline(text, i)}</div>);
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr${i}`} className="border-gray-600 my-3" />);
      i++; continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*+]\s)/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside my-1 space-y-0.5 pl-2">
          {items.map((it, ii) => <li key={ii} className="text-xs text-gray-300">{renderInline(it, ii)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol${i}`} className="list-decimal list-inside my-1 space-y-0.5 pl-2">
          {items.map((it, ii) => <li key={ii} className="text-xs text-gray-300">{renderInline(it, ii)}</li>)}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const text = trimmed.slice(1).trim();
      elements.push(<blockquote key={`bq${i}`} className="border-l-2 border-gray-500 pl-3 my-1 text-xs text-gray-400 italic">{renderInline(text, i)}</blockquote>);
      i++; continue;
    }

    // Empty line
    if (!trimmed) {
      elements.push(<div key={`sp${i}`} className="h-1" />);
      i++; continue;
    }

    // Paragraph
    elements.push(<p key={`p${i}`} className="text-xs text-gray-300 leading-relaxed">{renderInline(trimmed, i)}</p>);
    i++;
  }

  return <div className="space-y-0.5 text-xs">{elements}</div>;
}

// ─── Tab: Documents ───────────────────────────────────────────────────────────
const DOC_TYPE_LABELS: Record<string, string> = {
  plan: "기획서",
  tech: "기술문서",
  research: "연구보고서",
  status: "상황보고",
  directive: "지시서",
};
const DOC_TYPE_COLORS: Record<string, string> = {
  plan:      "bg-blue-900 text-blue-200",
  tech:      "bg-purple-900 text-purple-200",
  research:  "bg-green-900 text-green-200",
  status:    "bg-yellow-900 text-yellow-200",
  directive: "bg-orange-900 text-orange-200",
};

function DocTypeBadge({ type }: { type: string }) {
  const cls = DOC_TYPE_COLORS[type] || "bg-gray-700 text-gray-300";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{DOC_TYPE_LABELS[type] || type}</span>;
}

function DocumentsTab() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDocuments();
      setDocs(res.documents || []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (doc: Document) => {
    if (expanded === doc.id) { setExpanded(null); setDetail(""); return; }
    setExpanded(doc.id);
    setDetailLoading(true);
    setDetail("");
    try {
      const res = await api.getDocumentContent(doc.id);
      setDetail(res.content || "내용 없음");
    } catch {
      setDetail("문서를 불러올 수 없습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const DOC_TYPES = ["all", "plan", "tech", "research", "status", "directive"];

  const filtered = docs
    .filter((d) => {
      const refDate = (d.created_at || "").slice(0, 10).replace(/\./g, "-").trim();
      // created_at: "2026-03-06 12:14 KST" → slice(0,10) → "2026-03-06"
      const dateStr = d.created_at ? d.created_at.slice(0, 10) : "";
      const fromOk = dateFrom ? dateStr >= dateFrom : true;
      const toOk = dateTo ? dateStr <= dateTo : true;
      return (
        (typeFilter === "all" || d.type === typeFilter) &&
        fromOk && toOk &&
        (searchQuery.trim() === "" ? true :
          d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.summary || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div>
      {/* 타입 필터 */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {DOC_TYPES.map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              typeFilter === t
                ? t === "all" ? "bg-white text-gray-900" : (DOC_TYPE_COLORS[t] || "bg-gray-600 text-white") + " ring-1 ring-white/30"
                : "border border-gray-600 text-gray-400 hover:bg-gray-700"
            }`}>
            {t === "all" ? "전체" : DOC_TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* 검색 + 날짜 필터 */}
      <div className="mb-3 space-y-2">
        <input type="text" placeholder="문서 ID, 제목, 태그 검색..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 whitespace-nowrap">기간</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-gray-500">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg whitespace-nowrap">초기화</button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-gray-400">총 <span className="text-white font-semibold">{filtered.length}</span>건</span>
        <button onClick={load} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">새로고침</button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
          저장된 문서가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div key={doc.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <button className="w-full text-left p-3 hover:bg-gray-750 transition-colors" onClick={() => handleExpand(doc)}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white font-mono text-xs font-semibold">{doc.id}</span>
                  <DocTypeBadge type={doc.type} />
                  <span className="text-gray-200 text-xs flex-1 min-w-0 truncate font-medium">{doc.title}</span>
                  <span className="text-gray-500 text-xs hidden md:inline">{doc.created_at?.slice(0, 16)}</span>
                  <span className="text-gray-500 text-xs">{expanded === doc.id ? "▲" : "▼"}</span>
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {(doc.tags || []).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">{tag}</span>
                  ))}
                </div>
                <div className="text-gray-500 text-xs mt-1 truncate">{doc.summary?.slice(0, 120)}</div>
              </button>
              {expanded === doc.id && (
                <div className="border-t border-gray-700 p-3">
                  {detailLoading ? (
                    <div className="text-gray-400 text-xs py-4 text-center">로딩 중...</div>
                  ) : (
                    <div className="max-h-[600px] overflow-auto pr-1">
                      <MarkdownRenderer content={detail} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Analytics ───────────────────────────────────────────────────────────
const ERROR_TYPES = ["auth_expired", "permission_denied", "timeout", "task_failure"];
const ERROR_TYPE_COLORS: Record<string, string> = {
  auth_expired: "bg-gray-600",
  permission_denied: "bg-yellow-700",
  timeout: "bg-orange-700",
  task_failure: "bg-red-700",
};

function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAnalytics();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const _id = setInterval(() => load(), 30_000); return () => clearInterval(_id); }, [load]);

  if (loading) return <div className="text-center text-gray-400 py-12">로딩 중...</div>;
  if (!data) return <div className="text-center text-red-400 py-12">데이터 로드 실패</div>;

  const s = data.summary;
  // T-080: success_rate = completed / (completed + error) * 100
  const successRate = (s.completed_tasks + s.error_tasks) > 0
    ? Math.round((s.completed_tasks / (s.completed_tasks + s.error_tasks)) * 100)
    : 0;
  const dailyTrend = Array.isArray(data.daily_trend) ? data.daily_trend : [];
  const byProject = Array.isArray(data.by_project) ? data.by_project : [];
  const byServer = Array.isArray(data.by_server) ? data.by_server : [];
  const maxTasks = Math.max(...dailyTrend.map((d) => d.tasks), 1);

  // Error distribution
  const errorDist = Array.isArray(data.error_distribution) ? data.error_distribution : [];
  const totalErrors = errorDist.reduce((sum, e) => sum + e.count, 0) || 1;

  return (
    <div className="space-y-6">
      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 border border-gray-600 bg-gray-900">
          <div className="text-2xl font-bold text-white">{s.total_tasks}</div>
          <div className="text-xs mt-1 text-gray-400">총 작업수</div>
        </div>
        <div className="rounded-xl p-4 border border-blue-700 bg-gray-900">
          <div className="text-2xl font-bold text-blue-300">{successRate}%</div>
          <div className="text-xs mt-1 text-gray-400">성공률</div>
          <div className="text-xs text-gray-500">{s.completed_tasks}/{s.total_tasks}</div>
        </div>
        <div className="rounded-xl p-4 border border-yellow-700 bg-gray-900">
          <div className="text-2xl font-bold text-yellow-300">
            {s.cost_status === "active" && s.total_cost_usd > 0
              ? `$${s.total_cost_usd.toFixed(2)}`
              : "데이터 수집중"}
          </div>
          <div className="text-xs mt-1 text-gray-400">총 비용</div>
          <div className="text-xs text-gray-500">{s.total_tokens.toLocaleString()} tokens</div>
          {s.cost_status === "active" && s.total_cost_usd > 0 && (
            <div className="text-xs text-green-500 mt-1">task_cost_log 집계</div>
          )}
        </div>
        <div className="rounded-xl p-4 border border-purple-700 bg-gray-900">
          <div className="text-2xl font-bold text-purple-300">
            {s.avg_task_duration_min < 0 ? "데이터 부족" : `${s.avg_task_duration_min.toFixed(1)}분`}
          </div>
          <div className="text-xs mt-1 text-gray-400">평균 작업시간</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 프로젝트별 완료율 바 차트 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">프로젝트별 완료율</h3>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            {byProject.length === 0 ? (
              <div className="text-center text-gray-500 py-4">데이터 없음</div>
            ) : (
              byProject
                .filter((p) => Array.isArray([p]) && p.project && p.project.length <= 40)
                .map((p, i) => {
                  const total = typeof p.total === "number" ? p.total : 0;
                  const completed = typeof p.completed === "number" ? p.completed : 0;
                  const error = typeof p.error === "number" ? p.error : 0;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1">
                        <ProjectBadge project={p.project} />
                        <span className="text-xs text-gray-400">{completed}/{total} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, completed > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      {error > 0 && (
                        <div className="text-xs text-red-400 mt-0.5">에러 {error}건</div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* 서버별 테이블 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">서버별 현황</h3>
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left p-3">서버</th>
                  <th className="text-right p-3">작업수</th>
                  <th className="text-left p-3">상태</th>
                  <th className="text-right p-3 hidden md:table-cell">최근보고</th>
                </tr>
              </thead>
              <tbody>
                {byServer.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-gray-500">데이터 없음</td></tr>
                ) : byServer.map((sv, i) => (
                  <tr key={i} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                    <td className="p-3 text-white font-mono font-medium">{sv.server}</td>
                    <td className="p-3 text-right text-gray-300">{sv.tasks}</td>
                    <td className="p-3"><StatusBadge status={sv.status} /></td>
                    <td className="p-3 text-right text-gray-500 hidden md:table-cell">{sv.last_report ? sv.last_report.slice(0, 16) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 일별 트렌드 바 차트 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">일별 작업 트렌드 (최근 7일)</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          {dailyTrend.length === 0 ? (
            <div className="text-center text-gray-500 py-8">데이터 없음</div>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {dailyTrend.slice(-7).map((d, i) => {
                const pct = Math.round((d.tasks / maxTasks) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400">{d.tasks}</span>
                    <div
                      className="w-full bg-blue-600 rounded-t transition-all"
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: "4px" }}
                      title={`${d.date}: ${d.tasks}건 / $${d.cost_usd.toFixed(2)}`}
                    />
                    <span className="text-xs text-gray-500 truncate w-full text-center">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 에러 유형 분포 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">에러 유형 분포</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          {errorDist.length === 0 ? (
            <div className="text-center text-gray-500 py-4">에러 데이터 없음</div>
          ) : (
            ERROR_TYPES.map((et) => {
              const item = errorDist.find((e) => e.error_type === et);
              const count = item?.count ?? 0;
              const pct = Math.round((count / totalErrors) * 100);
              return (
                <div key={et}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300">{et}</span>
                    <span className="text-gray-400">{count}건 ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ERROR_TYPE_COLORS[et] || "bg-gray-500"}`}
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={load} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
          새로고침
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline Health Tab (AADS-166) ──────────────────────────────────────────
function PipelineTab() {
  return <PipelineHealthTab />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tab, setTab] = useState<TabType>("directives");

  const tabs: { key: TabType; label: string }[] = [
    { key: "directives", label: "📋 지시서" },
    { key: "reports", label: "📊 보고서" },
    { key: "pipeline", label: "🏥 Pipeline" },
    { key: "remote", label: "🔄 원격작업" },
    { key: "analytics", label: "📈 분석" },
    { key: "docs", label: "📄 문서" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <Header title="작업 현황" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* 탭 버튼 */}
        <div className="flex gap-1 mb-6 border-b border-gray-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "border-blue-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        {tab === "directives" && <DirectivesTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "pipeline" && <PipelineTab />}
        {tab === "remote" && <RemoteTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "docs" && <DocumentsTab />}
      </div>
    </div>
  );
}
