export type RequestedModelSelection = Readonly<{
  commandId: string;
  requestedModelId: string;
  requestedAccountId: string | null;
  requestedRoleId: string | null;
  selectionVersion: number;
  capturedAt: string;
}>;

export type ActualModelAttempt = Readonly<{
  commandId: string;
  executionId: string;
  attemptId: string;
  attemptNumber: number;
  actualModelId: string;
  actualAccountId: string | null;
  fallbackReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
}>;

export type ModelProvenance = Readonly<{
  requested: RequestedModelSelection;
  attempts: readonly ActualModelAttempt[];
  actual: ActualModelAttempt | null;
  fallbackApplied: boolean;
}>;

export function captureRequestedModelSelection(input: RequestedModelSelection): RequestedModelSelection {
  if (!input.commandId || !input.requestedModelId || !Number.isInteger(input.selectionVersion) || input.selectionVersion < 1) {
    throw new TypeError("invalid requested model selection");
  }
  return Object.freeze({ ...input });
}

/** Existing execution snapshots stay immutable when the composer changes. */
export function appendActualModelAttempt(
  provenance: ModelProvenance,
  attempt: ActualModelAttempt,
): ModelProvenance {
  if (attempt.commandId !== provenance.requested.commandId) throw new TypeError("command scope mismatch");
  if (!attempt.executionId || !attempt.attemptId || !attempt.actualModelId) throw new TypeError("invalid model attempt");
  if (!Number.isInteger(attempt.attemptNumber) || attempt.attemptNumber < 1) throw new TypeError("invalid attempt number");
  if (provenance.attempts.some((item) => item.attemptId === attempt.attemptId)) return provenance;
  if (provenance.attempts.some((item) => item.attemptNumber >= attempt.attemptNumber)) {
    throw new RangeError("model attempts must be appended in ledger order");
  }
  const attempts = [...provenance.attempts, Object.freeze({ ...attempt })];
  return {
    requested: provenance.requested,
    attempts,
    actual: attempts.at(-1) ?? null,
    fallbackApplied: attempts.some((item) => item.actualModelId !== provenance.requested.requestedModelId),
  };
}

export function createModelProvenance(requested: RequestedModelSelection): ModelProvenance {
  return { requested: captureRequestedModelSelection(requested), attempts: [], actual: null, fallbackApplied: false };
}
