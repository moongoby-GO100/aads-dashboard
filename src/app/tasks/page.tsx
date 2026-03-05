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
  file_path: string;
}

interface DirectiveSummary {
  total: number;
  running: number;
  completed: number;
  error: number;
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
}

type TabType = "directives" | "reports" | "remote";
type DirectiveFilter = "all" | "running" | "completed" | "error";

// ─── Helper Components ────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-gray-700 text-gray-300";
  if (s === "running") cls = "bg-green-900 text-green-300";
  else if (s === "completed" || s === "success") cls = "bg-blue-900 text-blue-300";
  else if (s === "error" || s === "failed" || s === "fail") cls = "bg-red-900 text-red-300";
  else if (s === "online") cls = "bg-emerald-900 text-emerald-300";
  else if (s === "offline") cls = "bg-red-900 text-red-300";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{status}</span>;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-70">{label}</div>
    </div>
  );
}

// ─── Tab: Directives ──────────────────────────────────────────────────────────
function DirectivesTab() {
  const [data, setData] = useState<DirectiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DirectiveFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDirectives();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data?.directives.filter((d) =>
    filter === "all" ? true : d.status === filter
  ) ?? [];

  return (
    <div>
      {/* 통계 카드 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="전체" value={data.total} color="border-gray-600 text-white" />
          <StatCard label="진행중" value={data.running} color="border-green-700 text-green-300" />
          <StatCard label="완료" value={data.completed} color="border-blue-700 text-blue-300" />
          <StatCard label="에러" value={data.error} color="border-red-700 text-red-300" />
        </div>
      )}

      {/* 필터 버튼 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "running", "completed", "error"] as DirectiveFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filter === f ? "bg-blue-600 text-white" : "border border-gray-600 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {f === "all" ? "전체" : f === "running" ? "진행중" : f === "completed" ? "완료" : "에러"}
          </button>
        ))}
        <button
          onClick={load}
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
                <th className="text-left p-3 hidden lg:table-cell">생성시각</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                  <td className="p-3 text-white font-medium font-mono">{d.task_id}</td>
                  <td className="p-3 text-gray-200 max-w-xs truncate">{d.title}</td>
                  <td className="p-3 text-gray-400 hidden md:table-cell">{d.project}</td>
                  <td className="p-3"><StatusBadge status={d.status} /></td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">{d.created_at || "-"}</td>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getReports();
      setReports(res.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-300">총 {reports.length}건</span>
        <button onClick={load} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
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
                  <span className="text-gray-300 text-xs flex-1 min-w-0 truncate">{r.filename}</span>
                  <StatusBadge status={r.status} />
                  <span className="text-gray-500 text-xs hidden md:inline">{r.completed_at || "-"}</span>
                  {r.github_url && (
                    <a
                      href={r.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs hover:underline"
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

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* 원격 서버 헬스 */}
      {data?.remote_servers && (
        <div className="flex gap-3 mb-5 flex-wrap">
          {data.remote_servers.map((s) => (
            <div
              key={s.name}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm ${
                s.health === "online"
                  ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                  : "border-red-700 bg-red-950 text-red-300"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.health === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="font-semibold">{s.name}</span>
              <StatusBadge status={s.health} />
              {s.last_ping && (
                <span className="text-xs opacity-60 hidden md:inline">ping: {s.last_ping.slice(0, 19)}</span>
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
                  <td className="p-3"><StatusBadge status={t.status || "unknown"} /></td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">{t.started_at ? String(t.started_at).slice(0, 19) : "-"}</td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">{t.finished_at ? String(t.finished_at).slice(0, 19) : "-"}</td>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tab, setTab] = useState<TabType>("directives");

  const tabs: { key: TabType; label: string }[] = [
    { key: "directives", label: "📋 지시서" },
    { key: "reports", label: "📊 보고서" },
    { key: "remote", label: "🔄 원격작업" },
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
      </div>
    </div>
  );
}
