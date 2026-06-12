"use client";
import { memo, RefObject, type CSSProperties } from "react";
import Link from "next/link";
import { syncTokenCookieFromStorage } from "@/lib/auth";
import type { Workspace, ChatSession, Theme, ScreenSize } from "./types";

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  CTO: "CTO",
  PM: "PM",
  Developer: "Dev",
  QA: "QA",
  Ops: "Ops",
  PromptEngineer: "Prompt",
  Analyst: "Analyst",
};

function getWorkspaceDefaultRole(workspace?: Workspace): string {
  const value = String(workspace?.settings?.default_role_key || "");
  return ROLE_LABELS[value] ? value : "CEO";
}

export interface ChatSidebarProps {
  screenSize: ScreenSize;
  leftOpen: boolean;
  setLeftOpen: (v: boolean) => void;
  mobileOverlay: "sidebar" | "artifact" | null;
  setMobileOverlay: (v: "sidebar" | "artifact" | null) => void;
  activeWsObj: Workspace | undefined;
  activeWsName: string;
  workspaces: Workspace[];
  activeWs: string | null;
  onWorkspaceToggle: (workspaceId: string) => void;
  expandedWorkspaceIds: string[];
  workspaceSessions: Record<string, ChatSession[]>;
  workspaceSessionLoading: Record<string, boolean>;
  workspaceSessionErrors: Record<string, string | null>;
  filteredSessions: ChatSession[];
  renaming: { id: string; value: string } | null;
  setRenaming: (v: { id: string; value: string } | null) => void;
  commitRename: () => void;
  activeSession: ChatSession | null;
  onSessionSelect: (s: ChatSession) => void;
  isInitialLoadRef: RefObject<boolean>;
  onSessionContextMenu: (e: React.MouseEvent, s: ChatSession) => void;
  search: string;
  setSearch: (v: string) => void;
  createSession: () => void;
  deleteSession: (id: string) => void;
  setShowAddProject: (v: boolean) => void;
  theme: Theme;
  toggleTheme: () => void;
  tagFilter: string | null;
  setTagFilter: (v: string | null) => void;
  allTags: string[];
}

/** 좌측 사이드바 — 세션 목록, 워크스페이스, 테마 토글 */
const ChatSidebar = memo(function ChatSidebar(props: ChatSidebarProps) {
  const {
    screenSize, leftOpen, setLeftOpen,
    mobileOverlay, setMobileOverlay,
    activeWsObj, activeWsName, workspaces, activeWs, onWorkspaceToggle,
    expandedWorkspaceIds, workspaceSessions, workspaceSessionLoading, workspaceSessionErrors,
    filteredSessions, renaming, setRenaming, commitRename,
    activeSession, onSessionSelect, isInitialLoadRef,
    onSessionContextMenu, search, setSearch,
    createSession, deleteSession, setShowAddProject, theme, toggleTheme,
    tagFilter, setTagFilter, allTags,
  } = props;

  const showLeftSidebar = screenSize === "desktop" ? leftOpen : mobileOverlay === "sidebar";

  return (
    <div
      style={{
        width: screenSize === "desktop" ? (leftOpen ? "280px" : "60px") : "280px",
        minWidth: screenSize === "desktop" ? (leftOpen ? "280px" : "60px") : "280px",
        background: "var(--ct-sb)",
        borderRight: "1px solid var(--ct-border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.3s, min-width 0.3s, transform 0.3s",
        overflow: "hidden",
        flexShrink: 0,
        // On non-desktop, position as overlay
        ...(screenSize !== "desktop"
          ? {
              position: "fixed",
              left: 0,
              top: 0,
              height: "100%",
              zIndex: 200,
              transform: showLeftSidebar ? "translateX(0)" : "translateX(-100%)",
              boxShadow: showLeftSidebar ? "4px 0 20px rgba(0,0,0,0.3)" : "none",
            }
          : {}),
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: "14px 12px",
          borderBottom: "1px solid var(--ct-border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {leftOpen || screenSize !== "desktop" ? (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--ct-accent)" }}>
                CEO Chat
              </div>
              <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
                AI 채팅 허브
              </div>
            </div>
            <button
              onClick={() =>
                screenSize === "desktop" ? setLeftOpen(false) : setMobileOverlay(null)
              }
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "16px",
                padding: "4px",
                borderRadius: "4px",
              }}
              title="사이드바 접기"
            >
              ◀
            </button>
          </>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ct-accent)",
              fontSize: "22px",
              width: "100%",
              textAlign: "center",
              padding: "4px",
            }}
            title="사이드바 펼치기"
          >
            💬
          </button>
        )}
      </div>

      {leftOpen || screenSize !== "desktop" ? (
        <>
          {/* New Chat + Search */}
          <div style={{ padding: "12px" }}>
            <button
              onClick={() => createSession()}
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "var(--ct-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ct-accent-h)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ct-accent)")}
            >
              ✏️ 새 대화 ({activeWsObj?.icon || "📁"} {activeWsName.replace(/^\[.*?\]\s*/, "")})
            </button>
            <input
              type="text"
              placeholder="세션 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "7px 10px",
                fontSize: "12px",
                background: "var(--ct-input)",
                color: "var(--ct-text)",
                border: "1px solid var(--ct-border)",
                borderRadius: "6px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {/* 태그 필터 칩 */}
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
                <button
                  onClick={() => setTagFilter(null)}
                  style={{
                    padding: "2px 8px", fontSize: "10px", borderRadius: "10px",
                    background: !tagFilter ? "var(--ct-accent)" : "var(--ct-hover)",
                    color: !tagFilter ? "#fff" : "var(--ct-text2)",
                    border: "1px solid var(--ct-border)", cursor: "pointer",
                  }}
                >
                  전체
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                    style={{
                      padding: "2px 8px", fontSize: "10px", borderRadius: "10px",
                      background: tagFilter === t ? "var(--ct-accent)" : "var(--ct-hover)",
                      color: tagFilter === t ? "#fff" : "var(--ct-text2)",
                      border: "1px solid var(--ct-border)", cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Workspace + Sessions */}
          <div style={{ flex: 1, overflowY: "auto", contain: "content", padding: "0 8px" }}>
            {workspaces.map((ws) => (
              <div key={ws.id} style={{ marginBottom: "4px" }}>
                {/* Workspace header */}
                <button
                  onClick={() => onWorkspaceToggle(ws.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    background: "none",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    color: activeWs === ws.id
                      ? "var(--ct-accent)"
                      : expandedWorkspaceIds.includes(ws.id)
                        ? "var(--ct-text)"
                        : "var(--ct-text2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>{ws.icon || "📁"}</span>
                  <span style={{ flex: 1 }}>{ws.name}</span>
                  <span style={{ fontSize: "10px" }}>
                    {expandedWorkspaceIds.includes(ws.id) ? "▾" : "▸"}
                  </span>
                </button>

                {/* Sessions */}
                {expandedWorkspaceIds.includes(ws.id) && (() => {
                  const sourceSessions = workspaceSessions[ws.id] || (activeWs === ws.id ? filteredSessions : []);
                  const visibleSessions = sourceSessions.filter((s) => {
                    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
                    if (tagFilter && !(s.tags || []).includes(tagFilter)) return false;
                    return true;
                  });
                  const pinned = visibleSessions.filter((s) => s.pinned);
                  const unpinned = visibleSessions.filter((s) => !s.pinned);
                  const workspaceDefaultRole = getWorkspaceDefaultRole(ws);
                  const sessionRoleLabel = (s: ChatSession) => ROLE_LABELS[s.role_key || workspaceDefaultRole] || s.role_key || workspaceDefaultRole;
                  const actionStyle = (isActive: boolean): CSSProperties => ({
                    width: "22px",
                    height: "22px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    borderRadius: "5px",
                    background: isActive ? "rgba(255,255,255,0.18)" : "var(--ct-hover)",
                    color: isActive ? "#fff" : "var(--ct-text2)",
                    cursor: "pointer",
                    fontSize: "11px",
                    flexShrink: 0,
                  });
                  const renderSession = (s: ChatSession) => (
                    <div key={s.id} style={{ marginBottom: "1px" }}>
                      {renaming?.id === s.id ? (
                        <div style={{ padding: "3px 6px" }}>
                          <input
                            autoFocus
                            value={renaming.value}
                            onChange={(e) =>
                              setRenaming({ id: s.id, value: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            onBlur={commitRename}
                            style={{
                              width: "100%",
                              padding: "5px 8px",
                              fontSize: "12px",
                              background: "var(--ct-input)",
                              color: "var(--ct-text)",
                              border: "1px solid var(--ct-accent)",
                              borderRadius: "4px",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          onContextMenu={(e) => onSessionContextMenu(e, s)}
                          style={{
                            display: "flex",
                            alignItems: "stretch",
                            gap: "4px",
                            padding: "2px 4px",
                            borderRadius: "7px",
                            background: activeSession?.id === s.id ? "var(--ct-accent)" : "transparent",
                          }}
                        >
                          <a
                            href={`/chat#${s.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              isInitialLoadRef.current = true;
                              onSessionSelect(s);
                              if (screenSize !== "desktop") setMobileOverlay(null);
                            }}
                            style={{
                              display: "block",
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              padding: "5px 6px",
                              fontSize: "12px",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              color: activeSession?.id === s.id ? "#fff" : "var(--ct-text2)",
                              overflow: "hidden",
                              textDecoration: "none",
                              fontFamily: "inherit",
                              boxSizing: "border-box",
                            }}
                            onMouseEnter={(e) => {
                              if (activeSession?.id !== s.id) e.currentTarget.style.background = "var(--ct-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (activeSession?.id !== s.id) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              {s.pinned && <span style={{ fontSize: "10px", flexShrink: 0 }}>📌</span>}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {s.title || "새 대화"}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                opacity: 0.72,
                                marginTop: "2px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span>{s.message_count ?? 0}개 메시지</span>
                              <span
                                style={{
                                  padding: "0 4px",
                                  borderRadius: "5px",
                                  background: activeSession?.id === s.id ? "rgba(255,255,255,0.2)" : "var(--ct-hover)",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                }}
                              >
                                {sessionRoleLabel(s)}
                              </span>
                              {(s.tags || []).length > 0 && (
                                <span style={{ display: "inline-flex", gap: "2px", marginLeft: "2px" }}>
                                  {s.tags.slice(0, 2).map((t) => (
                                    <span
                                      key={t}
                                      style={{
                                        padding: "0 4px",
                                        borderRadius: "6px",
                                        background: activeSession?.id === s.id ? "rgba(255,255,255,0.2)" : "var(--ct-hover)",
                                        fontSize: "9px",
                                      }}
                                    >
                                      {t}
                                    </span>
                                  ))}
                                  {s.tags.length > 2 && (
                                    <span style={{ fontSize: "9px" }}>+{s.tags.length - 2}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </a>
                          <div style={{ display: "flex", alignItems: "center", gap: "2px", paddingRight: "2px" }}>
                            <button
                              title="새창에서 열기"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`${window.location.origin}/chat#${s.id}`, "_blank");
                              }}
                              style={actionStyle(activeSession?.id === s.id)}
                            >
                              ↗
                            </button>
                            <button
                              title="이름 수정"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenaming({ id: s.id, value: s.title });
                              }}
                              style={actionStyle(activeSession?.id === s.id)}
                            >
                              ✎
                            </button>
                            <button
                              title="삭제"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(s.id);
                              }}
                              style={actionStyle(activeSession?.id === s.id)}
                            >
                              ×
                            </button>
                            <button
                              title="더보기"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSessionContextMenu(e, s);
                              }}
                              style={actionStyle(activeSession?.id === s.id)}
                            >
                              ⋯
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <>
                      {workspaceSessionLoading[ws.id] && (
                        <div style={{
                          padding: "8px 12px",
                          fontSize: "11px",
                          color: "var(--ct-text2)",
                        }}>
                          세션 불러오는 중...
                        </div>
                      )}
                      {workspaceSessionErrors[ws.id] && (
                        <div style={{
                          padding: "8px 12px",
                          fontSize: "11px",
                          color: "var(--ct-warn)",
                        }}>
                          {workspaceSessionErrors[ws.id]}
                        </div>
                      )}
                      {!workspaceSessionLoading[ws.id] && !workspaceSessionErrors[ws.id] && visibleSessions.length === 0 && (
                        <div style={{
                          padding: "8px 12px",
                          fontSize: "11px",
                          color: "var(--ct-text2)",
                        }}>
                          세션 없음
                        </div>
                      )}
                      {pinned.map(renderSession)}
                      {pinned.length > 0 && unpinned.length > 0 && (
                        <div style={{
                          height: "1px",
                          background: "var(--ct-border)",
                          margin: "4px 10px",
                          opacity: 0.6,
                        }} />
                      )}
                      {unpinned.map(renderSession)}
                    </>
                  );
                })()}
              </div>
            ))}

            {workspaces.length === 0 && (
              <div
                style={{
                  padding: "20px 10px",
                  fontSize: "12px",
                  color: "var(--ct-text2)",
                  textAlign: "center",
                }}
              >
                워크스페이스 로딩 중...
              </div>
            )}
          </div>

          {/* 프로젝트 추가 버튼 */}
          <div style={{ padding: "4px 12px" }}>
            <button
              onClick={() => setShowAddProject(true)}
              style={{
                width: "100%",
                padding: "6px",
                background: "none",
                border: "1px dashed var(--ct-border)",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ct-accent)"; e.currentTarget.style.color = "var(--ct-accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ct-border)"; e.currentTarget.style.color = "var(--ct-text2)"; }}
            >
              + 프로젝트 추가
            </button>
          </div>

          {/* Sidebar Footer */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid var(--ct-border)",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "라이트 모드" : "다크 모드"}
              style={{
                flex: 1,
                padding: "7px",
                background: "var(--ct-hover)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--ct-text)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              {theme === "dark" ? "☀️ 라이트" : "🌙 다크"}
            </button>
            <Link
              href="/"
              onClick={() => syncTokenCookieFromStorage()}
              style={{
                padding: "7px 10px",
                background: "var(--ct-hover)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "13px",
                textDecoration: "none",
              }}
              title="대시보드로"
            >
              🏠
            </Link>
            <a
              href="/memory"
              style={{
                padding: "7px 10px",
                background: "var(--ct-hover)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "13px",
                textDecoration: "none",
              }}
              title="AI Memory"
            >
              🧠
            </a>
            <a
              href="/settings"
              style={{
                padding: "7px 10px",
                background: "var(--ct-hover)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "13px",
                textDecoration: "none",
              }}
              title="설정"
            >
              ⚙️
            </a>
          </div>
        </>
      ) : (
        /* Icon-only mode */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "12px 0",
            flex: 1,
          }}
        >
          <button
            onClick={() => createSession()}
            title="새 대화"
            style={{
              background: "var(--ct-accent)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              color: "#fff",
              width: "40px",
              height: "40px",
              fontSize: "16px",
            }}
          >
            ✏️
          </button>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => { onWorkspaceToggle(ws.id); setLeftOpen(true); }}
              title={ws.name}
              style={{
                background:
                  activeWs === ws.id ? "var(--ct-accent)" : "var(--ct-hover)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                color: activeWs === ws.id ? "#fff" : "var(--ct-text2)",
                width: "40px",
                height: "40px",
                fontSize: "14px",
              }}
            >
              {ws.icon || "📁"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            style={{
              background: "none",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              color: "var(--ct-text2)",
              width: "40px",
              height: "40px",
              fontSize: "16px",
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      )}
    </div>

  );
});

ChatSidebar.displayName = "ChatSidebar";
export default ChatSidebar;
