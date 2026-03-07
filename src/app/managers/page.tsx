"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface ManagerAgent {
  agent_id: string;
  role: string;
  projects: string[];
  server: string;
  status: string;
  importance: number;
  required_docs?: Record<string, string>;
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

// AADS-143: 프로젝트별 HANDOVER 문서 GitHub 링크
const HANDOVER_LINKS: Record<string, string> = {
  AADS: "https://github.com/moongoby-GO100/aads-docs/blob/master/HANDOVER.md",
  GO100: "https://github.com/moongoby-GO100/aads-docs/blob/master/GO100-HANDOVER.md",
  KIS: "https://github.com/moongoby-GO100/aads-docs/blob/master/KIS-HANDOVER.md",
  SF: "https://github.com/moongoby-GO100/aads-docs/blob/master/SF-HANDOVER.md",
  ShortFlow: "https://github.com/moongoby-GO100/aads-docs/blob/master/SF-HANDOVER.md",
  NTV2: "https://github.com/moongoby-GO100/aads-docs/blob/master/NTV2-HANDOVER.md",
  NewTalk: "https://github.com/moongoby-GO100/aads-docs/blob/master/NTV2-HANDOVER.md",
  NAS: "https://github.com/moongoby-GO100/aads-docs/blob/master/NAS-HANDOVER.md",
};

export default function ManagersPage() {
  const [projectManagers, setProjectManagers] = useState<ManagerAgent[]>([]);
  const [coreAgents, setCoreAgents] = useState<CoreAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState("");

  const fetchManagers = useCallback(async () => {
    setLoading(true);
    try {
      // AADS-146: /api/v1/managers 전용 엔드포인트 우선 사용 (fallback: public-summary, registry)
      const [managersResult, summaryResult, registryResult] = await Promise.allSettled([
        api.getManagers(),
        api.getPublicSummary(),
        api.getMemorySearch({ memory_type: "agent_registry" }),
      ]);

      const mgrs: ManagerAgent[] = [];
      const core: CoreAgent[] = [];

      // 1순위: /api/v1/managers
      if (managersResult.status === "fulfilled") {
        const d = managersResult.value as any;
        for (const v of (d.project_managers || [])) {
          mgrs.push({
            agent_id: String(v.agent_id || v.key || ""),
            role: String(v.role || ""),
            projects: Array.isArray(v.projects) ? v.projects.map(String) : [],
            server: String(v.server || ""),
            status: String(v.status || "unknown"),
            importance: Number(v.importance || 0),
            required_docs: (v.required_docs as Record<string, string>) || {},
            inbox_url: String(v.inbox_url || ""),
          });
        }
        for (const v of (d.core_agents || [])) {
          core.push({
            key: String(v.key || ""),
            role: String(v.role || ""),
            model: String(v.model || ""),
            alt_model: String(v.alt_model || ""),
            cost_input_per_1m: Number(v.cost_input_per_1m || 0),
            cost_output_per_1m: Number(v.cost_output_per_1m || 0),
          });
        }
      }

      // 2순위: public-summary fallback
      if (mgrs.length === 0 && summaryResult.status === "fulfilled") {
        const d = summaryResult.value as any;
        const agents: { key: string; value: Record<string, unknown> | string }[] = d.data?.agents || [];
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
              required_docs: (v.required_docs as Record<string, string>) || {},
              inbox_url: String(v.inbox_url || ""),
            });
          } else if (v.model || v.role) {
            core.push({
              key: String(a.key),
              role: String(v.role || ""),
              model: String(v.model || ""),
              alt_model: String(v.alt_model || ""),
              cost_input_per_1m: Number(v.cost_input_per_1m || 0),
              cost_output_per_1m: Number(v.cost_output_per_1m || 0),
            });
          }
        }
      }

      // 3순위: agent_registry fallback
      if (registryResult.status === "fulfilled") {
        const reg = registryResult.value as any;
        const items = reg.results ?? reg.memories ?? [];
        for (const item of items) {
          const v = typeof item.content === "string" ? JSON.parse(item.content).value ?? {} : (item.content?.value ?? {});
          if (v.agent_id && !mgrs.find(m => m.agent_id === v.agent_id)) {
            mgrs.push({
              agent_id: String(v.agent_id),
              role: String(v.role || ""),
              projects: Array.isArray(v.projects) ? v.projects.map(String) : [],
              server: String(v.server || ""),
              status: String(v.status || "unknown"),
              importance: Number(v.importance || 0),
              required_docs: v.required_docs || {},
              inbox_url: String(v.inbox_url || ""),
            });
          }
        }
      }

      mgrs.sort((a, b) => b.importance - a.importance);
      setProjectManagers(mgrs);
      setCoreAgents(core);
      setLastRefreshed(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchManagers(); }, [fetchManagers]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Managers" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            최근 갱신: <span style={{ color: "var(--text-primary)" }}>{lastRefreshed || "-"}</span>
          </p>
          <button
            onClick={fetchManagers}
            className="px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : (
          <>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              프로젝트 매니저 ({projectManagers.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {projectManagers.map((mgr) => (
                <div key={mgr.agent_id} className="rounded-xl p-4"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{mgr.agent_id}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{mgr.role}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: mgr.status === "active" ? "rgba(34,197,94,0.15)" : "var(--bg-hover)",
                        color: mgr.status === "active" ? "var(--success)" : "var(--text-secondary)"
                      }}>
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: mgr.status === "active" ? "var(--success)" : "var(--text-secondary)" }} />
                      {mgr.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {mgr.projects.map((p) => (
                      <span key={p} className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(59,130,246,0.2)", color: "var(--accent)" }}>{p}</span>
                    ))}
                    {mgr.server && (
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                        🖥 {mgr.server}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 rounded-full h-1.5" style={{ background: "var(--bg-hover)" }}>
                      <div className="h-1.5 rounded-full" style={{ background: "var(--accent)", width: `${Math.min(100, (mgr.importance / 10) * 100)}%` }} />
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{mgr.importance}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {/* AADS-143: HANDOVER 문서 링크 */}
                    {mgr.projects.map((p) => {
                      const hwUrl = HANDOVER_LINKS[p];
                      return hwUrl ? (
                        <a key={`hw-${p}`} href={hwUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-1.5 py-0.5 rounded transition-colors font-medium"
                          style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                          📄 {p} HANDOVER
                        </a>
                      ) : null;
                    })}
                    {mgr.required_docs && Object.entries(mgr.required_docs).map(([docType, url]) => (
                      url ? (
                        <a key={docType} href={url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-1.5 py-0.5 rounded transition-colors"
                          style={{ background: "var(--bg-hover)", color: "var(--accent)" }}>
                          {docType}
                        </a>
                      ) : null
                    ))}
                  </div>
                </div>
              ))}
              {projectManagers.length === 0 && (
                <div className="col-span-3 text-center py-8 rounded-xl"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  매니저 정보가 없습니다 (API 응답 없음)
                </div>
              )}
            </div>

            {coreAgents.length > 0 && (
              <>
                <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  코어 에이전트 ({coreAgents.length})
                </h2>
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <th className="text-left p-3">에이전트</th>
                        <th className="text-left p-3">역할</th>
                        <th className="text-left p-3 hidden md:table-cell">모델</th>
                        <th className="text-right p-3 hidden lg:table-cell">비용 /1M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coreAgents.map((a) => (
                        <tr key={a.key} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="p-3 font-medium" style={{ color: "var(--text-primary)" }}>{a.key}</td>
                          <td className="p-3" style={{ color: "var(--text-secondary)" }}>{a.role || "-"}</td>
                          <td className="p-3 hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>
                            {a.model || "-"}{a.alt_model ? ` / ${a.alt_model}` : ""}
                          </td>
                          <td className="p-3 text-right hidden lg:table-cell" style={{ color: "var(--text-secondary)" }}>
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
