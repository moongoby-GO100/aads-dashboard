import type {
  ContentCompleteness,
  RuntimeMessageProjection,
} from "./runtimeTypes";

const COMPLETENESS_RANK: Record<ContentCompleteness, number> = {
  minimal: 0,
  preview: 1,
  render: 2,
  full: 3,
};

function decimalVersion(value: unknown): bigint | null {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string" ? value : "";
  return /^(?:0|[1-9]\d*)$/.test(text) ? BigInt(text) : null;
}

export function compareContentVersions(left: unknown, right: unknown): -1 | 0 | 1 | null {
  const leftVersion = decimalVersion(left);
  const rightVersion = decimalVersion(right);
  if (leftVersion === null || rightVersion === null) return null;
  if (leftVersion === rightVersion) return 0;
  return leftVersion < rightVersion ? -1 : 1;
}

function completenessOf(message: RuntimeMessageProjection): ContentCompleteness {
  if (message.content_completeness) return message.content_completeness;
  if (message.is_truncated) return "minimal";
  const contentLength = Number(message.content_length || 0);
  if (contentLength > String(message.content || "").length) return "preview";
  return "render";
}

export function stableRenderKey(message: RuntimeMessageProjection): string {
  return String(message.render_key || message.render_id || message.id);
}

/**
 * Merges a server projection without using text length as an edit version.
 * A lower/same completeness response cannot shrink a hydrated body, while a
 * higher explicit content_version is a real edit and may legitimately be
 * shorter (or empty for a tombstone projection).
 */
export function mergeMessageProjection<T extends RuntimeMessageProjection>(
  existing: T | undefined,
  incoming: T,
): T {
  if (!existing) {
    const key = stableRenderKey(incoming);
    return { ...incoming, render_key: key, render_id: incoming.render_id || key };
  }

  const versionOrder = compareContentVersions(incoming.content_version, existing.content_version);
  if (versionOrder === -1) return existing;

  const renderKey = stableRenderKey(existing);
  const existingCompleteness = completenessOf(existing);
  const incomingCompleteness = completenessOf(incoming);
  const incomingIsDowngrade = versionOrder !== 1
    && COMPLETENESS_RANK[incomingCompleteness] < COMPLETENESS_RANK[existingCompleteness];
  const incomingIsLegacyTruncation = versionOrder === null
    && Boolean(incoming.is_truncated)
    && String(existing.content || "").length > String(incoming.content || "").length;
  const preserveHydratedContent = incomingIsDowngrade || incomingIsLegacyTruncation;

  return {
    ...existing,
    ...incoming,
    content: preserveHydratedContent ? existing.content : incoming.content,
    content_length: preserveHydratedContent
      ? Math.max(Number(existing.content_length || 0), String(existing.content || "").length)
      : incoming.content_length,
    content_completeness: preserveHydratedContent ? existingCompleteness : incomingCompleteness,
    render_key: renderKey,
    render_id: existing.render_id || renderKey,
  };
}

export function reduceMessageProjection(
  messages: ReadonlyMap<string, RuntimeMessageProjection>,
  incoming: RuntimeMessageProjection,
): ReadonlyMap<string, RuntimeMessageProjection> {
  const next = new Map(messages);
  const identity = String(incoming.id || incoming.render_key || incoming.render_id || "");
  if (!identity) return messages;
  const existing = next.get(identity)
    || [...next.values()].find((message) =>
      Boolean(incoming.execution_id) && message.execution_id === incoming.execution_id
    );
  const merged = mergeMessageProjection(existing, incoming);
  if (existing && existing.id !== identity) next.delete(existing.id);
  next.set(identity, merged);
  return next;
}
