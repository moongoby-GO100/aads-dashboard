"use client";
import { useEffect, useState } from "react";
import KakaoBotHeader from "@/components/KakaoBotHeader";

interface HistoryItem {
  id: string;
  contact_name: string;
  message: string;
  category: string;
  sent_at: string;
  status: string;
  channel: string;
}

interface HistoryStats {
  total_sent: number;
  this_month: number;
  by_category: Record<string, number>;
  by_month: { month: string; count: number }[];
}

const API = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

const CATEGORY_COLORS: Record<string, string> = {
  birthday: "#ec4899",
  greeting: "#8b5cf6",
  marketing: "#f59e0b",
  thank_you: "#22c55e",
  congratulation: "#06b6d4",
  new_year: "#ef4444",
  custom: "#64748b",
};

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/kakao-bot/history`).then(r => r.ok ? r.json() : { history: [] }),
      fetch(`${API}/kakao-bot/history/stats`).then(r => r.ok ? r.json() : null),
    ])
      .then(([h, s]) => {
        setHistory(h.history || []);
        setStats(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxMonthCount = stats?.by_month ? Math.max(...stats.by_month.map(m => m.count), 1) : 1;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <KakaoBotHeader title="발송 이력 · 통계" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>총 발송</p>
            <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{loading ? "—" : (stats?.total_sent ?? 0)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>이번 달</p>
            <p className="text-2xl font-bold" style={{ color: "#22c55e" }}>{loading ? "—" : (stats?.this_month ?? 0)}</p>
          </div>
          <div className="rounded-xl p-4 col-span-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>카테고리별 발송</p>
            <div className="flex flex-wrap gap-2">
              {stats?.by_category && Object.entries(stats.by_category).map(([cat, cnt]) => (
                <span key={cat} className="text-xs px-2 py-1 rounded-full" style={{ background: `${CATEGORY_COLORS[cat] || "#64748b"}20`, color: CATEGORY_COLORS[cat] || "#64748b" }}>
                  {cat} {cnt}건
                </span>
              ))}
              {!stats?.by_category && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>데이터 없음</span>}
            </div>
          </div>
        </div>

        {/* 월별 차트 (간단 바 차트) */}
        {stats?.by_month && stats.by_month.length > 0 && (
          <div className="rounded-xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>📊 월별 발송 추이</h2>
            <div className="flex items-end gap-2 h-32">
              {stats.by_month.slice(-12).map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>{m.count}</span>
                  <div className="w-full rounded-t" style={{
                    background: "var(--accent)",
                    height: `${Math.max((m.count / maxMonthCount) * 100, 4)}%`,
                    minHeight: "4px",
                  }} />
                  <span className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>{m.month.slice(-2)}월</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 발송 이력 목록 */}
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>📋 최근 발송 이력</h2>
        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : history.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>발송 이력이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(item => (
              <div key={item.id} className="rounded-xl p-4 flex items-center gap-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: "var(--bg-hover)" }}>
                  {item.status === "sent" ? "✅" : "❌"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.contact_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${CATEGORY_COLORS[item.category] || "#64748b"}20`, color: CATEGORY_COLORS[item.category] || "#64748b" }}>
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{item.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{new Date(item.sent_at).toLocaleDateString("ko-KR")}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{item.channel || "카카오톡"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
