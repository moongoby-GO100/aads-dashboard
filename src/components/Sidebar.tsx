"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🏠", adminOnly: true },
  { href: "/chat", label: "AI Chat", icon: "💬", highlight: true },
  { href: "/assistant", label: "Assistant Hub", icon: "🧭", adminOnly: true },
  { href: "/braming", label: "브레인스토밍", icon: "🧠" },
  { href: "/project-status", label: "Project Status", icon: "📊", adminOnly: true },
  { href: "/conversations", label: "Conversations", icon: "🗨️", adminOnly: true },
  { href: "/channels", label: "대화창 관리", icon: "📌", adminOnly: true },
  { href: "/managers", label: "Managers", icon: "👥", adminOnly: true },
  { href: "/team", label: "Team", icon: "👥" },
  { href: "/agenda", label: "아젠다", icon: "📌" },
  { href: "/decisions", label: "CEO Decisions", icon: "🎯", adminOnly: true },
  { href: "/tasks", label: "Tasks", icon: "📋", adminOnly: true },
  { href: "/docs", label: "문서 통합", icon: "📄" },
  { href: "/design/modifications", label: "Design Studio", icon: "🎨", adminOnly: true },
  { href: "/projects", label: "Pipeline", icon: "🔧", adminOnly: true },
  { href: "/ops", label: "운영 현황", icon: "📊", adminOnly: true },
  { href: "/ops/recovery", label: "Recovery", icon: "🔄", adminOnly: true },
  { href: "/ops/servers", label: "Servers", icon: "🖥️", adminOnly: true },
  { href: "/ops/memory", label: "메모리", icon: "🧠", adminOnly: true },
  { href: "/ops/pc-agents", label: "PC Agent", icon: "💻", adminOnly: true },
  { href: "/ops/mobile-agent", label: "Mobile Agent", icon: "📱", adminOnly: true },
  { href: "/lessons", label: "교훈", icon: "💡", adminOnly: true },
  { href: "/flow", label: "FLOW", icon: "🔄", adminOnly: true },
  { href: "/reports", label: "Reports", icon: "📊", adminOnly: true },
  { href: "/kakaobot", label: "KakaoBot", icon: "💬" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/admin/users", label: "사용자 현황", icon: "👤", adminOnly: true },
  { href: "/admin/prompts", label: "Prompts", icon: "📝", adminOnly: true },
  { href: "/admin/tasks", label: "Task Board", icon: "🗂️", adminOnly: true },
  { href: "/admin/agents", label: "Agent Registry", icon: "🧩", adminOnly: true },
  { href: "/admin/governance", label: "Governance", icon: "🏛️", adminOnly: true },
  { href: "/admin/model-routing", label: "모델 라우팅", icon: "🧭", adminOnly: true },
  { href: "/admin/model-parity", label: "모델 패리티", icon: "⚖️", adminOnly: true },
  { href: "/admin/deploy", label: "배포 현황", icon: "🚀", adminOnly: true },
  { href: "/admin/sessions", label: "세션 리플레이", icon: "📹", adminOnly: true },
  { href: "/admin/emergency", label: "Emergency", icon: "🚨", adminOnly: true },
  { href: "/server-status", label: "Server Status", icon: "🖥️", adminOnly: true },
];

interface SidebarProps {
  isOpen: boolean;
  isInternalAdmin: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function Sidebar({ isOpen, isInternalAdmin, onOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <button
        className="fixed top-3 left-3 z-50 md:hidden text-white rounded p-2 leading-none"
        style={{ background: "var(--bg-card)" }}
        onClick={onOpen}
        aria-label="메뉴 열기"
      >
        ☰
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-56 flex flex-col
          transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:h-screen md:z-auto
        `}
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderRight: "1px solid var(--border)" }}
      >
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--accent)" }}>AADS</h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Autonomous AI Dev System</p>
          </div>
          <button
            className="md:hidden text-lg leading-none"
            style={{ color: "var(--text-secondary)" }}
            onClick={onClose}
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.filter((item) => isInternalAdmin || !item.adminOnly).map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                style={isActive
                  ? { background: "var(--accent)", color: "#fff" }
                  : "highlight" in item && item.highlight
                    ? { color: "#a78bfa", fontWeight: 600 }
                    : { color: "var(--text-secondary)" }
                }
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
          <a
            href="/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full"
            style={{ background: "var(--accent)", color: "#fff" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--accent-hover)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
          >
            <span>💬</span>
            새 채팅 열기
          </a>
        </div>
      </aside>
    </>
  );
}
