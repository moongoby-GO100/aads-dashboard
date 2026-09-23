import {
  CHAT_BOTTOM_THRESHOLD_PX,
  decideChatFollow,
  isChatNearBottom,
  nextChatFollowModeAfterUserScroll,
  type ChatFollowMode,
  type ChatScrollMetrics,
} from "../../../lib/chatScrollPolicy";

export type ChatViewportReason =
  | "initial"
  | "restore-session"
  | "user-send"
  | "jump-latest"
  | "prepend"
  | "hydrate"
  | "content-resize"
  | "anchor-removed"
  | "message-commit"
  | "unexpected-reset"
  | "response-outline";

/**
 * The legacy aliases keep version-refresh snapshots written by the v1 route
 * readable while WP02 moves the live viewport to renderKey/offsetPx.
 */
export type MessageViewportAnchor = {
  renderKey: string | null;
  messageId: string | null;
  neighborKeys: string[];
  offsetPx: number;
  scrollTop: number;
  scrollHeight: number;
  distanceFromBottom: number;
  wasNearBottom: boolean;
  renderId?: string | null;
  offsetTop?: number;
};

export type ChatViewportIntent = {
  id: number;
  reason: ChatViewportReason;
  sessionEpoch: number;
  gestureEpoch: number;
  listRevision: string;
  anchor?: MessageViewportAnchor;
};

export interface ChatViewportAdapter {
  readMetrics(): ChatScrollMetrics | null;
  captureAnchor(): MessageViewportAnchor | null;
  restoreAnchor(anchor: MessageViewportAnchor): boolean;
  writeBottom(): boolean;
  writeScrollTop(scrollTop: number): boolean;
  scrollElementIntoView(element: HTMLElement, options: ScrollIntoViewOptions): boolean;
}

type FrameScheduler = {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
};

type ControllerOptions = {
  now?: () => number;
  frames?: FrameScheduler;
  onFollowModeChange?: (mode: ChatFollowMode) => void;
  onUnreadCountChange?: (count: number) => void;
  onViewportWrite?: (event: {
    reason: ChatViewportReason;
    followMode: ChatFollowMode;
    gestureEpoch: number;
    listRevision: string;
  }) => void;
};

const defaultFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * How many rows on each side of the anchor are remembered as restore
 * fallbacks.  Anything further away is a different part of the conversation.
 */
const ANCHOR_NEIGHBOR_SPAN = 8;

function rowKey(element: HTMLElement): string | null {
  return element.dataset.messageRenderId || element.dataset.messageId || null;
}

export function createDomChatViewportAdapter(
  getContainer: () => HTMLElement | null,
): ChatViewportAdapter {
  const rows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"));

  return {
    readMetrics() {
      const container = getContainer();
      if (!container) return null;
      return {
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
      };
    },
    captureAnchor() {
      const container = getContainer();
      if (!container) return null;
      const messageRows = rows(container);
      const anchorIndex = messageRows.findIndex(
        (element) => element.offsetTop + element.offsetHeight >= container.scrollTop,
      );
      const anchor = anchorIndex >= 0 ? messageRows[anchorIndex] : null;
      const following = anchorIndex >= 0 ? messageRows.slice(anchorIndex + 1) : [];
      const preceding = anchorIndex > 0 ? messageRows.slice(0, anchorIndex).reverse() : [];
      return {
        renderKey: anchor ? rowKey(anchor) : null,
        messageId: anchor?.dataset.messageId || null,
        // Only the rows adjacent to the anchor can serve as a fallback: if none
        // of them survived the mutation, the anchor's neighbourhood is gone and
        // a far-away row would restore the wrong position anyway.  Keeping the
        // whole list made every scroll event allocate one key per rendered row.
        neighborKeys: [
          ...following.slice(0, ANCHOR_NEIGHBOR_SPAN),
          ...preceding.slice(0, ANCHOR_NEIGHBOR_SPAN),
        ]
          .map(rowKey)
          .filter((key): key is string => Boolean(key)),
        offsetPx: anchor ? anchor.offsetTop - container.scrollTop : 0,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        distanceFromBottom: Math.max(
          0,
          container.scrollHeight - container.scrollTop - container.clientHeight,
        ),
        wasNearBottom: isChatNearBottom(container),
      };
    },
    restoreAnchor(anchor) {
      const container = getContainer();
      if (!container) return false;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      if (
        anchor.scrollTop > 0 &&
        container.scrollHeight < anchor.scrollHeight &&
        (maxScrollTop === 0 || maxScrollTop < Math.min(anchor.scrollTop, anchor.scrollHeight * 0.5))
      ) return false;
      if (anchor.wasNearBottom) {
        if (Math.abs(container.scrollTop - maxScrollTop) > 1) container.scrollTop = maxScrollTop;
        return true;
      }
      const targetKeys = [
        anchor.renderKey || anchor.renderId || anchor.messageId,
        ...(anchor.neighborKeys || []),
      ].filter((key): key is string => Boolean(key));
      // `.map()` does not short-circuit, so the previous form re-ran
      // querySelectorAll once per candidate key — quadratic in the rendered row
      // count, on a path that runs for every ResizeObserver frame while a reply
      // streams.  Index the rows once and stop at the first surviving key.
      const rowsByKey = new Map<string, HTMLElement>();
      for (const element of rows(container)) {
        const key = rowKey(element);
        if (key && !rowsByKey.has(key)) rowsByKey.set(key, element);
      }
      let target: HTMLElement | null = null;
      for (const key of targetKeys) {
        const found = rowsByKey.get(key);
        if (found) { target = found; break; }
      }
      const offset = Number.isFinite(anchor.offsetPx) ? anchor.offsetPx : Number(anchor.offsetTop || 0);
      const desired = target ? target.offsetTop - offset : anchor.scrollTop;
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, desired));
      if (Math.abs(container.scrollTop - nextScrollTop) > 1) container.scrollTop = nextScrollTop;
      return true;
    },
    writeBottom() {
      const container = getContainer();
      if (!container) return false;
      const bottom = Math.max(0, container.scrollHeight - container.clientHeight);
      if (Math.abs(container.scrollTop - bottom) > 1) container.scrollTop = bottom;
      return true;
    },
    writeScrollTop(scrollTop) {
      const container = getContainer();
      if (!container) return false;
      const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
      const next = Math.max(0, Math.min(maximum, scrollTop));
      if (Math.abs(container.scrollTop - next) > 1) container.scrollTop = next;
      return true;
    },
    scrollElementIntoView(element, options) {
      if (!getContainer()?.contains(element)) return false;
      element.scrollIntoView(options);
      return true;
    },
  };
}

export class ChatViewportController {
  private readonly now: () => number;
  private readonly frames: FrameScheduler;
  private readonly onFollowModeChange?: ControllerOptions["onFollowModeChange"];
  private readonly onUnreadCountChange?: ControllerOptions["onUnreadCountChange"];
  private readonly onViewportWrite?: ControllerOptions["onViewportWrite"];
  private followMode: ChatFollowMode = "auto";
  private nearBottom = true;
  private sessionKey: string | null = null;
  private sessionEpoch = 0;
  private gestureEpoch = 0;
  private gestureActiveUntil = 0;
  private bottomStickUntil = 0;
  private listRevision = 0;
  private nextIntentId = 1;
  private pendingIntent: ChatViewportIntent | null = null;
  private commitFrame = 0;
  private bottomFrames = new Set<number>();
  private stableAnchor: MessageViewportAnchor | null = null;
  private stableScrollTop = 0;
  private unreadCount = 0;
  private applying = false;

  constructor(
    private readonly adapter: ChatViewportAdapter,
    options: ControllerOptions = {},
  ) {
    this.now = options.now || (() => Date.now());
    this.frames = options.frames || defaultFrames;
    this.onFollowModeChange = options.onFollowModeChange;
    this.onUnreadCountChange = options.onUnreadCountChange;
    this.onViewportWrite = options.onViewportWrite;
  }

  get mode(): ChatFollowMode { return this.followMode; }
  get currentSessionEpoch(): number { return this.sessionEpoch; }
  get currentGestureEpoch(): number { return this.gestureEpoch; }
  get isNearBottom(): boolean { return this.nearBottom; }
  get isApplying(): boolean { return this.applying; }
  get hasActiveGesture(): boolean { return this.gestureIsActive(); }
  get unreadMessages(): number { return this.unreadCount; }

  resetSession(sessionKey: string | null): void {
    if (this.sessionKey === sessionKey) return;
    this.cancelAll();
    this.sessionKey = sessionKey;
    this.sessionEpoch += 1;
    this.gestureEpoch += 1;
    this.gestureActiveUntil = 0;
    this.bottomStickUntil = 0;
    this.nearBottom = true;
    this.stableAnchor = null;
    this.stableScrollTop = 0;
    this.setUnreadCount(0);
    this.setFollowMode("auto");
  }

  destroy(): void { this.cancelAll(); }

  captureAnchor(): MessageViewportAnchor | null { return this.adapter.captureAnchor(); }

  markUserGesture(durationMs = 1_000): void {
    this.gestureEpoch += 1;
    this.gestureActiveUntil = Math.max(this.gestureActiveUntil, this.now() + durationMs);
    this.cancelPendingIntent();
    this.cancelBottomFrames();
    this.setFollowMode("manual");
  }

  recordScroll(userInitiated: boolean): void {
    const metrics = this.adapter.readMetrics();
    if (!metrics) return;
    this.nearBottom = isChatNearBottom(metrics);
    // A layout shrink can emit a scroll event without user input. In manual
    // mode that event must not replace the last position the reader chose;
    // the resize observer needs that anchor to repair the jump.
    if (!this.applying && (userInitiated || this.followMode !== "manual" || !this.stableAnchor)) {
      this.stableScrollTop = metrics.scrollTop;
      this.stableAnchor = this.adapter.captureAnchor();
    }
    if (!userInitiated) return;
    const mode = nextChatFollowModeAfterUserScroll(metrics);
    this.setFollowMode(mode);
    if (mode === "auto") {
      // Resuming follow does NOT end the gesture.  Clearing the window here let
      // the 300ms streaming tick write the bottom while the user was still
      // scrolling: any nudge smaller than the near-bottom threshold was undone
      // before the next wheel event, so the view felt stuck to the bottom.  The
      // window now expires on its own, which is what protects an in-flight
      // gesture.  noteUserSend()/jumpToLatest() still clear it explicitly,
      // because there the user asked to be taken to the bottom.
      this.setUnreadCount(0);
    }
    if (!this.nearBottom) this.bottomStickUntil = 0;
  }

  noteUserSend(): void {
    this.setFollowMode("auto");
    this.nearBottom = true;
    this.gestureActiveUntil = 0;
    this.bottomStickUntil = this.now() + 180_000;
    this.setUnreadCount(0);
  }

  jumpToLatest(): void {
    this.noteUserSend();
    this.requestBottom(true, "jump-latest");
  }

  settleAfterMessageChange(activeReply: boolean, messageCountGrew: boolean): void {
    if (this.followMode === "manual" && messageCountGrew) {
      this.setUnreadCount(this.unreadCount + 1);
    }
    const decision = decideChatFollow({
      mode: this.followMode,
      isNearBottom: this.nearBottom,
      activeReply,
      bottomStickActive: this.now() < this.bottomStickUntil,
      messageCountGrew,
    });
    if (decision === "force-bottom") this.requestBottom(true, "user-send");
    if (decision === "follow-bottom") this.requestBottom(false, "message-commit");
  }

  requestBottom(force: boolean, reason: ChatViewportReason): void {
    const scope = this.scope();
    const write = () => {
      if (!this.scopeIsCurrent(scope) || this.gestureIsActive()) return;
      if (!force && (this.followMode === "manual" || !this.nearBottom)) return;
      this.performWrite(reason, () => this.adapter.writeBottom());
      this.nearBottom = true;
      const metrics = this.adapter.readMetrics();
      if (metrics) this.stableScrollTop = metrics.scrollTop;
    };
    const first = this.frames.request(() => {
      this.bottomFrames.delete(first);
      write();
      const second = this.frames.request(() => {
        this.bottomFrames.delete(second);
        write();
      });
      this.bottomFrames.add(second);
    });
    this.bottomFrames.add(first);
  }

  enqueueMutationAnchor(anchor: MessageViewportAnchor | null, reason: ChatViewportReason): string {
    const revision = String(++this.listRevision);
    if (!anchor) return revision;
    if (this.pendingIntent) {
      this.pendingIntent = { ...this.pendingIntent, listRevision: revision };
      return revision;
    }
    this.pendingIntent = {
      id: this.nextIntentId++,
      reason,
      sessionEpoch: this.sessionEpoch,
      gestureEpoch: this.gestureEpoch,
      listRevision: revision,
      anchor,
    };
    return revision;
  }

  restoreSessionAnchor(anchor: MessageViewportAnchor): void {
    this.cancelPendingIntent();
    this.pendingIntent = {
      id: this.nextIntentId++,
      reason: "restore-session",
      sessionEpoch: this.sessionEpoch,
      gestureEpoch: this.gestureEpoch,
      listRevision: String(++this.listRevision),
      anchor,
    };
  }

  commitPendingIntent(): boolean {
    const intent = this.pendingIntent;
    if (!intent || !this.intentIsCurrent(intent) || !intent.anchor) {
      if (intent) this.cancelPendingIntent();
      return false;
    }
    const applied = this.performWrite(intent.reason, () => this.adapter.restoreAnchor(intent.anchor!));
    if (!applied) return false;
    if (this.commitFrame) this.frames.cancel(this.commitFrame);
    this.commitFrame = this.frames.request(() => {
      this.commitFrame = 0;
      if (this.pendingIntent?.id !== intent.id || !this.intentIsCurrent(intent)) return;
      this.performWrite(intent.reason, () => this.adapter.restoreAnchor(intent.anchor!));
      if (this.pendingIntent?.id === intent.id) this.pendingIntent = null;
      this.refreshPosition();
    });
    return true;
  }

  correctContentResize(): boolean {
    if (this.followMode !== "manual" || !this.stableAnchor || this.gestureIsActive()) return false;
    return this.performWrite("content-resize", () => this.adapter.restoreAnchor(this.stableAnchor!));
  }

  restoreUnexpectedTopReset(): boolean {
    const metrics = this.adapter.readMetrics();
    if (
      !metrics || this.gestureIsActive() || this.applying ||
      this.stableScrollTop <= Math.max(320, metrics.clientHeight * 0.75) || metrics.scrollTop > 16
    ) return false;
    const restored = this.stableAnchor
      ? this.performWrite("unexpected-reset", () => this.adapter.restoreAnchor(this.stableAnchor!))
      : this.performWrite("unexpected-reset", () => this.adapter.writeScrollTop(this.stableScrollTop));
    if (restored) this.refreshPosition();
    return restored;
  }

  scrollElementIntoView(element: HTMLElement): boolean {
    const scope = this.scope();
    if (!this.scopeIsCurrent(scope)) return false;
    return this.performWrite("response-outline", () => this.adapter.scrollElementIntoView(element, {
      behavior: "smooth",
      block: "center",
    }));
  }

  private refreshPosition(): void {
    const metrics = this.adapter.readMetrics();
    if (!metrics) return;
    this.nearBottom = isChatNearBottom(metrics, CHAT_BOTTOM_THRESHOLD_PX);
    this.stableScrollTop = metrics.scrollTop;
    this.stableAnchor = this.adapter.captureAnchor();
  }

  private setFollowMode(mode: ChatFollowMode): void {
    if (this.followMode === mode) return;
    this.followMode = mode;
    this.onFollowModeChange?.(mode);
  }

  private setUnreadCount(count: number): void {
    if (this.unreadCount === count) return;
    this.unreadCount = count;
    this.onUnreadCountChange?.(count);
  }

  private gestureIsActive(): boolean { return this.now() < this.gestureActiveUntil; }

  private scope(): { sessionEpoch: number; gestureEpoch: number } {
    return { sessionEpoch: this.sessionEpoch, gestureEpoch: this.gestureEpoch };
  }

  private scopeIsCurrent(scope: { sessionEpoch: number; gestureEpoch: number }): boolean {
    return scope.sessionEpoch === this.sessionEpoch && scope.gestureEpoch === this.gestureEpoch;
  }

  private intentIsCurrent(intent: ChatViewportIntent): boolean {
    return this.scopeIsCurrent(intent) && !this.gestureIsActive();
  }

  private performWrite(reason: ChatViewportReason, write: () => boolean): boolean {
    if (this.gestureIsActive()) return false;
    this.applying = true;
    try {
      const applied = write();
      if (applied) this.onViewportWrite?.({
        reason,
        followMode: this.followMode,
        gestureEpoch: this.gestureEpoch,
        listRevision: String(this.listRevision),
      });
      return applied;
    } finally {
      this.applying = false;
    }
  }

  private cancelPendingIntent(): void {
    this.pendingIntent = null;
    if (this.commitFrame) this.frames.cancel(this.commitFrame);
    this.commitFrame = 0;
  }

  private cancelBottomFrames(): void {
    for (const frame of this.bottomFrames) this.frames.cancel(frame);
    this.bottomFrames.clear();
  }

  private cancelAll(): void {
    this.cancelPendingIntent();
    this.cancelBottomFrames();
  }
}
