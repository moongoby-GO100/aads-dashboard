import type { InboxItem, InboxSummary, InboxTab } from "@/lib/api";

export const INBOX_POLL_MS = 60_000;
export const INBOX_CHANGED_EVENT = "ohvis-inbox-changed";

export const INBOX_TABS: Array<{ key: InboxTab; label: string }> = [
  { key: "action", label: "처리 필요" },
  { key: "alert", label: "경보" },
  { key: "change", label: "변경 알림" },
  { key: "runner", label: "러너 진행" },
];

const DEGRADED_LABELS: Record<string, string> = {
  alert_history: "경보",
  agent_permission_requests: "승인 요청",
  "agent_permission_requests.notify": "변경 알림",
  ohvis_notifications: "오비스 알림",
  pipeline_runner_events: "러너 진행",
};

export function degradedSourceLabel(raw: string): string {
  return DEGRADED_LABELS[raw] ?? "일부 출처";
}

export function degradedBanners(...lists: Array<string[] | undefined>): string[] {
  const labels = new Set<string>();
  for (const list of lists) for (const raw of list ?? []) labels.add(degradedSourceLabel(raw));
  return [...labels];
}

export function isInboxDenied(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

export function itemKey(item: Pick<InboxItem, "source" | "source_id">): string {
  return `${item.source}:${item.source_id}`;
}

export function mergeItems(prev: InboxItem[], next: InboxItem[]): InboxItem[] {
  const seen = new Set(prev.map(itemKey));
  const merged = [...prev];
  for (const item of next) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function applyRead(
  items: InboxItem[],
  summary: InboxSummary | null,
  tab: InboxTab,
  key: string,
  unreadOnly: boolean,
): { items: InboxItem[]; summary: InboxSummary | null } {
  const target = items.find((i) => itemKey(i) === key);
  if (!target || target.read) return { items, summary };
  const nextItems = unreadOnly
    ? items.filter((i) => itemKey(i) !== key)
    : items.map((i) => (itemKey(i) === key ? { ...i, read: true, actions: i.actions.filter((a) => a !== "read") } : i));
  const nextSummary = summary
    ? {
        ...summary,
        tabs: {
          ...summary.tabs,
          [tab]: { ...summary.tabs[tab], unread: Math.max(0, summary.tabs[tab].unread - 1) },
        },
      }
    : summary;
  return { items: nextItems, summary: nextSummary };
}

const SEVERITY_STYLE: Record<string, { label: string; className: string }> = {
  critical: { label: "긴급", className: "border-red-500/60 bg-red-500/10 text-red-300" },
  high: { label: "높음", className: "border-orange-500/60 bg-orange-500/10 text-orange-300" },
  warning: { label: "주의", className: "border-amber-500/60 bg-amber-500/10 text-amber-300" },
  info: { label: "정보", className: "border-slate-500/50 bg-slate-500/10 text-slate-300" },
};

export function severityStyle(severity: string): { label: string; className: string } {
  return SEVERITY_STYLE[String(severity).toLowerCase()] ?? SEVERITY_STYLE.info;
}

export function formatInboxTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function safeInboxLink(link: string): string | null {
  const value = String(link || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function shouldPollInbox(hidden: boolean): boolean {
  return !hidden;
}
