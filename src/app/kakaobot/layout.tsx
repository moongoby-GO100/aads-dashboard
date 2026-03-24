"use client";
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
  { href: "/kakaobot/settings", label: "설정", icon: "⚙️" },
];

export default function KakaoBotLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* 서브 네비게이션 */}
      <div
        className="shrink-0 overflow-x-auto scrollbar-hide"
        style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1 px-3 md:px-6 py-2 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                style={{
                  background: isActive ? "var(--accent)" : "transparent",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      {/* 페이지 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
