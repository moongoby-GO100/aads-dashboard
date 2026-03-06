"use client";
import { useEffect, useState } from "react";
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

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHealth()
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ok = (v: boolean | undefined) =>
    v === undefined ? "var(--text-secondary)" : v ? "var(--success)" : "var(--danger)";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Settings" />
      <div className="flex-1 p-3 md:p-6 overflow-auto space-y-5">

        {/* API 상태 요약 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>시스템 상태</h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
          ) : health ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>서버 상태</p>
                <p className="font-bold" style={{ color: ok(health.status === "ok") }}>
                  {health.status?.toUpperCase() ?? "UNKNOWN"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Graph DB</p>
                <p className="font-bold" style={{ color: ok(health.graph_ready) }}>
                  {health.graph_ready ? "READY" : "LOADING"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>API 버전</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {health.version ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>서버 응답 없음</p>
          )}
        </section>

        {/* 버전 / 인프라 정보 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>버전 정보</h2>
          <div className="space-y-2 text-sm">
            {[
              ["Dashboard", "v0.5.1 (Server Status 분리)"],
              ["HANDOVER", "v5.22 (T-038 Watchdog)"],
              ["서버", "68 (aads.newtalk.kr)"],
              ["API Base", "https://aads.newtalk.kr/api/v1"],
              ["API Version", health?.version ?? "—"],
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

        {/* 빠른 링크 */}
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
