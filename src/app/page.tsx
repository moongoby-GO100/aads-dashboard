"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import type { HealthResponse, ConversationStatsResponse, Conversation } from "@/types";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [convStats, setConvStats] = useState<ConversationStatsResponse | null>(null);
  const [recentConvs, setRecentConvs] = useState<Conversation[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [ceoDecisions, setCeoDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getHealth().then(setHealth).catch(() => {}),
      api.getProjectDashboard().then(setDashboard).catch(() => {}),
      api.getConversationStats().then(setConvStats).catch(() => {}),
      api.getConversations(undefined, undefined, 5)
        .then((r) => setRecentConvs(r.conversations ?? []))
        .catch(() => {}),
      api.getAlerts().then((r) => setAlerts(r.alerts ?? r ?? [])).catch(() => {}),
      api.getCeoDecisions(7).then((r) => setCeoDecisions(r.decisions ?? r ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects: any[] = dashboard?.projects ?? [];
  const totalConvs = convStats?.total_conversations ?? 0;
  const agentCount = dashboard?.agent_count ?? 0;
  const alertCount = alerts.length;
  const healthOk = health?.status === "ok";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="AADS CEO 대시보드" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 4개 통계 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>프로젝트 수</p>
            <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{loading ? "—" : projects.length}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>총 대화</p>
            <p className="text-2xl font-bold" style={{ color: "var(--success)" }}>{loading ? "—" : totalConvs}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>에이전트 수</p>
            <p className="text-2xl font-bold" style={{ color: "var(--warning)" }}>{loading ? "—" : agentCount || "—"}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>알림</p>
            <p className="text-2xl font-bold" style={{ color: alertCount > 0 ? "var(--danger)" : "var(--success)" }}>
              {loading ? "—" : alertCount}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              시스템: {health === null ? "—" : healthOk ? "✅ OK" : "❌ Error"}
            </p>
          </div>
        </div>

        {/* 중단: 6개 프로젝트 카드 그리드 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>프로젝트 현황</h2>
            <Link href="/project-status" className="text-xs" style={{ color: "var(--accent)" }}>전체 보기 →</Link>
          </div>
          {loading ? (
            <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              프로젝트 대시보드 API 응답 없음 (서버 확인 필요)
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.slice(0, 6).map((p: any) => (
                <Link key={p.id || p.project_id || p.name} href={`/project-status/${p.id || p.project_id || p.name}`}
                  className="rounded-xl p-4 block transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{p.name || p.project_id}</h3>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                      {p.status || "active"}
                    </span>
                  </div>
                  {/* 진행률 바 */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                      <span>진행률</span>
                      <span>{p.progress ?? 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "var(--bg-hover)" }}>
                      <div className="h-1.5 rounded-full" style={{ background: "var(--accent)", width: `${p.progress ?? 0}%` }} />
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {p.manager && <span>매니저: {p.manager} · </span>}
                    {p.last_activity && <span>{p.last_activity}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 하단: 최근 대화 + 알림/CEO결정 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 최근 대화 5건 */}
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>최근 대화 (5건)</h2>
              <Link href="/conversations" className="text-xs" style={{ color: "var(--accent)" }}>전체 →</Link>
            </div>
            {loading ? (
              <div className="text-sm py-4 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
            ) : recentConvs.length === 0 ? (
              <div className="text-sm py-4 text-center" style={{ color: "var(--text-secondary)" }}>저장된 대화가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {recentConvs.map((c) => (
                  <div key={c.id} className="border-l-2 pl-3 py-1" style={{ borderColor: "var(--accent)" }}>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white font-semibold bg-blue-600">
                        {c.project?.toUpperCase()}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{c.logged_at || c.updated_at}</span>
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{c.snapshot || "(내용 없음)"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 알림 · CEO 결정 */}
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>알림 · CEO 결정</h2>
              <Link href="/decisions" className="text-xs" style={{ color: "var(--accent)" }}>전체 →</Link>
            </div>
            {loading ? (
              <div className="text-sm py-4 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
            ) : (
              <div className="space-y-2">
                {alerts.slice(0, 3).map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: "var(--bg-hover)" }}>
                    <span style={{ color: "var(--danger)" }}>⚠</span>
                    <span style={{ color: "var(--text-primary)" }}>{a.message || a.title || JSON.stringify(a)}</span>
                  </div>
                ))}
                {ceoDecisions.slice(0, 3).map((d: any, i: number) => (
                  <div key={`d-${i}`} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: "var(--bg-hover)" }}>
                    <span style={{ color: "var(--accent)" }}>🎯</span>
                    <span style={{ color: "var(--text-primary)" }}>{d.content || d.decision || d.message || JSON.stringify(d)}</span>
                  </div>
                ))}
                {alerts.length === 0 && ceoDecisions.length === 0 && (
                  <div className="text-sm py-2 text-center" style={{ color: "var(--text-secondary)" }}>알림 없음</div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
