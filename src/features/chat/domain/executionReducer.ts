import type { ChatExecutionState, ExecutionPhase } from "./runtimeTypes";

export type ExecutionRuntimeEvent = {
  phase?: ExecutionPhase;
  executionId?: string | null;
  generationId?: string | null;
  ownerEpoch?: string | null;
  revision?: string | null;
  finalMessageReady?: boolean;
};

export const TERMINAL_EXECUTION_PHASES = new Set<ExecutionPhase>([
  "completed",
  "interrupted",
  "failed",
]);

export const initialExecutionState = (): ChatExecutionState => ({
  executionId: null,
  generationId: null,
  ownerEpoch: null,
  phase: "idle",
  revision: null,
  finalMessageReady: false,
});

function compareDecimal(left: string | null | undefined, right: string | null | undefined): number | null {
  if (!left || !right || !/^\d+$/.test(left) || !/^\d+$/.test(right)) return null;
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Terminal phases and newer fenced owners cannot be rolled back by callbacks. */
export function reduceExecutionState(
  state: ChatExecutionState,
  event: ExecutionRuntimeEvent,
): ChatExecutionState {
  if (event.executionId && state.executionId && event.executionId !== state.executionId) {
    return state;
  }
  const ownerOrder = compareDecimal(event.ownerEpoch, state.ownerEpoch);
  if (ownerOrder === -1) return state;
  const revisionOrder = compareDecimal(event.revision, state.revision);
  if (revisionOrder === -1) return state;

  const requestedPhase = event.phase || state.phase;
  if (TERMINAL_EXECUTION_PHASES.has(state.phase) && requestedPhase !== state.phase) return state;
  const phase = requestedPhase === "completed" && event.finalMessageReady === false
    ? "finalizing"
    : requestedPhase;

  const next: ChatExecutionState = {
    executionId: event.executionId || state.executionId,
    generationId: event.generationId || state.generationId,
    ownerEpoch: event.ownerEpoch || state.ownerEpoch,
    phase,
    revision: event.revision || state.revision,
    finalMessageReady: event.finalMessageReady ?? state.finalMessageReady,
  };
  return Object.keys(next).every((key) =>
    next[key as keyof ChatExecutionState] === state[key as keyof ChatExecutionState]
  ) ? state : next;
}
