"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { INBOX_CHANGED_EVENT, INBOX_POLL_MS, isInboxDenied, shouldPollInbox } from "@/lib/inbox";

export default function InboxBell() {
  const [unread, setUnread] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  const deniedRef = useRef(false);

  const load = useCallback(() => {
    if (deniedRef.current || !shouldPollInbox(document.hidden)) return;
    api
      .getInboxSummary()
      .then((summary) => setUnread(summary.tabs.action.unread))
      .catch((error) => {
        if (isInboxDenied(error)) {
          deniedRef.current = true;
          setDenied(true);
        }
      });
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (shouldPollInbox(document.hidden)) timer = setInterval(load, INBOX_POLL_MS);
    };
    const onVisibility = () => {
      if (shouldPollInbox(document.hidden)) {
        load();
        start();
      } else {
        stop();
      }
    };
    load();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(INBOX_CHANGED_EVENT, load);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(INBOX_CHANGED_EVENT, load);
    };
  }, [load]);

  if (denied) return null;

  const label = unread === null ? "알림 모아보기" : `알림 모아보기, 처리 필요 ${unread}건`;
  return (
    <Link
      href="/inbox"
      aria-label={label}
      title="알림 모아보기"
      data-testid="inbox-bell"
      className="fixed top-1 right-2 z-30 flex h-11 w-11 items-center justify-center rounded-full text-lg"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <span aria-hidden>🔔</span>
      {unread !== null && (
        <span
          data-testid="inbox-badge"
          data-count={unread}
          className={`absolute -top-0.5 -right-0.5 min-w-[20px] rounded-full px-1 text-center text-[11px] font-bold leading-5 ${
            unread > 0 ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
