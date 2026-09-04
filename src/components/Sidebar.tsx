"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_NAV_ITEMS } from "@/lib/navigation";

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
            <h1 className="text-lg font-bold" style={{ color: "var(--accent)" }}>OHVIS</h1>
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
          {APP_NAV_ITEMS.filter((item) => isInternalAdmin || !item.adminOnly).map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                target={"external" in item && item.external ? "_blank" : undefined}
                rel={"external" in item && item.external ? "noopener noreferrer" : undefined}
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
