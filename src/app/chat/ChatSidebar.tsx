"use client";
import { memo, RefObject } from "react";
import type { Workspace, ChatSession, Theme, ScreenSize } from "./types";

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
  setActiveWs: (v: string) => void;
  filteredSessions: ChatSession[];
  renaming: { id: string; value: string } | null;
  setRenaming: (v: { id: string; value: string } | null) => void;
  commitRename: () => void;
  activeSession: ChatSession | null;
  setActiveSession: (s: ChatSession | null) => void;
  isInitialLoadRef: RefObject<boolean>;
  onSessionContextMenu: (e: React.MouseEvent, s: ChatSession) => void;
  search: string;
  setSearch: (v: string) => void;
  createSession: () => void;
  setShowAddProject: (v: boolean) => void;
  theme: Theme;
  toggleTheme: () => void;
}

/** 좌측 사이드바 — 세션 목록, 워크스페이스, 테마 토글 */
const ChatSidebar = memo(function ChatSidebar(props: ChatSidebarProps) {
  const {
    screenSize, leftOpen, setLeftOpen,
    mobileOverlay, setMobileOverlay,
    activeWsObj, activeWsName, workspaces, activeWs, setActiveWs,
    filteredSessions, renaming, setRenaming, commitRename,
    activeSession, setActiveSession, isInitialLoadRef,
    onSessionContextMenu, search, setSearch,
    createSession, setShowAddProject, theme, toggleTheme,
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
          </div>

          {/* Workspace + Sessions */}
          <div style={{ flex: 1, overflowY: "auto", contain: "content", padding: "0 8px" }}>
            {workspaces.map((ws) => (
              <div key={ws.id} style={{ marginBottom: "4px" }}>
                {/* Workspace header */}
                <button
                  onClick={() => setActiveWs(ws.id)}
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
                    color: activeWs === ws.id ? "var(--ct-accent)" : "var(--ct-text2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>{ws.icon || "📁"}</span>
                  <span style={{ flex: 1 }}>{ws.name}</span>
                  {activeWs === ws.id && (
                    <span style={{ fontSize: "10px" }}>▾</span>
                  )}
                </button>

                {/* Sessions */}
                {activeWs === ws.id &&
                  filteredSessions.map((s) => (
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
                        <button
                          onClick={() => {
                            isInitialLoadRef.current = true;
                            setActiveSession(s);
                            if (screenSize !== "desktop") setMobileOverlay(null);
                          }}
                          onContextMenu={(e) => onSessionContextMenu(e, s)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "7px 10px",
                            fontSize: "12px",
                            background:
                              activeSession?.id === s.id ? "var(--ct-accent)" : "none",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color:
                              activeSession?.id === s.id ? "#fff" : "var(--ct-text2)",
                            overflow: "hidden",
                          }}
                          onMouseEnter={(e) => {
                            if (activeSession?.id !== s.id)
                              e.currentTarget.style.background = "var(--ct-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (activeSession?.id !== s.id)
                              e.currentTarget.style.background = "none";
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.title || "새 대화"}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              opacity: 0.65,
                              marginTop: "2px",
                            }}
                          >
                            {s.message_count ?? 0}개 메시지
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
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
            <a
              href="/"
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
            </a>
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
              onClick={() => { setActiveWs(ws.id); setLeftOpen(true); }}
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
