"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncTokenCookieFromStorage } from "@/lib/auth";
import { resolveRouteTitle } from "@/lib/navigation";
import { CHAT_SESSION_TITLE_EVENT, type ChatSessionTitleEventDetail } from "@/lib/pageTitleEvents";
import { SESSION_ATTENTION_EVENT, type SessionAttentionCounts } from "@/lib/sessionAttention";

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
    let attention: SessionAttentionCounts = { workingCount: 0, completedUnreadCount: 0 };
    let baseTitle = formatDocumentTitle(resolveRouteTitle(pathname));
    const faviconLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    const originalFavicons = faviconLinks.map((link) => ({ link, href: link.href }));

    const applyFavicon = () => {
      if (attention.workingCount === 0 && attention.completedUnreadCount === 0) {
        originalFavicons.forEach(({ link, href }) => { link.href = href; });
        return;
      }
      const color = attention.workingCount > 0 ? "#22c55e" : "#38bdf8";
      const glyph = attention.workingCount > 0 ? "▶" : "✓";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${color}"/><text x="32" y="43" text-anchor="middle" font-size="34" font-family="Arial" fill="white">${glyph}</text></svg>`;
      const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      faviconLinks.forEach((link) => { link.href = href; });
    };

    const renderTitle = () => {
      const states = [
        attention.workingCount > 0 ? `작업중 ${attention.workingCount}` : "",
        attention.completedUnreadCount > 0 ? `완료 ${attention.completedUnreadCount}` : "",
      ].filter(Boolean);
      const prefix = states.length > 0 ? `[${states.join(" · ")}] ` : "";
      document.title = `${prefix}${baseTitle}`;
      applyFavicon();
    };

    const setBaseTitle = (title: string, suffix = APP_SUFFIX) => {
      baseTitle = formatDocumentTitle(title, suffix);
      renderTitle();
    };

    const cancelPendingSessionLookup = () => {
      titleRequestId += 1;
      if (abortController) abortController.abort();
      abortController = null;
    };

    const applyTitle = () => {
      cancelPendingSessionLookup();

      if (pathname === "/chat") {
        const sessionId = currentChatSessionId();
        setBaseTitle("AI Chat", CHAT_SUFFIX);
        if (!sessionId) return;
        const requestId = titleRequestId;
        abortController = new AbortController();
        fetchChatSessionTitle(sessionId, abortController.signal)
          .then((title) => {
            if (title && requestId === titleRequestId) setBaseTitle(title, CHAT_SUFFIX);
          })
          .catch(() => {
            // Keep the route-level title if session lookup fails.
          });
        return;
      }

      setBaseTitle(resolveRouteTitle(pathname));
    };

    const handleChatSessionTitleChange = (event: Event) => {
      if (pathname !== "/chat") return;
      const detail = (event as CustomEvent<ChatSessionTitleEventDetail>).detail;
      if (!detail || detail.sessionId !== currentChatSessionId()) return;
      cancelPendingSessionLookup();
      const nextTitle = detail.deleted ? "AI Chat" : detail.title || "AI Chat";
      setBaseTitle(nextTitle, CHAT_SUFFIX);
    };

    const handleSessionAttentionChange = (event: Event) => {
      const detail = (event as CustomEvent<SessionAttentionCounts>).detail;
      if (!detail) return;
      attention = detail;
      renderTitle();
    };

    applyTitle();
    window.addEventListener("hashchange", applyTitle);
    window.addEventListener("popstate", applyTitle);
    window.addEventListener(CHAT_SESSION_TITLE_EVENT, handleChatSessionTitleChange);
    window.addEventListener(SESSION_ATTENTION_EVENT, handleSessionAttentionChange);
    return () => {
      window.removeEventListener("hashchange", applyTitle);
      window.removeEventListener("popstate", applyTitle);
      window.removeEventListener(CHAT_SESSION_TITLE_EVENT, handleChatSessionTitleChange);
      window.removeEventListener(SESSION_ATTENTION_EVENT, handleSessionAttentionChange);
      if (abortController) abortController.abort();
      originalFavicons.forEach(({ link, href }) => { link.href = href; });
    };
  }, [disabled, pathname]);

  return null;
}
