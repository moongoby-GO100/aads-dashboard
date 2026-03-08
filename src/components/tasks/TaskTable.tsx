/**
 * AADS-181: TaskTable — 서버 뱃지 컬럼 포함 통합 태스크 테이블
 */
"use client";
import React from "react";
import { CrossDirective } from "@/services/taskApi";

// ─── 서버 뱃지 ────────────────────────────────────────────────────────────────
const SERVER_COLORS: Record<string, string> = {
  "68": "bg-blue-900 text-blue-200 border border-blue-700",
  "211": "bg-purple-900 text-purple-200 border border-purple-700",
  "114": "bg-orange-900 text-orange-200 border border-orange-700",
};
const SERVER_LABELS: Record<string, string> = {
  "68": "68 (AADS)",
  "211": "211 (KIS/GO)",
  "114": "114 (SF/NT/NAS)",
};

function ServerBadge({ server }: { server: string }) {
  const cls = SERVER_COLORS[server] ?? "bg-gray-700 text-gray-300";
  const label = SERVER_LABELS[server] ?? server;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── 프로젝트 뱃지 ────────────────────────────────────────────────────────────
const PROJECT_COLORS: Record<string, string> = {
  AADS: "bg-blue-900 text-blue-200",
  KIS: "bg-purple-900 text-purple-200",
  GO100: "bg-yellow-900 text-yellow-200",
  SF: "bg-orange-900 text-orange-200",
  NTV2: "bg-green-900 text-green-200",
  NAS: "bg-pink-900 text-pink-200",
};
function ProjectBadge({ project }: { project: string }) {
  const p = (project || "").toUpperCase();
  const cls = PROJECT_COLORS[p] ?? "bg-gray-700 text-gray-300";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {project || "-"}
    </span>
  );
}

// ─── 상태 뱃지 ────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let cls = "bg-gray-700 text-gray-300";
  if (s === "running") cls = "bg-green-900 text-green-300";
  else if (s === "done" || s === "completed") cls = "bg-blue-900 text-blue-300";
  else if (s === "error" || s === "failed") cls = "bg-red-900 text-red-300";
  else if (s === "pending") cls = "bg-yellow-900 text-yellow-300";
  else if (s === "archived") cls = "bg-gray-700 text-gray-500";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ─── 우선순위 뱃지 ────────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  if (!priority) return <span className="text-gray-600">-</span>;
  const p = priority.toUpperCase();
  let cls = "text-gray-400";
  if (p.startsWith("P0")) cls = "text-red-400 font-bold";
  else if (p.startsWith("P1")) cls = "text-orange-400 font-semibold";
  else if (p.startsWith("P2")) cls = "text-yellow-400";
  return <span className={`text-xs font-mono ${cls}`}>{priority}</span>;
}

// ─── KST 시간 포맷 ────────────────────────────────────────────────────────────
function toKST(dtStr: string | null | undefined, len = 16): string {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr.slice(0, len);
    const kst = d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const m = kst.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
    if (m) {
      const [, y, mo, day, h, min] = m;
      return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")} ${h.padStart(2, "0")}:${min}`.slice(0, len);
    }
    return dtStr.slice(0, len);
  } catch {
    return dtStr.slice(0, len);
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface TaskTableProps {
  directives: CrossDirective[];
  expandedTask: string | null;
  onExpand: (d: CrossDirective) => void;
  taskDetail: string;
  detailLoading: boolean;
  isStalled?: (d: CrossDirective) => boolean;
}

// ─── TaskTable Component ──────────────────────────────────────────────────────
export function TaskTable({
  directives,
  expandedTask,
  onExpand,
  taskDetail,
  detailLoading,
  isStalled,
}: TaskTableProps) {
  if (directives.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
        해당하는 지시서가 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="text-left p-3">Task ID</th>
            <th className="text-left p-3">제목</th>
            <th className="text-left p-3 hidden md:table-cell">서버</th>
            <th className="text-left p-3 hidden md:table-cell">프로젝트</th>
            <th className="text-left p-3">상태</th>
            <th className="text-left p-3 hidden sm:table-cell">우선순위</th>
            <th className="text-left p-3 hidden lg:table-cell">시작</th>
            <th className="text-left p-3 hidden lg:table-cell">완료</th>
          </tr>
        </thead>
        <tbody>
          {directives.map((d, i) => {
            const stalled = isStalled ? isStalled(d) : false;
            const expanded = expandedTask === d.task_id;
            return (
              <React.Fragment key={`${d.server}-${d.task_id}-${i}`}>
                <tr
                  onClick={() => onExpand(d)}
                  className={[
                    "border-b border-gray-700 last:border-0 cursor-pointer transition-colors",
                    expanded ? "bg-gray-750" : "hover:bg-gray-750",
                    stalled ? "bg-red-900/30" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td className="p-3 text-white font-medium font-mono">
                    <span className="mr-1 text-gray-500 text-xs">{expanded ? "▲" : "▶"}</span>
                    {stalled && <span className="mr-1 text-red-400" title="stalled > 1h">⚠</span>}
                    {d.task_id}
                  </td>
                  <td className="p-3 text-gray-200 max-w-[200px]">
                    <span className="block truncate">{d.title || d.filename}</span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <ServerBadge server={d.server} />
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <ProjectBadge project={d.project} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="p-3 hidden sm:table-cell">
                    <PriorityBadge priority={d.priority} />
                  </td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">
                    {toKST(d.started_at)}
                  </td>
                  <td className="p-3 text-gray-500 hidden lg:table-cell">
                    {toKST(d.completed_at)}
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <td colSpan={8} className="p-4">
                      {detailLoading ? (
                        <div className="text-gray-400 text-xs">로딩 중...</div>
                      ) : (
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-800 p-3 rounded-lg max-h-96 overflow-y-auto">
                          {taskDetail || "내용 없음"}
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
  );
}

export default TaskTable;
