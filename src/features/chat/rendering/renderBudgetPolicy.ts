export const DEFAULT_CHAT_RENDER_BUDGETS = Object.freeze({
  maxMountedRows: 80,
  overscanRows: 8,
  maxCachedPages: 5,
  maxToolPreviewChars: 4_000,
  maxReservedImageHeightPx: 960,
});

export type PinnedRenderRow = Readonly<{
  index: number;
  /** Lower values win if the mounted-row budget cannot contain every pin. */
  priority: number;
}>;

export type VirtualRenderPlan = Readonly<{
  indices: readonly number[];
  ranges: readonly Readonly<{ start: number; end: number }>[];
  droppedPinnedIndices: readonly number[];
}>;

function assertInteger(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function toRanges(indices: readonly number[]): readonly Readonly<{ start: number; end: number }>[] {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const index of indices) {
    const current = ranges.at(-1);
    if (current && current.end + 1 === index) current.end = index;
    else ranges.push({ start: index, end: index });
  }
  return ranges;
}

/**
 * Produces a bounded set of rows for a virtual timeline. Focus/search/reply
 * targets can be pinned without expanding the mounted DOM beyond maxRows.
 */
export function planVirtualRenderRows(input: Readonly<{
  itemCount: number;
  visibleStart: number;
  visibleEnd: number;
  pinnedRows?: readonly PinnedRenderRow[];
  overscan?: number;
  maxRows?: number;
}>): VirtualRenderPlan {
  const {
    itemCount,
    visibleStart,
    visibleEnd,
    pinnedRows = [],
    overscan = DEFAULT_CHAT_RENDER_BUDGETS.overscanRows,
    maxRows = DEFAULT_CHAT_RENDER_BUDGETS.maxMountedRows,
  } = input;
  for (const [name, value] of Object.entries({ itemCount, visibleStart, visibleEnd, overscan, maxRows })) {
    assertInteger(name, value);
  }
  if (itemCount < 0 || overscan < 0 || maxRows < 1) throw new RangeError("render bounds must be non-negative");
  if (itemCount === 0) return { indices: [], ranges: [], droppedPinnedIndices: [] };

  const start = clamp(visibleStart, 0, itemCount - 1);
  const end = clamp(visibleEnd, start, itemCount - 1);
  if (end - start + 1 > maxRows) {
    throw new RangeError("visible rows exceed the mounted-row budget");
  }

  const selected = new Set<number>();
  for (let index = start; index <= end; index += 1) selected.add(index);

  const validPins = [...pinnedRows]
    .filter(({ index }) => Number.isInteger(index) && index >= 0 && index < itemCount)
    .sort((left, right) => left.priority - right.priority || left.index - right.index);
  const droppedPinnedIndices: number[] = [];
  for (const pin of validPins) {
    if (selected.has(pin.index)) continue;
    if (selected.size >= maxRows) droppedPinnedIndices.push(pin.index);
    else selected.add(pin.index);
  }

  for (let distance = 1; distance <= overscan && selected.size < maxRows; distance += 1) {
    const before = start - distance;
    const after = end + distance;
    if (before >= 0 && selected.size < maxRows) selected.add(before);
    if (after < itemCount && selected.size < maxRows) selected.add(after);
  }

  const indices = [...selected].sort((left, right) => left - right);
  return { indices, ranges: toRanges(indices), droppedPinnedIndices };
}

export type LayoutCompensationDecision = Readonly<{
  shouldWrite: boolean;
  deltaPx: number;
  reason: "layout-delta" | "gesture-changed" | "anchor-missing" | "already-applied" | "within-tolerance";
}>;

/** A layout revision can schedule at most one correction for one gesture epoch. */
export function planLayoutCompensation(input: Readonly<{
  deltaPx: number;
  tolerancePx?: number;
  capturedGestureEpoch: number;
  currentGestureEpoch: number;
  anchorExists: boolean;
  layoutRevision: string;
  lastAppliedLayoutRevision: string | null;
}>): LayoutCompensationDecision {
  if (!input.anchorExists) return { shouldWrite: false, deltaPx: 0, reason: "anchor-missing" };
  if (input.capturedGestureEpoch !== input.currentGestureEpoch) {
    return { shouldWrite: false, deltaPx: 0, reason: "gesture-changed" };
  }
  if (input.layoutRevision === input.lastAppliedLayoutRevision) {
    return { shouldWrite: false, deltaPx: 0, reason: "already-applied" };
  }
  const tolerance = Math.max(0, input.tolerancePx ?? 2);
  if (!Number.isFinite(input.deltaPx) || Math.abs(input.deltaPx) <= tolerance) {
    return { shouldWrite: false, deltaPx: 0, reason: "within-tolerance" };
  }
  return { shouldWrite: true, deltaPx: input.deltaPx, reason: "layout-delta" };
}

export type ImageReservation = Readonly<{
  width: number;
  height: number;
  aspectRatio: string;
}>;

/** Reserves aspect ratio while bounding an oversized image's initial layout box. */
export function imageReservation(
  width: number | null | undefined,
  height: number | null | undefined,
  maxHeightPx: number = DEFAULT_CHAT_RENDER_BUDGETS.maxReservedImageHeightPx,
): ImageReservation | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height || width <= 0 || height <= 0) {
    return null;
  }
  const scale = Math.min(1, maxHeightPx / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    aspectRatio: `${width} / ${height}`,
  };
}

export type CachedPage = Readonly<{
  key: string;
  lastAccess: number;
  pinned: boolean;
}>;

export function planPageEvictions(
  pages: readonly CachedPage[],
  maxPages: number = DEFAULT_CHAT_RENDER_BUDGETS.maxCachedPages,
): Readonly<{ evict: readonly string[]; retainedOverflow: number }> {
  if (!Number.isInteger(maxPages) || maxPages < 0) throw new RangeError("maxPages must be a non-negative integer");
  const requiredEvictions = Math.max(0, pages.length - maxPages);
  const evict = pages
    .filter((page) => !page.pinned)
    .sort((left, right) => left.lastAccess - right.lastAccess || left.key.localeCompare(right.key))
    .slice(0, requiredEvictions)
    .map((page) => page.key);
  return {
    evict,
    retainedOverflow: Math.max(0, pages.length - evict.length - maxPages),
  };
}
