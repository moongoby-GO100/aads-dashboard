import {
  decideChatFollow,
  isChatNearBottom,
  nextChatFollowModeAfterUserScroll,
  shouldLockHistoryActions,
} from "./chatScrollPolicy";

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

assertEqual(isChatNearBottom({ scrollTop: 700, clientHeight: 300, scrollHeight: 1000 }), true, "at bottom");
assertEqual(isChatNearBottom({ scrollTop: 399, clientHeight: 300, scrollHeight: 1000 }), false, "outside threshold");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 200, clientHeight: 300, scrollHeight: 1000 }), "manual", "user owns history viewport");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 650, clientHeight: 300, scrollHeight: 1000 }), "auto", "user returned near bottom");
assertEqual(decideChatFollow({ mode: "manual", isNearBottom: true, activeReply: true, bottomStickActive: true, messageCountGrew: true }), "none", "manual always wins");
assertEqual(decideChatFollow({ mode: "auto", isNearBottom: false, activeReply: true, bottomStickActive: true, messageCountGrew: true }), "none", "history viewport is not forced");
assertEqual(decideChatFollow({ mode: "auto", isNearBottom: true, activeReply: false, bottomStickActive: true, messageCountGrew: true }), "none", "idle does not follow");
assertEqual(decideChatFollow({ mode: "auto", isNearBottom: true, activeReply: true, bottomStickActive: true, messageCountGrew: false }), "force-bottom", "send stick follows updates");
assertEqual(decideChatFollow({ mode: "auto", isNearBottom: true, activeReply: true, bottomStickActive: false, messageCountGrew: true }), "follow-bottom", "new message follows");
assertEqual(decideChatFollow({ mode: "auto", isNearBottom: true, activeReply: true, bottomStickActive: false, messageCountGrew: false }), "none", "poll replacement does not scroll");
assertEqual(shouldLockHistoryActions(false, true), true, "recovery locks actions");
assertEqual(shouldLockHistoryActions(false, false), false, "idle unlocks actions");

console.log("PASS: 12 chat scroll policy cases");
