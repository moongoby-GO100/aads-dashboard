type Dependencies = {
  isCurrentSession: () => boolean;
  isLocallyActive: () => boolean;
  readActive: () => Promise<boolean>;
  confirm: () => boolean;
  stop: () => Promise<void>;
};

/** Fail closed before edits/regeneration can replace an active reply. */
export async function allowReplyReplacement(deps: Dependencies): Promise<boolean> {
  const serverActive = await deps.readActive();
  if (!deps.isCurrentSession()) return false;
  if (!serverActive && !deps.isLocallyActive()) return true;
  if (!deps.confirm() || !deps.isCurrentSession()) return false;
  await deps.stop();
  if (!deps.isCurrentSession()) return false;
  // A successful HTTP stop may only have queued cancellation on another worker.
  return !(await deps.readActive()) && deps.isCurrentSession();
}

export function shouldQueueAdditionalInstruction(active: boolean, isRetry: boolean): boolean {
  return active && !isRetry;
}
