"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Header from "@/components/Header";
import { api } from "@/lib/api";

interface AgentSummary {
  role: string;
  display_name: string;
  display_name_ko?: string | null;
  base_model: string;
  allowed_intents: string[];
  max_tokens: number | null;
  created_at: string | null;
  project_scope?: string[];
  role_category?: string;
  role_category_label_ko?: string;
  role_group_order?: number;
  lifecycle_stage?: string;
  category_description?: string;
  when_to_use?: string[];
  how_to_instruct?: string[];
  instruction_template?: string;
  recent_tasks_count: number;
  last_active_at: string | null;
}

interface AgentListResponse {
  agents: AgentSummary[];
  total: number;
  category_counts?: Record<string, number>;
}

interface AgentStatsItem {
  role: string;
  display_name: string;
  total_tasks: number;
  completed_tasks: number;
  error_tasks: number;
  completed_ratio: number;
  error_ratio: number;
  last_active_at: string | null;
}

interface AgentStatsResponse {
  agents: AgentStatsItem[];
  total: number;
}

interface AgentTask {
  job_id: string;
  project: string;
  status: string;
  phase: string;
  instruction: string;
  model: string;
  worker_model: string;
  actual_model: string;
  error_detail: string;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AgentDetail extends AgentSummary {
  total_tasks: number;
  completed_tasks: number;
  error_tasks: number;
  completed_ratio: number;
  error_ratio: number;
}

interface AgentDetailResponse {
  agent: AgentDetail;
  recent_tasks: AgentTask[];
}

type AgentHealth = "healthy" | "active" | "warning" | "idle";

const ALL_CATEGORIES = "__all__";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  const diff = Math.max(0, Date.now() - parsed.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ratioToPercent(value?: number): string {
  return `${Math.round((value || 0) * 100)}%`;
}

function inferHealth(agent: AgentSummary, stat?: AgentStatsItem): AgentHealth {
  if ((stat?.total_tasks || 0) > 0 && (stat?.error_ratio || 0) >= 0.3) return "warning";
  if (agent.recent_tasks_count > 0) return "active";
  if ((stat?.total_tasks || 0) > 0) return "healthy";
  return "idle";
}

function healthTone(status: AgentHealth): { label: string; background: string; color: string; border: string } {
  if (status === "healthy") {
    return { label: "Healthy", background: "rgba(34,197,94,0.14)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.24)" };
  }
  if (status === "active") {
    return { label: "Active", background: "rgba(59,130,246,0.14)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.24)" };
  }
  if (status === "warning") {
    return { label: "At Risk", background: "rgba(239,68,68,0.14)", color: "#f87171", border: "1px solid rgba(239,68,68,0.24)" };
  }
  return { label: "Idle", background: "rgba(148,163,184,0.14)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.24)" };
}

function taskStatusTone(status: string): { background: string; color: string; border: string } {
  if (status === "done") return { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.24)" };
  if (status === "running") return { background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.24)" };
  if (status === "error") return { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.24)" };
  return { background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)", border: "1px solid rgba(148,163,184,0.24)" };
}

function uniqueText(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [stats, setStats] = useState<AgentStatsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [query, setQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const statsByRole = useMemo(() => {
    const mapped: Record<string, AgentStatsItem> = {};
    for (const item of stats) {
      mapped[(item.role || "").toLowerCase()] = item;
    }
    return mapped;
  }, [stats]);

  const categories = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; order: number; count: number; description: string }>();
    for (const agent of agents) {
      const key = agent.role_category || "uncategorized";
      const current = grouped.get(key);
      grouped.set(key, {
        key,
        label: agent.role_category_label_ko || "미분류",
        order: agent.role_group_order ?? 999,
        count: (current?.count || 0) + 1,
        description: current?.description || agent.category_description || "",
      });
    }
    return Array.from(grouped.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [agents]);

  const loadBoard = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [listRes, statsRes] = await Promise.all([
        api.getAdminAgents(),
        api.getAdminAgentStats(),
      ]);
      setAgents(((listRes as AgentListResponse)?.agents || []) as AgentSummary[]);
      setStats(((statsRes as AgentStatsResponse)?.agents || []) as AgentStatsItem[]);
      setError("");
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("agent registry load failed", err);
      setError(err instanceof Error ? err.message : "Agent Registry 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDetail = useCallback(async (role: string, silent = false) => {
    if (!role) return;
    if (!silent) {
      setDetailLoading(true);
      setDetailError("");
    }
    try {
      const response = await api.getAdminAgent(role);
      setDetail((response as AgentDetailResponse) || null);
      setDetailError("");
    } catch (err) {
      console.error("agent detail load failed", err);
      setDetailError(err instanceof Error ? err.message : "에이전트 상세를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadBoard(true);
      if (selectedRole) loadDetail(selectedRole, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadBoard, loadDetail, selectedRole]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents
      .filter((agent) => categoryFilter === ALL_CATEGORIES || (agent.role_category || "uncategorized") === categoryFilter)
      .filter((agent) => {
        if (!normalizedQuery) return true;
        return [
          agent.role,
          agent.display_name,
          agent.display_name_ko,
          agent.role_category_label_ko,
          agent.lifecycle_stage,
          ...(agent.project_scope || []),
        ].join(" ").toLowerCase().includes(normalizedQuery);
      })
      .map((agent) => {
        const stat = statsByRole[(agent.role || "").toLowerCase()];
        return { agent, stat, health: inferHealth(agent, stat) };
      });
  }, [agents, categoryFilter, query, statsByRole]);

  const totalRecentTasks = useMemo(() => agents.reduce((acc, item) => acc + (item.recent_tasks_count || 0), 0), [agents]);
  const activeAgents = useMemo(() => rows.filter((item) => item.health === "active" || item.health === "healthy").length, [rows]);
  const avgErrorRatio = useMemo(() => {
    if (!stats.length) return 0;
    return stats.reduce((acc, item) => acc + (item.error_ratio || 0), 0) / stats.length;
  }, [stats]);
  const projectList = useMemo(() => uniqueText(agents.flatMap((agent) => agent.project_scope || [])), [agents]);

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "16px",
  };

  const modalAgent = detail?.agent;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Agent Registry" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700 }}>AI Agent Registry</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                역할 분류, 프로젝트 적용 범위, 활용 기준, 최근 작업 흐름을 관리합니다.
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "12px" }}>
                {refreshing ? "새로고침 중..." : `최근 갱신 ${lastRefreshedAt ? formatDateTime(lastRefreshedAt.toISOString()) : "-"}`}
              </div>
              <button
                onClick={() => loadBoard(true)}
                style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}
              >
                새로고침
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Total Roles", agents.length, "var(--text-primary)"],
              ["Categories", categories.length, "#fbbf24"],
              ["Active", activeAgents, "#60a5fa"],
              ["Recent Tasks", totalRecentTasks, "#4ade80"],
              ["Avg Error", ratioToPercent(avgErrorRatio), "#f87171"],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={{ ...cardStyle, padding: "14px" }}>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>{label}</div>
                <div style={{ color: String(color), fontWeight: 700, fontSize: "26px" }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle }}>
            <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: "12px" }}>
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>역할 분류</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "3px" }}>
                  프로젝트 범위: {projectList.length ? projectList.join(", ") : "-"}
                </div>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="역할, 분류, 프로젝트 검색"
                style={{ width: "min(360px, 100%)", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", outline: "none" }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter(ALL_CATEGORIES)}
                style={{
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: categoryFilter === ALL_CATEGORIES ? "var(--accent)" : "var(--bg-hover)",
                  color: categoryFilter === ALL_CATEGORIES ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                전체 {agents.length}
              </button>
              {categories.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setCategoryFilter(category.key)}
                  title={category.description || category.label}
                  style={{
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: categoryFilter === category.key ? "var(--accent)" : "var(--bg-hover)",
                    color: categoryFilter === category.key ? "#fff" : "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {category.label} {category.count}
                </button>
              ))}
            </div>
          </div>

          {error ? <div style={{ ...cardStyle, color: "var(--danger)" }}>{error}</div> : null}

          {loading ? (
            <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>로딩 중...</div>
          ) : rows.length === 0 ? (
            <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>조건에 맞는 에이전트가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {rows.map(({ agent, stat, health }) => {
                const tone = healthTone(health);
                return (
                  <button
                    key={agent.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(agent.role);
                      setDetail(null);
                      setDetailLoading(true);
                      setDetailError("");
                      loadDetail(agent.role);
                    }}
                    style={{ ...cardStyle, textAlign: "left", cursor: "pointer" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 700 }}>{agent.role}</div>
                        <div style={{ color: "var(--text-primary)", fontSize: "18px", fontWeight: 700, marginTop: "2px" }}>{agent.display_name || agent.role}</div>
                      </div>
                      <span style={{ padding: "4px 9px", borderRadius: "8px", background: tone.background, color: tone.color, border: tone.border, fontSize: "11px", fontWeight: 700 }}>
                        {tone.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2" style={{ marginTop: "11px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "8px", background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: "12px" }}>
                        {agent.role_category_label_ko || "미분류"}
                      </span>
                      {agent.lifecycle_stage ? (
                        <span style={{ padding: "4px 8px", borderRadius: "8px", background: "rgba(59,130,246,0.10)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.18)", fontSize: "12px" }}>
                          {agent.lifecycle_stage}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2" style={{ marginTop: "12px" }}>
                      <div style={{ padding: "10px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>Projects</div>
                        <div style={{ color: "var(--text-primary)", fontSize: "12px", marginTop: "4px" }}>{(agent.project_scope || []).slice(0, 4).join(", ") || "-"}</div>
                      </div>
                      <div style={{ padding: "10px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>Recent Tasks</div>
                        <div style={{ color: "#93c5fd", fontSize: "18px", fontWeight: 700, marginTop: "2px" }}>{(agent.recent_tasks_count || 0).toLocaleString("ko-KR")}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2" style={{ marginTop: "10px" }}>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>Error {ratioToPercent(stat?.error_ratio)}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{formatElapsed(agent.last_active_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedRole ? (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => {
            setSelectedRole("");
            setDetail(null);
            setDetailError("");
          }}
        >
          <div
            style={{ width: "min(1080px, 100%)", maxHeight: "88vh", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: "18px" }}>
              <div>
                <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 700 }}>{modalAgent?.role || selectedRole}</div>
                <div style={{ color: "var(--text-primary)", fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{modalAgent?.display_name || "Agent Detail"}</div>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: "10px" }}>
                  <span style={{ padding: "4px 10px", borderRadius: "8px", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px" }}>
                    {modalAgent?.role_category_label_ko || "미분류"}
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>Last Active {formatDateTime(modalAgent?.last_active_at)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("");
                  setDetail(null);
                  setDetailError("");
                }}
                style={{ border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: "24px", cursor: "pointer", lineHeight: 1 }}
              >
                x
              </button>
            </div>

            {detailLoading && !detail ? <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>상세를 불러오는 중...</div> : null}
            {detailError ? <div style={{ ...cardStyle, color: "var(--danger)", marginBottom: "16px" }}>{detailError}</div> : null}

            {detail ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    ["Max Tokens", modalAgent?.max_tokens != null ? modalAgent.max_tokens.toLocaleString("ko-KR") : "-"],
                    ["Total Tasks", (modalAgent?.total_tasks || 0).toLocaleString("ko-KR")],
                    ["Completed", ratioToPercent(modalAgent?.completed_ratio)],
                    ["Error", ratioToPercent(modalAgent?.error_ratio)],
                    ["Stage", modalAgent?.lifecycle_stage || "-"],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ ...cardStyle, padding: "14px" }}>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>{label}</div>
                      <div style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div style={{ ...cardStyle }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "10px" }}>활용 기준</div>
                    {(modalAgent?.when_to_use || []).length ? (
                      <ul style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: 1.7, paddingLeft: "18px" }}>
                        {(modalAgent?.when_to_use || []).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>등록된 활용 기준이 없습니다.</div>
                    )}
                  </div>
                  <div style={{ ...cardStyle }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "10px" }}>지시 방법</div>
                    {(modalAgent?.how_to_instruct || []).length ? (
                      <ul style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: 1.7, paddingLeft: "18px" }}>
                        {(modalAgent?.how_to_instruct || []).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>등록된 지시 방법이 없습니다.</div>
                    )}
                  </div>
                </div>

                <div style={{ ...cardStyle }}>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "10px" }}>관리 메타데이터</div>
                  <div className="grid md:grid-cols-3 gap-3" style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                    <div>Category: {modalAgent?.role_category || "-"}</div>
                    <div>Projects: {(modalAgent?.project_scope || []).join(", ") || "-"}</div>
                    <div>Created: {formatDateTime(modalAgent?.created_at)}</div>
                  </div>
                  {modalAgent?.instruction_template ? (
                    <div style={{ marginTop: "12px", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13px" }}>
                      {modalAgent.instruction_template}
                    </div>
                  ) : null}
                </div>

                <div style={{ ...cardStyle }}>
                  <div className="flex items-center justify-between gap-2" style={{ marginBottom: "12px" }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>최근 작업 10건</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{detail.recent_tasks.length}건</div>
                  </div>
                  {detail.recent_tasks.length === 0 ? (
                    <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>최근 작업 기록이 없습니다.</div>
                  ) : (
                    <div className="grid gap-2">
                      {detail.recent_tasks.map((task) => {
                        const tone = taskStatusTone(task.status);
                        return (
                          <div key={task.job_id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", background: "var(--bg-primary)" }}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 700 }}>{task.job_id}</div>
                              <span style={{ padding: "3px 8px", borderRadius: "8px", ...tone, fontSize: "11px", fontWeight: 600 }}>{task.status || "-"}</span>
                            </div>
                            <div style={{ color: "var(--text-primary)", fontSize: "13px", lineHeight: "1.5", marginTop: "8px" }}>{task.instruction || "(instruction 없음)"}</div>
                            <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginTop: "10px" }}>
                              <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{task.actual_model || task.worker_model || task.model || "-"}</div>
                              <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{formatDateTime(task.updated_at || task.created_at)}</div>
                            </div>
                            {task.error_detail ? <div style={{ color: "#fca5a5", fontSize: "11px", marginTop: "8px", lineHeight: "1.5" }}>{task.error_detail}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
