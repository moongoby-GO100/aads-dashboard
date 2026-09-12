export type InterruptReceiptRollback<T extends { id: string }> = {
  queue: string[];
  messages: T[];
};

export function removeFirstQueuedInterrupt(
  queue: readonly string[],
  content: string,
): string[] {
  const failedQueueIndex = queue.indexOf(content);
  return failedQueueIndex < 0
    ? [...queue]
    : [...queue.slice(0, failedQueueIndex), ...queue.slice(failedQueueIndex + 1)];
}

export function removeOptimisticInterruptMessage<T extends { id: string }>(
  messages: readonly T[],
  localMessageId: string,
): T[] {
  return messages.filter((message) => message.id !== localMessageId);
}

/**
 * Removes only the optimistic state created for a receipt that the server did
 * not durably commit. Equal later instructions remain independent commands.
 */
export function rollbackOptimisticInterruptReceipt<T extends { id: string }>(
  queue: readonly string[],
  content: string,
  messages: readonly T[],
  localMessageId: string,
): InterruptReceiptRollback<T> {
  return {
    queue: removeFirstQueuedInterrupt(queue, content),
    messages: removeOptimisticInterruptMessage(messages, localMessageId),
  };
}
