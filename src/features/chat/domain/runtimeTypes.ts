export type ExecutionPhase =
  | "idle"
  | "queued"
  | "running"
  | "recovering"
  | "finalizing"
  | "awaiting_approval"
  | "stopping"
  | "completed"
  | "interrupted"
  | "failed";

export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export type ChatStreamEntry = "direct" | "replay" | "resume" | "regenerate";
export type ChatProtocolMode = "legacy-v1" | "v2";
export type ContentCompleteness = "minimal" | "preview" | "render" | "full";

export type ChatRuntimeScope = {
  sessionId: string | null;
  sessionEpoch: number;
};

export type ChatExecutionState = {
  executionId: string | null;
  generationId: string | null;
  ownerEpoch: string | null;
  phase: ExecutionPhase;
  revision: string | null;
  finalMessageReady: boolean;
};

export type ChatTransportSlice = {
  state: TransportState;
  source: ChatStreamEntry | null;
};

export type ChatViewSlice = {
  activeRenderKey: string | null;
  messageRevision: string | null;
};

export type ChatCursorState = {
  lastAppliedEventId: string;
  serverHighWatermark: string;
  snapshotCoversThroughEventId: string;
};

export type ChatRuntimeFeatureSnapshot = Readonly<{
  runtimeV2: boolean;
  protocolMode: ChatProtocolMode;
  serverCapabilities: readonly string[];
}>;

export type RuntimeMessageProjection = {
  id: string;
  render_id?: string;
  render_key?: string;
  session_id?: string;
  execution_id?: string | null;
  generation_id?: string | null;
  segment_id?: string | null;
  content?: string;
  content_version?: string | number | null;
  content_completeness?: ContentCompleteness;
  content_length?: number;
  is_truncated?: boolean;
};

export type ChatRuntimeSnapshot = {
  scope: ChatRuntimeScope;
  execution: ChatExecutionState;
  transport: ChatTransportSlice;
  view: ChatViewSlice;
  cursors: ChatCursorState;
  features: ChatRuntimeFeatureSnapshot;
  messages: ReadonlyMap<string, RuntimeMessageProjection>;
  invalidEventCount: number;
};
