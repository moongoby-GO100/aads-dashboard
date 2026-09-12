export type ComposerKeyDecision = Readonly<{
  action: "ignore" | "newline" | "select-slash" | "select-mention" | "submit";
  preventDefault: boolean;
  reason: string;
}>;

export type ComposerKeyInput = Readonly<{
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  nativeIsComposing: boolean;
  keyCode: number;
  activeMenu: "slash" | "mention" | null;
  hasActiveOption: boolean;
  repeat: boolean;
  submitPending: boolean;
}>;

/** One precedence table for IME, menus, newline and submit. */
export function decideComposerKeyAction(input: ComposerKeyInput): ComposerKeyDecision {
  if (input.key !== "Enter") {
    return { action: "ignore", preventDefault: false, reason: "not-enter" };
  }
  if (input.isComposing || input.nativeIsComposing || input.keyCode === 229) {
    return { action: "ignore", preventDefault: false, reason: "ime-composition" };
  }
  if (input.activeMenu) {
    if (!input.hasActiveOption) {
      return { action: "ignore", preventDefault: true, reason: "menu-without-selection" };
    }
    return {
      action: input.activeMenu === "slash" ? "select-slash" : "select-mention",
      preventDefault: true,
      reason: "menu-selection",
    };
  }
  if (input.shiftKey) {
    return { action: "newline", preventDefault: false, reason: "shift-enter" };
  }
  if (input.repeat || input.submitPending) {
    return { action: "ignore", preventDefault: true, reason: "duplicate-submit-guard" };
  }
  return { action: "submit", preventDefault: true, reason: "plain-enter" };
}
