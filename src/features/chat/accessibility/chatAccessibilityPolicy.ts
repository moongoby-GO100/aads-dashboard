import type { ExecutionPhase } from "../domain/runtimeTypes";

export const CHAT_MOBILE_TARGET_MIN_PX = 44;

export type ChatFocusPlan = Readonly<{
  action: "preserve" | "restore_trigger" | "focus_composer" | "pin_virtual_row";
  targetId: string | null;
}>;

/** Message/token updates never take focus; explicit close/unmount events get a deterministic fallback. */
export function planChatFocus(input: Readonly<{
  cause: "message_update" | "dialog_close" | "menu_close" | "virtual_row_unmount";
  currentFocusConnected: boolean;
  triggerId?: string | null;
  triggerConnected?: boolean;
  composerId?: string;
  focusedRowId?: string | null;
}>): ChatFocusPlan {
  if (input.cause === "virtual_row_unmount" && input.focusedRowId) {
    return { action: "pin_virtual_row", targetId: input.focusedRowId };
  }
  if (input.cause === "message_update" || input.currentFocusConnected) {
    return { action: "preserve", targetId: null };
  }
  if ((input.cause === "dialog_close" || input.cause === "menu_close")
      && input.triggerConnected && input.triggerId) {
    return { action: "restore_trigger", targetId: input.triggerId };
  }
  return { action: "focus_composer", targetId: input.composerId || "chat-composer" };
}

export type ChatAnnouncement = Readonly<{
  announce: boolean;
  politeness: "polite";
  token: string | null;
  message: "응답이 완료되었습니다." | "응답이 중단되었습니다." | "응답 생성에 실패했습니다." | null;
}>;

const TERMINAL_ANNOUNCEMENTS: Partial<Record<ExecutionPhase, NonNullable<ChatAnnouncement["message"]>>> = {
  completed: "응답이 완료되었습니다.",
  interrupted: "응답이 중단되었습니다.",
  failed: "응답 생성에 실패했습니다.",
};

/** Announces a terminal transition once; token/delta updates never enter a live region. */
export function planChatAnnouncement(input: Readonly<{
  previousPhase: ExecutionPhase;
  nextPhase: ExecutionPhase;
  completionToken: string | null;
  lastAnnouncedToken: string | null;
}>): ChatAnnouncement {
  const message = TERMINAL_ANNOUNCEMENTS[input.nextPhase] || null;
  const token = input.completionToken;
  if (!message || input.previousPhase === input.nextPhase || !token || token === input.lastAnnouncedToken) {
    return { announce: false, politeness: "polite", token: null, message: null };
  }
  return { announce: true, politeness: "polite", token, message };
}

export function chatMotionPolicy(prefersReducedMotion: boolean): Readonly<{
  viewportBehavior: "auto" | "smooth";
  animateDecorations: boolean;
}> {
  return prefersReducedMotion
    ? { viewportBehavior: "auto", animateDecorations: false }
    : { viewportBehavior: "smooth", animateDecorations: true };
}

export function mobileTargetPolicy(widthPx: number, heightPx: number): Readonly<{
  compliant: boolean;
  minWidthPx: number;
  minHeightPx: number;
}> {
  const compliant = Number.isFinite(widthPx) && Number.isFinite(heightPx)
    && widthPx >= CHAT_MOBILE_TARGET_MIN_PX && heightPx >= CHAT_MOBILE_TARGET_MIN_PX;
  return {
    compliant,
    minWidthPx: Math.max(CHAT_MOBILE_TARGET_MIN_PX, Number.isFinite(widthPx) ? widthPx : 0),
    minHeightPx: Math.max(CHAT_MOBILE_TARGET_MIN_PX, Number.isFinite(heightPx) ? heightPx : 0),
  };
}

export function virtualRowAccessibility(input: Readonly<{
  labelId: string;
  index: number;
  total: number;
}>): Readonly<{
  role: "article";
  labelledBy: string;
  positionInSet: number;
  setSize: number;
}> {
  if (!input.labelId || !Number.isInteger(input.index) || !Number.isInteger(input.total)
      || input.index < 0 || input.total < 1 || input.index >= input.total) {
    throw new RangeError("virtual row accessibility metadata is out of bounds");
  }
  return {
    role: "article",
    labelledBy: input.labelId,
    positionInSet: input.index + 1,
    setSize: input.total,
  };
}
