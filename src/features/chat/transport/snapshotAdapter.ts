import type { ExecutionPhase, RuntimeMessageProjection } from "../domain/runtimeTypes";

export type ChatSnapshot = {
  sessionId: string;
  sessionRevision: string | null;
  messageRevision: string | null;
  executionId: string | null;
  executionPhase: ExecutionPhase | null;
  executionOwnerEpoch: string | null;
  executionRevision: string | null;
  generationId: string | null;
  coversThroughEventId: string;
  serverHighWatermark: string;
  messages: RuntimeMessageProjection[];
};

export type ChatSessionRevisionSnapshot = {
  sessionRevision: string;
  messageRevision: string;
  artifactRevision: string;
  executionRevision: string;
};

export type ChatSessionView = {
  snapshot: ChatSnapshot;
  revisions: ChatSessionRevisionSnapshot;
  nextCursor: string | null;
  hasMore: boolean;
  productionReady: boolean;
  snapshotAt: string;
};

export type SessionViewAdaptResult =
  | { ok: true; view: ChatSessionView }
  | { ok: false; reason: string };

export type SnapshotAdaptResult =
  | { ok: true; snapshot: ChatSnapshot }
  | { ok: false; reason: string };

const text = (value: unknown) => typeof value === "string" ? value : null;

const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const revision = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) return value;
  return null;
};

const executionPhases = new Set<ExecutionPhase>([
  "idle", "queued", "running", "recovering", "finalizing",
  "awaiting_approval", "stopping", "completed", "interrupted", "failed",
]);

const executionPhase = (value: unknown): ExecutionPhase | null => {
  if (value === "retrying") return "recovering";
  return typeof value === "string" && executionPhases.has(value as ExecutionPhase)
    ? value as ExecutionPhase
    : null;
};

/**
 * Validates the additive WP04 session-view contract without decoding its
 * opaque cursor.  Unknown fields are intentionally ignored for forward
 * compatibility, while identity/revision/checkpoint fields fail closed.
 */
export function adaptChatSessionView(value: unknown): SessionViewAdaptResult {
  const raw = record(value);
  if (!raw) return { ok: false, reason: "session-view-not-object" };
  if (raw.schema_version !== 2 || raw.contract_version !== 2) {
    return { ok: false, reason: "session-view-version-unsupported" };
  }

  const session = record(raw.session);
  const revisions = record(raw.revisions);
  const checkpoint = raw.checkpoint === null ? null : record(raw.checkpoint);
  const execution = raw.execution === null ? null : record(raw.execution);
  const messagePage = record(raw.messages);
  const messageRows = Array.isArray(raw.messages)
    ? raw.messages
    : messagePage && Array.isArray(messagePage.messages)
      ? messagePage.messages
      : null;
  const page = messagePage ? record(messagePage.page) : null;
  const sessionId = text(raw.session_id) || text(session?.id) || text(session?.session_id);
  const snapshotAt = text(raw.snapshot_at);
  if (!sessionId || !snapshotAt || !revisions || !messageRows) {
    return { ok: false, reason: "session-view-contract-incomplete" };
  }
  if (messageRows.some((message) => !record(message)?.id)) {
    return { ok: false, reason: "session-view-message-invalid" };
  }

  const sessionRevision = revision(revisions.session_revision ?? revisions.session);
  const messageRevision = revision(revisions.message_revision ?? revisions.message);
  const artifactRevision = revision(revisions.artifact_revision ?? revisions.artifact);
  const executionRevision = revision(revisions.execution_revision ?? revisions.execution);
  if (
    sessionRevision === null
    || messageRevision === null
    || artifactRevision === null
    || executionRevision === null
  ) {
    return { ok: false, reason: "session-view-revision-invalid" };
  }

  const executionId = text(execution?.id) || text(execution?.execution_id);
  const phase = execution ? executionPhase(execution.phase) : null;
  const ownerEpoch = execution ? revision(execution.owner_epoch) : null;
  if (execution && (!executionId || phase === null || ownerEpoch === null)) {
    return { ok: false, reason: "session-view-execution-invalid" };
  }
  const checkpointExecutionId = checkpoint ? text(checkpoint.execution_id) : null;
  if (checkpoint && (!checkpointExecutionId || revision(checkpoint.content_version) === null)) {
    return { ok: false, reason: "session-view-checkpoint-invalid" };
  }
  if (executionId && checkpointExecutionId && executionId !== checkpointExecutionId) {
    return { ok: false, reason: "session-view-execution-mismatch" };
  }

  const rawNextCursor = raw.next_cursor ?? page?.next_cursor ?? null;
  const nextCursor = rawNextCursor === null ? null : text(rawNextCursor);
  if (rawNextCursor !== null && nextCursor === null) {
    return { ok: false, reason: "session-view-cursor-invalid" };
  }
  const hasMore = raw.has_more ?? page?.has_more;
  if (typeof hasMore !== "boolean" || typeof raw.production_ready !== "boolean") {
    return { ok: false, reason: "session-view-flags-invalid" };
  }
  const pageSessionId = messagePage ? text(messagePage.session_id) : sessionId;
  const pageSessionRevision = messagePage ? revision(messagePage.session_revision) : sessionRevision;
  const pageMessageRevision = messagePage ? revision(messagePage.message_revision) : messageRevision;
  if (
    pageSessionId !== sessionId
    || pageSessionRevision !== sessionRevision
    || pageMessageRevision !== messageRevision
  ) {
    return { ok: false, reason: "session-view-page-scope-mismatch" };
  }

  return {
    ok: true,
    view: {
      snapshot: {
        sessionId,
        sessionRevision,
        messageRevision,
        executionId: executionId || checkpointExecutionId,
        executionPhase: phase,
        executionOwnerEpoch: ownerEpoch,
        executionRevision,
        generationId: checkpoint ? text(checkpoint.generation_id) : null,
        coversThroughEventId: checkpoint
          ? text(checkpoint.covers_through_event_id) || text(checkpoint.covers_event_id) || ""
          : "",
        serverHighWatermark: text(raw.server_high_watermark) || "",
        messages: messageRows as RuntimeMessageProjection[],
      },
      revisions: {
        sessionRevision,
        messageRevision,
        artifactRevision,
        executionRevision,
      },
      nextCursor,
      hasMore,
      productionReady: raw.production_ready,
      snapshotAt,
    },
  };
}

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
      messageRevision: text(raw.message_revision) ?? text(raw.session_revision),
      executionId: text(raw.execution_id),
      executionPhase: null,
      executionOwnerEpoch: null,
      executionRevision: null,
      generationId: text(raw.generation_id),
      coversThroughEventId: coverage,
      serverHighWatermark: highWatermark,
      messages: raw.messages as RuntimeMessageProjection[],
    },
  };
}
