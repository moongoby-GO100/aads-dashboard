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
 *
 * AADS-TOKEN-BUFFER: 토큰 버퍼 렌더링 (30ms 간격)
 * - 서버에서 수신한 토큰을 tokenBufferRef에 쌓고
 * - 30ms 마다 렌더 루프가 꺼내어 setStreamingText 호출
 * - 버퍼가 50개 이상 쌓이면 batch로 따라잡기
 * - done 이벤트 시 남은 버퍼 즉시 flush
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  // AADS-TOKEN-BUFFER: 버퍼 대기 중 typing indicator용
  isBuffering: boolean;
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
  isBuffering: false,
};

const SSE_INACTIVITY_MS = 150_000; // heartbeat 기준 — 150초간 무응답 시에만 타임아웃
const MAX_RETRY = 5;
const MAX_RETRY_DELAY_MS = 30_000; // 최대 단일 대기 30초 캡
const RENDER_INTERVAL_MS = 30; // 토큰 렌더 루프 간격

function getReconnectDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, Math.max(attempt - 1, 0)), MAX_RETRY_DELAY_MS);
}

export function useChatSSE() {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionRef = useRef<string | null>(null);

  // AADS-TOKEN-BUFFER: 디스플레이 버퍼 관련 ref
  const tokenBufferRef = useRef<string[]>([]);
  const displayTextRef = useRef<string>('');
  const renderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamDoneRef = useRef<boolean>(false);
  // Phase4: SSE id: 필드 추적 → stream-resume 재연결 시 Last-Event-ID로 사용
  const lastEventIdRef = useRef<string>("0");

  // 렌더 루프: 30ms마다 토큰 버퍼에서 꺼내 화면에 표시
  const startRenderLoop = useCallback(() => {
    if (renderTimerRef.current) return; // 이미 실행 중이면 중복 시작 방지
    renderTimerRef.current = setInterval(() => {
      const buf = tokenBufferRef.current;
      if (buf.length > 0) {
        // 버퍼가 많이 쌓였으면 여러 개씩 소비 (따라잡기)
        const batchSize = buf.length > 50 ? Math.ceil(buf.length / 10) : 1;
        const tokens = buf.splice(0, batchSize);
        displayTextRef.current += tokens.join('');
        setState((s) => ({ ...s, streamingText: displayTextRef.current, isBuffering: false }));
      } else if (streamDoneRef.current) {
        // 버퍼 소진 + 스트림 완료 → 렌더 루프 종료
        if (renderTimerRef.current) {
          clearInterval(renderTimerRef.current);
          renderTimerRef.current = null;
        }
      } else {
        // 버퍼가 비어있지만 스트림은 아직 진행 중 → isBuffering 표시
        setState((s) => (s.isBuffering ? s : { ...s, isBuffering: true }));
      }
    }, RENDER_INTERVAL_MS);
  }, []);

  // 렌더 루프 및 버퍼 정리
  const stopRenderLoop = useCallback(() => {
    if (renderTimerRef.current) {
      clearInterval(renderTimerRef.current);
      renderTimerRef.current = null;
    }
  }, []);

  const resetStream = useCallback(() => {
    stopRenderLoop();
    tokenBufferRef.current = [];
    displayTextRef.current = '';
    streamDoneRef.current = false;
    setState(INITIAL_STREAM);
  }, [stopRenderLoop]);

  const cancelStream = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    stopRenderLoop();
    tokenBufferRef.current = [];
    readerRef.current?.cancel();
    readerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, isStreaming: false, isBuffering: false }));
  }, [stopRenderLoop]);

  // 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  const sendMessage = useCallback(
    async (
      sessionId: string,
      content: string,
      modelOverride?: string,
      onDone?: (fullText: string, meta: StreamMeta) => void
    ) => {
      readerRef.current?.cancel();
      abortRef.current?.abort();

      // 이전 렌더 루프 및 버퍼 초기화
      stopRenderLoop();
      tokenBufferRef.current = [];
      displayTextRef.current = '';
      streamDoneRef.current = false;
      lastEventIdRef.current = "0";

      const abort = new AbortController();
      abortRef.current = abort;

      setState({ ...INITIAL_STREAM, isStreaming: true });
      // AADS-190: StreamManager에 스트림 시작 등록
      registerStream(sessionId);
      activeSessionRef.current = sessionId;

      // pollFallback: SSE 완전 실패 시 1회성 안전장치 (중복 폴링 아님)
      const pollFallback = async (): Promise<boolean> => {
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const msgs = await chatApi.getMessages(sessionId, 20, 0);
          const lastAI = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAI) {
            // 폴백 복구 시 버퍼 정리 후 즉시 표시
            stopRenderLoop();
            tokenBufferRef.current = [];
            displayTextRef.current = lastAI.content;
            setState((s) => ({
              ...s,
              isStreaming: false,
              isBuffering: false,
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
      let fullText = "";
      let thinkingText = "";
      let thoughtSummary: string | null = null;
      let sources: SourceItem[] = [];
      const toolEvents: ToolUseEvent[] = [];

      const preserveVisibleStreamText = (statusMessage?: string | null) => {
        const preservedText = displayTextRef.current || fullText;
        stopRenderLoop();
        tokenBufferRef.current = [];
        displayTextRef.current = "";
        streamDoneRef.current = false;
        setState((s) => ({
          ...s,
          streamingText: s.streamingText || preservedText,
          thinkingText: null,
          thoughtSummary: null,
          sources: [],
          toolEvents: [],
          isResearching: false,
          researchProgress: statusMessage ? String(statusMessage) : null,
          isBuffering: false,
        }));
      };

      const flushBufferedText = (markDone = false): string => {
        if (markDone) streamDoneRef.current = true;
        if (tokenBufferRef.current.length > 0) {
          displayTextRef.current += tokenBufferRef.current.join('');
          tokenBufferRef.current = [];
        }
        stopRenderLoop();
        return displayTextRef.current;
      };

      const finalizeStream = (chunk?: SSEChunk) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const streamedText = flushBufferedText(true);
        const meta: StreamMeta = {
          modelUsed: chunk?.model_used || chunk?.model || null,
          inputTokens: chunk?.input_tokens || null,
          outputTokens: chunk?.output_tokens || null,
          costUsd: chunk?.cost_usd || chunk?.cost || null,
          sources,
          thoughtSummary: thoughtSummary || (thinkingText ? thinkingText.slice(0, 300) : null),
          thinkingText: thinkingText || null,
          toolsUsed: [...toolEvents],
        };
        setState((s) => ({
          ...s,
          isStreaming: false,
          isBuffering: false,
          isResearching: false,
          streamingText: streamedText,
          messageId: chunk?.message_id || null,
          modelUsed: meta.modelUsed,
          inputTokens: meta.inputTokens,
          outputTokens: meta.outputTokens,
          costUsd: meta.costUsd,
          sources,
          toolEvents: [...toolEvents],
          thoughtSummary: meta.thoughtSummary,
          thinkingText: meta.thinkingText,
          sessionCost: chunk?.session_cost || null,
          sessionTurns: chunk?.session_turns || null,
          yellowLimitWarning: null,
        }));
        completeStream(sessionId, fullText);
        onDone?.(fullText, meta);
      };

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
          let sawTerminalEvent = false;
          let receivedDataSinceConnect = false;

          while (true) {
            if (abort.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            if (!receivedDataSinceConnect) {
              receivedDataSinceConnect = true;
              attempt = 0;
            }

            // 데이터 수신 → inactivity 타이머 리셋
            resetInactivityTimeout();

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
              for (const line of event.split("\n")) {
                const trimmed = line.trim();
                if (trimmed.startsWith("id:")) {
                  lastEventIdRef.current = trimmed.slice(3);
                  continue;
                }
                if (!trimmed.startsWith("data: ")) continue;

                let chunk: SSEChunk;
                try {
                  chunk = JSON.parse(trimmed.slice(6)) as SSEChunk;
                } catch { continue; }

                // heartbeat → 타이머 리셋만, UI 변경 없음
                if (chunk.type === "heartbeat") continue;

                if (chunk.type === "delta" && chunk.content) {
                  // AADS-TOKEN-BUFFER: 즉시 렌더링 대신 버퍼에 쌓기
                  fullText += chunk.content;
                  tokenBufferRef.current.push(chunk.content);
                  startRenderLoop(); // 이미 실행 중이면 no-op
                  // streamManager는 fullText 기준으로 업데이트 (즉시)
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

                } else if (chunk.type === "stream_reset") {
                  // Gemini 재시도 등으로 백엔드가 스트림을 리셋할 때
                  // 이미 렌더된 텍스트는 유지하고, 다음 delta부터 같은 버블에서 다시 누적한다.
                  fullText = "";
                  thinkingText = "";
                  thoughtSummary = null;
                  sources = [];
                  toolEvents.length = 0;
                  preserveVisibleStreamText(chunk.content ? String(chunk.content) : null);

                } else if (chunk.type === "done") {
                  sawTerminalEvent = true;
                  finalizeStream(chunk);
                  return;

                } else if (chunk.type === "error") {
                  // 서버 명시적 에러는 재시도하지 않고 즉시 종료
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  // AADS-TOKEN-BUFFER: 에러 시 버퍼 flush 후 정리
                  flushBufferedText();
                  const errMsg = chunk.content || "스트리밍 오류";
                  completeStream(sessionId, "", errMsg);
                  setState((s) => ({
                    ...s,
                    isStreaming: false,
                    isBuffering: false,
                    isResearching: false,
                    error: errMsg,
                    modelUsed: chunk.model || chunk.model_used || s.modelUsed,
                    inputTokens: chunk.input_tokens || s.inputTokens,
                    outputTokens: chunk.output_tokens || s.outputTokens,
                    costUsd: chunk.cost_usd || chunk.cost || s.costUsd,
                  }));
                  return;
                }
              }
            }
          }

          if (!abort.signal.aborted && !sawTerminalEvent) {
            throw new Error("Stream ended without terminal event");
          }
        } catch (err) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const isAborted = abort.signal.aborted;
          attempt++;

          // Phase4: stream-resume 재연결 시도 (Last-Event-ID 기반)
          if (!isAborted && lastEventIdRef.current !== "0") {
            try {
              const BASE = process.env.NEXT_PUBLIC_API_URL || "";
              const resumeResp = await fetch(
                `${BASE}/api/v1/chat/sessions/${sessionId}/stream-resume?last_event_id=${encodeURIComponent(lastEventIdRef.current)}`,
                { signal: abort.signal }
              );
              if (resumeResp.ok && resumeResp.body) {
                const resumeReader = resumeResp.body.getReader();
                readerRef.current = resumeReader;
                const resumeDecoder = new TextDecoder();
                let resumeBuffer = "";
                let resumeSawTerminalEvent = false;
                let resumeReceivedData = false;
                while (true) {
                  if (abort.signal.aborted) break;
                  const { done: rDone, value: rValue } = await resumeReader.read();
                  if (rDone) break;
                  if (!resumeReceivedData) {
                    resumeReceivedData = true;
                    attempt = 0;
                  }
                  resetInactivityTimeout();
                  resumeBuffer += resumeDecoder.decode(rValue, { stream: true });
                  const rEvents = resumeBuffer.split("\n\n");
                  resumeBuffer = rEvents.pop() ?? "";
                  for (const rEvent of rEvents) {
                    for (const rLine of rEvent.split("\n")) {
                      const rTrimmed = rLine.trim();
                      if (rTrimmed.startsWith("id:")) {
                        lastEventIdRef.current = rTrimmed.slice(3);
                        continue;
                      }
                      if (!rTrimmed.startsWith("data: ")) continue;
                      let rChunk: SSEChunk;
                      try { rChunk = JSON.parse(rTrimmed.slice(6)) as SSEChunk; } catch { continue; }
                      if (rChunk.type === "heartbeat") continue;
                      if (rChunk.type === "delta" && rChunk.content) {
                        fullText += rChunk.content;
                        tokenBufferRef.current.push(rChunk.content);
                        startRenderLoop();
                        updateStreamText(sessionId, fullText);
                      } else if (rChunk.type === "resume_done" || rChunk.type === "done") {
                        // resume 완료 — 정상 종료 처리
                        resumeSawTerminalEvent = true;
                        finalizeStream(rChunk);
                        return;
                      }
                    }
                  }
                }
                if (!resumeSawTerminalEvent) {
                  throw new Error("Resume stream ended without terminal event");
                }
                return;
              }
            } catch { /* resume failed, fall through to retry */ }
          }

          if (attempt <= MAX_RETRY && !isAborted) {
            const delay = getReconnectDelayMs(attempt);
            await new Promise((r) => setTimeout(r, delay));
            return doStream();
          }

          const recovered = await pollFallback();
          if (!recovered) {
            // AADS-TOKEN-BUFFER: 에러/재연결 실패 시 버퍼 flush 후 정리
            flushBufferedText();
            const msg = err instanceof Error ? err.message : String(err);
            const errorType = isAborted ? "STREAM_TIMEOUT" : "SSE_DISCONNECT";
            // AADS-190: StreamManager에 에러 기록 + 백엔드 보고
            completeStream(sessionId, displayTextRef.current || "", msg);
            reportError({
              error_type: errorType,
              message: msg,
              session_id: sessionId,
              context: { attempt, maxRetry: MAX_RETRY },
            });
            setState((s) => ({
              ...s,
              isStreaming: false,
              isBuffering: false,
              isResearching: false,
              error: isAborted ? "응답 시간 초과. 폴링 복구 실패 — 재시도하세요." : msg,
            }));
          }
        }
      };

      await doStream();
    },
    [startRenderLoop, stopRenderLoop]
  );

  return { state, sendMessage, cancelStream, resetStream };
}
