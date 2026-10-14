export type ListBodyState = "loading" | "error" | "empty" | "no-results" | "list";

export function listBodyState(input: { loading: boolean; hasError: boolean; count: number; query: string }): ListBodyState {
  if (input.loading) return "loading";
  if (input.hasError) return "error";
  if (input.count === 0) return input.query ? "no-results" : "empty";
  return "list";
}

// 선택 문서가 현재 목록(검색 결과 포함)에 있는지. 목록이 아직 확정되지 않았으면 "unknown".
export type SelectionPresence = "none" | "unknown" | "present" | "missing";

export function selectionPresence(input: {
  selected: string | null;
  keys: readonly string[];
  loading: boolean;
  hasError: boolean;
}): SelectionPresence {
  if (!input.selected) return "none";
  if (input.loading || input.hasError) return "unknown";
  return input.keys.includes(input.selected) ? "present" : "missing";
}

export const SLOW_LIST_MS = 3000;

export interface ListedDocument {
  document_key: string;
  title: string;
  kind: string;
  status: string;
  updated_at: string;
}

export interface DocFilters {
  status: string;
  kind: string;
}

export const NO_FILTERS: DocFilters = { status: "", kind: "" };

export function hasActiveFilter(filters: DocFilters): boolean {
  return !!(filters.status || filters.kind);
}

export function filterDocuments<T extends ListedDocument>(documents: readonly T[], filters: DocFilters): T[] {
  return documents.filter((item) => (!filters.status || item.status === filters.status) && (!filters.kind || item.kind === filters.kind));
}

// 한 필터의 옵션 건수는 "다른 필터"가 걸린 결과 안에서 센다(선택해도 0건이 되지 않게).
export function countBy<T extends ListedDocument>(documents: readonly T[], field: "status" | "kind"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of documents) counts.set(item[field], (counts.get(item[field]) || 0) + 1);
  return counts;
}

export function optionCounts<T extends ListedDocument>(documents: readonly T[], filters: DocFilters) {
  return {
    status: countBy(filterDocuments(documents, { ...filters, status: "" }), "status"),
    kind: countBy(filterDocuments(documents, { ...filters, kind: "" }), "kind"),
  };
}

export function recentDocuments<T extends ListedDocument>(documents: readonly T[], limit = 5): T[] {
  return [...documents].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)).slice(0, limit);
}

// 같은 제목 문서끼리 구별되는 최소 document_key 끝부분. 제목이 유일하면 맵에 넣지 않는다.
export function duplicateKeyTails(documents: readonly ListedDocument[], minLength = 6): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const item of documents) {
    const title = (item.title || "").trim();
    groups.set(title, [...(groups.get(title) || []), item.document_key]);
  }
  const tails = new Map<string, string>();
  for (const keys of groups.values()) {
    if (keys.length < 2) continue;
    let length = minLength;
    const maxLength = Math.max(...keys.map((key) => key.length));
    while (length < maxLength && new Set(keys.map((key) => key.slice(-length))).size < keys.length) length += 1;
    for (const key of keys) tails.set(key, key.length > length ? `…${key.slice(-length)}` : key);
  }
  return tails;
}

const kstParts = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return parts as Record<"year" | "month" | "day" | "hour" | "minute", string>;
};

// 같은 해(KST)면 '10/14 12:47', 다른 해면 '2025/10/14 12:47'.
export function kstShort(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const at = kstParts(date);
  const base = `${at.month}/${at.day} ${at.hour}:${at.minute}`;
  return at.year === kstParts(now).year ? base : `${at.year}/${base}`;
}
