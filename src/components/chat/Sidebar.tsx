"use client";
import { useState, useEffect, useCallback } from "react";
import SidebarHubCard from "./SidebarHubCard";
import { api } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  icon: string;
  description?: string;
  session_count?: number;
}

interface Session {
  session_id: string;
  title: string;
  created_at: string;
  message_count: number;
  workspace_id: string;
}

const WORKSPACE_ICONS: Record<string, string> = {
  CEO: "👑",
  AADS: "🤖",
  SF: "📈",
  KIS: "💹",
  GO100: "🎯",
  NTV2: "📺",
  NAS: "💾",
};

interface ChatSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectSession: (sessionId: string, workspaceId: string) => void;
  activeSessionId?: string;
  onNewSession: (workspaceId: string) => void;
}

export default function ChatSidebar({
  isCollapsed,
  onToggleCollapse,
  onSelectSession,
  activeSessionId,
  onNewSession,
}: ChatSidebarProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    api.getChatWorkspaces().then((data) => {
      const ws: Workspace[] = data?.workspaces || data || [];
      setWorkspaces(ws);
      if (ws.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(ws[0].id);
      }
    }).catch(() => {
      // Fallback static workspaces
      const fallback: Workspace[] = [
        { id: "ceo", name: "CEO", icon: "👑", session_count: 0 },
        { id: "aads", name: "AADS", icon: "🤖", session_count: 0 },
        { id: "sf", name: "SF", icon: "📈", session_count: 0 },
        { id: "kis", name: "KIS", icon: "💹", session_count: 0 },
        { id: "go100", name: "GO100", icon: "🎯", session_count: 0 },
        { id: "ntv2", name: "NTV2", icon: "📺", session_count: 0 },
        { id: "nas", name: "NAS", icon: "💾", session_count: 0 },
      ];
      setWorkspaces(fallback);
      if (!selectedWorkspace) setSelectedWorkspace(fallback[0].id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = useCallback((workspaceId: string) => {
    setLoadingSessions(true);
    api.getChatSessions(workspaceId).then((data) => {
      setSessions(data?.sessions || data || []);
    }).catch(() => {
      setSessions([]);
    }).finally(() => {
      setLoadingSessions(false);
    });
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      loadSessions(selectedWorkspace);
    }
  }, [selectedWorkspace, loadSessions]);

  const handleSelectWorkspace = (id: string) => {
    setSelectedWorkspace(id);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60000) return "방금 전";
      if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
      return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const sidebarWidth = isCollapsed ? "64px" : "280px";

  return (
    <aside
      className="flex flex-col h-full flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
        background: "var(--ct-sidebar-bg)",
        borderRight: "1px solid var(--ct-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ct-border)" }}
      >
        {!isCollapsed && (
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--ct-text)" }}>
              Workspaces
            </h2>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-7 h-7 rounded text-sm transition-colors ml-auto"
          style={{ color: "var(--ct-text-muted)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "var(--ct-hover)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
          title={isCollapsed ? "사이드바 확장" : "사이드바 축소"}
        >
          {isCollapsed ? "▶" : "◀"}
        </button>
      </div>

      {/* Workspace Hub Cards */}
      <div className="p-2 space-y-0.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--ct-border)" }}>
        {workspaces.map((ws) => (
          <SidebarHubCard
            key={ws.id}
            id={ws.id}
            name={ws.name}
            icon={ws.icon || WORKSPACE_ICONS[ws.name] || "📁"}
            sessionCount={ws.session_count || 0}
            isSelected={selectedWorkspace === ws.id}
            isCollapsed={isCollapsed}
            onClick={() => handleSelectWorkspace(ws.id)}
          />
        ))}
      </div>

      {/* Sessions list — hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* New session button */}
          <div className="px-2 pt-2 pb-1 flex-shrink-0">
            <button
              onClick={() => selectedWorkspace && onNewSession(selectedWorkspace)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ background: "var(--ct-accent)", color: "#fff" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--ct-accent-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "var(--ct-accent)")
              }
            >
              <span>+</span>
              <span>새 대화</span>
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto chat-scrollbar px-2 pb-2 space-y-0.5">
            {loadingSessions ? (
              <div className="text-center py-4 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                로딩 중...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-4 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                대화 없음
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => onSelectSession(s.session_id, s.workspace_id)}
                  className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background:
                      activeSessionId === s.session_id
                        ? "var(--ct-hover)"
                        : "transparent",
                    borderLeft:
                      activeSessionId === s.session_id
                        ? "2px solid var(--ct-accent)"
                        : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (activeSessionId !== s.session_id)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--ct-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (activeSessionId !== s.session_id)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                >
                  <div
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--ct-text)" }}
                  >
                    {s.title || "새 대화"}
                  </div>
                  <div
                    className="flex items-center gap-2 mt-0.5"
                    style={{ color: "var(--ct-text-muted)" }}
                  >
                    <span className="text-xs">{formatDate(s.created_at)}</span>
                    {s.message_count > 0 && (
                      <span className="text-xs">{s.message_count}개</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
