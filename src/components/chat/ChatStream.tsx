"use client";
/**
 * AADS-172-B: ChatStream
 * 채팅 스트림 메시지 영역
 * - 메시지 버블 목록 렌더링
 * - 타이핑 인디케이터 (AI 응답 중 ···)
 * - 자동 스크롤 + "새 메시지" 플로팅 버튼
 * - SSE 스트리밍 텍스트 실시간 표시
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/services/chatApi";
import ChatBubble from "./ChatBubble";
import DeepResearchProgress from "./DeepResearchProgress";

interface ChatStreamProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  isDeepResearch?: boolean;
  onBookmark?: (id: string) => void;
  onCopy?: (content: string) => void;
  onCreateDirective?: (content: string) => void;
  onViewInPanel?: (content: string) => void;
  emptyState?: React.ReactNode;
}

export default function ChatStream({
  messages,
  isStreaming,
  streamingText,
  isDeepResearch,
  onBookmark,
  onCopy,
  onCreateDirective,
  onViewInPanel,
  emptyState,
}: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const isNearBottomRef = useRef(true);

  // 스크롤 위치 감지
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    if (isNearBottomRef.current) setShowNewMessage(false);
  }, []);

  // 새 메시지 → 자동 스크롤 또는 "새 메시지" 버튼 표시
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowNewMessage(false);
    } else {
      if (messages.length > 0) setShowNewMessage(true);
    }
  }, [messages.length, streamingText]);

  // 스트리밍 중 자동 스크롤
  useEffect(() => {
    if (isStreaming && isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isStreaming, streamingText]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowNewMessage(false);
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-4"
        onScroll={handleScroll}
        style={{ scrollBehavior: "smooth" }}
      >
        {/* 빈 상태 */}
        {isEmpty && (emptyState ?? <DefaultEmptyState />)}

        {/* 메시지 목록 */}
        {messages.map((msg, idx) => {
          // AI 메시지가 마지막이고 스트리밍 중이면 스트리밍 텍스트 표시
          const isLastAI =
            idx === messages.length - 1 && msg.role === "assistant";
          return (
            <ChatBubble
              key={msg.id || idx}
              message={msg}
              isStreaming={isLastAI && isStreaming}
              streamingText={isLastAI && isStreaming ? streamingText : undefined}
              onBookmark={onBookmark}
              onCopy={onCopy}
              onCreateDirective={onCreateDirective}
              onViewInPanel={msg.role === "assistant" ? onViewInPanel : undefined}
            />
          );
        })}

        {/* 스트리밍 중 타이핑 인디케이터 (메시지 없을 때) */}
        {isStreaming && messages.length === 0 && (
          <div className="flex justify-start mb-3">
            <div
              className="px-4 py-3 rounded-2xl text-sm"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderBottomLeftRadius: "6px",
              }}
            >
              {streamingText || (
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: "var(--text-secondary)",
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Deep Research 진행 표시 */}
        {isDeepResearch && isStreaming && (
          <DeepResearchProgress isActive={isStreaming} streamingText={streamingText} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* "새 메시지" 플로팅 버튼 */}
      {showNewMessage && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs px-4 py-2 rounded-full shadow-lg transition-all animate-bounce"
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          ↓ 새 메시지
        </button>
      )}
    </div>
  );
}

function DefaultEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center py-20">
      <p className="text-5xl mb-4">💬</p>
      <p className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        CEO Chat-First
      </p>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        메시지를 입력하거나 아래 빠른 액션을 선택하세요
      </p>
      <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
        <p>⚡ Auto → 인텐트 기반 자동 모델 라우팅</p>
        <p>🧠 Opus → 설계·분석·복잡한 추론</p>
        <p>🔬 Deep Research → 심층 리서치 + 출처 제공</p>
      </div>
    </div>
  );
}
