import type {
  ChatRuntimeFeatureSnapshot,
  ChatRuntimeSnapshot,
  ExecutionPhase,
} from "./runtimeTypes";

type FeatureInput = {
  runtimeV2?: boolean;
  protocolV2?: boolean;
  advertised?: readonly string[] | null;
};

export function captureChatRuntimeFeatures(input: FeatureInput = {}): ChatRuntimeFeatureSnapshot {
  const advertised = [...new Set(input.advertised || [])].sort();
  const protocolV2 = Boolean(
    input.runtimeV2
    && input.protocolV2
    && advertised.includes("chat.protocol.v2"),
  );
  return Object.freeze({
    runtimeV2: Boolean(input.runtimeV2),
    protocolMode: protocolV2 ? "v2" : "legacy-v1",
    serverCapabilities: Object.freeze(advertised),
  });
}

const ACTIVE_PHASES = new Set<ExecutionPhase>([
  "queued",
  "running",
  "recovering",
  "finalizing",
  "awaiting_approval",
  "stopping",
]);

export type ChatCapabilities = {
  canStop: boolean;
  canQueueInstruction: boolean;
  canResume: boolean;
  canReplaceResponse: boolean;
  canEditHistory: boolean;
  protocolMode: "legacy-v1" | "v2";
};

export function deriveChatCapabilities(
  runtime: Pick<ChatRuntimeSnapshot, "execution" | "features">,
  options: { canWrite?: boolean } = {},
): ChatCapabilities {
  const canWrite = options.canWrite !== false;
  const phase = runtime.execution.phase;
  const active = ACTIVE_PHASES.has(phase);
  const stopping = phase === "stopping";
  return {
    canStop: canWrite && active && !stopping,
    canQueueInstruction: canWrite && active && !stopping,
    canResume: canWrite && ["recovering", "interrupted", "failed"].includes(phase),
    canReplaceResponse: canWrite && !active,
    canEditHistory: canWrite && !active,
    protocolMode: runtime.features.protocolMode,
  };
}

/** Keeps v1 UI locks working while the route moves state ownership to runtime. */
export function adaptLegacyExecutionPhase(input: {
  streaming: boolean;
  waitingForBackground: boolean;
  stopping?: boolean;
  completed?: boolean;
}): ExecutionPhase {
  if (input.stopping) return "stopping";
  if (input.streaming) return input.waitingForBackground ? "recovering" : "running";
  if (input.waitingForBackground) return "recovering";
  if (input.completed) return "completed";
  return "idle";
}
