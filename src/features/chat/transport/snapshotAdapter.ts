import type { RuntimeMessageProjection } from "../domain/runtimeTypes";

export type ChatSnapshot = {
  sessionId: string;
  sessionRevision: string | null;
  executionId: string | null;
  generationId: string | null;
  coversThroughEventId: string;
  serverHighWatermark: string;
  messages: RuntimeMessageProjection[];
};

export type SnapshotAdaptResult =
  | { ok: true; snapshot: ChatSnapshot }
  | { ok: false; reason: string };

const text = (value: unknown) => typeof value === "string" ? value : null;

export function adaptChatSnapshot(value: unknown): SnapshotAdaptResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "snapshot-not-object" };
  }
  const raw = value as Record<string, unknown>;
  const sessionId = text(raw.session_id);
  const coverage = text(raw.covers_through_event_id);
  const highWatermark = text(raw.server_high_watermark);
  if (!sessionId || coverage === null || highWatermark === null || !Array.isArray(raw.messages)) {
    return { ok: false, reason: "snapshot-contract-incomplete" };
  }
  if (raw.messages.some((message) => !message || typeof message !== "object" || !(message as { id?: unknown }).id)) {
    return { ok: false, reason: "snapshot-message-invalid" };
  }
  return {
    ok: true,
    snapshot: {
      sessionId,
      sessionRevision: text(raw.session_revision),
      executionId: text(raw.execution_id),
      generationId: text(raw.generation_id),
      coversThroughEventId: coverage,
      serverHighWatermark: highWatermark,
      messages: raw.messages as RuntimeMessageProjection[],
    },
  };
}
