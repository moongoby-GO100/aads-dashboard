export const CHAT_BOTTOM_THRESHOLD_PX = 300;

/**
 * A user scroll that leaves the bottom by more than this ends follow, even
 * inside CHAT_BOTTOM_THRESHOLD_PX (CEO decision 2026-10-12: a reader who moved
 * up on purpose is reading).  Coming back within it resumes follow.  The 300px
 * band still decides whether a *following* view keeps up with content growth.
 */
export const CHAT_FOLLOW_RELEASE_PX = 64;

export type ChatFollowMode = "auto" | "manual";

export type ChatScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

export type ChatFollowDecision = "none" | "follow-bottom" | "force-bottom";

export function isChatNearBottom(
  metrics: ChatScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  return metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - threshold;
}

export function nextChatFollowModeAfterUserScroll(metrics: ChatScrollMetrics): ChatFollowMode {
  return isChatNearBottom(metrics, CHAT_FOLLOW_RELEASE_PX) ? "auto" : "manual";
}

export function decideChatFollow(params: {
  mode: ChatFollowMode;
  isNearBottom: boolean;
  activeReply: boolean;
  bottomStickActive: boolean;
  messageCountGrew: boolean;
}): ChatFollowDecision {
  if (params.mode === "manual" || !params.activeReply || !params.isNearBottom) return "none";
  if (params.bottomStickActive) return "force-bottom";
  return params.messageCountGrew ? "follow-bottom" : "none";
}

export function shouldLockHistoryActions(streaming: boolean, waitingForBackground: boolean): boolean {
  return streaming || waitingForBackground;
}
