export function getRequestedChatSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const querySession = new URLSearchParams(window.location.search).get("session")?.trim();
  if (querySession) return querySession;
  const hashSession = window.location.hash.replace(/^#/, "").trim();
  return hashSession || null;
}
