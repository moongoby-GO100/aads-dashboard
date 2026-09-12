export type DraftScope = Readonly<{
  tenantId: string;
  userId: string;
  sessionId: string;
  branchId: string | null;
  tabId: string;
}>;

export type DraftSelection = Readonly<{
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}>;

export type ChatDraft = Readonly<{
  version: 1;
  text: string;
  selection: DraftSelection;
  requestedModelId: string | null;
  responseMode: string | null;
  uploadedFileIds: readonly string[];
  updatedAt: string;
}>;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type DraftStorageMode = "session" | "memory";

export type DraftStore = Readonly<{
  save(scope: DraftScope, draft: ChatDraft): DraftStorageMode;
  load(scope: DraftScope): ChatDraft | null;
  remove(scope: DraftScope): boolean;
  purgeTenant(tenantId: string): boolean;
  purgeAll(): boolean;
  mode(): DraftStorageMode;
}>;

const DRAFT_PREFIX = "aads.chat.draft.v1:";

function requireScopePart(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return encodeURIComponent(normalized);
}

export function draftStorageKey(scope: DraftScope): string {
  return DRAFT_PREFIX + [
    requireScopePart("tenantId", scope.tenantId),
    requireScopePart("userId", scope.userId),
    requireScopePart("sessionId", scope.sessionId),
    scope.branchId?.trim() ? `branch-${encodeURIComponent(scope.branchId.trim())}` : "root-branch",
    requireScopePart("tabId", scope.tabId),
  ].join(":");
}

function tenantPrefix(tenantId: string): string {
  return `${DRAFT_PREFIX}${requireScopePart("tenantId", tenantId)}:`;
}

function isDraft(value: unknown): value is ChatDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ChatDraft>;
  const selection = draft.selection as Partial<DraftSelection> | undefined;
  return draft.version === 1
    && typeof draft.text === "string"
    && typeof draft.updatedAt === "string"
    && (draft.requestedModelId === null || typeof draft.requestedModelId === "string")
    && (draft.responseMode === null || typeof draft.responseMode === "string")
    && Array.isArray(draft.uploadedFileIds)
    && draft.uploadedFileIds.every((id) => typeof id === "string")
    && !!selection
    && Number.isInteger(selection.start)
    && Number.isInteger(selection.end)
    && selection.start! >= 0
    && selection.end! >= selection.start!
    && ["forward", "backward", "none"].includes(selection.direction || "");
}

function normalizeDraft(draft: ChatDraft): ChatDraft {
  return {
    version: 1,
    text: draft.text,
    selection: {
      start: draft.selection.start,
      end: draft.selection.end,
      direction: draft.selection.direction,
    },
    requestedModelId: draft.requestedModelId,
    responseMode: draft.responseMode,
    uploadedFileIds: [...draft.uploadedFileIds],
    updatedAt: draft.updatedAt,
  };
}

function listKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Stores only the serializable draft contract. File bodies, object URLs,
 * credentials and command receipts are deliberately outside this boundary.
 */
export function createDraftStore(options: Readonly<{
  storage?: StorageLike | null;
  memory?: Map<string, string>;
  onDegraded?: (reason: "unavailable" | "read-failed" | "write-failed") => void;
}> = {}): DraftStore {
  const memory = options.memory ?? new Map<string, string>();
  const storage = options.storage ?? null;
  let storageMode: DraftStorageMode = storage ? "session" : "memory";
  if (!storage) options.onDegraded?.("unavailable");

  const degrade = (reason: "read-failed" | "write-failed") => {
    storageMode = "memory";
    options.onDegraded?.(reason);
  };

  const removeStorageKey = (key: string): boolean => {
    if (!storage) return true;
    try { storage.removeItem(key); return true; }
    catch { degrade("write-failed"); return false; }
  };

  const purgeStorage = (matches: (key: string) => boolean): boolean => {
    if (!storage) return true;
    let keys: string[];
    try { keys = listKeys(storage); }
    catch { degrade("read-failed"); return false; }
    let complete = true;
    for (const key of keys) if (matches(key)) complete = removeStorageKey(key) && complete;
    return complete;
  };

  return {
    save(scope, draft) {
      if (!isDraft(draft)) throw new TypeError("invalid draft");
      const key = draftStorageKey(scope);
      const serialized = JSON.stringify(normalizeDraft(draft));
      memory.set(key, serialized);
      if (!storage || storageMode === "memory") return "memory";
      try {
        storage.setItem(key, serialized);
        return "session";
      } catch {
        degrade("write-failed");
        return "memory";
      }
    },
    load(scope) {
      const key = draftStorageKey(scope);
      let serialized: string | null = null;
      if (storageMode === "memory") serialized = memory.get(key) ?? null;
      if (!serialized && storage) {
        try { serialized = storage.getItem(key); }
        catch { degrade("read-failed"); }
      }
      serialized ??= memory.get(key) ?? null;
      if (!serialized) return null;
      try {
        const parsed: unknown = JSON.parse(serialized);
        if (isDraft(parsed)) return normalizeDraft(parsed);
      } catch {
        // Corrupt tab state is discarded rather than leaking into another draft.
      }
      memory.delete(key);
      removeStorageKey(key);
      return null;
    },
    remove(scope) {
      const key = draftStorageKey(scope);
      memory.delete(key);
      return removeStorageKey(key);
    },
    purgeTenant(tenantId) {
      const prefix = tenantPrefix(tenantId);
      for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
      return purgeStorage((key) => key.startsWith(prefix));
    },
    purgeAll() {
      for (const key of memory.keys()) if (key.startsWith(DRAFT_PREFIX)) memory.delete(key);
      return purgeStorage((key) => key.startsWith(DRAFT_PREFIX));
    },
    mode: () => storageMode,
  };
}
