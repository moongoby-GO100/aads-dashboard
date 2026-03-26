"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/kakaobot", label: "대시보드", icon: "🏠" },
  { href: "/kakaobot/contacts", label: "연락처", icon: "👥" },
  { href: "/kakaobot/anniversaries", label: "기념일", icon: "📅" },
  { href: "/kakaobot/templates", label: "템플릿", icon: "📝" },
  { href: "/kakaobot/ai-writer", label: "AI 생성", icon: "✨" },
  { href: "/kakaobot/scheduled", label: "예약발송", icon: "⏰" },
  { href: "/kakaobot/history", label: "이력", icon: "📊" },
  { href: "/kakaobot/agent", label: "PC 에이전트", icon: "💻" },
  { href: "/kakaobot/settings", label: "설정", icon: "⚙️" },
];

export default function KakaoBotLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.title = "카카오봇 — AI 메시지 서비스";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#FFE812");
  }, []);

  return (
    <div className="flex flex-col h-full" data-theme="kakaobot" style={{ background: "#FAFAFA", color: "#1A1A1A" }}>
      <div style={{ background: "#FFE812", borderBottom: "1px solid #E5C800", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "20px" }}>💬</span>
        <span style={{ fontSize: "16px", fontWeight: "700", color: "#3C1E1E", letterSpacing: "-0.3px" }}>카카오봇</span>
        <span style={{ fontSize: "11px", color: "#7A4A00", marginLeft: "4px", fontWeight: "500" }}>AI 메시지 서비스</span>
      </div>
      <div className="shrink-0 overflow-x-auto scrollbar-hide" style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
        <div className="flex items-center gap-1 px-3 md:px-6 py-2 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                style={{
                  background: isActive ? "#FFE812" : "transparent",
                  color: isActive ? "#3C1E1E" : "#6B7280",
                  border: isActive ? "1px solid #F5DC00" : "1px solid transparent",
                  fontWeight: isActive ? "600" : "500",
                }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-hidden" style={{ background: "#FAFAFA" }}>{children}</div>
      <div style={{ background: "#FFFFFF", borderTop: "1px solid #E5E7EB", padding: "8px 16px", textAlign: "center" }}>
        <span style={{ fontSize: "11px", color: "#9CA3AF" }}>© 2026 KakaoBot — Powered by AADS</span>
      </div>
    </div>
  );
}
