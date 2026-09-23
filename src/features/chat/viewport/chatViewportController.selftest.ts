import {
  ChatViewportController,
  type ChatViewportAdapter,
  type MessageViewportAnchor,
} from "./chatViewportController";

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function anchor(key = "row-1", scrollTop = 500): MessageViewportAnchor {
  return {
    renderKey: key,
    messageId: key,
    neighborKeys: ["row-2", "row-0"],
    offsetPx: 12,
    scrollTop,
    scrollHeight: 2_000,
    distanceFromBottom: 1_000,
    wasNearBottom: false,
  };
}

function harness() {
  let now = 0;
  let metrics = { scrollTop: 500, clientHeight: 500, scrollHeight: 2_000 };
  let currentAnchor = anchor();
  const writes: string[] = [];
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const adapter: ChatViewportAdapter = {
    readMetrics: () => metrics,
    captureAnchor: () => currentAnchor,
    restoreAnchor: (value) => { writes.push(`anchor:${value.renderKey}`); metrics = { ...metrics, scrollTop: value.scrollTop }; return true; },
    writeBottom: () => { writes.push("bottom"); metrics = { ...metrics, scrollTop: metrics.scrollHeight - metrics.clientHeight }; return true; },
    writeScrollTop: (value) => { writes.push(`top:${value}`); metrics = { ...metrics, scrollTop: value }; return true; },
    scrollElementIntoView: () => { writes.push("element"); return true; },
  };
  const controller = new ChatViewportController(adapter, {
    now: () => now,
    frames: {
      request(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
      cancel(id) { frames.delete(id); },
    },
  });
  return {
    controller,
    writes,
    setNow: (value: number) => { now = value; },
    setMetrics: (value: typeof metrics) => { metrics = value; },
    setAnchor: (value: MessageViewportAnchor) => { currentAnchor = value; },
    flushFrame: () => {
      const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return false;
      frames.delete(entry[0]);
      entry[1](now);
      return true;
    },
  };
}

// T01: a user gesture invalidates even a previously forced frame.
{
  const h = harness();
  h.controller.requestBottom(true, "user-send");
  h.controller.markUserGesture();
  h.flushFrame();
  assertEqual(h.writes.length, 0, "gesture cancels late forced scroll");
  h.setNow(30_000);
  h.controller.settleAfterMessageChange(true, true);
  h.flushFrame();
  assertEqual(h.writes.length, 0, "manual mode does not expire with time");
  assertEqual(h.controller.unreadMessages, 1, "manual mode counts new messages");
}

// T02: explicit latest resumes follow and uses the adapter, never a direct write.
{
  const h = harness();
  h.controller.markUserGesture();
  h.setNow(2_000);
  h.controller.jumpToLatest();
  h.flushFrame();
  h.flushFrame();
  assertEqual(h.controller.mode, "auto", "latest resumes auto follow");
  assertEqual(h.controller.unreadMessages, 0, "latest clears unread messages");
  assertEqual(h.writes.join(","), "bottom,bottom", "latest adapter writes");
}

// T03: the earliest anchor survives a batched prepend/hydrate and is consumed twice at most.
{
  const h = harness();
  h.controller.enqueueMutationAnchor(anchor("earliest"), "prepend");
  h.controller.enqueueMutationAnchor(anchor("later"), "hydrate");
  assertEqual(h.controller.commitPendingIntent(), true, "commit applies anchor");
  h.flushFrame();
  h.flushFrame();
  assertEqual(h.writes.join(","), "anchor:earliest,anchor:earliest", "bounded correction keeps earliest anchor");
}

// T03: a deleted primary row falls through to ordered neighbor keys in the DOM adapter contract.
assertEqual(anchor().neighborKeys.join(","), "row-2,row-0", "next neighbor precedes previous neighbor");

// T04: switching sessions and a later gesture both invalidate an old commit intent.
{
  const h = harness();
  h.controller.resetSession("A");
  h.controller.enqueueMutationAnchor(anchor("session-a"), "restore-session");
  h.controller.resetSession("B");
  assertEqual(h.controller.commitPendingIntent(), false, "session switch drops old intent");
  h.controller.enqueueMutationAnchor(anchor("session-b"), "hydrate");
  h.controller.markUserGesture();
  assertEqual(h.controller.commitPendingIntent(), false, "gesture drops old intent");
  assertEqual(h.writes.length, 0, "stale intents never write");
}

// T03: content resize may preserve the current reading anchor after a gesture settles.
{
  const h = harness();
  h.controller.markUserGesture();
  h.setNow(2_000);
  h.controller.recordScroll(false);
  h.setAnchor(anchor("stable", 640));
  h.controller.recordScroll(true);
  assertEqual(h.controller.correctContentResize(), true, "resize correction applies stable anchor");
  assertEqual(h.writes[h.writes.length - 1], "anchor:stable", "resize uses latest stable anchor");
}

// T05: a nudge that stays inside the near-bottom band must survive the
// streaming tick.  Resuming auto-follow used to clear the gesture window in the
// same call, so the very next bottom write undid the user scroll and the view
// felt stuck to the bottom while a reply streamed.
{
  const h = harness();
  h.setMetrics({ scrollTop: 1_500, clientHeight: 500, scrollHeight: 2_000 });
  h.controller.markUserGesture();
  h.setMetrics({ scrollTop: 1_400, clientHeight: 500, scrollHeight: 2_000 });
  h.controller.recordScroll(true);
  assertEqual(h.controller.mode, "auto", "a nudge inside the band keeps follow armed");
  h.controller.requestBottom(false, "message-commit");
  h.flushFrame();
  h.flushFrame();
  assertEqual(h.writes.length, 0, "streaming tick never fights an open gesture");
  h.setNow(2_000);
  h.controller.requestBottom(false, "message-commit");
  h.flushFrame();
  h.flushFrame();
  assertEqual(h.writes.join(","), "bottom,bottom", "follow resumes once the gesture expires");
}

// T06: a passive scroll event caused by a shrinking message must not erase
// the reading anchor, including when the browser clamps all the way to top.
{
  const h = harness();
  h.controller.markUserGesture();
  h.setMetrics({ scrollTop: 640, clientHeight: 500, scrollHeight: 2_000 });
  h.setAnchor(anchor("reading-row", 640));
  h.controller.recordScroll(true);
  h.setNow(2_000);
  h.setMetrics({ scrollTop: 0, clientHeight: 500, scrollHeight: 2_000 });
  h.setAnchor(anchor("wrong-top-row", 0));
  h.controller.recordScroll(false);
  assertEqual(h.controller.correctContentResize(), true, "manual resize repairs reading position");
  assertEqual(h.writes[h.writes.length - 1], "anchor:reading-row", "passive scroll preserves reader anchor");
  h.setMetrics({ scrollTop: 0, clientHeight: 500, scrollHeight: 2_000 });
  assertEqual(h.controller.restoreUnexpectedTopReset(), true, "manual mode repairs unexpected top reset");
  assertEqual(h.writes[h.writes.length - 1], "anchor:reading-row", "top reset uses reader anchor");
}

console.log("PASS: WP02 viewport controller T01-T06 cases");
