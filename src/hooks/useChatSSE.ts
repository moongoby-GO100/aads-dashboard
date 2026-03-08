"use client";
/**
 * AADS-182: useChatSSE — SSE 파싱 버그 수정
 * 수정 내용:
 * - 버퍼 기반 SSE 파싱 (\n\n 이벤트 분리, 청크 잘림 대응)
 * - done 이벤트 필드 수정 (model/cost ← 백엔드 실제 필드명)
 * - StreamMeta를 onDone 콜백으로 직접 전달 (stale closure 방지)
 * - 30초 AbortController 타임아웃 + 폴링 fallback (3초 대기 후 GET messages)
 */
import { useCallback, useRef, useState } from "react";
import { chatApi, type SourceItem, type SSEChunk } from "@/services/chatApi";

export interface StreamMeta {
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  sources: SourceItem[];
  thoughtSummary: string | null;
}

export interface StreamState {
  isStreaming: boolean;
  streamingText: string;
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

const SSE_TIMEOUT_MS = 30_000;
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

      // 폴링 fallback: SSE 실패 시 3초 후 DB에서 최신 assistant 메시지 가져오기
      const pollFallback = async (): Promise<boolean> => {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const msgs = await chatApi.getMessages(sessionId, 20, 0);
          // list_messages returns ASC (oldest first)
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
            });
            return true;
          }
        } catch {
          // 폴링도 실패
        }
        return false;
      };

      let attempt = 0;

      const doStream = async (): Promise<void> => {
        const timeoutId = setTimeout(() => abort.abort(), SSE_TIMEOUT_MS);

        try {
          const reader = await chatApi.sendMessageStream(
            sessionId,
            content,
            modelOverride,
            abort.signal
          );
          readerRef.current = reader;

          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";
          let thoughtSummary: string | null = null;
          let sources: SourceItem[] = [];

          while (true) {
            if (abort.signal.aborted) break;

            const { done, value } = await reader.read();
            if (done) break;

            // 버퍼에 누적 후 \n\n 기준으로 SSE 이벤트 분리
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? ""; // 마지막 불완전 이벤트는 버퍼에 유지

            for (const event of events) {
              for (const line of event.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: ")) continue;

                let chunk: SSEChunk;
                try {
                  chunk = JSON.parse(trimmed.slice(6)) as SSEChunk;
                } catch {
                  continue; // malformed JSON 무시
                }

                if (chunk.type === "delta" && chunk.content) {
                  fullText += chunk.content;
                  setState((s) => ({ ...s, streamingText: fullText }));
                } else if (chunk.type === "thought_summary" && chunk.summary) {
                  thoughtSummary = chunk.summary;
                  setState((s) => ({ ...s, thoughtSummary: chunk.summary! }));
                } else if (chunk.type === "sources" && chunk.sources) {
                  sources = chunk.sources;
                  setState((s) => ({ ...s, sources: chunk.sources! }));
                } else if (chunk.type === "done") {
                  clearTimeout(timeoutId);
                  // 백엔드: "model"/"cost" 필드 사용 (model_used/cost_usd도 허용)
                  const meta: StreamMeta = {
                    modelUsed: chunk.model_used || chunk.model || null,
                    inputTokens: chunk.input_tokens || null,
                    outputTokens: chunk.output_tokens || null,
                    costUsd: chunk.cost_usd || chunk.cost || null,
                    sources,
                    thoughtSummary,
                  };
                  setState((s) => ({
                    ...s,
                    isStreaming: false,
                    messageId: chunk.message_id || null,
                    modelUsed: meta.modelUsed,
                    inputTokens: meta.inputTokens,
                    outputTokens: meta.outputTokens,
                    costUsd: meta.costUsd,
                  }));
                  onDone?.(fullText, meta);
                  return;
                } else if (chunk.type === "error") {
                  throw new Error(chunk.content || "스트리밍 오류");
                }
              }
            }
          }

          // 스트림 정상 종료 (done 이벤트 없이)
          clearTimeout(timeoutId);
          setState((s) => ({ ...s, isStreaming: false }));
          onDone?.(fullText, {
            modelUsed: null,
            inputTokens: null,
            outputTokens: null,
            costUsd: null,
            sources,
            thoughtSummary,
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

          // 폴링 fallback 시도
          const recovered = await pollFallback();
          if (!recovered) {
            const msg = err instanceof Error ? err.message : String(err);
            setState((s) => ({
              ...s,
              isStreaming: false,
              error: isAborted
                ? "응답 시간 초과 (30초). 폴링 복구 실패 — 재시도하세요."
                : msg,
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
