export type ForegroundStreamRequest = {
  requestId: number;
  sessionId: string;
  previousExecutionId: string | null;
};

export type StreamingStatusIdentity = {
  is_streaming: boolean;
  just_completed?: boolean;
  execution_id?: string | null;
};

type StreamingStatusGuardInput = {
  sessionId: string;
  status: StreamingStatusIdentity;
  pendingRequest: ForegroundStreamRequest | null;
  expectedExecutionId: string | null;
};

/**
 * Reject a streaming-status snapshot that belongs to the previous request.
 *
 * The backend intentionally keeps a completed snapshot available for a short
 * recovery window. Between clicking Send and the new stream_start event, that
 * old snapshot must not be allowed to finalize the new optimistic placeholder.
 */
export function shouldIgnoreStreamingStatus({
  sessionId,
  status,
  pendingRequest,
  expectedExecutionId,
}: StreamingStatusGuardInput): boolean {
  const statusExecutionId = status.execution_id || null;
  const activeStatus = status.is_streaming || Boolean(status.just_completed);
  const pendingForSession = pendingRequest?.sessionId === sessionId ? pendingRequest : null;

  if (pendingForSession) {
    if (status.just_completed || !status.is_streaming || !statusExecutionId) return true;
    if (
      pendingForSession.previousExecutionId &&
      statusExecutionId === pendingForSession.previousExecutionId
    ) return true;
    return false;
  }

  return Boolean(
    activeStatus &&
    expectedExecutionId &&
    statusExecutionId &&
    statusExecutionId !== expectedExecutionId
  );
}
