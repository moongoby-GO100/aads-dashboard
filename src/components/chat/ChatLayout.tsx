"use client";
import { useState, useCallback } from "react";
import ChatSidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

interface ChatLayoutProps {
  children: React.ReactNode;
  artifactPanel?: React.ReactNode;
  activeSessionId?: string;
  onSelectSession?: (sessionId: string, workspaceId: string) => void;
  onNewSession?: (workspaceId: string) => void;
}

export default function ChatLayout({
  children,
  artifactPanel,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: ChatLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string, workspaceId: string) => {
      onSelectSession?.(sessionId, workspaceId);
      setMobileSidebarOpen(false);
    },
    [onSelectSession]
  );

  const handleNewSession = useCallback(
    (workspaceId: string) => {
      onNewSession?.(workspaceId);
      setMobileSidebarOpen(false);
    },
    [onNewSession]
  );

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "var(--ct-bg)" }}
    >
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar — desktop: inline, mobile: overlay */}
      <div
        className={`
          fixed top-0 left-0 h-full z-50 lg:relative lg:z-auto
          transition-transform duration-300
          ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <ChatSidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onSelectSession={handleSelectSession}
          activeSessionId={activeSessionId}
          onNewSession={handleNewSession}
        />
      </div>

      {/* Center — main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{
            background: "var(--ct-card)",
            borderBottom: "1px solid var(--ct-border)",
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-sm"
            style={{ color: "var(--ct-text-muted)" }}
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="사이드바 열기"
          >
            ☰
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle />
            <a
              href="/"
              className="text-xs px-3 py-1 rounded-lg transition-colors"
              style={{
                color: "var(--ct-text-muted)",
                border: "1px solid var(--ct-border)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--ct-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "transparent")
              }
            >
              Dashboard
            </a>
          </div>
        </header>

        {/* Chat stream area */}
        <main className="flex-1 overflow-hidden min-w-0">{children}</main>
      </div>

      {/* Right artifact panel — slot reserved (AADS-172-C) */}
      {artifactPanel && (
        <div
          className="hidden xl:flex flex-col flex-shrink-0"
          style={{
            width: "360px",
            minWidth: "360px",
            background: "var(--ct-card)",
            borderLeft: "1px solid var(--ct-border)",
          }}
        >
          {artifactPanel}
        </div>
      )}
    </div>
  );
}
