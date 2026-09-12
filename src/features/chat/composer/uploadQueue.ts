export type UploadStatus = "queued" | "uploading" | "completed" | "failed" | "cancelled";

export type UploadItem = Readonly<{
  id: string;
  scopeKey: string;
  generation: number;
  attemptId: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  status: UploadStatus;
  progress: number;
  serverFileId: string | null;
  errorCode: string | null;
}>;

export type UploadEvent = Readonly<{
  id: string;
  scopeKey: string;
  generation: number;
  attemptId: string;
  type: "start" | "progress" | "complete" | "fail" | "cancel";
  progress?: number;
  serverFileId?: string;
  errorCode?: string;
}>;

export type UploadReduction = Readonly<{
  items: readonly UploadItem[];
  applied: boolean;
  ignoredReason: "missing" | "scope" | "generation" | "attempt" | "terminal" | "invalid" | null;
}>;

export function uploadIdentity(input: Pick<UploadItem, "id" | "scopeKey" | "generation" | "attemptId">): string {
  return `${encodeURIComponent(input.scopeKey)}:${input.generation}:${encodeURIComponent(input.id)}:${encodeURIComponent(input.attemptId)}`;
}

/** Rejects stale callbacks before they can update another session/draft. */
export function reduceUploadQueue(
  items: readonly UploadItem[],
  event: UploadEvent,
  activeScopeKey: string,
): UploadReduction {
  const index = items.findIndex((item) => item.id === event.id);
  if (index < 0) return { items, applied: false, ignoredReason: "missing" };
  const current = items[index];
  if (event.scopeKey !== activeScopeKey || current.scopeKey !== activeScopeKey) {
    return { items, applied: false, ignoredReason: "scope" };
  }
  if (event.generation !== current.generation) return { items, applied: false, ignoredReason: "generation" };
  if (event.attemptId !== current.attemptId) return { items, applied: false, ignoredReason: "attempt" };
  if (current.status === "completed" || current.status === "cancelled") {
    return { items, applied: false, ignoredReason: "terminal" };
  }

  let next: UploadItem;
  if (event.type === "start") next = { ...current, status: "uploading", progress: 0, errorCode: null };
  else if (event.type === "progress") next = {
    ...current,
    status: "uploading",
    progress: Math.max(
      current.progress,
      Number.isFinite(event.progress) ? Math.min(100, Math.max(0, event.progress!)) : current.progress,
    ),
  };
  else if (event.type === "complete") {
    if (!event.serverFileId) return { items, applied: false, ignoredReason: "invalid" };
    next = { ...current, status: "completed", progress: 100, serverFileId: event.serverFileId, errorCode: null };
  } else if (event.type === "fail") {
    next = { ...current, status: "failed", errorCode: event.errorCode || "upload_failed" };
  } else {
    next = { ...current, status: "cancelled", errorCode: null };
  }
  return {
    items: items.map((item, itemIndex) => itemIndex === index ? next : item),
    applied: true,
    ignoredReason: null,
  };
}

export type StoppableTrack = Readonly<{ stop(): void }>;
export type UploadResourceCleanupResult = Readonly<{
  performed: boolean;
  complete: boolean;
  failedSteps: readonly ("abort" | "track" | "object-url")[];
}>;

/** Owns abort, media-track and Blob URL cleanup; cleanup is idempotent. */
export function createUploadResourceCleanup(options: Readonly<{
  abort?: () => void;
  tracks?: readonly StoppableTrack[];
  objectUrls?: readonly string[];
  revokeObjectUrl?: (url: string) => void;
}> = {}): Readonly<{ cleanup(): UploadResourceCleanupResult; isCleaned(): boolean }> {
  let cleaned = false;
  let complete = true;
  const failedSteps: ("abort" | "track" | "object-url")[] = [];
  return {
    cleanup() {
      if (cleaned) return { performed: false, complete, failedSteps };
      cleaned = true;
      try { options.abort?.(); } catch { failedSteps.push("abort"); }
      for (const track of options.tracks ?? []) {
        try { track.stop(); } catch { failedSteps.push("track"); }
      }
      for (const url of options.objectUrls ?? []) {
        try { options.revokeObjectUrl?.(url); } catch { failedSteps.push("object-url"); }
      }
      complete = failedSteps.length === 0;
      return { performed: true, complete, failedSteps };
    },
    isCleaned: () => cleaned,
  };
}
