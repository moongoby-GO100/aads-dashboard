"use client";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import SearchableSelect from "@/components/SearchableSelect";

const STATUS_OPTIONS = ["전체", "논의중", "보류", "결정", "진행중", "완료", "폐기"];
const PROJECT_OPTIONS = ["전체", "AADS", "KIS", "GO100", "SF", "NTV2", "NAS"];

const projectOptions = PROJECT_OPTIONS.map((p) => ({
  value: p,
  label: p === "전체" ? "전체 프로젝트" : p,
}));

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  P0: { bg: "#7f1d1d", text: "#fca5a5", label: "P0" },
  P1: { bg: "#7f1d1d", text: "#f87171", label: "P1" },
  P2: { bg: "#78350f", text: "#fbbf24", label: "P2" },
  P3: { bg: "#1e3a5f", text: "#60a5fa", label: "P3" },
};

const STATUS_COLORS: Record<string, string> = {
  논의중: "#a78bfa",
  보류: "#94a3b8",
  결정: "#34d399",
  진행중: "#60a5fa",
  완료: "#6b7280",
  폐기: "#ef4444",
};

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_COLORS[priority] ?? { bg: "#374151", text: "#9ca3af", label: priority };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
      style={{ background: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#9ca3af";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + "22", color }}
    >
      {status}
    </span>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface AgendaItem {
  id: number;
  title: string;
  project: string;
  priority: string;
  status: string;
  summary?: string;
  decision?: string;
  tags?: string[];
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export default function AgendaPage() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("전체");
  const [projectFilter, setProjectFilter] = useState("전체");
  const [sessionFilter, setSessionFilter] = useState("전체");
  const [sessions, setSessions] = useState<{ value: string; label: string }[]>([]);
  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchSessions = async (project: string) => {
    try {
      const res = await api.getAgendaSessions(project !== "전체" ? project : undefined);
      const rawSessions: string[] = Array.isArray(res.sessions) ? res.sessions : [];
      const sessionOptions = await Promise.allSettled(
        rawSessions.map(async (s) => {
          try {
            const detail = await api.getChatSession(s);
            return { value: s, label: detail?.title || `세션 ${s.slice(0, 8)}…` };
          } catch {
            return { value: s, label: `세션 ${s.slice(0, 8)}…` };
          }
        })
      );
      setSessions(
        sessionOptions
          .filter((r) => r.status === "fulfilled")
          .map((r) => (r as PromiseFulfilledResult<{ value: string; label: string }>).value)
      );
    } catch {
      setSessions([]);
    }
  };

  const fetchAgendas = async (status: string, project: string, session: string) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: 0 };
      if (status !== "전체") params.status = status;
      if (project !== "전체") params.project = project;
      if (session !== "전체") params.session_id = session;
      const res = await api.getAgendas(params as any);
      setItems(Array.isArray(res.items) ? res.items : []);
      setTotal(typeof res.total === "number" ? res.total : 0);
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAgendas(statusFilter, projectFilter, sessionFilter);
  }, [statusFilter, projectFilter, sessionFilter]);

  useEffect(() => {
    fetchSessions(projectFilter);
    setSessionFilter("전체");
  }, [projectFilter]);

  const handleSelect = async (item: AgendaItem) => {
    if (selected?.id === item.id) {
      setSelected(null);
      return;
    }
    setDetailLoading(true);
    setSelected(item);
    try {
      const detail = await api.getAgenda(item.id);
      setSelected(detail);
    } catch {
      // keep partial data
    }
    setDetailLoading(false);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="CEO 아젠다" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 필터 */}
        <div className="flex flex-col gap-3 mb-5">
          {/* 드롭다운 필터 행 */}
          <div className="flex items-center gap-2 flex-wrap">
            <SearchableSelect
              options={projectOptions}
              value={projectFilter}
              onChange={(v) => { setProjectFilter(v); setSelected(null); }}
            />
            <SearchableSelect
              options={[{ value: "전체", label: "전체 세션" }, ...sessions]}
              value={sessionFilter}
              onChange={(v) => { setSessionFilter(v); setSelected(null); }}
              placeholder="전체 세션"
              disabled={sessions.length === 0}
            />
            <button
              onClick={() => { fetchAgendas(statusFilter, projectFilter, sessionFilter); fetchSessions(projectFilter); }}
              className="ml-auto px-3 py-1.5 text-sm rounded-lg"
              style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
            >
              새로고침
            </button>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              총 {total}건
            </span>
          </div>
          {/* 상태 필터 버튼 행 */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setSelected(null); }}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                style={statusFilter === s
                  ? { background: "var(--accent)", color: "#fff" }
                  : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            아젠다가 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* 목록 */}
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="rounded-xl p-4 cursor-pointer transition-colors"
                  style={{
                    background: selected?.id === item.id ? "var(--bg-hover)" : "var(--bg-card)",
                    border: selected?.id === item.id
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <PriorityBadge priority={item.priority} />
                    <StatusBadge status={item.status} />
                    <span
                      className="ml-auto text-xs shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {item.project}
                    </span>
                  </div>
                  <p
                    className="text-sm font-medium leading-snug mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {item.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 상세 패널 */}
            <div>
              {selected ? (
                <div
                  className="rounded-xl p-5 sticky top-0"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  {detailLoading ? (
                    <div className="py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 mb-3">
                        <PriorityBadge priority={selected.priority} />
                        <StatusBadge status={selected.status} />
                        <span
                          className="ml-auto text-xs px-2 py-0.5 rounded"
                          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                        >
                          {selected.project}
                        </span>
                      </div>
                      <h2
                        className="text-base font-semibold mb-4"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {selected.title}
                      </h2>

                      {selected.summary && (
                        <div className="mb-4">
                          <p
                            className="text-xs font-semibold uppercase mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            요약
                          </p>
                          <div
                            className="text-sm rounded-lg p-3 whitespace-pre-wrap"
                            style={{
                              background: "var(--bg-hover)",
                              color: "var(--text-primary)",
                              lineHeight: 1.6,
                            }}
                          >
                            {selected.summary}
                          </div>
                        </div>
                      )}

                      {selected.decision && (
                        <div className="mb-4">
                          <p
                            className="text-xs font-semibold uppercase mb-1"
                            style={{ color: "#34d399" }}
                          >
                            CEO 결정
                          </p>
                          <div
                            className="text-sm rounded-lg p-3 whitespace-pre-wrap"
                            style={{
                              background: "#052e16",
                              border: "1px solid #166534",
                              color: "#86efac",
                              lineHeight: 1.6,
                            }}
                          >
                            {selected.decision}
                          </div>
                        </div>
                      )}

                      {selected.tags && selected.tags.length > 0 && (
                        <div className="mb-4">
                          <p
                            className="text-xs font-semibold uppercase mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            태그
                          </p>
                          <div className="flex gap-1 flex-wrap">
                            {selected.tags.map((t) => (
                              <span
                                key={t}
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div
                        className="text-xs pt-3 space-y-1"
                        style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}
                      >
                        {selected.created_by && (
                          <p>등록자: <span style={{ color: "var(--text-primary)" }}>{selected.created_by}</span></p>
                        )}
                        <p>생성: <span style={{ color: "var(--text-primary)" }}>{formatDate(selected.created_at)}</span></p>
                        {selected.updated_at && (
                          <p>수정: <span style={{ color: "var(--text-primary)" }}>{formatDate(selected.updated_at)}</span></p>
                        )}
                        <p className="mt-1">
                          ID: <span style={{ color: "var(--text-primary)" }}>#{selected.id}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-xl p-10 text-center"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <p className="text-2xl mb-2">📌</p>
                  <p className="text-sm">아젠다를 클릭하면 상세 내용이 표시됩니다</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
