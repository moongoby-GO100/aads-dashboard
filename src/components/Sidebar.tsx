"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_NAV_ITEMS, NAV_GROUP_ORDER, type AppNavItem, type NavGroup } from "@/lib/navigation";

/**
 * 사이드바 — 즐겨찾기 + 주제별 묶음.
 *
 * 2026-09-14. 그 전에는 53개를 평면으로 나열하고 스크롤만 있었다. 화면
 * 높이에 20줄쯤 들어가니 끝까지 보려면 세 번 스크롤해야 했다.
 *
 * 7일 실사용(실제 사람 방문만 추림)은 이렇게 치우쳐 있다.
 *
 *     /chat      113회   ← 전체의 60%
 *     /reports    17회
 *     나머지 40여 개  각 3~4회 (한 번씩 눌러본 흔적)
 *
 * 그래서 두 가지를 둔다.
 *   - **즐겨찾기**: 대표가 직접 별을 눌러 위로 올린다. 자동 추천은 순서가
 *     바뀌어 헷갈리고, 손으로 정하면 내가 또 잘못 고른다 — 실제로
 *     오늘 메뉴 위치를 잘못 골라 못 찾으셨다.
 *   - **주제 묶음**: 나머지는 접어 둔다. 현재 위치가 속한 묶음은 자동으로
 *     펼친다.
 *
 * 즐겨찾기와 펼침 상태는 이 브라우저에만 남는다(localStorage). 읽기·쓰기가
 * 실패해도(시크릿 창, 사이트 데이터 차단) 메뉴는 정상 동작해야 한다.
 */

interface SidebarProps {
  isOpen: boolean;
  isInternalAdmin: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const FAV_KEY = "ohvis-nav-favorites";
const OPEN_KEY = "ohvis-nav-open-groups";

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막혀도 이번 화면에서는 동작한다. 다음 방문에 안 남을 뿐이다.
  }
}

export default function Sidebar({ isOpen, isInternalAdmin, onOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // 첫 렌더는 서버와 같아야 한다(hydration). localStorage 는 마운트 뒤에 읽는다.
  useEffect(() => {
    setFavorites(readList(FAV_KEY));
    setOpenGroups(readList(OPEN_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const visible = useMemo(
    () => APP_NAV_ITEMS.filter((item) => isInternalAdmin || !item.adminOnly),
    [isInternalAdmin],
  );

  const matchesPath = useCallback(
    (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)),
    [pathname],
  );

  const isActive = useCallback(
    (item: AppNavItem) =>
      matchesPath(item.href) &&
      !visible.some(
        (other) =>
          !other.external &&
          other.href.length > item.href.length &&
          matchesPath(other.href),
      ),
    [matchesPath, visible],
  );

  // 지금 보고 있는 페이지가 속한 묶음은 접혀 있어도 펼친다.
  const activeGroup = useMemo(() => {
    const hit = visible.find((item) => isActive(item));
    return hit?.group;
  }, [visible, isActive]);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      writeList(FAV_KEY, next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group];
      writeList(OPEN_KEY, next);
      return next;
    });
  }, []);

  const favItems = useMemo(
    () => favorites.map((h) => visible.find((i) => i.href === h)).filter(Boolean) as AppNavItem[],
    [favorites, visible],
  );

  const grouped = useMemo(() => {
    const map = new Map<NavGroup, AppNavItem[]>();
    for (const item of visible) {
      const g = (item.group || "기타") as NavGroup;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return NAV_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [visible]);

  const row = (item: AppNavItem, opts?: { inFavorites?: boolean }) => {
    const active = isActive(item);
    const starred = favorites.includes(item.href);
    return (
      <div key={`${opts?.inFavorites ? "fav-" : ""}${item.href}`} className="flex items-center group/navrow">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors flex-1 min-w-0"
          style={
            active
              ? { background: "var(--accent)", color: "#fff" }
              : item.highlight
                ? { color: "#a78bfa", fontWeight: 600 }
                : { color: "var(--text-secondary)" }
          }
          onMouseEnter={(e) => {
            if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!active) (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          <span>{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </Link>
        <button
          onClick={() => toggleFavorite(item.href)}
          title={starred ? "즐겨찾기에서 빼기" : "즐겨찾기에 넣기"}
          aria-label={starred ? `${item.label} 즐겨찾기 해제` : `${item.label} 즐겨찾기`}
          className="px-1.5 text-xs shrink-0"
          style={{ color: starred ? "#f59e0b" : "var(--text-secondary)", opacity: starred ? 1 : 0.35 }}
        >
          {starred ? "★" : "☆"}
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        className="fixed top-3 left-3 z-50 md:hidden text-white rounded p-2 leading-none"
        style={{ background: "var(--bg-card)" }}
        onClick={onOpen}
        aria-label="메뉴 열기"
      >
        ☰
      </button>

      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-56 flex flex-col
          transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:h-screen md:z-auto
        `}
        style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderRight: "1px solid var(--border)" }}
      >
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--accent)" }}>OHVIS</h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Autonomous AI Dev System</p>
          </div>
          <button
            className="md:hidden text-lg leading-none"
            style={{ color: "var(--text-secondary)" }}
            onClick={onClose}
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {ready && favItems.length > 0 && (
            <div className="mb-2">
              <div
                className="px-3 py-1 text-[11px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                ★ 즐겨찾기
              </div>
              {favItems.map((item) => row(item, { inFavorites: true }))}
              <div className="my-2" style={{ borderTop: "1px solid var(--border)" }} />
            </div>
          )}

          {ready && favItems.length === 0 && (
            <div
              className="px-3 py-2 mb-1 text-[11px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              메뉴 옆 ☆ 를 누르면 여기 위로 올라옵니다.
            </div>
          )}

          {grouped.map(({ group, items }) => {
            const expanded = openGroups.includes(group) || group === activeGroup;
            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold rounded-lg"
                  style={{ color: "var(--text-secondary)" }}
                  aria-expanded={expanded}
                >
                  <span>{group}</span>
                  <span style={{ opacity: 0.6 }}>{expanded ? "▾" : `▸ ${items.length}`}</span>
                </button>
                {expanded && <div className="space-y-1 mb-1">{items.map((item) => row(item))}</div>}
              </div>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
          <a
            href="/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full"
            style={{ background: "var(--accent)", color: "#fff" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
          >
            <span>💬</span> 새 채팅 열기
          </a>
        </div>
      </aside>
    </>
  );
}
