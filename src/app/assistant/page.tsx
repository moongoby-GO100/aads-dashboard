"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface AssistantReadinessResponse {
  generated_at: string;
  mode: string;
  summary: {
    ready: number;
    total: number;
    attention: number;
  };
  connectors: Record<string, {
    status: string;
    ready: boolean;
    detail: string;
    next_action?: string;
    online_count?: number;
  }>;
}

const CONNECTOR_LABELS: Record<string, string> = {
  pc_agent: "PC Agent",
  google_calendar: "Google Calendar",
  gmail: "Gmail",
  kakao: "Kakao",
  files: "파일함",
  approval_policy: "승인 정책",
};

const ACTIONS = [
  { href: "/chat", label: "채팅 실행", detail: "지시, 보고, 작업 요청" },
  { href: "/agenda", label: "아젠다", detail: "미결정 사항과 진행 우선순위" },
  { href: "/ops/pc-agents", label: "PC Agent", detail: "CEO PC 제어와 상태 확인" },
  { href: "/projects", label: "러너", detail: "코드 수정과 승인 대기 작업" },
];

function formatTime(value: string | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchAssistantReadiness(): Promise<AssistantReadinessResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
  const res = await fetch(`${BASE_URL}/assistant/readiness`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<AssistantReadinessResponse>;
}

export default function AssistantHubPage() {
  const [data, setData] = useState<AssistantReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssistantReadiness()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const connectors = useMemo(() => Object.entries(data?.connectors || {}), [data]);
  const ready = data?.summary.ready ?? 0;
  const total = data?.summary.total ?? 0;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Personal Assistant Hub" />
      <main className="flex-1 overflow-auto p-3 md:p-6 space-y-5">
        <section
          className="rounded-lg p-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>CEO 개인비서 모드</h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                채팅, 아젠다, PC Agent, 커넥터 준비 상태를 한 화면에서 점검합니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center min-w-[260px]">
              <div className="rounded-md p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>준비</p>
                <p className="text-xl font-bold" style={{ color: "var(--success)" }}>{loading ? "-" : ready}</p>
              </div>
              <div className="rounded-md p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>전체</p>
                <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{loading ? "-" : total}</p>
              </div>
              <div className="rounded-md p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>기준</p>
                <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{formatTime(data?.generated_at)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-lg p-4 transition-colors"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{action.label}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{action.detail}</p>
            </Link>
          ))}
        </section>

        <section
          className="rounded-lg p-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>개인 데이터 커넥터 준비 상태</h2>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
          ) : error ? (
            <div className="rounded-md p-3 text-sm" style={{ background: "#7f1d1d22", color: "#fca5a5" }}>{error}</div>
          ) : connectors.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>표시할 커넥터가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {connectors.map(([key, item]) => (
                <div
                  key={key}
                  className="rounded-md p-4"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {CONNECTOR_LABELS[key] || key}
                    </p>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: item.ready ? "#064e3b" : item.status === "attention" ? "#78350f" : "#1f2937",
                        color: item.ready ? "#6ee7b7" : item.status === "attention" ? "#fbbf24" : "#d1d5db",
                      }}
                    >
                      {item.ready ? "ready" : item.status}
                    </span>
                  </div>
                  <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{item.detail}</p>
                  {typeof item.online_count === "number" && (
                    <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>online: {item.online_count}</p>
                  )}
                  {item.next_action && (
                    <p className="text-xs mt-2" style={{ color: "#fbbf24" }}>{item.next_action}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
