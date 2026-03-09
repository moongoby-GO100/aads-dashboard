"use client";
/**
 * AADS-185-C2: ChatStream — 확장된 메시지 렌더링
 * 신규: ThinkingIndicator, 도구 호출 블록, CitationCard, ResearchProgress
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, SourceItem } from "@/services/chatApi";
import type { ToolUseEvent } from "@/hooks/useChatSSE";
import ChatBubble from "./ChatBubble";
import ThinkingIndicator from "./ThinkingIndicator";
import CitationCard from "./CitationCard";
import ResearchProgress from "./ResearchProgress";

interface ChatStreamProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  thinkingText?: string | null;
  toolEvents?: ToolUseEvent[];
  sources?: SourceItem[];
  isResearching?: boolean;
  researchProgress?: string | null;
  isDeepResearch?: boolean;
  onBookmark?: (id: string) => void;
  onCopy?: (content: string) => void;
  onCreateDirective?: (content: string) => void;
  onViewInPanel?: (content: string) => void;
  onViewReport?: () => void;
  emptyState?: React.ReactNode;
}

export default function ChatStream({
  messages,
  isStreaming,
  streamingText,
  thinkingText,
  toolEvents = [],
  sources = [],
  isResearching,
  researchProgress,
  isDeepResearch,
  onBookmark,
  onCopy,
  onCreateDirective,
  onViewInPanel,
  onViewReport,
  emptyState,
}: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const isNearBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (isNearBottomRef.current) setShowNewMessage(false);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowNewMessage(false);
    } else if (messages.length > 0) {
      setShowNewMessage(true);
    }
  }, [messages.length, streamingText]);

  useEffect(() => {
    if (isStreaming && isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isStreaming, streamingText, toolEvents]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowNewMessage(false);
  };

  const isEmpty = messages.length === 0 && !isStreaming;
  const hasActiveTools = toolEvents.some((e) => e.status === "running");

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-4"
        onScroll={handleScroll}
        style={{ scrollBehavior: "smooth" }}
      >
        {isEmpty && (emptyState ?? <DefaultEmptyState />)}

        {/* 메시지 목록 */}
        {messages.map((msg, idx) => {
          const isLastAI = idx === messages.length - 1 && msg.role === "assistant";
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

        {/* 스트리밍 중 Extended Thinking 표시 */}
        {isStreaming && thinkingText && (
          <div className="mb-3 ml-1">
            <ThinkingIndicator thinkingText={thinkingText} isActive={isStreaming} />
          </div>
        )}

        {/* 스트리밍 중 Thinking (텍스트 없는 초기 상태) */}
        {isStreaming && !thinkingText && !streamingText && toolEvents.length === 0 && !isResearching && (
          <div className="flex justify-start mb-3">
            <div
              className="px-4 py-3 rounded-2xl text-sm"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderBottomLeftRadius: "6px",
              }}
            >
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "var(--text-secondary)", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {/* 도구 호출 블록 */}
        {isStreaming && toolEvents.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            {toolEvents.map((ev, i) => (
              <ToolEventBlock key={i} event={ev} />
            ))}
          </div>
        )}

        {/* Deep Research 진행 표시 */}
        {(isResearching || researchProgress) && (
          <ResearchProgress
            isActive={!!isResearching}
            progress={researchProgress || null}
            onViewReport={onViewReport}
          />
        )}

        {/* 스트리밍 중 텍스트 (메시지 없을 때) */}
        {isStreaming && messages.length === 0 && streamingText && (
          <div className="flex justify-start mb-3">
            <div
              className="px-4 py-3 rounded-2xl text-sm max-w-[85%]"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderBottomLeftRadius: "6px",
                color: "var(--text-primary)",
                lineHeight: "1.6",
              }}
            >
              {streamingText}
            </div>
          </div>
        )}

        {/* 검색 인용 카드 (스트리밍 완료 후 표시) */}
        {!isStreaming && sources.length > 0 && (
          <div className="mb-3">
            <CitationCard citations={sources as Parameters<typeof CitationCard>[0]["citations"]} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showNewMessage && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs px-4 py-2 rounded-full shadow-lg transition-all animate-bounce"
          style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", zIndex: 10 }}
        >
          ↓ 새 메시지
        </button>
      )}
    </div>
  );
}

// ─── 도구 이벤트 블록 ────────────────────────────────────────────────────────

function ToolEventBlock({ event }: { event: ToolUseEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = event.status === "done";

  return (
    <div
      className="rounded-lg overflow-hidden text-xs"
      style={{
        background: "var(--bg-secondary, #1e1e2e)",
        border: "1px solid var(--border, #3a3a4a)",
      }}
    >
      <button
        onClick={() => event.result && setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ color: "var(--text-secondary, #888)", cursor: event.result ? "pointer" : "default" }}
      >
        {isDone ? (
          <span style={{ color: "#22c55e" }}>✓</span>
        ) : (
          <span className="w-3 h-3 rounded-full animate-spin border-2 border-t-transparent flex-shrink-0"
            style={{ borderColor: "var(--accent, #6366f1)", borderTopColor: "transparent" }}
          />
        )}
        <span className="font-medium">
          🔧 {_TOOL_DISPLAY_NAMES[event.toolName] || event.toolName}
        </span>
        {event.result && (
          <span className="ml-auto opacity-50">{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      {expanded && event.result && (
        <div
          className="px-3 pb-2 text-xs opacity-70 whitespace-pre-wrap"
          style={{ borderTop: "1px solid var(--border, #3a3a4a)", maxHeight: "150px", overflowY: "auto" }}
        >
          {event.result}
        </div>
      )}
    </div>
  );
}

const _TOOL_DISPLAY_NAMES: Record<string, string> = {
  health_check: "서버 헬스체크",
  server_status: "서버 상태",
  dashboard_query: "대시보드 조회",
  task_history: "작업 이력",
  directive_create: "지시서 생성",
  read_github_file: "GitHub 파일 읽기",
  query_database: "DB 조회",
  read_remote_file: "원격 서버 파일 읽기",
  list_remote_dir: "서버 파일 검색 (SSH)",
  web_search_brave: "웹 검색",
  cost_report: "비용 보고서",
};

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
        <p>🧠 Opus → 설계·분석·Extended Thinking</p>
        <p>🔬 Deep Research → Gemini 심층 리서치 + 출처</p>
        <p>🔧 System → Claude + Tool Use 도구 자동 호출</p>
      </div>
    </div>
  );
}
