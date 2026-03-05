"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

interface TaskItem {
  id: string;
  date: string;
  commit_sha: string;
  status: string;
  result: string;
  raw: Record<string, unknown>;
}

type FilterType = "all" | "completed" | "failed" | "pending";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/context/public-summary");
      if (res.ok) {
        const d = await res.json();
        const history: { key: string; value: Record<string, unknown> | string }[] = d.data?.history || [];
        const taskList: TaskItem[] = history.map((h) => {
          const v = typeof h.value === "string" ? JSON.parse(h.value) : h.value;
          const statusRaw = String(v?.status || v?.result_status || "").toLowerCase();
          let status = "pending";
          if (statusRaw.includes("completed") || statusRaw.includes("ok") || statusRaw.includes("success")) status = "completed";
          else if (statusRaw.includes("failed") || statusRaw.includes("error")) status = "failed";
          return {
            id: h.key,
            date: String(v?.completed_at || v?.timestamp || v?.updated_at || ""),
            commit_sha: String(v?.commit_sha || v?.sha || "").slice(0, 8),
            status,
            result: String(v?.result || v?.summary || v?.message || "").slice(0, 200),
            raw: v,
          };
        });
        taskList.sort((a, b) => (b.date > a.date ? 1 : -1));
        setTasks(taskList);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const statusBadge = (s: string) => {
    const cls = s === "completed" ? "bg-green-900 text-green-300" : s === "failed" ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300";
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{s}</span>;
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <Header title="작업 현황" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">총 {tasks.length}건</span>
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">완료 {completedCount}</span>
          </div>
          <button onClick={fetchTasks} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">새로고침</button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["all", "completed", "failed", "pending"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filter === f ? "bg-blue-600 text-white" : "border border-gray-600 text-gray-300 hover:bg-gray-700"}`}
            >
              {f === "all" ? "전체" : f === "completed" ? "완료" : f === "failed" ? "실패" : "진행중"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-12 border border-dashed border-gray-700 rounded-lg">
            해당하는 작업이 없습니다.
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left p-3">Task ID</th>
                  <th className="text-left p-3 hidden md:table-cell">날짜</th>
                  <th className="text-left p-3 hidden lg:table-cell">Commit</th>
                  <th className="text-left p-3">상태</th>
                  <th className="text-left p-3">결과 요약</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                    <td className="p-3 text-white font-medium">{t.id}</td>
                    <td className="p-3 text-gray-400 hidden md:table-cell">{t.date || "-"}</td>
                    <td className="p-3 text-gray-500 font-mono hidden lg:table-cell">{t.commit_sha || "-"}</td>
                    <td className="p-3">{statusBadge(t.status)}</td>
                    <td className="p-3 text-gray-300 max-w-xs truncate">{t.result || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
