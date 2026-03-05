"use client";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types";

const LINKS = [
  { label: "HANDOVER", url: "https://aads.newtalk.kr/api/v1/context/handover", desc: "현재 핸드오버 문서" },
  { label: "CEO DIRECTIVES", url: "https://aads.newtalk.kr/api/v1/context/ceo-directives", desc: "CEO 지시사항" },
  { label: "Public Summary", url: "https://aads.newtalk.kr/api/v1/context/public-summary", desc: "공개 요약 정보" },
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

  const statusColor = (ok: boolean | undefined) =>
    ok === undefined ? "var(--text-secondary)" : ok ? "var(--success)" : "var(--danger)";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Settings" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 시스템 정보 */}
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>시스템 상태</h2>
          {loading ? (
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
          ) : health ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>서버 상태</p>
                <p className="font-bold" style={{ color: statusColor(health.status === "ok") }}>
                  {health.status?.toUpperCase() || "UNKNOWN"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Graph DB</p>
                <p className="font-bold" style={{ color: statusColor(health.graph_ready) }}>
                  {health.graph_ready ? "READY" : "LOADING"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>버전</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {health.version || "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: "var(--danger)" }}>서버 응답 없음</div>
          )}
        </div>

        {/* 버전 정보 */}
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>버전 정보</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: "var(--text-secondary)" }}>Dashboard</span>
              <span style={{ color: "var(--text-primary)" }}>v0.4.0 (T-049)</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-secondary)" }}>서버</span>
              <span style={{ color: "var(--text-primary)" }}>68 (aads.newtalk.kr)</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-secondary)" }}>API Base</span>
              <span style={{ color: "var(--text-primary)" }}>https://aads.newtalk.kr/api/v1</span>
            </div>
            {health?.version && (
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>API Version</span>
                <span style={{ color: "var(--text-primary)" }}>{health.version}</span>
              </div>
            )}
          </div>
        </div>

        {/* 링크 */}
        <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>빠른 링크</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LINKS.map((link) => (
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
        </div>

      </div>
    </div>
  );
}
