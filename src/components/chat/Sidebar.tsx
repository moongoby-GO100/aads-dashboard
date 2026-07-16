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
  id?: string;
  title: string;
  created_at: string;
  message_count: number;
  workspace_id: string;
  role_key?: string | null;
}

interface RoleOption {
  value: string;
  label: string;
  role_category?: string | null;
  role_category_label_ko?: string | null;
  when_to_use?: string[] | null;
  how_to_instruct?: string[] | null;
  instruction_template?: string | null;
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

const COMMON_ROLE_OPTIONS: RoleOption[] = [
  { value: "CTO", label: "CTO" },
  { value: "PM", label: "PM" },
  { value: "Developer", label: "개발" },
  { value: "QA", label: "QA" },
  { value: "Ops", label: "Ops" },
  { value: "PromptEngineer", label: "프롬프트" },
];

const PROJECT_ROLE_OPTIONS: Record<string, RoleOption[]> = {
  AADS: [
    { value: "PromptContextHarnessEngineer", label: "하네스" },
    { value: "DataEngineer", label: "데이터" },
    { value: "SecurityEngineer", label: "보안" },
    { value: "SREDevOps", label: "SRE" },
    { value: "AIMLEngineer", label: "AI·ML" },
    { value: "JudgeEvaluator", label: "평가" },
  ],
  GO100: [
    { value: "QuantAnalyst", label: "퀀트" },
    { value: "RiskManager", label: "리스크" },
    { value: "DataEngineer", label: "데이터" },
    { value: "ResearchAnalyst", label: "리서치" },
    { value: "ComplianceOfficer", label: "컴플" },
  ],
  NTV2: [
    { value: "UXProductDesigner", label: "UX" },
    { value: "GrowthMarketer", label: "성장" },
    { value: "SecurityEngineer", label: "보안" },
    { value: "SREDevOps", label: "SRE" },
    { value: "DataEngineer", label: "데이터" },
  ],
};

const getWorkspaceKey = (workspace?: Workspace) => {
  const name = (workspace?.name || "").toUpperCase();
  if (name.includes("GO100")) return "GO100";
  if (name.includes("NTV2") || name.includes("NT")) return "NTV2";
  if (name.includes("AADS")) return "AADS";
  return "";
};

const getRoleOptions = (workspace?: Workspace) => {
  const projectKey = getWorkspaceKey(workspace);
  const merged = [...COMMON_ROLE_OPTIONS, ...(PROJECT_ROLE_OPTIONS[projectKey] || [])];
  return merged.filter(
    (option, index, list) =>
      list.findIndex((item) => item.value === option.value) === index
  );
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
  const [savingRoleSessionId, setSavingRoleSessionId] = useState<string | null>(null);
  const [roleErrorSessionId, setRoleErrorSessionId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>(COMMON_ROLE_OPTIONS);

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
      return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const selectedWorkspaceItem = workspaces.find((ws) => ws.id === selectedWorkspace);

  useEffect(() => {
    if (!selectedWorkspace) {
      setRoleOptions(COMMON_ROLE_OPTIONS);
      return;
    }

    const fallbackOptions = getRoleOptions(selectedWorkspaceItem);
    let cancelled = false;
    setRoleOptions(fallbackOptions);

    api.getChatWorkspaceRoles(selectedWorkspace)
      .then((data) => {
        const dbRoles = (data?.roles || [])
          .map((role) => {
            const value = String(role.value || role.role || "").trim();
            const ko = String(role.display_name_ko || "").trim();
            const label = String(role.label || (ko ? `${value} / ${ko}` : value)).trim();
            return value
              ? {
                  value,
                  label,
                  role_category: role.role_category,
                  role_category_label_ko: role.role_category_label_ko,
                  when_to_use: role.when_to_use,
                  how_to_instruct: role.how_to_instruct,
                  instruction_template: role.instruction_template,
                }
              : null;
          })
          .filter(Boolean) as RoleOption[];

        if (!cancelled && dbRoles.length > 0) {
          setRoleOptions(dbRoles);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoleOptions(fallbackOptions);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace, selectedWorkspaceItem]);

  const updateSessionRole = async (sessionId: string, roleKey: string) => {
    setSavingRoleSessionId(sessionId);
    setRoleErrorSessionId(null);
    try {
      const updated = await api.updateChatSession(sessionId, { role_key: roleKey });
      setSessions((prev) =>
        prev.map((session) => {
          const currentId = session.session_id ?? session.id ?? "";
          if (currentId !== sessionId) return session;
          return {
            ...session,
            role_key: updated?.role_key ?? roleKey,
          };
        })
      );
    } catch {
      setRoleErrorSessionId(sessionId);
    } finally {
      setSavingRoleSessionId(null);
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
              sessions.map((s) => {
                const sessionId = s.session_id ?? s.id ?? "";
                const isActive = activeSessionId === sessionId;
                const roleKey = (s.role_key || "").trim();
                const isSavingRole = savingRoleSessionId === sessionId;
                const selectedRoleOption = roleOptions.find((role) => role.value === roleKey);
                const roleHelp = selectedRoleOption
                  ? [
                      selectedRoleOption.label,
                      selectedRoleOption.role_category_label_ko
                        ? `분류: ${selectedRoleOption.role_category_label_ko}`
                        : "",
                      selectedRoleOption.when_to_use?.length
                        ? `언제 쓰나: ${selectedRoleOption.when_to_use.join(" / ")}`
                        : "",
                      selectedRoleOption.how_to_instruct?.length
                        ? `지시 팁: ${selectedRoleOption.how_to_instruct.join(" / ")}`
                        : "",
                      selectedRoleOption.instruction_template
                        ? `템플릿: ${selectedRoleOption.instruction_template}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : "";

                return (
                <div
                  key={sessionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSession(sessionId, s.workspace_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSession(sessionId, s.workspace_id);
                    }
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer"
                  style={{
                    background: isActive ? "var(--ct-hover)" : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--ct-accent)"
                      : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--ct-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                >
                  <div
                    className="flex items-center gap-1 text-xs font-medium truncate"
                    style={{ color: "var(--ct-text)" }}
                  >
                    <span className="truncate">{s.title || "새 대화"}</span>
                    {/* 세션 상태 뱃지: 🟢 정상 / 🟡 30턴+ / 🔴 50턴+ */}
                    <span className="flex-shrink-0" style={{ fontSize: "8px" }}>
                      {s.message_count >= 50 ? "🔴" : s.message_count >= 30 ? "🟡" : "🟢"}
                    </span>
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
                  <div className="mt-1 flex items-center gap-1">
                    <select
                      value={roleKey}
                      disabled={isSavingRole}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateSessionRole(sessionId, e.target.value);
                      }}
                      className="min-w-0 max-w-full rounded border px-1.5 py-0.5 text-[11px] outline-none"
                      style={{
                        borderColor: roleKey ? "var(--ct-accent)" : "var(--ct-border)",
                        background: roleKey ? "var(--ct-hover)" : "transparent",
                        color: roleKey ? "var(--ct-text)" : "var(--ct-text-muted)",
                      }}
                      title={roleKey ? "세션 역할 변경" : "세션 역할 지정"}
                    >
                      <option value="">{isSavingRole ? "저장 중..." : "역할 지정"}</option>
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    {roleHelp && (
                      <span
                        className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
                        style={{
                          border: "1px solid var(--ct-border)",
                          color: "var(--ct-text-muted)",
                        }}
                        title={roleHelp}
                      >
                        ?
                      </span>
                    )}
                    {roleErrorSessionId === sessionId && (
                      <span className="text-[10px]" style={{ color: "#ef4444" }}>
                        실패
                      </span>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
