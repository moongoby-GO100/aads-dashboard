import type { ExecutionPhase } from "../domain/runtimeTypes";
import type { FetchSseFrame } from "./sseParser";

export type LegacyChatEvent = {
  type: string;
  content?: string;
  text?: string;
  thinking?: string;
  execution_id?: string;
  generation_id?: string;
  message?: unknown;
  message_id?: string;
  model?: string;
  requested_model?: string;
  fallback_reason?: string;
  intent?: string;
  confidence_label?: "db_realtime" | "ai_inference" | "mixed";
  session_cost?: string;
  session_turns?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost?: string | number;
  cost_usd?: number;
  duration_sec?: number;
  duration_ms?: number;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  tool_count?: number;
  last_tool?: string;
  attempt?: number;
  max_attempts?: number;
  from_model?: string;
  to_model?: string;
  reason?: string;
  consecutive_count?: number;
  current_turn?: number;
  extended_to?: number;
  error_type?: string;
  error_code?: string;
  raw_error?: string;
  cancel_scope?: string;
  recoverable?: boolean;
  is_error?: boolean;
  summary_only?: boolean;
  original_content?: string;
  modified_content?: string;
  file_path?: string;
  name?: string;
  [key: string]: unknown;
};

export type AdaptedChatEvent = {
  schemaVersion: number;
  eventId: string | null;
  type: string;
  sessionId: string | null;
  executionId: string | null;
  generationId: string | null;
  ownerEpoch: string | null;
  sequence: string | null;
  phase: ExecutionPhase | null;
  payload: Record<string, unknown>;
  legacy: LegacyChatEvent;
  unknownAdditive: boolean;
};

export type ChatEventAdaptResult =
  | { ok: true; event: AdaptedChatEvent }
  | { ok: false; reason: "invalid-json" | "invalid-schema" | "event-id-mismatch" | "sentinel" };

const KNOWN_V2_TYPES = new Set([
  "message.delta",
  "message.snapshot",
  "message.final",
  "execution.phase",
  "tool.started",
  "tool.result",
  "command.accepted",
  "command.applied",
  "command.failed",
  "artifact.changed",
  "usage.updated",
  "stream.reset",
  "heartbeat",
]);

const PHASES = new Set<ExecutionPhase>([
  "idle", "queued", "running", "recovering", "finalizing",
  "awaiting_approval", "stopping", "completed", "interrupted", "failed",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function phaseOrNull(value: unknown): ExecutionPhase | null {
  return typeof value === "string" && PHASES.has(value as ExecutionPhase)
    ? value as ExecutionPhase
    : null;
}

function legacyFromV2(type: string, payload: Record<string, unknown>, envelope: Record<string, unknown>): LegacyChatEvent {
  const common = {
    ...payload,
    type,
    execution_id: stringOrNull(envelope.execution_id) || undefined,
    generation_id: stringOrNull(envelope.generation_id) || undefined,
  } as LegacyChatEvent;
  if (type === "message.delta") return {
    ...common,
    type: "delta",
    content: typeof (payload.text ?? payload.content) === "string"
      ? String(payload.text ?? payload.content)
      : undefined,
  };
  if (type === "message.final") return { ...common, type: "done", message: payload.message };
  if (type === "stream.reset") return { ...common, type: "stream_reset" };
  if (type === "tool.started") return { ...common, type: "tool_use", tool_name: stringOrNull(payload.tool_name) || undefined };
  if (type === "tool.result") return { ...common, type: "tool_result", tool_name: stringOrNull(payload.tool_name) || undefined };
  return { ...common, type };
}

export function adaptChatEventFrame(frame: FetchSseFrame): ChatEventAdaptResult {
  if (frame.data === "[DONE]") return { ok: false, reason: "sentinel" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const value = record(parsed);
  if (!value || typeof value.type !== "string" || !value.type) {
    return { ok: false, reason: "invalid-schema" };
  }

  const schemaVersion = Number(value.schema_version || 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, reason: "invalid-schema" };
  }
  if (schemaVersion === 1) {
    if (value.type === "delta" && typeof value.content !== "string") {
      return { ok: false, reason: "invalid-schema" };
    }
    if (value.type === "token" && typeof value.text !== "string") {
      return { ok: false, reason: "invalid-schema" };
    }
    return {
      ok: true,
      event: {
        schemaVersion,
        eventId: frame.id,
        type: value.type,
        sessionId: stringOrNull(value.session_id),
        executionId: stringOrNull(value.execution_id),
        generationId: stringOrNull(value.generation_id),
        ownerEpoch: stringOrNull(value.owner_epoch),
        sequence: stringOrNull(value.sequence),
        phase: phaseOrNull(value.phase),
        payload: value,
        legacy: value as LegacyChatEvent,
        unknownAdditive: false,
      },
    };
  }

  const payload = record(value.payload);
  const envelopeEventId = stringOrNull(value.event_id);
  if (!payload || !envelopeEventId || !stringOrNull(value.session_id)) {
    return { ok: false, reason: "invalid-schema" };
  }
  if (frame.id !== null && frame.id !== envelopeEventId) {
    return { ok: false, reason: "event-id-mismatch" };
  }
  if (value.type === "message.delta" && typeof (payload.text ?? payload.content) !== "string") {
    return { ok: false, reason: "invalid-schema" };
  }
  if (value.type === "execution.phase" && !phaseOrNull(payload.phase)) {
    return { ok: false, reason: "invalid-schema" };
  }
  return {
    ok: true,
    event: {
      schemaVersion,
      eventId: envelopeEventId,
      type: value.type,
      sessionId: stringOrNull(value.session_id),
      executionId: stringOrNull(value.execution_id),
      generationId: stringOrNull(value.generation_id),
      ownerEpoch: stringOrNull(value.owner_epoch),
      sequence: stringOrNull(value.sequence),
      phase: value.type === "execution.phase" ? phaseOrNull(payload.phase) : null,
      payload,
      legacy: legacyFromV2(value.type, payload, value),
      unknownAdditive: !KNOWN_V2_TYPES.has(value.type),
    },
  };
}
