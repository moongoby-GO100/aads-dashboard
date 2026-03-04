"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const navItems = [
  { href: "/", label: "대시보드", icon: "🏠" },
  { href: "/projects", label: "프로젝트", icon: "📁" },
];

interface SidebarProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Hamburger button - mobile only */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden bg-gray-900 text-white rounded p-2 leading-none"
        onClick={onOpen}
        aria-label="메뉴 열기"
      >
        ☰
      </button>

      {/* Overlay - mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-56 bg-gray-900 text-white flex flex-col
          transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:h-screen md:z-auto
        `}
      >
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-blue-400">AADS</h1>
            <p className="text-xs text-gray-400">Autonomous AI Dev System</p>
          </div>
          {/* X button - mobile only */}
          <button
            className="md:hidden text-gray-400 hover:text-white text-lg leading-none"
            onClick={onClose}
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
          v0.2.0 · Phase 2
        </div>
      </aside>
    </>
  );
}
