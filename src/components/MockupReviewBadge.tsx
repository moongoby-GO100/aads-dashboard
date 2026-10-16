/**
 * 채팅 상단 '목업 검토 N' 배지 — 읽지 않은 목업 검토 알림을 띄우고,
 * 항목을 누르면 서버가 정한 딥링크(item.link)로 이동하며 읽음 처리한다.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mockupApi } from "@/lib/mockupReviewApi";
import {
  badgeProjects, mergeBadgeNotifications, notificationKindLabel, safeChatLink, type BadgeNotification,
} from "@/lib/mockupReviewModel";

const TOUCH = 44;
const POLL_MS = 60_000;

export function MockupReviewBadge({ project }: { project: string }) {
  const [items, setItems] = useState<BadgeNotification[]>([]);
  const [open, setOpen] = useState(false);

  const projects = useMemo(() => badgeProjects(project), [project]);
  const multi = projects.length > 1;

  const load = useCallback(async () => {
    // 한 프로젝트 조회가 실패해도 나머지는 표시한다. 알림 조회 실패가 대화를 막으면 안 된다.
    const results = await Promise.all(projects.map(async (p) => {
      try {
        return { project: p, items: (await mockupApi.listNotifications(p, true)).items };
      } catch {
        return { project: p, items: null };
      }
    }));
    if (results.every((r) => r.items === null)) return;
    setItems(mergeBadgeNotifications(results));
  }, [projects]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const go = useCallback(async (item: BadgeNotification) => {
    try { await mockupApi.markRead(item.sourceProject, item.id); } catch { /* 읽음 표시 실패여도 이동한다 */ }
    const link = safeChatLink(item.link);
    setOpen(false);
    if (link) window.location.assign(link);
    else void load();
  }, [load]);

  if (items.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ minHeight: TOUCH, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 999,
                 border: "1px solid #2563eb", background: "rgba(37,99,235,.08)", color: "#2563eb",
                 fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
        🖼 목업 검토 {items.length} <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul role="menu" style={{ position: "absolute", top: "100%", right: 0, zIndex: 30, margin: "4px 0 0", padding: 4, listStyle: "none",
                                 width: "min(420px, 92vw)", maxHeight: "60vh", overflowY: "auto",
                                 background: "var(--ct-card, var(--bg-card))", border: "1px solid var(--ct-border, var(--border))",
                                 borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>
          {items.map((n) => (
            <li key={`${n.sourceProject}:${n.id}`} role="none">
              <button type="button" role="menuitem" onClick={() => void go(n)}
                style={{ width: "100%", minHeight: TOUCH, textAlign: "left", padding: "8px 10px", border: 0, borderRadius: 8,
                         background: "transparent", color: "var(--ct-text, var(--text-primary))", cursor: "pointer" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>
                  {multi && <span style={{ marginRight: 6, padding: "1px 6px", borderRadius: 6, fontSize: 11, background: "rgba(37,99,235,.12)", color: "#2563eb" }}>{n.sourceProject}</span>}
                  {notificationKindLabel(n.kind)}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ct-text2, var(--text-secondary))", wordBreak: "break-word" }}>{n.body}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
