// Both embedded artifacts and the fixed mobile fallback return to the same composer.
export function returnToMockupComposer(
  closePanel: () => void,
  closeOverlay: () => void,
  focusComposer: () => void,
): void {
  closePanel();
  closeOverlay();
  requestAnimationFrame(focusComposer);
}
