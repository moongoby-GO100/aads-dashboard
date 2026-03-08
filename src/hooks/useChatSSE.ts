"use client";
/**
 * AADS-172-B: useChatSSE
 * POST /api/v1/chat/messages/send → SSE 스트리밍 수신 훅
 * - content.delta 이벤트 → 실시간 텍스트 렌더링
 * - thought_summary 이벤트 → 접이식 사고 과정
 * - 연결 끊김 시 자동 재연결 (3회, exponential backoff)
 */
import { useCallback, useRef, useState } from "react";
import { chatApi, type SourceItem, type SSEChunk } from "@/services/chatApi";

export interface StreamState {
  isStreaming: boolean;
  streamingText: string;      // 현재 누적 텍스트
  thoughtSummary: string | null;
  sources: SourceItem[];
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
  thoughtSummary: null,
  sources: [],
  error: null,
  messageId: null,
  modelUsed: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
};

export function useChatSSE() {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const retryCountRef = useRef(0);

  const resetStream = useCallback(() => {
    setState(INITIAL_STREAM);
  }, []);

  const cancelStream = useCallback(() => {
    readerRef.current?.cancel();
    readerRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  const parseChunks = useCallback((raw: string): SSEChunk[] => {
    const chunks: SSEChunk[] = [];
    const lines = raw.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          chunks.push(JSON.parse(line.slice(6)) as SSEChunk);
        } catch {
          // ignore malformed chunk
        }
      }
    }
    return chunks;
  }, []);

  const sendMessage = useCallback(
    async (
      sessionId: string,
      content: string,
      modelOverride?: string,
      onDone?: (fullText: string) => void
    ) => {
      // 이전 스트림 정리
      readerRef.current?.cancel();
      readerRef.current = null;

      setState({
        ...INITIAL_STREAM,
        isStreaming: true,
      });

      let attempt = 0;
      const MAX_RETRY = 3;

      const doStream = async () => {
        try {
          const reader = await chatApi.sendMessageStream(sessionId, content, modelOverride);
          readerRef.current = reader;
          retryCountRef.current = 0;

          const decoder = new TextDecoder();
          let fullText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const raw = decoder.decode(value, { stream: true });
            const chunks = parseChunks(raw);

            for (const chunk of chunks) {
              if (chunk.type === "delta" && chunk.content) {
                fullText += chunk.content;
                setState((s) => ({
                  ...s,
                  streamingText: fullText,
                }));
              } else if (chunk.type === "thought_summary" && chunk.summary) {
                setState((s) => ({
                  ...s,
                  thoughtSummary: chunk.summary!,
                }));
              } else if (chunk.type === "sources" && chunk.sources) {
                setState((s) => ({
                  ...s,
                  sources: chunk.sources!,
                }));
              } else if (chunk.type === "done") {
                setState((s) => ({
                  ...s,
                  isStreaming: false,
                  messageId: chunk.message_id || null,
                  modelUsed: chunk.model_used || null,
                  inputTokens: chunk.input_tokens || null,
                  outputTokens: chunk.output_tokens || null,
                  costUsd: chunk.cost_usd || null,
                }));
                onDone?.(fullText);
                return;
              } else if (chunk.type === "error") {
                throw new Error(chunk.content || "스트리밍 오류");
              }
            }
          }

          // 스트림 정상 종료 (done 이벤트 없이)
          setState((s) => ({ ...s, isStreaming: false }));
          onDone?.(fullText);
        } catch (err) {
          attempt++;
          if (attempt < MAX_RETRY) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, delay));
            return doStream();
          }
          const msg = err instanceof Error ? err.message : String(err);
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: msg,
          }));
        }
      };

      await doStream();
    },
    [parseChunks]
  );

  return { state, sendMessage, cancelStream, resetStream };
}
