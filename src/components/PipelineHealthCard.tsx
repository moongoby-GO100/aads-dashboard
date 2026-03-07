"use client";
import React, { useEffect, useState } from "react";
import { useSSE, SSEHealth, SSEPipeline, SSEDirectiveChange } from "@/hooks/useSSE";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface FullHealthData {
  status: string;
  checked_at: string;
  duration_ms: number;
  sections: {
    directives: Record<string, { count: number; folder_exists: boolean }>;
    pipeline: { overall: string; server_211?: Record<string, unknown>; server_68?: Record<string, unknown> };
    infra: { overall: string; issues?: Array<{ type: string; detail: string; severity?: string }> } & Record<string, unknown>;
    consistency: { overall: string; issues?: Array<{ type: string; detail: string }> } & Record<string, unknown>;
    existing_health: Record<string, unknown>;
  };
  issues: Array<{ type: string; detail: string; severity?: string }>;
  summary_kr: string;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "HEALTHY" ? "bg-green-500" :
    status === "DEGRADED" ? "bg-yellow-500" :
    status === "CRITICAL" ? "bg-red-500 animate-pulse" :
    "bg-gray-400";
  return <span className={`inline-block w-3 h-3 rounded-full ${color}`} />;
}

function Card({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  const borderColor =
    status === "HEALTHY" ? "border-green-700" :
    status === "DEGRADED" ? "border-yellow-700" :
    status === "CRITICAL" ? "border-red-700" :
    "border-gray-700";
  return (
    <div className={`bg-gray-800 border ${borderColor} rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <StatusDot status={status} />
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      <div className="text-xs text-gray-400 space-y-1">{children}</div>
    </div>
  );
}

export default function PipelineHealthTab() {
  const { health: sseHealth, pipeline: ssePipeline, directives: sseDirectives, connected } = useSSE();
  const [fullHealth, setFullHealth] = useState<FullHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFull = async () => {
      try {
        const r = await fetch(`${BASE_URL}/ops/full-health`);
        if (r.ok) setFullHealth(await r.json());
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchFull();
    const interval = setInterval(fetchFull, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !fullHealth) {
    return <div className="text-gray-400 text-sm p-4">Loading health data...</div>;
  }

  const overallStatus = sseHealth?.status || fullHealth?.status || "UNKNOWN";
  const dirSections = fullHealth?.sections?.directives || {} as Record<string, any>;
  const infraSection = (fullHealth?.sections?.infra || {}) as Record<string, any>;
  const consistencySection = (fullHealth?.sections?.consistency || {}) as Record<string, any>;
  const pipelineSection = (fullHealth?.sections?.pipeline || {}) as Record<string, any>;
  const allIssues = fullHealth?.issues || [];

  return (
    <div className="space-y-4">
      {/* Overall Banner */}
      <div className={`rounded-lg p-3 flex items-center justify-between ${
        overallStatus === "HEALTHY" ? "bg-green-900/30 border border-green-700" :
        overallStatus === "DEGRADED" ? "bg-yellow-900/30 border border-yellow-700" :
        "bg-red-900/30 border border-red-700"
      }`}>
        <div className="flex items-center gap-3">
          <StatusDot status={overallStatus} />
          <span className="text-sm font-semibold text-gray-200">
            Pipeline Status: {overallStatus}
          </span>
          <span className="text-xs text-gray-400">
            SSE: {connected ? "connected" : "polling fallback"}
          </span>
        </div>
        {fullHealth?.duration_ms && (
          <span className="text-xs text-gray-500">{fullHealth.duration_ms}ms</span>
        )}
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1) Directives */}
        <Card title="Directives" status={Object.values(dirSections).some((d: any) => !d?.folder_exists) ? "DEGRADED" : "HEALTHY"}>
          <div className="grid grid-cols-4 gap-2">
            {["pending", "running", "done", "archived"].map(s => {
              const d = (dirSections as Record<string, any>)[s] || {};
              return (
                <div key={s} className="text-center">
                  <div className="text-lg font-bold text-gray-200">{d.count ?? "-"}</div>
                  <div className="text-[10px] text-gray-500">{s}</div>
                </div>
              );
            })}
          </div>
          {sseHealth && (
            <div className="mt-2 text-[10px] text-gray-500">
              SSE: pending={sseHealth.pending_folder}, running_folder={sseHealth.running_folder}
            </div>
          )}
        </Card>

        {/* 2) Pipeline Processes */}
        <Card title="Pipeline Processes" status={pipelineSection.overall || "UNKNOWN"}>
          {ssePipeline ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ssePipeline.bridge_running ? "bg-green-500" : "bg-red-500"}`} />
                <span>bridge.py: {ssePipeline.bridge_running ? "running" : "stopped"}</span>
              </div>
              <div>Active sessions: {ssePipeline.active_sessions}</div>
            </>
          ) : (
            <>
              {["bridge_py", "auto_trigger", "session_watchdog"].map(proc => {
                const s211 = (pipelineSection as any).server_211 || {};
                const info = s211[proc] || {};
                return (
                  <div key={proc} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${info.running ? "bg-green-500" : "bg-red-500"}`} />
                    <span>{proc}: {info.running ? `PID ${info.pid || "?"}` : "stopped"}</span>
                  </div>
                );
              })}
            </>
          )}
        </Card>

        {/* 3) Infrastructure */}
        <Card title="Infrastructure" status={infraSection.overall || "UNKNOWN"}>
          {["db", "ssh_211", "ssh_114", "disk_68", "disk_211", "disk_114", "memory_68", "cpu_68"].map(key => {
            const check = (infraSection as Record<string, any>)[key] || {};
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${check.ok ? "bg-green-500" : check.severity === "warning" ? "bg-yellow-500" : "bg-red-500"}`} />
                <span>{key}: {check.ok ? "OK" : (check.error || check.severity || "FAIL")}</span>
                {key.startsWith("disk_") && check.usage_pct != null && (
                  <span className="text-gray-500">({check.usage_pct}%)</span>
                )}
              </div>
            );
          })}
        </Card>

        {/* 4) Consistency */}
        <Card title="Consistency" status={consistencySection.overall || "UNKNOWN"}>
          {["status_md_sync", "pending_sync", "commit_sync", "handover_sync"].map(key => {
            const check = (consistencySection as Record<string, any>)[key] || {};
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${check.ok !== false ? "bg-green-500" : "bg-red-500"}`} />
                <span>{key.replace(/_/g, " ")}: {check.ok !== false ? "OK" : "MISMATCH"}</span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Issues List */}
      {allIssues.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Issues ({allIssues.length})</h3>
          <div className="space-y-1">
            {allIssues.map((issue, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${
                issue.severity === "critical" ? "bg-red-900/30 text-red-300" :
                issue.severity === "warning" ? "bg-yellow-900/30 text-yellow-300" :
                "bg-gray-700 text-gray-300"
              }`}>
                [{issue.severity || "info"}] {issue.type}: {issue.detail}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Directive Changes (from SSE) */}
      {sseDirectives.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-2">Recent Changes (SSE)</h3>
          <div className="space-y-1">
            {sseDirectives.map((d, i) => (
              <div key={i} className="text-xs text-gray-400">
                {d.task_id} [{d.status}] {d.title || d.project}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
