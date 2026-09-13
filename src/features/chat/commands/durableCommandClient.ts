import { chatApi } from "@/app/chat/api";

export const CHAT_PROTOCOL_V2_CAPABILITY = "chat.protocol.v2";

export type DurableChatCommandType = "interrupt" | "stop" | "resume";

type ChatCommandStatus = "accepted" | "running" | "succeeded" | "failed" | "superseded";

type ChatCommandEnvelope<T> = {
  command_id: string;
  status: ChatCommandStatus;
  terminal: boolean;
  result?: T | null;
  error?: { code?: string; message?: string } | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type CommandRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type RunChatCommandOptions<T> = {
  sessionId: string;
  commandType: DurableChatCommandType;
  payload?: Record<string, unknown>;
  advertisedCapabilities?: readonly string[] | null;
  legacyRequest: () => Promise<T>;
  signal?: AbortSignal;
};

type RunChatCommandDependencies = {
  request?: CommandRequest;
  storage?: StorageLike | null;
  createId?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
};

const COMMAND_STORAGE_PREFIX = "aads.chat.command.v2";
const POLL_DELAYS_MS = [150, 300, 600, 1_000, 1_500, 2_000, 2_500];

export function supportsDurableChatCommands(
  advertisedCapabilities?: readonly string[] | null,
): boolean {
  return Boolean(advertisedCapabilities?.includes(CHAT_PROTOCOL_V2_CAPABILITY));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function shortPayloadFingerprint(value: unknown): string {
  const text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

function storageKey(
  sessionId: string,
  commandType: DurableChatCommandType,
  payload: Record<string, unknown>,
): string {
  return `${COMMAND_STORAGE_PREFIX}:${sessionId}:${commandType}:${shortPayloadFingerprint(payload)}`;
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function defaultCreateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readOrCreateIdempotencyKey(
  key: string,
  commandType: DurableChatCommandType,
  storage: StorageLike | null,
  createId: () => string,
): string {
  const existing = storage?.getItem(key)?.trim();
  if (existing) return existing;
  const created = `web-${commandType}-${createId()}`;
  storage?.setItem(key, created);
  return created;
}

function commandError<T>(command: ChatCommandEnvelope<T>): Error {
  const detail = command.error?.message || `채팅 ${command.status} 상태로 종료되었습니다.`;
  const error = new Error(detail);
  error.name = command.error?.code || "ChatCommandError";
  return error;
}

function unwrapSettled<T>(command: ChatCommandEnvelope<T>): T | undefined {
  if (command.status === "succeeded") return (command.result ?? {}) as T;
  if (command.status === "failed" || command.status === "superseded") {
    throw commandError(command);
  }
  return undefined;
}

/**
 * Execute stop/resume/interrupt through WP05 only after the server advertises
 * the complete v2 contract. The idempotency key stays in sessionStorage while
 * the outcome is unknown, so a browser retry cannot duplicate the side effect.
 * Older servers continue to use their existing endpoint without behaviour drift.
 */
export async function runChatCommand<T>(
  options: RunChatCommandOptions<T>,
  dependencies: RunChatCommandDependencies = {},
): Promise<T> {
  if (!supportsDurableChatCommands(options.advertisedCapabilities)) {
    return options.legacyRequest();
  }

  const payload = options.payload || {};
  const request = dependencies.request || chatApi;
  const storage = dependencies.storage === undefined ? browserStorage() : dependencies.storage;
  const createId = dependencies.createId || defaultCreateId;
  const sleep = dependencies.sleep || ((milliseconds: number) => new Promise<void>(
    (resolve) => window.setTimeout(resolve, milliseconds),
  ));
  const persistenceKey = storageKey(options.sessionId, options.commandType, payload);
  const idempotencyKey = readOrCreateIdempotencyKey(
    persistenceKey,
    options.commandType,
    storage,
    createId,
  );

  const init: RequestInit = {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ command_type: options.commandType, payload }),
    signal: options.signal,
  };
  let command = await request<ChatCommandEnvelope<T>>(
    `/chat/sessions/${options.sessionId}/commands`,
    init,
  );

  for (const delay of [0, ...POLL_DELAYS_MS]) {
    const result = unwrapSettled(command);
    if (result !== undefined) {
      storage?.removeItem(persistenceKey);
      return result;
    }
    if (delay > 0) await sleep(delay);
    command = await request<ChatCommandEnvelope<T>>(
      `/chat/sessions/${options.sessionId}/commands/${command.command_id}`,
      { signal: options.signal },
    );
  }

  throw new Error("채팅 명령이 아직 처리 중입니다. 같은 작업을 다시 누르면 기존 명령을 이어서 확인합니다.");
}
