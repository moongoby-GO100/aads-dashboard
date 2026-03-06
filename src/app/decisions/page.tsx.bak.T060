"use client";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchAll = async (d: number) => {
    setLoading(true);
    await Promise.allSettled([
      api.getCeoDecisions(d)
        .then((r) => setDecisions(Array.isArray(r.data) ? r.data : Array.isArray(r.decisions) ? r.decisions : []))
        .catch(() => {}),
      api.getAlerts()
        .then((r) => setAlerts(Array.isArray(r.alerts) ? r.alerts : []))
        .catch(() => {}),
    ]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(days); }, [days]);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="CEO Decisions" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* 기간 필터 */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>기간:</span>
          {[7, 14, 30, 90].map((d) => (
            <button key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={days === d
                ? { background: "var(--accent)", color: "#fff" }
                : { border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }
              }
            >
              {d}일
            </button>
          ))}
          <button
            onClick={() => fetchAll(days)}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CEO 결정 타임라인 */}
            <div>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                CEO 결정 ({decisions.length}건)
              </h2>
              {decisions.length === 0 ? (
                <div className="rounded-xl p-6 text-center"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  CEO 결정 데이터가 없습니다
                </div>
              ) : (
                <div className="space-y-3">
                  {decisions.map((d: any, i: number) => (
                    <div key={d.id || i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: "var(--accent)" }} />
                        {i < decisions.length - 1 && (
                          <div className="w-0.5 flex-1 my-1" style={{ background: "var(--border)" }} />
                        )}
                      </div>
                      <div className="flex-1 pb-3 rounded-xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                          {d.created_at || d.timestamp || d.date || ""}
                        </p>
                        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {d.content || d.decision || d.message || JSON.stringify(d)}
                        </p>
                        {d.project && (
                          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded"
                            style={{ background: "rgba(59,130,246,0.2)", color: "var(--accent)" }}>
                            {d.project}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 알림 목록 */}
            <div>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                알림 ({alerts.length}건)
              </h2>
              {alerts.length === 0 ? (
                <div className="rounded-xl p-6 text-center"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  ✅ 알림 없음
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a: any, i: number) => {
                    const severity = a.severity || a.level || "warning";
                    const color = severity === "critical" ? "var(--danger)" : "var(--warning)";
                    return (
                      <div key={i} className="rounded-xl p-3"
                        style={{ background: "var(--bg-card)", border: `1px solid ${color}` }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color }}>
                            {severity === "critical" ? "🔴" : "⚠️"}
                          </span>
                          <span className="text-xs font-semibold" style={{ color }}>
                            {severity.toUpperCase()}
                          </span>
                          {a.project && (
                            <span className="text-xs px-1.5 py-0.5 rounded ml-auto"
                              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                              {a.project}
                            </span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {a.message || a.title || JSON.stringify(a)}
                        </p>
                        {a.created_at && (
                          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{a.created_at}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
