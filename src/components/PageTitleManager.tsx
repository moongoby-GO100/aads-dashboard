"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncTokenCookieFromStorage } from "@/lib/auth";
import { resolveRouteTitle } from "@/lib/navigation";
import { CHAT_SESSION_TITLE_EVENT, type ChatSessionTitleEventDetail } from "@/lib/pageTitleEvents";

const APP_SUFFIX = "AADS";
const CHAT_SUFFIX = "AADS Chat";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function formatDocumentTitle(title: string, suffix = APP_SUFFIX): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned} | ${suffix}` : suffix;
}

function currentChatSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function fetchChatSessionTitle(sessionId: string, signal: AbortSignal): Promise<string | null> {
  const token = syncTokenCookieFromStorage();
  const res = await fetch(`${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null) as { title?: unknown } | null;
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  return title || null;
}

export default function PageTitleManager({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (disabled || typeof document === "undefined") return;
    let abortController: AbortController | null = null;
    let titleRequestId = 0;

    const cancelPendingSessionLookup = () => {
      titleRequestId += 1;
      if (abortController) abortController.abort();
      abortController = null;
    };

    const applyTitle = () => {
      cancelPendingSessionLookup();

      if (pathname === "/chat") {
        const sessionId = currentChatSessionId();
        document.title = formatDocumentTitle("AI Chat", CHAT_SUFFIX);
        if (!sessionId) return;
        const requestId = titleRequestId;
        abortController = new AbortController();
        fetchChatSessionTitle(sessionId, abortController.signal)
          .then((title) => {
            if (title && requestId === titleRequestId) document.title = formatDocumentTitle(title, CHAT_SUFFIX);
          })
          .catch(() => {
            // Keep the route-level title if session lookup fails.
          });
        return;
      }

      document.title = formatDocumentTitle(resolveRouteTitle(pathname));
    };

    const handleChatSessionTitleChange = (event: Event) => {
      if (pathname !== "/chat") return;
      const detail = (event as CustomEvent<ChatSessionTitleEventDetail>).detail;
      if (!detail || detail.sessionId !== currentChatSessionId()) return;
      cancelPendingSessionLookup();
      const nextTitle = detail.deleted ? "AI Chat" : detail.title || "AI Chat";
      document.title = formatDocumentTitle(nextTitle, CHAT_SUFFIX);
    };

    applyTitle();
    window.addEventListener("hashchange", applyTitle);
    window.addEventListener("popstate", applyTitle);
    window.addEventListener(CHAT_SESSION_TITLE_EVENT, handleChatSessionTitleChange);
    return () => {
      window.removeEventListener("hashchange", applyTitle);
      window.removeEventListener("popstate", applyTitle);
      window.removeEventListener(CHAT_SESSION_TITLE_EVENT, handleChatSessionTitleChange);
      if (abortController) abortController.abort();
    };
  }, [disabled, pathname]);

  return null;
}
