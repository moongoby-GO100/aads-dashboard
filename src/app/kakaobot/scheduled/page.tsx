"use client";
import { useEffect, useState, useCallback } from "react";
import KakaoBotHeader from "@/components/KakaoBotHeader";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token")
    || document.cookie.split("; ").find(r => r.startsWith("aads_token="))?.split("=")[1]
    || null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}


interface Scheduled {
  id: string;
  contact_name: string;
  message: string;
  scheduled_at: string;
  status: string;
  category?: string;
  created_at: string;
}

const API = typeof window !== "undefined" ? "/api/v1" : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");
const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "대기중" },
  sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "발송완료" },
  failed: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "실패" },
  cancelled: { bg: "rgba(100,116,139,0.15)", color: "#64748b", label: "취소" },
};

export default function ScheduledPage() {
  const [items, setItems] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchItems = useCallback(() => {
    setLoading(true);
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    fetch(`${API}/kakao-bot/scheduled${q}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { scheduled: [] })
      .then(d => setItems(d.scheduled || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCancel = async (id: string) => {
    if (!confirm("예약을 취소하시겠습니까?")) return;
    await fetch(`${API}/kakao-bot/scheduled/${id}/cancel`, { method: "POST", headers: getAuthHeaders() });
    fetchItems();
  };

  const pending = items.filter(i => i.status === "pending").length;
  const sent = items.filter(i => i.status === "sent").length;
  const failed = items.filter(i => i.status === "failed").length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <KakaoBotHeader title="예약 발송 관리" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 통계 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>대기중</p>
            <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{loading ? "—" : pending}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>발송 완료</p>
            <p className="text-2xl font-bold" style={{ color: "#22c55e" }}>{loading ? "—" : sent}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>실패</p>
            <p className="text-2xl font-bold" style={{ color: "#ef4444" }}>{loading ? "—" : failed}</p>
          </div>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2 mb-4">
          {[
            { key: "all", label: "전체" },
            { key: "pending", label: "대기중" },
            { key: "sent", label: "발송완료" },
            { key: "failed", label: "실패" },
            { key: "cancelled", label: "취소" },
          ].map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className="rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                background: statusFilter === f.key ? "var(--accent)" : "var(--bg-card)",
                color: statusFilter === f.key ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}>{f.label}</button>
          ))}
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-3xl mb-2">⏰</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>예약된 발송이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const st = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
              return (
                <div key={item.id} className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.contact_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        {item.category && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{item.category}</span>}
                      </div>
                      <p className="text-xs line-clamp-2 mb-1" style={{ color: "var(--text-secondary)" }}>{item.message}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        예약: {new Date(item.scheduled_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    {item.status === "pending" && (
                      <button onClick={() => handleCancel(item.id)}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                        취소
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
