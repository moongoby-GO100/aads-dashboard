"use client";
/**
 * AADS-185-C1: useChatSSE — 확장된 SSE 이벤트 핸들링
 * 신규 이벤트:
 * - thinking: Claude Extended Thinking delta
 * - tool_use / tool_use.start: 도구 호출 시작
 * - tool_result: 도구 실행 결과
 * - research.progress / research.complete: Deep Research
 * 기존 유지:
 * - delta, done, error, thought_summary, sources (하위 호환)
 */
import { useCallback, useRef, useState } from "react";
import { chatApi, type SourceItem, type SSEChunk } from "@/services/chatApi";
import { reportError } from "@/services/errorReporter";
import { registerStream, updateStreamText, completeStream } from "@/services/streamManager";

export interface ToolUseEvent {
  toolName: string;
  toolUseId?: string;
  result?: string;
  status: "running" | "done" | "error";
}

export interface StreamMeta {
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  sources: SourceItem[];
  thoughtSummary: string | null;
  thinkingText: string | null;
  toolsUsed: ToolUseEvent[];
}

export interface StreamState {
  isStreaming: boolean;
  streamingText: string;
  thinkingText: string | null;
  thoughtSummary: string | null;
  sources: SourceItem[];
  toolEvents: ToolUseEvent[];
  isResearching: boolean;
  researchProgress: string | null;
  error: string | null;
  messageId: string | null;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  // AADS-190: 세션 누적 비용/턴
  sessionCost: string | null;
  sessionTurns: number | null;
  yellowLimitWarning: string | null;
}

const INITIAL_STREAM: StreamState = {
  isStreaming: false,
  streamingText: "",
  thinkingText: null,
  thoughtSummary: null,
  sources: [],
  toolEvents: [],
  isResearching: false,
  researchProgress: null,
  error: null,
  messageId: null,
  modelUsed: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  sessionCost: null,
  sessionTurns: null,
  yellowLimitWarning: null,
};

const SSE_INACTIVITY_MS = 90_000; // heartbeat(10s) 기준 — 90초간 무응답 시에만 타임아웃
const MAX_RETRY = 3;

export function useChatSSE() {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetStream = useCallback(() => {
    setState(INITIAL_STREAM);
  }, []);

  const cancelStream = useCallback(() => {
    readerRef.current?.cancel();
    readerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  const sendMessage = useCallback(
    async (
      sessionId: string,
      content: string,
      modelOverride?: string,
      onDone?: (fullText: string, meta: StreamMeta) => void
    ) => {
      readerRef.current?.cancel();
      abortRef.current?.abort();

      const abort = new AbortController();
      abortRef.current = abort;

      setState({ ...INITIAL_STREAM, isStreaming: true });
      // AADS-190: StreamManager에 스트림 시작 등록
      registerStream(sessionId);

      const pollFallback = async (): Promise<boolean> => {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const msgs = await chatApi.getMessages(sessionId, 20, 0);
          const lastAI = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAI) {
            setState((s) => ({
              ...s,
              isStreaming: false,
              streamingText: lastAI.content,
              error: null,
            }));
            onDone?.(lastAI.content, {
              modelUsed: lastAI.model_used,
              inputTokens: lastAI.input_tokens,
              outputTokens: lastAI.output_tokens,
              costUsd: lastAI.cost_usd,
              sources: lastAI.sources || [],
              thoughtSummary: null,
              thinkingText: null,
              toolsUsed: [],
            });
            return true;
          }
        } catch { /* 폴링 실패 */ }
        return false;
      };

      let attempt = 0;

      const doStream = async (): Promise<void> => {
        // 이벤트(heartbeat 포함) 수신 시마다 리셋되는 inactivity 타임아웃
        const resetInactivityTimeout = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => abort.abort(), SSE_INACTIVITY_MS);
        };
        resetInactivityTimeout();

        try {
          const reader = await chatApi.sendMessageStream(
            sessionId, content, modelOverride, abort.signal
          );
          readerRef.current = reader;

          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";
          let thinkingText = "";
          let thoughtSummary: string | null = null;
          let sources: SourceItem[] = [];
          const toolEvents: ToolUseEvent[] = [];

          while (true) {
            if (abort.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            // 데이터 수신 → inactivity 타이머 리셋
            resetInactivityTimeout();

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
              for (const line of event.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: ")) continue;

                let chunk: SSEChunk;
                try {
                  chunk = JSON.parse(trimmed.slice(6)) as SSEChunk;
                } catch { continue; }

                // heartbeat → 타이머 리셋만, UI 변경 없음
                if (chunk.type === "heartbeat") continue;

                if (chunk.type === "delta" && chunk.content) {
                  fullText += chunk.content;
                  setState((s) => ({ ...s, streamingText: fullText }));
                  updateStreamText(sessionId, fullText);

                } else if (chunk.type === "thinking" && chunk.content) {
                  thinkingText += chunk.content;
                  setState((s) => ({ ...s, thinkingText: thinkingText.slice(-2000) }));

                } else if (chunk.type === "thought_summary" && chunk.summary) {
                  thoughtSummary = chunk.summary;
                  setState((s) => ({ ...s, thoughtSummary: chunk.summary! }));

                } else if (chunk.type === "tool_use" && chunk.tool_name) {
                  const ev: ToolUseEvent = {
                    toolName: chunk.tool_name,
                    toolUseId: chunk.tool_use_id,
                    status: "running",
                  };
                  toolEvents.push(ev);
                  setState((s) => ({ ...s, toolEvents: [...toolEvents] }));

                } else if (chunk.type === "tool_result" && chunk.tool_name) {
                  const toolName = chunk.tool_name;
                  const idx = toolEvents.findIndex(
                    (e) => e.toolName === toolName && e.status === "running"
                  );
                  if (idx >= 0) {
                    toolEvents[idx] = {
                      ...toolEvents[idx],
                      result: (chunk.content || "").slice(0, 300),
                      status: "done",
                    };
                    setState((s) => ({ ...s, toolEvents: [...toolEvents] }));
                  }

                } else if (chunk.type === "sources" && chunk.sources) {
                  sources = chunk.sources;
                  setState((s) => ({ ...s, sources: chunk.sources! }));

                } else if (chunk.type === "research.progress") {
                  const progress = chunk.content || chunk.summary || "";
                  setState((s) => ({
                    ...s,
                    isResearching: true,
                    researchProgress: String(progress),
                  }));

                } else if (chunk.type === "research.complete") {
                  setState((s) => ({
                    ...s,
                    isResearching: false,
                    researchProgress: "완료",
                  }));

                } else if (chunk.type === "yellow_limit") {
                  // Yellow 도구 연속 실행 경고
                  setState((s) => ({
                    ...s,
                    yellowLimitWarning: chunk.content || `쓰기 도구 연속 ${chunk.consecutive_count || 5}회`,
                  }));

                } else if (chunk.type === "done") {
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  const meta: StreamMeta = {
                    modelUsed: chunk.model_used || chunk.model || null,
                    inputTokens: chunk.input_tokens || null,
                    outputTokens: chunk.output_tokens || null,
                    costUsd: chunk.cost_usd || chunk.cost || null,
                    sources,
                    thoughtSummary: thoughtSummary || (thinkingText ? thinkingText.slice(0, 300) : null),
                    thinkingText: thinkingText || null,
                    toolsUsed: [...toolEvents],
                  };
                  setState((s) => ({
                    ...s,
                    isStreaming: false,
                    isResearching: false,
                    messageId: chunk.message_id || null,
                    modelUsed: meta.modelUsed,
                    inputTokens: meta.inputTokens,
                    outputTokens: meta.outputTokens,
                    costUsd: meta.costUsd,
                    sources,
                    toolEvents: [...toolEvents],
                    thoughtSummary: meta.thoughtSummary,
                    thinkingText: meta.thinkingText,
                    sessionCost: chunk.session_cost || null,
                    sessionTurns: chunk.session_turns || null,
                    yellowLimitWarning: null,
                  }));
                  completeStream(sessionId, fullText);
                  onDone?.(fullText, meta);
                  return;

                } else if (chunk.type === "error") {
                  throw new Error(chunk.content || "스트리밍 오류");
                }
              }
            }
          }

          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setState((s) => ({ ...s, isStreaming: false, isResearching: false }));
          onDone?.(fullText, {
            modelUsed: null, inputTokens: null, outputTokens: null, costUsd: null,
            sources, thoughtSummary,
            thinkingText: thinkingText || null,
            toolsUsed: [...toolEvents],
          });
        } catch (err) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const isAborted = abort.signal.aborted;
          attempt++;

          if (attempt < MAX_RETRY && !isAborted) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, delay));
            return doStream();
          }

          const recovered = await pollFallback();
          if (!recovered) {
            const msg = err instanceof Error ? err.message : String(err);
            const errorType = isAborted ? "STREAM_TIMEOUT" : "SSE_DISCONNECT";
            // AADS-190: StreamManager에 에러 기록 + 백엔드 보고
            completeStream(sessionId, "", msg);
            reportError({
              error_type: errorType,
              message: msg,
              session_id: sessionId,
              context: { attempt, maxRetry: MAX_RETRY },
            });
            setState((s) => ({
              ...s,
              isStreaming: false,
              isResearching: false,
              error: isAborted ? "응답 시간 초과. 폴링 복구 실패 — 재시도하세요." : msg,
            }));
          }
        }
      };

      await doStream();
    },
    []
  );

  return { state, sendMessage, cancelStream, resetStream };
}
