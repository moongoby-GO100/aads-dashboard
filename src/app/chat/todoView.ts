import type { ChatTodoItem } from "./types";

export const TODO_PAGE_SIZE = 200;
export const TODO_DATE_UNKNOWN = "등록일시 미확인";

const KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE_TIME_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const HAS_ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

export function parseTodoTimestamp(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!DATE_TIME_PREFIX.test(text)) return null;
  const iso = HAS_ZONE.test(text) ? text.replace(" ", "T") : `${text.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= 2000 && year <= 2100 ? ms : null;
}

export function formatTodoCreatedAt(raw: unknown): { text: string; known: boolean } {
  const ms = parseTodoTimestamp(raw);
  if (ms === null) return { text: TODO_DATE_UNKNOWN, known: false };
  const parts: Record<string, string> = {};
  for (const part of KST_FORMAT.formatToParts(ms)) parts[part.type] = part.value;
  return {
    text: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`,
    known: true,
  };
}

function statusRank(status: ChatTodoItem["status"]): number {
  return status === "in_progress" ? 0 : status === "pending" ? 1 : status === "failed" ? 2 : status === "skipped" ? 3 : 4;
}

export function selectVisibleTodos(items: ChatTodoItem[], showAll: boolean): ChatTodoItem[] {
  return items
    .filter((item) => showAll || item.status === "pending" || item.status === "in_progress")
    .sort((a, b) => {
      const byRank = statusRank(a.status) - statusRank(b.status);
      if (byRank !== 0) return byRank;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
}

export function countTodos(items: ChatTodoItem[]) {
  const counts = { active: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, skipped: 0 };
  for (const item of items) {
    if (item.status === "pending") { counts.pending += 1; counts.active += 1; }
    else if (item.status === "in_progress") { counts.inProgress += 1; counts.active += 1; }
    else if (item.status === "completed") counts.completed += 1;
    else if (item.status === "failed") counts.failed += 1;
    else if (item.status === "skipped") counts.skipped += 1;
  }
  return counts;
}

export function mergeTodoPages(pages: ChatTodoItem[][]): { items: ChatTodoItem[]; lastPageAdded: number } {
  const seen = new Set<string>();
  const items: ChatTodoItem[] = [];
  let lastPageAdded = 0;
  pages.forEach((page, index) => {
    let added = 0;
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      added += 1;
    }
    if (index === pages.length - 1) lastPageAdded = added;
  });
  return { items, lastPageAdded };
}

export function todoStatusLabel(status: ChatTodoItem["status"]): string {
  return status === "in_progress" ? "진행" : status === "pending" ? "대기" : status === "completed" ? "완료" : status === "failed" ? "실패" : "제외";
}
