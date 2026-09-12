export const CHAT_BOTTOM_THRESHOLD_PX = 300;

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
  return isChatNearBottom(metrics) ? "auto" : "manual";
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
