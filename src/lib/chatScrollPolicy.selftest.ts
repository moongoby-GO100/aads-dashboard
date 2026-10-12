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
assertEqual(isChatNearBottom({ scrollTop: 400, clientHeight: 300, scrollHeight: 1000 }), true, "threshold edge is still near bottom");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 399, clientHeight: 300, scrollHeight: 1000 }), "manual", "outside the near-bottom band releases follow");
assertEqual(decideChatFollow({ mode: "manual", isNearBottom: false, activeReply: true, bottomStickActive: false, messageCountGrew: true }), "none", "reading a past message: streaming never scrolls");
assertEqual(decideChatFollow({ mode: "manual", isNearBottom: false, activeReply: true, bottomStickActive: true, messageCountGrew: false }), "none", "send-stick cannot override a reader who left the bottom");
// AADS-CHAT-SCROLL-AUTOMOVE-RECUR-20261012 (CEO 2026-10-12): a reader who moved
// up on purpose is reading, even inside the 300px near-bottom band.  Production
// /chat probe: a 180px wheel/drag up left follow armed and the next row commit
// or streaming update pulled the view back to the bottom.
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 520, clientHeight: 300, scrollHeight: 1000 }), "manual", "a 180px scroll up inside the band releases follow");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 610, clientHeight: 300, scrollHeight: 1000 }), "manual", "a 90px scroll up releases follow");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 640, clientHeight: 300, scrollHeight: 1000 }), "auto", "within the release distance still follows");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 636, clientHeight: 300, scrollHeight: 1000 }), "auto", "release distance edge still follows");
assertEqual(nextChatFollowModeAfterUserScroll({ scrollTop: 635, clientHeight: 300, scrollHeight: 1000 }), "manual", "one pixel past the release distance releases follow");
assertEqual(shouldLockHistoryActions(false, true), true, "recovery locks actions");
assertEqual(shouldLockHistoryActions(false, false), false, "idle unlocks actions");

console.log("PASS: 21 chat scroll policy cases");
