"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type InboxItem, type InboxSummary, type InboxTab } from "@/lib/api";
import {
  INBOX_CHANGED_EVENT,
  INBOX_POLL_MS,
  INBOX_TABS,
  applyRead,
  degradedBanners,
  formatInboxTime,
  isInboxDenied,
  itemKey,
  mergeItems,
  safeInboxLink,
  severityStyle,
  shouldPollInbox,
} from "@/lib/inbox";

const PAGE_SIZE = 30;
const TOUCH = "min-h-[44px]";

export default function InboxPage() {
  const router = useRouter();
  const [tab, setTab] = useState<InboxTab>("action");
  const [project, setProject] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [listDegraded, setListDegraded] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const listSeq = useRef(0);
  const loadedAt = useRef(new Date().toISOString());
  const deniedRef = useRef(false);

  const notifyBell = () => window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));

  const handleFailure = useCallback((e: unknown, fallback: string) => {
    if (isInboxDenied(e)) {
      deniedRef.current = true;
      setDenied(true);
      return;
    }
    setError(fallback);
  }, []);

  const loadSummary = useCallback(async () => {
    if (deniedRef.current) return;
    try {
      setSummary(await api.getInboxSummary());
    } catch (e) {
      handleFailure(e, "알림 개수를 불러오지 못했습니다.");
    }
  }, [handleFailure]);

  const loadList = useCallback(
    async (opts: { cursor?: string | null } = {}) => {
      if (deniedRef.current) return;
      const seq = ++listSeq.current;
      const append = Boolean(opts.cursor);
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const res = await api.getInbox({
          tab,
          project,
          unreadOnly,
          cursor: opts.cursor,
          limit: PAGE_SIZE,
        });
        if (seq !== listSeq.current) return;
        if (!append) loadedAt.current = new Date().toISOString();
        setItems((prev) => (append ? mergeItems(prev, res.items) : res.items));
        setNextCursor(res.next_cursor);
        setListDegraded(res.degraded_sources ?? []);
        setProjects((prev) => {
          const found = new Set(prev);
          for (const item of res.items) if (item.project) found.add(item.project);
          return found.size === prev.length ? prev : [...found].sort();
        });
      } catch (e) {
        if (seq !== listSeq.current) return;
        handleFailure(e, "알림을 불러오지 못했습니다.");
      } finally {
        if (seq === listSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [tab, project, unreadOnly, handleFailure],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (shouldPollInbox(document.hidden)) timer = setInterval(() => void loadSummary(), INBOX_POLL_MS);
    };
    const onVisibility = () => {
      if (shouldPollInbox(document.hidden)) {
        void loadSummary();
        start();
      } else {
        stop();
      }
    };
    void loadSummary();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadSummary]);

  const reloadAll = useCallback(() => {
    void loadSummary();
    void loadList();
  }, [loadSummary, loadList]);

  const markRead = useCallback(
    async (item: InboxItem) => {
      const key = itemKey(item);
      if (item.read || busyKeys.includes(key)) return true;
      setBusyKeys((prev) => [...prev, key]);
      const before = { items, summary };
      const next = applyRead(items, summary, tab, key, unreadOnly);
      setItems(next.items);
      setSummary(next.summary);
      try {
        const res = await api.markInboxRead([item]);
        if (!res.ok || res.failed_sources.length > 0) throw new Error("partial");
        setNotice("");
        void loadSummary();
        notifyBell();
        return true;
      } catch (e) {
        setItems(before.items);
        setSummary(before.summary);
        if (isInboxDenied(e)) handleFailure(e, "");
        else setNotice("확인 처리를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      } finally {
        setBusyKeys((prev) => prev.filter((k) => k !== key));
      }
    },
    [busyKeys, items, summary, tab, unreadOnly, loadSummary, handleFailure],
  );

  const openItem = useCallback(
    (item: InboxItem) => {
      const link = safeInboxLink(item.link);
      if (!link) return;
      router.push(link);
      if (!item.read) void markRead(item);
    },
    [router, markRead],
  );

  const readAll = useCallback(async () => {
    const label = INBOX_TABS.find((t) => t.key === tab)?.label ?? "";
    if (!window.confirm(`'${label}' 탭의 미확인 알림을 모두 확인 처리할까요?`)) return;
    try {
      const res = await api.markInboxReadAll(tab, loadedAt.current);
      setNotice(
        !res.ok || res.failed_sources.length > 0
          ? "일부 출처의 확인 처리를 저장하지 못했습니다. 다시 불러온 뒤 확인해 주세요."
          : "",
      );
    } catch (e) {
      if (isInboxDenied(e)) {
        handleFailure(e, "");
        return;
      }
      setNotice("모두 확인 처리를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    notifyBell();
    reloadAll();
  }, [tab, handleFailure, reloadAll]);

  if (denied) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center" data-testid="inbox-denied">
        <div className="mb-3 text-3xl" aria-hidden>🔒</div>
        <h1 className="mb-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          알림 모아보기는 관리자만 볼 수 있습니다
        </h1>
        <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          필요한 알림은 담당 관리자에게 문의해 주세요. 로그인 상태는 그대로 유지됩니다.
        </p>
        <Link href="/chat" className={`inline-flex items-center rounded-lg px-4 text-sm ${TOUCH}`} style={{ background: "var(--accent)", color: "#fff" }}>
          채팅으로 이동
        </Link>
      </div>
    );
  }

  const banners = degradedBanners(listDegraded, summary?.degraded_sources);
  const currentUnread = summary?.tabs[tab].unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl p-3 pt-16 md:p-6 md:pt-6">
      <h1 className="mb-3 text-lg font-bold" style={{ color: "var(--text-primary)" }}>알림 모아보기</h1>

      <div
        role="tablist"
        aria-label="알림 종류"
        className="sticky top-0 z-20 -mx-3 mb-3 flex gap-1 overflow-x-auto px-3 py-2 md:mx-0 md:px-0"
        style={{ background: "var(--bg-primary, #030712)" }}
      >
        {INBOX_TABS.map((t) => {
          const active = t.key === tab;
          const unread = summary?.tabs[t.key].unread;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              data-testid={`inbox-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] sm:gap-1.5 sm:px-3 sm:text-sm ${TOUCH}`}
              style={
                active
                  ? { background: "var(--accent)", color: "#fff", fontWeight: 600 }
                  : { background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }
              }
            >
              <span>{t.label}</span>
              {unread !== undefined && (
                <span
                  data-testid={`inbox-tab-count-${t.key}`}
                  className={`rounded-full px-1.5 text-[11px] leading-5 ${unread > 0 ? "bg-red-600 text-white" : "bg-black/30"}`}
                >
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="프로젝트 필터"
          data-testid="inbox-project-filter"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className={`rounded-lg px-3 text-sm ${TOUCH}`}
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          <option value="">모든 프로젝트</option>
          {project && !projects.includes(project) && <option value={project}>{project}</option>}
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className={`flex cursor-pointer items-center gap-2 px-1 text-sm ${TOUCH}`} style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            data-testid="inbox-unread-only"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="h-5 w-5"
          />
          미확인만
        </label>
        <button
          data-testid="inbox-read-all"
          onClick={() => void readAll()}
          disabled={currentUnread === 0}
          className={`ml-auto rounded-lg px-3 text-sm disabled:opacity-40 ${TOUCH}`}
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          모두 확인
        </button>
      </div>

      {banners.map((name) => (
        <div
          key={name}
          role="alert"
          data-testid="inbox-degraded-banner"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          <span>{name} 알림을 일부 불러오지 못했습니다. 표시된 목록에 빠진 항목이 있을 수 있습니다.</span>
          <button
            onClick={reloadAll}
            className={`rounded-lg border border-amber-500/60 px-3 text-sm ${TOUCH}`}
            data-testid="inbox-degraded-retry"
          >
            다시 불러오기
          </button>
        </div>
      ))}

      {notice && (
        <div role="status" data-testid="inbox-notice" className="mb-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" data-testid="inbox-error" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={reloadAll} className={`rounded-lg border border-red-500/60 px-3 text-sm ${TOUCH}`}>다시 불러오기</button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>불러오는 중...</div>
      ) : items.length === 0 && !error ? (
        <div data-testid="inbox-empty" className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          처리할 알림이 없습니다
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const key = itemKey(item);
            const sev = severityStyle(item.severity);
            const link = safeInboxLink(item.link);
            const canRead = !item.read && item.actions.includes("read");
            return (
              <li
                key={key}
                data-testid="inbox-card"
                data-read={item.read ? "true" : "false"}
                className="rounded-xl p-3"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  opacity: item.read ? 0.65 : 1,
                }}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  {item.project && (
                    <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                      {item.project}
                    </span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 ${sev.className}`}>{sev.label}</span>
                  {item.count > 1 && (
                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-200">{item.count}회</span>
                  )}
                  {!item.read && <span aria-label="미확인" className="h-2 w-2 rounded-full bg-red-500" />}
                  <span className="ml-auto" style={{ color: "var(--text-secondary)" }}>{formatInboxTime(item.occurred_at_kst)}</span>
                </div>
                <h2
                  className="mb-0.5 text-[15px] font-semibold leading-snug"
                  style={{
                    color: "var(--text-primary)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.title}
                </h2>
                {item.summary && (
                  <p className="truncate text-sm" style={{ color: "var(--text-secondary)" }}>{item.summary}</p>
                )}
                {(link || canRead) && (
                  <div className="mt-2 flex gap-2">
                    {link && (
                      <button
                        data-testid="inbox-open"
                        onClick={() => openItem(item)}
                        className={`flex-1 rounded-lg px-3 text-sm md:flex-none md:px-5 ${TOUCH}`}
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        열기
                      </button>
                    )}
                    {canRead && (
                      <button
                        data-testid="inbox-read"
                        onClick={() => void markRead(item)}
                        disabled={busyKeys.includes(key)}
                        className={`flex-1 rounded-lg px-3 text-sm disabled:opacity-50 md:flex-none md:px-5 ${TOUCH}`}
                        style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                      >
                        확인
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <button
          data-testid="inbox-more"
          onClick={() => void loadList({ cursor: nextCursor })}
          disabled={loadingMore}
          className={`mt-3 w-full rounded-lg text-sm disabled:opacity-50 ${TOUCH}`}
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          {loadingMore ? "불러오는 중..." : "더 보기"}
        </button>
      )}
    </div>
  );
}
