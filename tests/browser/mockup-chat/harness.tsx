import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MockupReviewPanel } from "../../../src/components/MockupReviewPanel";
import { MockupTargetBar } from "../../../src/components/MockupTargetBar";
import { useMockupChatTargets } from "../../../src/app/chat/useMockupChatTargets";
import { captureMockupUiFence, mockupTargetStore, registerMockupChangeAfterSend } from "../../../src/lib/mockupTargetStore";

const SESSION = "3f9d6a52-0c1e-4c2b-9d0a-5b6f7a8c9d01";
// 저장된 내 메시지 id — 실제 채팅은 /chat/messages 로 읽어 오며, 하니스는 같은 모양의 고정 응답을 돌려준다.
const SAVED_MESSAGE_ID = "cccccccc-0000-4000-8000-000000000001";

function Harness() {
  const [panel, setPanel] = useState<{ project: string; reviewId: string } | null>(null);
  const [text, setText] = useState("");
  useMockupChatTargets({ sessionId: SESSION, replyArtifactId: null, artifacts: [], workspaceProject: "AADS" });
  // chat/page.tsx 의 전송 경로와 같은 순서: 대상 판정 → 장전 해제 → 전송 후 저장된 메시지로 접수.
  const send = () => {
    const content = text.trim();
    if (!content) return;
    const sentAt = Date.now();
    const r = mockupTargetStore.sendResolution();
    if (r.kind === "target" && r.target.sessionId === SESSION) {
      mockupTargetStore.disarm();
      void registerMockupChangeAfterSend({
        uiFence: captureMockupUiFence(SESSION), target: r.target, content, sentAt, replyToId: null,
        loadMessages: async () => [{ id: SAVED_MESSAGE_ID, role: "user", content, created_at: new Date(sentAt).toISOString() }],
      });
    }
    setText("");
  };
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--ct-bg)", color: "var(--ct-text)" }}>
      <header style={{ height: 48, flexShrink: 0, borderBottom: "1px solid var(--ct-border)", padding: "0 12px", display: "flex", alignItems: "center" }}>
        채팅 헤더 · 목업 확인 흐름 검증 하니스
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>메시지 영역</main>
      <div style={{ flexShrink: 0, padding: 12, borderTop: "1px solid var(--ct-border)", background: "var(--ct-sb)" }}>
        <MockupTargetBar sessionId={SESSION} onOpen={(t) => setPanel({ project: t.project, reviewId: t.reviewId })} />
        <div style={{ display: "flex", gap: 8 }}>
          <textarea style={{ flex: 1, height: 56, boxSizing: "border-box" }} placeholder="메시지 입력" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="button" style={{ minHeight: 44, minWidth: 56 }} onClick={send}>전송</button>
        </div>
      </div>
      {panel && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 45, display: "flex", boxShadow: "-8px 0 24px rgba(0,0,0,.18)" }}>
          <MockupReviewPanel key={`${panel.project}:${panel.reviewId}`} project={panel.project} reviewId={panel.reviewId}
            revisionId={null} chatSessionId={SESSION} onClose={() => setPanel(null)} />
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
