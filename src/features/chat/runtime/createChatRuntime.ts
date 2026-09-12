import { captureChatRuntimeFeatures } from "../domain/capabilities";
import {
  initialExecutionState,
  reduceExecutionState,
  type ExecutionRuntimeEvent,
} from "../domain/executionReducer";
import { reduceMessageProjection } from "../domain/messageReducer";
import type {
  ChatRuntimeFeatureSnapshot,
  ChatRuntimeSnapshot,
  ChatStreamEntry,
  RuntimeMessageProjection,
  TransportState,
} from "../domain/runtimeTypes";
import { adaptChatEventFrame, type AdaptedChatEvent } from "../transport/legacyEventAdapter";
import { FetchSseParser, type FetchSseFrame } from "../transport/sseParser";
import { adaptChatSnapshot } from "../transport/snapshotAdapter";

export type ChatFrameApplyResult =
  | { status: "applied"; event: AdaptedChatEvent }
  | { status: "duplicate" | "stale" | "invalid" | "sentinel"; event?: AdaptedChatEvent };

type RuntimeOptions = {
  features?: ChatRuntimeFeatureSnapshot;
  seenEventLimit?: number;
};

export type SnapshotApplyGuard = {
  sessionEpoch: number;
  lastAppliedEventId: string;
  messageRevision: string | null;
};

const defaultSnapshot = (features: ChatRuntimeFeatureSnapshot): ChatRuntimeSnapshot => ({
  scope: { sessionId: null, sessionEpoch: 0 },
  execution: initialExecutionState(),
  transport: { state: "disconnected", source: null },
  view: { activeRenderKey: null, messageRevision: null },
  cursors: {
    lastAppliedEventId: "",
    serverHighWatermark: "",
    snapshotCoversThroughEventId: "",
  },
  features,
  messages: new Map(),
  invalidEventCount: 0,
});

function eventExecutionUpdate(event: AdaptedChatEvent): ExecutionRuntimeEvent {
  const legacy = event.legacy;
  let phase = event.phase || undefined;
  if (!phase) {
    if ([
      "stream_start", "delta", "token", "tool_use", "tool_result", "heartbeat",
      "message.delta", "message.snapshot", "tool.started", "tool.result",
    ].includes(event.type)) phase = "running";
    else if (["resume_generating", "resume_unavailable", "resume_timeout", "resume_error"].includes(event.type)) phase = "recovering";
    else if (["done", "resume_done", "message.final"].includes(event.type)) phase = "finalizing";
    else if (event.type === "stop_accepted") phase = "stopping";
  }
  return {
    phase,
    executionId: event.executionId || (typeof legacy.execution_id === "string" ? legacy.execution_id : null),
    generationId: event.generationId,
    ownerEpoch: event.ownerEpoch,
    revision: event.sequence,
    finalMessageReady: event.type === "message.final" ? Boolean(event.payload.message) : undefined,
  };
}

function eventMessage(event: AdaptedChatEvent): RuntimeMessageProjection | null {
  const payload = event.payload;
  const direct = payload.message;
  if (direct && typeof direct === "object" && !Array.isArray(direct) && (direct as { id?: unknown }).id) {
    return direct as RuntimeMessageProjection;
  }
  if (event.type === "message.snapshot" && payload.message_id) {
    return {
      id: String(payload.message_id),
      session_id: event.sessionId || undefined,
      execution_id: event.executionId,
      generation_id: event.generationId,
      content: String(payload.text ?? payload.content ?? ""),
      content_version: typeof payload.content_version === "string" ? payload.content_version : null,
      content_completeness: "full",
    };
  }
  return null;
}

export class ChatRuntime {
  private snapshotValue: ChatRuntimeSnapshot;
  private readonly seenEventIds = new Set<string>();
  private readonly seenEventLimit: number;

  constructor(options: RuntimeOptions = {}) {
    this.snapshotValue = defaultSnapshot(options.features || captureChatRuntimeFeatures());
    this.seenEventLimit = options.seenEventLimit || 2_000;
  }

  get snapshot(): ChatRuntimeSnapshot { return this.snapshotValue; }

  /** A live session keeps its initially captured flag/capability adapter. */
  openSession(sessionId: string | null, features?: ChatRuntimeFeatureSnapshot): ChatRuntimeSnapshot {
    if (this.snapshotValue.scope.sessionId === sessionId) return this.snapshotValue;
    const sessionEpoch = this.snapshotValue.scope.sessionEpoch + 1;
    this.seenEventIds.clear();
    this.snapshotValue = {
      ...defaultSnapshot(features || this.snapshotValue.features),
      scope: { sessionId, sessionEpoch },
    };
    return this.snapshotValue;
  }

  setTransport(state: TransportState, source: ChatStreamEntry | null = null): void {
    if (this.snapshotValue.transport.state === state && this.snapshotValue.transport.source === source) return;
    this.snapshotValue = { ...this.snapshotValue, transport: { state, source } };
  }

  beginExecution(executionId: string | null = null, source: ChatStreamEntry = "direct"): void {
    this.seenEventIds.clear();
    this.snapshotValue = {
      ...this.snapshotValue,
      execution: { ...initialExecutionState(), executionId, phase: "queued" },
      transport: { state: "connecting", source },
      cursors: {
        lastAppliedEventId: "",
        serverHighWatermark: "",
        snapshotCoversThroughEventId: "",
      },
    };
  }

  observeServerHighWatermark(eventId: string | null | undefined): void {
    if (typeof eventId !== "string" || eventId === this.snapshotValue.cursors.serverHighWatermark) return;
    this.snapshotValue = {
      ...this.snapshotValue,
      cursors: { ...this.snapshotValue.cursors, serverHighWatermark: eventId },
    };
  }

  observeExecutionStatus(input: {
    executionId?: string | null;
    phase?: ExecutionRuntimeEvent["phase"];
    revision?: string | null;
    finalMessageReady?: boolean;
    serverHighWatermark?: string | null;
  }): void {
    this.observeServerHighWatermark(input.serverHighWatermark);
    const execution = reduceExecutionState(this.snapshotValue.execution, input);
    if (execution !== this.snapshotValue.execution) this.snapshotValue = { ...this.snapshotValue, execution };
  }

  captureSnapshotGuard(): SnapshotApplyGuard {
    return {
      sessionEpoch: this.snapshotValue.scope.sessionEpoch,
      lastAppliedEventId: this.snapshotValue.cursors.lastAppliedEventId,
      messageRevision: this.snapshotValue.view.messageRevision,
    };
  }

  applySnapshot(value: unknown, guard: SnapshotApplyGuard): boolean {
    const adapted = adaptChatSnapshot(value);
    if (!adapted.ok || adapted.snapshot.sessionId !== this.snapshotValue.scope.sessionId) return false;
    if (
      guard.sessionEpoch !== this.snapshotValue.scope.sessionEpoch
      || guard.lastAppliedEventId !== this.snapshotValue.cursors.lastAppliedEventId
      || guard.messageRevision !== this.snapshotValue.view.messageRevision
    ) return false;
    let messages: ReadonlyMap<string, RuntimeMessageProjection> = this.snapshotValue.messages;
    for (const message of adapted.snapshot.messages) messages = reduceMessageProjection(messages, message);
    this.snapshotValue = {
      ...this.snapshotValue,
      messages,
      execution: reduceExecutionState(this.snapshotValue.execution, {
        executionId: adapted.snapshot.executionId,
        generationId: adapted.snapshot.generationId,
      }),
      view: { ...this.snapshotValue.view, messageRevision: adapted.snapshot.sessionRevision },
      cursors: {
        lastAppliedEventId: adapted.snapshot.coversThroughEventId,
        snapshotCoversThroughEventId: adapted.snapshot.coversThroughEventId,
        serverHighWatermark: adapted.snapshot.serverHighWatermark,
      },
    };
    return true;
  }

  applyFrame(frame: FetchSseFrame, source: ChatStreamEntry): ChatFrameApplyResult {
    const adapted = adaptChatEventFrame(frame);
    if (!adapted.ok) {
      if ("reason" in adapted && adapted.reason === "sentinel") return { status: "sentinel" };
      this.snapshotValue = { ...this.snapshotValue, invalidEventCount: this.snapshotValue.invalidEventCount + 1 };
      return { status: "invalid" };
    }
    const event = adapted.event;
    if (event.sessionId && event.sessionId !== this.snapshotValue.scope.sessionId) {
      return { status: "stale", event };
    }
    if (event.eventId && this.seenEventIds.has(event.eventId)) {
      return { status: "duplicate", event };
    }

    let messages = this.snapshotValue.messages;
    const message = eventMessage(event);
    if (message) messages = reduceMessageProjection(messages, message);
    const execution = reduceExecutionState(this.snapshotValue.execution, eventExecutionUpdate(event));
    const nextCursor = event.eventId ?? this.snapshotValue.cursors.lastAppliedEventId;
    this.snapshotValue = {
      ...this.snapshotValue,
      messages,
      execution,
      transport: { state: "connected", source },
      cursors: { ...this.snapshotValue.cursors, lastAppliedEventId: nextCursor },
    };
    if (event.eventId) this.rememberEventId(event.eventId);
    return { status: "applied", event };
  }

  createEventStream(source: ChatStreamEntry): ChatEventStreamDispatcher {
    return new ChatEventStreamDispatcher(this, source);
  }

  private rememberEventId(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size <= this.seenEventLimit) return;
    const oldest = this.seenEventIds.values().next().value as string | undefined;
    if (oldest) this.seenEventIds.delete(oldest);
  }
}

export class ChatEventStreamDispatcher {
  private readonly parser = new FetchSseParser();

  constructor(private readonly runtime: ChatRuntime, private readonly source: ChatStreamEntry) {}

  push(chunk: Uint8Array): ChatFrameApplyResult[] {
    return this.parser.push(chunk).map((frame) => this.runtime.applyFrame(frame, this.source));
  }

  finish(): ChatFrameApplyResult[] {
    return this.parser.finish().map((frame) => this.runtime.applyFrame(frame, this.source));
  }
}

export function createChatRuntime(options: RuntimeOptions = {}): ChatRuntime {
  return new ChatRuntime(options);
}
