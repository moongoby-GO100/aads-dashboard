"use client";

import React, { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import TerminalPane from "@/components/chat/terminal";

function ChatTerminalPageInner() {
  const searchParams = useSearchParams();
  const preferredSessionId = searchParams.get("session_id");
  const activeSessionId = searchParams.get("chat_session_id");
  const initialCwd = searchParams.get("cwd") || "/root/aads";
  const modeParam = searchParams.get("mode");
  const initialSessionMode = modeParam === "container" ? "container" : "host";

  const pageStyle = useMemo<React.CSSProperties>(() => ({
    minHeight: "100vh",
    background: "radial-gradient(circle at top, rgba(30,41,59,0.95), rgba(2,6,23,1))",
    color: "var(--ct-text)",
    padding: "20px",
  }), []);

  return (
    <main style={pageStyle}>
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          background: "rgba(15,23,42,0.84)",
          border: "1px solid rgba(148,163,184,0.16)",
          borderRadius: "18px",
          boxShadow: "0 28px 64px rgba(0,0,0,0.32)",
          padding: "16px",
        }}
      >
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc" }}>AADS Terminal Window</div>
          <div style={{ fontSize: "12px", color: "rgba(226,232,240,0.74)", marginTop: "4px" }}>
            브라우저 새 창 전용 터미널입니다. 기존 세션을 붙여 쓰거나 새 세션을 만들 수 있습니다.
          </div>
        </div>

        <TerminalPane
          activeSessionId={activeSessionId}
          screenSize="desktop"
          panelOpen={true}
          standalone={true}
          preferredSessionId={preferredSessionId}
          initialCwd={initialCwd}
          initialSessionMode={initialSessionMode}
        />
      </div>
    </main>
  );
}

export default function ChatTerminalPage() {
  return (
    <Suspense fallback={null}>
      <ChatTerminalPageInner />
    </Suspense>
  );
}
