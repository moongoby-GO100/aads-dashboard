import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import TodoPanel from "../../../src/app/chat/TodoPanel";
import { useSessionTodos } from "../../../src/app/chat/useSessionTodos";
import type { ScreenSize } from "../../../src/app/chat/types";

declare global {
  interface Window { __setSession?: (id: string) => void }
}

function Harness() {
  const params = new URLSearchParams(window.location.search);
  const screenSize = (params.get("screen") || "desktop") as ScreenSize;
  const [sessionId, setSessionId] = useState(params.get("session") || "s-main");
  const activeSessionRef = useRef<string | null>(sessionId);
  const todos = useSessionTodos(activeSessionRef);
  const { refresh } = todos;

  useEffect(() => {
    window.__setSession = setSessionId;
  }, []);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    void refresh(sessionId);
    const timer = window.setInterval(() => void refresh(sessionId), 30000);
    return () => window.clearInterval(timer);
  }, [sessionId, refresh]);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--ct-bg)", color: "var(--ct-text)" }}>
      <header data-testid="chat-header" style={{ height: 48, flexShrink: 0, borderBottom: "1px solid var(--ct-border)", padding: "0 12px", display: "flex", alignItems: "center" }}>
        채팅 헤더 · {sessionId}
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>메시지 영역</main>
      <div data-testid="chat-input-area" style={{ flexShrink: 0, padding: 12, borderTop: "1px solid var(--ct-border)", background: "var(--ct-sb)" }}>
        {(todos.items.length > 0 || todos.loading || todos.error) && (
          <TodoPanel key={sessionId} todos={todos} sessionId={sessionId} screenSize={screenSize} />
        )}
        <textarea data-testid="chat-textarea" style={{ width: "100%", height: 64, boxSizing: "border-box" }} placeholder="메시지 입력" />
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
