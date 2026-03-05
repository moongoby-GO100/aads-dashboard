"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";

interface RequiredDocs {
  HANDOVER?: string;
  CEO_DIRECTIVES?: string;
  CONTEXT?: string;
}

interface ManagerAgent {
  agent_id: string;
  role: string;
  projects: string[];
  server: string;
  status: string;
  importance: number;
  required_docs?: RequiredDocs;
  inbox_url?: string;
}

interface CoreAgent {
  key: string;
  role?: string;
  model?: string;
  alt_model?: string;
  cost_input_per_1m?: number;
  cost_output_per_1m?: number;
}

export default function ManagersPage() {
  const [projectManagers, setProjectManagers] = useState<ManagerAgent[]>([]);
  const [coreAgents, setCoreAgents] = useState<CoreAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState("");

  const fetchManagers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/context/public-summary");
      if (res.ok) {
        const d = await res.json();
        const agents: { key: string; value: Record<string, unknown> | string }[] = d.data?.agents || [];
        const mgrs: ManagerAgent[] = [];
        const core: CoreAgent[] = [];
        for (const a of agents) {
          const v = typeof a.value === "string" ? JSON.parse(a.value) : a.value;
          if (String(a.key).endsWith("_MGR")) {
            mgrs.push({
              agent_id: String(v.agent_id || a.key),
              role: String(v.role || ""),
              projects: Array.isArray(v.projects) ? v.projects.map(String) : [],
              server: String(v.server || ""),
              status: String(v.status || "unknown"),
              importance: Number(v.importance || 0),
              required_docs: (v.required_docs as RequiredDocs) || {},
              inbox_url: String(v.inbox_url || ""),
            });
          } else if (v.model || v.role) {
            core.push({
              key: a.key,
              role: String(v.role || ""),
              model: String(v.model || ""),
              alt_model: String(v.alt_model || ""),
              cost_input_per_1m: Number(v.cost_input_per_1m || 0),
              cost_output_per_1m: Number(v.cost_output_per_1m || 0),
            });
          }
        }
        mgrs.sort((a, b) => b.importance - a.importance);
        setProjectManagers(mgrs);
        setCoreAgents(core);
        setLastRefreshed(new Date().toLocaleTimeString("ko-KR"));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchManagers(); }, [fetchManagers]);

  const importanceBar = (imp: number) => {
    const pct = Math.min(100, (imp / 10) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-700 rounded-full h-1.5">
          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-400">{imp}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <Header title="AI 매니저 & 에이전트" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm text-gray-400">최근 갱신: <span className="text-gray-300">{lastRefreshed || "-"}</span></p>
          <button onClick={fetchManagers} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">새로고침</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">프로젝트 매니저 ({projectManagers.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {projectManagers.map((mgr) => (
                <div key={mgr.agent_id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-white">{mgr.agent_id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{mgr.role}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${mgr.status === "active" ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${mgr.status === "active" ? "bg-green-400" : "bg-gray-500"}`} />
                      {mgr.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {mgr.projects.map((p) => (
                      <span key={p} className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">{p}</span>
                    ))}
                    <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">Server: {mgr.server}</span>
                  </div>
                  <div className="mb-3">{importanceBar(mgr.importance)}</div>
                  {mgr.required_docs && Object.keys(mgr.required_docs).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {Object.entries(mgr.required_docs).map(([docType, url]) => (
                        url ? (
                          <a key={docType} href={url} target="_blank" rel="noopener noreferrer"
                            className="text-xs bg-gray-700 hover:bg-gray-600 text-blue-400 px-1.5 py-0.5 rounded transition-colors">
                            {docType}
                          </a>
                        ) : null
                      ))}
                    </div>
                  )}
                  {mgr.inbox_url && (
                    <p className="text-xs text-gray-500">inbox: {mgr.inbox_url}</p>
                  )}
                </div>
              ))}
            </div>

            {coreAgents.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-gray-300 mb-3">코어 에이전트 ({coreAgents.length})</h2>
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="text-left p-3">에이전트</th>
                        <th className="text-left p-3">역할</th>
                        <th className="text-left p-3 hidden md:table-cell">모델</th>
                        <th className="text-right p-3 hidden lg:table-cell">비용(입력/출력 /1M)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coreAgents.map((a) => (
                        <tr key={a.key} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                          <td className="p-3 text-white font-medium">{a.key}</td>
                          <td className="p-3 text-gray-300">{a.role || "-"}</td>
                          <td className="p-3 text-gray-400 hidden md:table-cell">{a.model || "-"}{a.alt_model ? ` / ${a.alt_model}` : ""}</td>
                          <td className="p-3 text-right text-gray-400 hidden lg:table-cell">
                            {a.cost_input_per_1m ? `$${a.cost_input_per_1m} / $${a.cost_output_per_1m}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
