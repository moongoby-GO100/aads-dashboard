export const SESSION_ATTENTION_EVENT = "aads:session-attention-change";

export type SessionAttentionCounts = {
  workingCount: number;
  completedUnreadCount: number;
};

export function emitSessionAttentionChange(counts: SessionAttentionCounts): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SessionAttentionCounts>(SESSION_ATTENTION_EVENT, { detail: counts }),
  );
}
