export type RenderedFrameBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SourceViewport = {
  width: number;
  height: number;
};

/** Map a pointer in the rendered frame to a clamped source-viewport coordinate. */
export function mapFramePoint(
  clientX: number,
  clientY: number,
  bounds: RenderedFrameBounds,
  viewport: SourceViewport,
): { x: number; y: number } | null {
  if (![clientX, clientY, bounds.left, bounds.top, bounds.width, bounds.height, viewport.width, viewport.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }
  const renderedX = Math.min(bounds.width, Math.max(0, clientX - bounds.left));
  const renderedY = Math.min(bounds.height, Math.max(0, clientY - bounds.top));
  return {
    x: Math.min(viewport.width - 1, Math.round((renderedX / bounds.width) * viewport.width)),
    y: Math.min(viewport.height - 1, Math.round((renderedY / bounds.height) * viewport.height)),
  };
}
