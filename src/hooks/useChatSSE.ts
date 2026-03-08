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
};

const SSE_TIMEOUT_MS = 60_000; // Deep Research에 더 긴 타임아웃
const MAX_RETRY = 3;

export function useChatSSE() {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        const timeoutId = setTimeout(() => abort.abort(), SSE_TIMEOUT_MS);

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

                if (chunk.type === "delta" && chunk.content) {
                  fullText += chunk.content;
                  setState((s) => ({ ...s, streamingText: fullText }));

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

                } else if (chunk.type === "done") {
                  clearTimeout(timeoutId);
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
                  }));
                  onDone?.(fullText, meta);
                  return;

                } else if (chunk.type === "error") {
                  throw new Error(chunk.content || "스트리밍 오류");
                }
              }
            }
          }

          clearTimeout(timeoutId);
          setState((s) => ({ ...s, isStreaming: false, isResearching: false }));
          onDone?.(fullText, {
            modelUsed: null, inputTokens: null, outputTokens: null, costUsd: null,
            sources, thoughtSummary,
            thinkingText: thinkingText || null,
            toolsUsed: [...toolEvents],
          });
        } catch (err) {
          clearTimeout(timeoutId);
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
