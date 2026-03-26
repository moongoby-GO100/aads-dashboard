"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import KakaoBotHeader from "@/components/KakaoBotHeader";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token")
    || document.cookie.split("; ").find(r => r.startsWith("aads_token="))?.split("=")[1]
    || null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}


interface Stats {
  total_contacts: number;
  total_templates: number;
  total_scheduled: number;
  total_sent: number;
  upcoming_anniversaries: number;
}

const menuCards = [
  { href: "/kakaobot/contacts", icon: "👥", title: "연락처 관리", desc: "친구·가족·거래처 연락처와 관계를 관리합니다", color: "#3C1E1E" },
  { href: "/kakaobot/anniversaries", icon: "📅", title: "기념일 캘린더", desc: "생일·결혼기념일 등 중요한 날을 놓치지 마세요", color: "#8b5cf6" },
  { href: "/kakaobot/templates", icon: "📝", title: "템플릿 관리", desc: "카테고리별 메시지 템플릿을 관리합니다", color: "#f59e0b" },
  { href: "/kakaobot/ai-writer", icon: "✨", title: "AI 문구 생성기", desc: "AI가 상황에 맞는 메시지 3개를 추천합니다", color: "#ec4899" },
  { href: "/kakaobot/scheduled", icon: "⏰", title: "예약 발송", desc: "예약된 메시지를 확인하고 관리합니다", color: "#22c55e" },
  { href: "/kakaobot/history", icon: "📊", title: "발송 이력", desc: "발송 기록과 통계를 확인합니다", color: "#06b6d4" },
  { href: "/kakaobot/settings", icon: "⚙️", title: "설정", desc: "자동발송, 기본 톤, 채널 설정", color: "#64748b" },
];

export default function KakaoBotDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${"/api/v1"}/kakao-bot/stats`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "#FAFAFA" }}>
      <KakaoBotHeader title="💬 카카오봇 대시보드" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">

        {/* 상단 통계 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "연락처", value: stats?.total_contacts, color: "#3C1E1E" },
            { label: "템플릿", value: stats?.total_templates, color: "#f59e0b" },
            { label: "예약 발송", value: stats?.total_scheduled, color: "#22c55e" },
            { label: "총 발송", value: stats?.total_sent, color: "#8b5cf6" },
            { label: "다가오는 기념일", value: stats?.upcoming_anniversaries, color: "#ec4899" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <p className="text-xs mb-1" style={{ color: "#6B7280" }}>{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>
                {loading ? "—" : (s.value ?? 0)}
              </p>
            </div>
          ))}
        </div>

        {/* 기능 카드 그리드 */}
        <h2 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>기능 메뉴</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {menuCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl p-5 block transition-all hover:scale-[1.02]"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: "#1A1A1A" }}>{card.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>{card.desc}</p>
              <div className="mt-3 text-xs font-medium" style={{ color: card.color }}>바로가기 →</div>
            </Link>
          ))}
        </div>

        {/* 빠른 시작 가이드 */}
        <div className="mt-6 rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>💡 빠른 시작 가이드</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "#FFF9DB", color: "#3C1E1E", fontWeight: "700" }}>1</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "#1A1A1A" }}>연락처 등록</p>
                <p className="text-xs" style={{ color: "#6B7280" }}>발송 대상의 이름, 관계, 기념일을 등록합니다</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "#FFF9DB", color: "#3C1E1E", fontWeight: "700" }}>2</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "#1A1A1A" }}>템플릿 선택 or AI 생성</p>
                <p className="text-xs" style={{ color: "#6B7280" }}>준비된 템플릿을 쓰거나 AI가 문구를 만들어줍니다</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "#FFF9DB", color: "#3C1E1E", fontWeight: "700" }}>3</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "#1A1A1A" }}>예약 발송</p>
                <p className="text-xs" style={{ color: "#6B7280" }}>원하는 시간에 자동으로 카카오톡이 발송됩니다</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
