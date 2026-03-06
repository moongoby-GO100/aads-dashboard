"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types";

const QUICK_LINKS = [
  { label: "HANDOVER", url: "https://aads.newtalk.kr/api/v1/context/handover", desc: "현재 핸드오버 문서" },
  { label: "CEO DIRECTIVES", url: "https://aads.newtalk.kr/api/v1/context/system/ceo_directives", desc: "CEO 지시사항" },
  { label: "Public Summary", url: "https://aads.newtalk.kr/api/v1/context/public-summary", desc: "공개 요약 정보" },
  { label: "Watchdog Summary", url: "https://aads.newtalk.kr/api/v1/watchdog/summary", desc: "에러 자동감시 현황" },
  { label: "API Docs", url: "https://aads.newtalk.kr/api/v1/docs", desc: "FastAPI Swagger" },
  { label: "API Health", url: "https://aads.newtalk.kr/api/v1/health", desc: "서버 헬스체크" },
];

const SERVER_LABELS: Record<string, string> = {
  "68": "68서버 (AADS 본서버)",
  "211": "211서버 (KIS/GO100)",
  "114": "114서버 (NewTalk/NAS)",
};

function StatusDot({ status, enabled }: { status: string; enabled: boolean }) {
  if (!enabled) return <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>DISABLED</span>;
  const color = status === "ok" ? "var(--success)" : status === "error" ? "var(--danger)" : "var(--text-secondary)";
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
      <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="font-bold text-sm" style={{ color: color || "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [watchdog, setWatchdog] = useState<any>(null);
  const [services, setServices] = useState<any>(null);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchAll = useCallback(async () => {
    try {
      const [h, w, s] = await Promise.allSettled([
        api.getHealth(),
        api.getWatchdogSummary(),
        api.getWatchdogServices(),
      ]);
      if (h.status === "fulfilled") setHealth(h.value);
      if (w.status === "fulfilled") setWatchdog(w.value);
      if (s.status === "fulfilled") setServices(s.value);

      // pending 에러 조회 (Monitor Key 없어도 public 아닌 건 빈 배열)
      try {
        const e = await api.getWatchdogErrors("pending", 10);
        setErrors(Array.isArray(e.errors) ? e.errors : []);
      } catch { setErrors([]); }

      setLastUpdated(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const ok = (v: boolean | undefined) =>
    v === undefined ? "var(--text-secondary)" : v ? "var(--success)" : "var(--danger)";

  const wStats = watchdog?.stats ?? {};
  const svcServers = services?.servers ?? {};
  const allEnabled = Object.values(svcServers).flat().filter((s: any) => s.enabled);
  const allOk = allEnabled.filter((s: any) => s.last_status === "ok");

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Settings" />
      <div className="flex-1 p-3 md:p-6 overflow-auto space-y-5">

        {/* ── 상단 새로고침 ── */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {lastUpdated ? `마지막 갱신: ${lastUpdated} · 30초 자동 갱신` : "로딩 중..."}
          </span>
          <button
            onClick={fetchAll}
            className="text-xs px-3 py-1 rounded-lg"
            style={{ background: "var(--bg-hover)", color: "var(--accent)", border: "1px solid var(--border)" }}
          >
            새로고침
          </button>
        </div>

        {/* ── 1. API + Sandbox 상태 ── */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            AADS API 상태
          </h2>
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
          ) : health ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="서버 상태" value={health.status?.toUpperCase() || "UNKNOWN"}
                color={ok(health.status === "ok")} />
              <StatCard label="Graph DB" value={health.graph_ready ? "READY" : "LOADING"}
                color={ok(health.graph_ready)} />
              <StatCard label="Docker 샌드박스" value={health.sandbox?.status?.toUpperCase() || "—"}
                color={ok(health.sandbox?.status === "ok")} />
              <StatCard label="API 버전" value={health.version || "—"} />
            </div>
          ) : (
            <div className="text-sm font-bold" style={{ color: "var(--danger)" }}>서버 응답 없음</div>
          )}
          {health?.sandbox && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Python 이미지" value={health.sandbox.python_image ? "OK" : "MISSING"}
                color={ok(health.sandbox.python_image)} />
              <StatCard label="Node 이미지" value={health.sandbox.node_image ? "OK" : "MISSING"}
                color={ok(health.sandbox.node_image)} />
              <StatCard label="활성 샌드박스" value={`${health.sandbox.active_sandboxes ?? 0} / ${health.sandbox.max_concurrent ?? 5}`} />
              <StatCard label="Docker 연결" value={health.sandbox.docker_connected ? "연결됨" : "끊김"}
                color={ok(health.sandbox.docker_connected)} />
            </div>
          )}
        </section>

        {/* ── 2. Watchdog 에러 통계 ── */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Watchdog 에러 감시
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: wStats.pending > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                color: wStats.pending > 0 ? "var(--danger)" : "var(--success)",
              }}>
              {wStats.pending > 0 ? `미해결 ${wStats.pending}건` : "전체 해결됨"}
            </span>
          </div>
          {watchdog ? (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
                <StatCard label="총 에러" value={wStats.total_errors ?? 0} />
                <StatCard label="24h" value={wStats.last_24h ?? 0} />
                <StatCard label="미해결" value={wStats.pending ?? 0}
                  color={(wStats.pending ?? 0) > 0 ? "var(--danger)" : "var(--success)"} />
                <StatCard label="자동복구됨" value={wStats.auto_resolved ?? 0}
                  color={(wStats.auto_resolved ?? 0) > 0 ? "var(--success)" : undefined} />
                <StatCard label="수동해결" value={wStats.manual_resolved ?? 0} />
                <StatCard label="복구씨앗" value={wStats.recovery_seeds ?? 0}
                  color={(wStats.recovery_seeds ?? 0) > 0 ? "var(--accent)" : undefined} />
              </div>

              {/* 최근 에러 */}
              {Array.isArray(watchdog.recent_errors) && watchdog.recent_errors.length > 0 && (
                <div>
                  <p className="text-xs mb-2 font-medium" style={{ color: "var(--text-secondary)" }}>최근 에러</p>
                  <div className="space-y-1.5">
                    {watchdog.recent_errors.slice(0, 3).map((e: any, i: number) => (
                      <div key={i} className="rounded-lg px-3 py-2 flex items-start gap-2"
                        style={{ background: "var(--bg-hover)" }}>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)" }}>
                          {e.error_type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{e.message}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {e.server}서버 · {e.source} · {e.occurrence_count}회
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>데이터 없음</div>
          )}
        </section>

        {/* ── 3. 전 서버 감시 서비스 상태 ── */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              전 서버 서비스 감시
            </h2>
            {services && (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {allOk.length} / {allEnabled.length} 정상
              </span>
            )}
          </div>
          {services ? (
            <div className="space-y-4">
              {Object.entries(svcServers).sort().map(([server, svcs]: [string, any]) => (
                <div key={server}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    {SERVER_LABELS[server] || `${server}서버`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(svcs as any[]).map((svc: any) => (
                      <div key={svc.service_name}
                        className="rounded-lg px-3 py-2 flex items-center gap-2"
                        style={{
                          background: "var(--bg-hover)",
                          border: `1px solid ${svc.enabled && svc.last_status !== "ok" ? "rgba(239,68,68,0.3)" : "transparent"}`,
                        }}>
                        <StatusDot status={svc.last_status} enabled={svc.enabled} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                            {svc.service_name}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {svc.check_type}
                            {svc.consecutive_failures > 0 && svc.enabled
                              ? ` · ${svc.consecutive_failures}회 연속 실패`
                              : ""}
                          </p>
                        </div>
                        <span className="text-xs font-bold flex-shrink-0"
                          style={{
                            color: !svc.enabled ? "var(--text-secondary)"
                              : svc.last_status === "ok" ? "var(--success)"
                              : "var(--danger)"
                          }}>
                          {!svc.enabled ? "–" : svc.last_status?.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
          )}
        </section>

        {/* ── 4. 버전 / 인프라 정보 ── */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>인프라 정보</h2>
          <div className="space-y-2 text-sm">
            {[
              ["HANDOVER", "v5.22 (T-038 Watchdog)"],
              ["Dashboard", "v0.5.0 (T-038 settings 강화)"],
              ["68서버", "aads.newtalk.kr · Docker 4컨테이너"],
              ["211서버", "211.188.51.113 · KIS/GO100/ShortFlow"],
              ["114서버", "114서버 · NewTalk/NAS"],
              ["API Base", "https://aads.newtalk.kr/api/v1"],
              ["API Version", health?.version || "—"],
              ["DB", "PostgreSQL 15 (aads-postgres:5433)"],
              ["Watchdog", "aads-watchdog.service · 30초 주기"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-1"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontSize: 12 }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. 빠른 링크 ── */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>빠른 링크</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => (
              <a key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-3 block transition-colors"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--accent)" }}>{link.label}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{link.desc}</p>
              </a>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
