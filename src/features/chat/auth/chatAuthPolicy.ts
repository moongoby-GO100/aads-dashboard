const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const CHAT_PATH_PREFIXES = ["/chat"] as const;

export type ChatPrincipal = Readonly<{ tenantId: string; userId: string }>;
export type ChatPrivateResourceKind = "runtime" | "query_cache" | "draft" | "completion_ack" | "notification";
export type ChatPrivateResource = ChatPrincipal & Readonly<{ key: string; kind: ChatPrivateResourceKind }>;
export type ChatPrivateCleanupPlan = Readonly<{
  reason: "unchanged" | "logout" | "principal_changed";
  purgeKeys: readonly string[];
  effects: readonly ("abort_transports" | "clear_runtime" | "clear_query_cache" | "clear_drafts" | "clear_completion_state")[];
}>;

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value.trim() === value && !CONTROL_CHARACTER.test(value);
}

function exactOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)
        || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function pathAllowed(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Normalizes a login return value to a relative, same-origin chat URL. */
export function sanitizeChatReturnTarget(
  candidate: unknown,
  applicationOrigin: string,
  allowedPathPrefixes: readonly string[] = CHAT_PATH_PREFIXES,
): string | null {
  const origin = exactOrigin(applicationOrigin);
  if (!origin || typeof candidate !== "string" || !candidate || candidate.trim() !== candidate) return null;
  if (CONTROL_CHARACTER.test(candidate) || candidate.includes("\\") || candidate.startsWith("//")) return null;
  try {
    const parsed = new URL(candidate, `${origin}/`);
    if (parsed.origin !== origin || parsed.username || parsed.password) return null;
    if (!pathAllowed(parsed.pathname, allowedPathPrefixes)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function buildChatLoginRedirect(input: Readonly<{
  applicationOrigin: string;
  pathname: string;
  search?: string;
  hash?: string;
  reason?: "session_expired" | "login_required";
}>): string {
  const rawTarget = `${input.pathname}${input.search || ""}${input.hash || ""}`;
  const target = sanitizeChatReturnTarget(rawTarget, input.applicationOrigin) || "/chat";
  return `/login?next=${encodeURIComponent(target)}&reason=${input.reason || "session_expired"}`;
}

export function createChatPrivateStorageKey(
  principal: ChatPrincipal,
  kind: ChatPrivateResourceKind,
  resourceId: string,
): string {
  if (!safeIdentifier(principal.tenantId) || !safeIdentifier(principal.userId) || !safeIdentifier(resourceId)) {
    throw new TypeError("private chat storage scope must contain bounded identifiers");
  }
  return ["aads-chat", principal.tenantId, principal.userId, kind, resourceId]
    .map(encodeURIComponent).join(":");
}

const CLEANUP_EFFECTS = Object.freeze([
  "abort_transports", "clear_runtime", "clear_query_cache", "clear_drafts", "clear_completion_state",
] as const);

/** Plans one principal transition; AuthAdapter owns the atomic cleanup effects. */
export function planChatPrivateCleanup(
  previous: ChatPrincipal | null,
  next: ChatPrincipal | null,
  resources: readonly ChatPrivateResource[],
): ChatPrivateCleanupPlan {
  const unchanged = previous !== null && next !== null
    && previous.tenantId === next.tenantId && previous.userId === next.userId;
  if (unchanged) return { reason: "unchanged", purgeKeys: [], effects: [] };
  const purgeKeys = [...new Set(resources.filter((resource) => {
    if (!next) return true;
    return resource.tenantId !== next.tenantId || resource.userId !== next.userId;
  }).map((resource) => resource.key))].sort();
  return { reason: next ? "principal_changed" : "logout", purgeKeys, effects: CLEANUP_EFFECTS };
}

export const CHAT_SERVER_CAPABILITIES = [
  "chat.read", "chat.send", "chat.interrupt", "chat.stop", "chat.resume", "chat.edit",
  "chat.artifact.read", "chat.file.read", "chat.admin.repair",
] as const;
type ChatServerCapability = (typeof CHAT_SERVER_CAPABILITIES)[number];
export type AuthorizedChatCapabilities = Readonly<{
  valid: boolean;
  role: "viewer" | "member" | "admin" | null;
  canRead: boolean;
  canSend: boolean;
  canInterrupt: boolean;
  canStop: boolean;
  canResume: boolean;
  canEdit: boolean;
  canReadArtifacts: boolean;
  canReadFiles: boolean;
  canRepair: boolean;
}>;
const DENIED_CAPABILITIES: AuthorizedChatCapabilities = Object.freeze({
  valid: false, role: null, canRead: false, canSend: false, canInterrupt: false,
  canStop: false, canResume: false, canEdit: false, canReadArtifacts: false,
  canReadFiles: false, canRepair: false,
});

/** Maps scope-matching server permissions without deriving grants from UI role labels. */
export function mapServerChatCapabilities(input: unknown, expected: ChatPrincipal): AuthorizedChatCapabilities {
  if (!safeIdentifier(expected.tenantId) || !safeIdentifier(expected.userId)) return DENIED_CAPABILITIES;
  if (!input || typeof input !== "object" || Array.isArray(input)) return DENIED_CAPABILITIES;
  const value = input as Record<string, unknown>;
  const role = value.role;
  if (value.schema_version !== 1 || value.tenant_id !== expected.tenantId || value.user_id !== expected.userId
      || !["viewer", "member", "admin"].includes(String(role)) || !Array.isArray(value.capabilities)
      || !value.capabilities.every((entry) => typeof entry === "string")) return DENIED_CAPABILITIES;
  const advertised = new Set(value.capabilities.filter(
    (entry): entry is ChatServerCapability => CHAT_SERVER_CAPABILITIES.includes(entry as ChatServerCapability),
  ));
  const isViewer = role === "viewer";
  const has = (capability: ChatServerCapability) => advertised.has(capability);
  return Object.freeze({
    valid: true,
    role: role as "viewer" | "member" | "admin",
    canRead: has("chat.read"),
    canSend: !isViewer && has("chat.send"),
    canInterrupt: !isViewer && has("chat.interrupt"),
    canStop: !isViewer && has("chat.stop"),
    canResume: !isViewer && has("chat.resume"),
    canEdit: !isViewer && has("chat.edit"),
    canReadArtifacts: has("chat.artifact.read"),
    canReadFiles: has("chat.file.read"),
    canRepair: role === "admin" && has("chat.admin.repair"),
  });
}

export type ChatRequestPolicyDecision = Readonly<{
  allowed: boolean;
  reason: "same_origin_safe_method" | "same_origin_csrf_verified" | "legacy_bearer_verified"
    | "invalid_origin" | "mixed_auth_mode" | "missing_csrf_token" | "invalid_auth_mode";
}>;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
function tokensEqual(left: string, right: string): boolean {
  if (left.length < 8 || left.length > 512 || CONTROL_CHARACTER.test(left)
      || right.length < 8 || right.length > 512 || CONTROL_CHARACTER.test(right)
      || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

/** Cookie mode requires exact Origin+CSRF; bearer mode must omit cookies. */
export function evaluateChatRequestPolicy(input: Readonly<{
  method: string;
  applicationOrigin: string;
  requestOrigin: string | null;
  authMode: "same-origin-cookie" | "legacy-bearer" | string;
  credentials: "include" | "omit";
  hasBearerAuthorization?: boolean;
  csrfHeaderToken?: string | null;
  csrfExpectedToken?: string | null;
}>): ChatRequestPolicyDecision {
  const applicationOrigin = exactOrigin(input.applicationOrigin);
  const requestOrigin = input.requestOrigin ? exactOrigin(input.requestOrigin) : null;
  const method = input.method.trim().toUpperCase();
  if (input.authMode === "legacy-bearer") {
    if (input.credentials !== "omit" || !input.hasBearerAuthorization) return { allowed: false, reason: "mixed_auth_mode" };
    return { allowed: true, reason: "legacy_bearer_verified" };
  }
  if (input.authMode !== "same-origin-cookie") return { allowed: false, reason: "invalid_auth_mode" };
  if (!applicationOrigin || requestOrigin !== applicationOrigin) return { allowed: false, reason: "invalid_origin" };
  if (input.credentials !== "include" || input.hasBearerAuthorization) return { allowed: false, reason: "mixed_auth_mode" };
  if (SAFE_METHODS.has(method)) return { allowed: true, reason: "same_origin_safe_method" };
  if (typeof input.csrfHeaderToken !== "string" || typeof input.csrfExpectedToken !== "string"
      || !tokensEqual(input.csrfHeaderToken, input.csrfExpectedToken)) {
    return { allowed: false, reason: "missing_csrf_token" };
  }
  return { allowed: true, reason: "same_origin_csrf_verified" };
}
