export function getRequestedChatSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const querySession = new URLSearchParams(window.location.search).get("session")?.trim();
  if (querySession) return querySession;
  const hashSession = window.location.hash.replace(/^#/, "").trim();
  if (hashSession) return hashSession;

  // The chat page canonicalizes selected sessions to /chat/{sessionId}.
  // Read that durable path directly on refresh instead of relying on a second
  // client-side redirect to /chat?session=..., which can race workspace/session
  // initialization and leave the timeline empty.
  const pathMatch = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/);
  if (!pathMatch) return null;
  try {
    return decodeURIComponent(pathMatch[1]).trim() || null;
  } catch {
    return pathMatch[1].trim() || null;
  }
}
