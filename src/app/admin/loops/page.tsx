"use client";
import { useState, useEffect, useCallback } from "react";

interface Loop {
  id: number;
  loop_type: string;
  status: string;
  original_command: string;
  current_iteration: number | null;
  max_iterations: number | null;
  total_cost_usd: number;
  max_cost_usd: number;
  interval_seconds: number | null;
  execution_model_id: string | null;
  project: string;
  started_at: string;
  next_run_at: string | null;
  consecutive_failures: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const TYPE_LABELS: Record<string, string> = {
  monitor: "Monitor",
  task: "Task",
  sequential: "Sequential",
};

export default function LoopsPage() {
  const [loops, setLoops] = useState<Loop[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchLoops = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/loops", {
        headers: { Authorization: "Bearer " + (localStorage.getItem("token") || "") },
      });
      if (res.ok) {
        const data = await res.json();
        setLoops(Array.isArray(data) ? data : data.loops || []);
      }
    } catch (e) {
      console.error("Failed to fetch loops:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoops();
    const iv = setInterval(fetchLoops, 10000);
    return () => clearInterval(iv);
  }, [fetchLoops]);

  const handleAction = async (loopId: number, action: string) => {
    setActionLoading(loopId);
    try {
      const res = await fetch("/api/v1/loops/" + loopId + "/" + action, {
        method: "POST",
        headers: { Authorization: "Bearer " + (localStorage.getItem("token") || "") },
      });
      if (res.ok) await fetchLoops();
    } catch (e) {
      console.error("Action failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const activeCount = loops.filter((l) => l.status === "active").length;
  const totalCost = loops.reduce((s, l) => s + (l.total_cost_usd || 0), 0);

  if (loading) return <div className="p-6"><h1 className="text-2xl font-bold mb-4">Loop Management</h1><div className="animate-pulse text-gray-500">Loading...</div></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Loop Management</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4"><div className="text-sm text-gray-500">Active</div><div className="text-3xl font-bold text-green-600">{activeCount}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-sm text-gray-500">Total</div><div className="text-3xl font-bold">{loops.length}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-sm text-gray-500">Cost</div><div className="text-3xl font-bold text-blue-600">${totalCost.toFixed(2)}</div></div>
      </div>
      {loops.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No active loops.</div>
      ) : (
        <div className="space-y-4">{loops.map((loop) => (
          <div key={loop.id} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold">#{loop.id}</span>
                <span className="text-sm">{TYPE_LABELS[loop.loop_type] || loop.loop_type}</span>
                <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + (STATUS_COLORS[loop.status] || "bg-gray-100")}>{loop.status}</span>
              </div>
              <div className="flex gap-2">
                {loop.status === "active" && <button onClick={() => handleAction(loop.id, "pause")} disabled={actionLoading === loop.id} className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50">Pause</button>}
                {loop.status === "paused" && <button onClick={() => handleAction(loop.id, "resume")} disabled={actionLoading === loop.id} className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">Resume</button>}
                {(loop.status === "active" || loop.status === "paused") && <button onClick={() => handleAction(loop.id, "cancel")} disabled={actionLoading === loop.id} className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50">Cancel</button>}
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-3 truncate">{loop.original_command}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">Iterations:</span> <span className="font-medium">{loop.current_iteration || 0}/{loop.max_iterations || "N/A"}</span></div>
              <div><span className="text-gray-500">Cost:</span> <span className="font-medium">${(loop.total_cost_usd || 0).toFixed(2)} / ${(loop.max_cost_usd || 0).toFixed(2)}</span></div>
              <div><span className="text-gray-500">Interval:</span> <span className="font-medium">{loop.interval_seconds ? loop.interval_seconds + "s" : "N/A"}</span></div>
              <div><span className="text-gray-500">Model:</span> <span className="font-medium">{loop.execution_model_id || "default"}</span></div>
            </div>
            {loop.consecutive_failures > 0 && <div className="mt-2 text-xs text-red-500">Consecutive failures: {loop.consecutive_failures}</div>}
          </div>
        ))}</div>
      )}
    </div>
  );
}
