import type { OhvisCredentialScope, OhvisRecordingContext } from "./api";

export type RecordingIdentity = {
  sessionId?: string;
  lane: "server" | "pc";
  selectedId?: string;
  agentId?: string;
};

export function sameRecordingIdentity(a: RecordingIdentity, b: RecordingIdentity): boolean {
  return a.sessionId === b.sessionId && a.lane === b.lane &&
    a.selectedId === b.selectedId && a.agentId === b.agentId;
}

export function canStartRecording(identity: RecordingIdentity, connection: string, pending: boolean): boolean {
  if (pending) return false;
  if (identity.lane === "server") return Boolean(identity.selectedId);
  return connection === "live" && Boolean(identity.sessionId && identity.agentId);
}

export function recordingPage(url: string): { url: string; domain: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return { url: parsed.href, domain: parsed.hostname };
  } catch { return null; }
}

export function recordingContext(identity: RecordingIdentity, workKey?: string, credentialScope?: OhvisCredentialScope): OhvisRecordingContext {
  let key = workKey?.trim();
  if (identity.lane === "pc") key = identity.sessionId ? `chat-${identity.sessionId.slice(0, 12)}` : undefined;
  return {
    lane: identity.lane,
    ...(key ? { browser_work_key: key } : {}),
    ...(credentialScope && Object.keys(credentialScope).length ? { credential_scope: credentialScope } : {}),
  };
}

// Check both network boundaries: a selection can change while either request is pending.
export async function completeRecordingStart<T>(
  request: Promise<string>,
  isCurrent: () => boolean,
  saveInitialStep: (id: string) => Promise<T>,
  apply: (saved: T) => void,
): Promise<void> {
  const id = await request;
  if (!isCurrent()) return;
  const saved = await saveInitialStep(id);
  if (!isCurrent()) return;
  apply(saved);
}
