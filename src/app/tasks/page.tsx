"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

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

type TabType = "directives" | "reports" | "remote" | "analytics";
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
function ProjectFilterBar({ active, onChange }: { active: ProjectFilter; onChange: (p: ProjectFilter) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {PROJECT_FILTERS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
            active === p
              ? p === "all"
                ? "bg-white text-gray-900"
                : projectBadgeClass(p) + " ring-1 ring-white/30"
              : "border border-gray-600 text-gray-400 hover:bg-gray-700"
          }`}
        >
          {p === "all" ? "전체" : p}
        </button>
      ))}
    </div>
  );
}

// ─── Tab: Directives ──────────────────────────────────────────────────────────
function DirectivesTab() {
  const [data, setData] = useState<DirectiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DirectiveFilter>("all");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");

  const load = useCallback(async (proj: ProjectFilter = projectFilter) => {
    setLoading(true);
    try {
      const res = await api.getDirectives(proj === "all" ? undefined : proj);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => { load(); const _id = setInterval(() => load(), 30_000); return () => clearInterval(_id); }, [load]);

  const handleProjectChange = (p: ProjectFilter) => {
    setProjectFilter(p);
    load(p);
  };

  const filtered = data?.directives.filter((d) =>
    (statusFilter === "all" ? true : d.status === statusFilter) &&
    (projectFilter === "all" ? true : d.project.toUpperCase() === projectFilter.toUpperCase())
  ) ?? [];

  // Error type counts — T-072: error_breakdown API 필드 우선 사용
  const errorItems = data?.directives.filter((d) => d.status === "error") ?? [];
  const authExpiredCount = data?.error_breakdown?.auth_expired ?? errorItems.filter((d) => d.error_type === "auth_expired").length;
  const taskFailureCount = data?.error_breakdown?.task_failure ?? errorItems.filter((d) => d.error_type === "task_failure").length;

  return (
    <div>
      {/* KPI 카드 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl p-4 border border-gray-600 bg-gray-900">
            <div className="text-2xl font-bold text-white">{data.total}</div>
            <div className="text-xs mt-1 text-gray-400">전체</div>
          </div>
          <div className="rounded-xl p-4 border border-green-700 bg-gray-900">
            <div className="text-2xl font-bold text-green-300">{data.running}</div>
            <div className="text-xs mt-1 text-gray-400">진행중</div>
          </div>
          <div className="rounded-xl p-4 border border-blue-700 bg-gray-900">
            <div className="text-2xl font-bold text-blue-300">{data.completed}</div>
            <div className="text-xs mt-1 text-gray-400">완료</div>
          </div>
          <div className="rounded-xl p-4 border border-red-700 bg-gray-900">
            <div className="text-2xl font-bold text-red-300">{data.error}</div>
            <div className="text-xs mt-1 text-gray-400">에러</div>
            {data.error > 0 && (
              <div className="flex gap-2 mt-1 flex-wrap">
                {authExpiredCount > 0 && (
                  <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                    auth_expired: {authExpiredCount}
                  </span>
                )}
                {taskFailureCount > 0 && (
                  <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">
                    task_failure: {taskFailureCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 프로젝트 필터 */}
      <ProjectFilterBar active={projectFilter} onChange={handleProjectChange} />

      {/* 상태 필터 + 새로고침 */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {(["all", "running", "completed", "error"] as DirectiveFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              statusFilter === f ? "bg-blue-600 text-white" : "border border-gray-600 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {f === "all" ? "전체" : f === "running" ? "진행중" : f === "completed" ? "완료" : "에러"}
          </button>
        ))}
        <button
          onClick={() => load()}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
          해당하는 지시서가 없습니다.
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-3">Task ID</th>
                <th className="text-left p-3">제목</th>
                <th className="text-left p-3 hidden md:table-cell">프로젝트</th>
                <th className="text-left p-3">상태</th>
                <th className="text-left p-3 hidden md:table-cell">에러유형</th>
                <th className="text-left p-3 hidden lg:table-cell">시작</th>
                <th className="text-left p-3 hidden lg:table-cell">완료</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                  <td className="p-3 text-white font-medium font-mono">{safeRender(d.task_id)}</td>
                  <td className="p-3 text-gray-200 max-w-xs">
                    <span className="block truncate">{safeRender(d.title)}</span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <ProjectBadge project={d.project} />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Reports ─────────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");

  const load = useCallback(async (proj: ProjectFilter = projectFilter) => {
    setLoading(true);
    try {
      const res = await api.getReports(proj === "all" ? undefined : proj);
      // 중복 제거 (filename 기준)
      const seen = new Set<string>();
      const unique = (res.reports || []).filter((r: Report) => {
        if (seen.has(r.filename)) return false;
        seen.add(r.filename);
        return true;
      });
      setReports(unique);
    } catch {
      setReports([]);
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
      <ProjectFilterBar active={projectFilter} onChange={handleProjectChange} />

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-3 text-xs">
          <span className="text-gray-400">총 <span className="text-white font-semibold">{reports.length}</span>건</span>
          <span className="text-green-400">성공 <span className="font-semibold">{successCount}</span></span>
          <span className="text-red-400">에러 <span className="font-semibold">{errorCount}</span></span>
        </div>
        <button onClick={() => load()} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">로딩 중...</div>
      ) : reports.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
          보고서가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r, i) => (
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
              {data.tasks.map((t, i) => (
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tab, setTab] = useState<TabType>("directives");

  const tabs: { key: TabType; label: string }[] = [
    { key: "directives", label: "📋 지시서" },
    { key: "reports", label: "📊 보고서" },
    { key: "remote", label: "🔄 원격작업" },
    { key: "analytics", label: "📈 분석" },
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
        {tab === "remote" && <RemoteTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
