"use client";
/**
 * AADS-172-B: CEO Chat-First 페이지 (재작성)
 * - ChatStream / ChatInput / useChatSSE / useChatSession 통합
 * - AADS-170 /api/v1/chat/* 엔드포인트 사용
 * - 워크스페이스 선택 + 세션 관리 사이드바
 * - 기존 /api/v1/ceo-chat/* 비용 사이드바 유지 (하위 호환)
 */
import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import ChatStream from "@/components/chat/ChatStream";
import ChatInput from "@/components/chat/ChatInput";
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from "@/components/chat/ModelSelector";
import { useChatSSE } from "@/hooks/useChatSSE";
import { useChatSession } from "@/hooks/useChatSession";
import type { ChatMessage } from "@/services/chatApi";

export default function CeoChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [activeTasksCount, setActiveTasksCount] = useState(0);

  const { state: sseState, sendMessage: sseStreamSend, cancelStream } = useChatSSE();
  const {
    workspaces,
    sessions,
    messages,
    currentWorkspace,
    currentSession,
    loading,
    selectWorkspace,
    selectSession,
    createNewSession,
    appendMessage,
    updateLastMessage,
  } = useChatSession();

  // 메시지 전송
  const handleSend = useCallback(
    async (text: string, model: string) => {
      if (!currentWorkspace) return;

      // 세션이 없으면 자동 생성
      let sess = currentSession;
      if (!sess) {
        sess = await createNewSession();
        if (!sess) return;
      }

      // 사용자 메시지 낙관적 추가
      const userMsg: ChatMessage = {
        id: `tmp-user-${Date.now()}`,
        session_id: sess.id,
        role: "user",
        content: text,
        model_used: null,
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
        bookmarked: false,
        attachments: [],
        sources: null,
        thought_summary: null,
        created_at: new Date().toISOString(),
      };
      appendMessage(userMsg);

      // AI 플레이스홀더
      const aiPlaceholder: ChatMessage = {
        id: `tmp-ai-${Date.now()}`,
        session_id: sess.id,
        role: "assistant",
        content: "",
        model_used: model === "auto" ? null : model,
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
        bookmarked: false,
        attachments: [],
        sources: null,
        thought_summary: null,
        created_at: new Date().toISOString(),
      };
      appendMessage(aiPlaceholder);

      const resolvedModel = model === "auto" ? undefined : model;

      await sseStreamSend(sess.id, text, resolvedModel, (fullText) => {
        // 스트리밍 완료 → 마지막 메시지 업데이트
        updateLastMessage(fullText, {
          model_used: sseState.modelUsed || resolvedModel || "auto",
          input_tokens: sseState.inputTokens || undefined,
          output_tokens: sseState.outputTokens || undefined,
          cost_usd: sseState.costUsd || undefined,
          sources: sseState.sources.length > 0 ? sseState.sources : null,
          thought_summary: sseState.thoughtSummary || null,
        });
        setActiveTasksCount(0);
      });
    },
    [
      currentWorkspace,
      currentSession,
      createNewSession,
      appendMessage,
      updateLastMessage,
      sseStreamSend,
      sseState,
    ]
  );

  const handleNewSession = async () => {
    await createNewSession();
  };

  const handleBookmark = async (id: string) => {
    try {
      const { chatApi } = await import("@/services/chatApi");
      await chatApi.toggleBookmark(id);
    } catch (e) {
      console.error("Bookmark failed", e);
    }
  };

  const handleCreateDirective = (content: string) => {
    const snippet = content.slice(0, 200);
    alert(`지시서 생성 요청:\n${snippet}\n\n(지시서 작성 기능은 다음 단계에서 구현됩니다)`);
  };

  const isDeepResearch = CHAT_MODEL_OPTIONS.find((m) => m.id === selectedModel)?.isDeepResearch;

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-main)", color: "var(--text-primary)" }}>
      {/* ── 왼쪽 사이드바 (워크스페이스 + 세션) ─────────────────────────── */}
      {sidebarOpen && (
        <div
          className="w-60 flex flex-col overflow-y-auto flex-shrink-0"
          style={{ borderRight: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          {/* 워크스페이스 */}
          <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>워크스페이스</p>
            {loading && workspaces.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
            ) : (
              <div className="space-y-1">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => selectWorkspace(w)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2"
                    style={
                      currentWorkspace?.id === w.id
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "transparent", color: "var(--text-secondary)" }
                    }
                  >
                    <span>{w.icon || "💬"}</span>
                    <span className="truncate">{w.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 세션 목록 */}
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>세션</p>
              <button
                onClick={handleNewSession}
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                + 새 세션
              </button>
            </div>
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s)}
                  className="w-full text-left px-2 py-2 rounded-lg text-xs transition-colors"
                  style={
                    currentSession?.id === s.id
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--bg-main)", color: "var(--text-secondary)" }
                  }
                >
                  <p className="font-medium truncate">{s.title || "새 대화"}</p>
                  <p className="text-xs opacity-70 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString("ko-KR")}
                    {s.pinned && " 📌"}
                  </p>
                </button>
              ))}
              {sessions.length === 0 && currentWorkspace && (
                <p className="text-xs py-2 text-center" style={{ color: "var(--text-secondary)" }}>
                  세션이 없습니다
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 메인 채팅 영역 ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs px-2 py-1.5 rounded"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <div>
              <h1 className="font-bold text-base">
                {currentWorkspace?.name || "CEO Chat"}
              </h1>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {currentSession?.title || (currentSession ? "새 대화" : "세션을 선택하거나 + 새 세션")}
                {activeTasksCount > 0 && (
                  <span className="ml-2 text-green-400 animate-pulse">● {activeTasksCount}개 작업 실행중</span>
                )}
                {sseState.isStreaming && (
                  <span className="ml-2 animate-pulse" style={{ color: "var(--accent)" }}>● 응답 생성 중</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sseState.isStreaming && (
              <button
                onClick={cancelStream}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: "#ef4444", color: "#fff" }}
              >
                중지
              </button>
            )}
            <button
              onClick={handleNewSession}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              새 세션
            </button>
          </div>
        </div>

        {/* SSE 에러 표시 */}
        {sseState.error && (
          <div
            className="mx-4 mt-2 px-3 py-2 rounded text-xs flex-shrink-0"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
          >
            오류: {sseState.error}
          </div>
        )}

        {/* 워크스페이스 미선택 상태 */}
        {!currentWorkspace && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4">💬</p>
              <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                CEO Chat-First
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                왼쪽에서 워크스페이스를 선택하세요
              </p>
            </div>
          </div>
        )}

        {/* 채팅 스트림 */}
        {currentWorkspace && (
          <ChatStream
            messages={messages}
            isStreaming={sseState.isStreaming}
            streamingText={sseState.streamingText}
            isDeepResearch={!!isDeepResearch}
            onBookmark={handleBookmark}
            onCopy={(content) => navigator.clipboard.writeText(content)}
            onCreateDirective={handleCreateDirective}
          />
        )}

        {/* 입력 영역 */}
        {currentWorkspace && (
          <ChatInput
            onSend={handleSend}
            isStreaming={sseState.isStreaming}
            lastAssistantMessage={
              [...messages].reverse().find((m) => m.role === "assistant")?.content || ""
            }
            hasMessages={messages.length > 0}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        )}
      </div>
    </div>
  );
}
