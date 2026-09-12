import { DEFAULT_CHAT_RENDER_BUDGETS } from "./renderBudgetPolicy";

export type MarkdownRenderPlan = Readonly<{
  source: string;
  copyText: string;
  stability: "final" | "stable-stream" | "incomplete-stream";
  incompleteConstructs: readonly ("fence" | "table" | "list" | "reference")[];
}>;

/**
 * Classifies streaming Markdown without trimming or rewriting it. The current
 * renderer remains authoritative; consumers may use stability only to defer
 * expensive decoration such as syntax highlighting.
 */
export function planMarkdownRender(source: string, streaming: boolean): MarkdownRenderPlan {
  if (!streaming) return { source, copyText: source, stability: "final", incompleteConstructs: [] };

  const incomplete = new Set<"fence" | "table" | "list" | "reference">();
  const fenceCount = source.split(/\r?\n/).filter((line) => /^\s*```/.test(line)).length;
  if (fenceCount % 2 === 1) incomplete.add("fence");
  const lines = source.split(/\r?\n/);
  const lastLine = lines.at(-1) || "";
  if (/^\s*\|/.test(lastLine) && !/\|\s*$/.test(lastLine)) incomplete.add("table");
  if (/^\s*(?:[-+*]|\d+\.)\s*$/.test(lastLine)) incomplete.add("list");
  if (/\[[^\]]+\]\[[^\]]*$/.test(lastLine)) incomplete.add("reference");

  return {
    source,
    copyText: source,
    stability: incomplete.size > 0 ? "incomplete-stream" : "stable-stream",
    incompleteConstructs: [...incomplete],
  };
}

/** Historical rows do not subscribe to the active token clock. */
export function messageRenderSubscriptionKey(input: Readonly<{
  renderKey: string;
  contentVersion: string | number | null;
  contentCompleteness: string;
  active: boolean;
  activeTokenRevision: number;
}>): string {
  const stable = `${input.renderKey}:${String(input.contentVersion ?? "legacy")}:${input.contentCompleteness}`;
  return input.active ? `${stable}:token-${input.activeTokenRevision}` : stable;
}

export type ToolLogEntry = Readonly<{
  toolId: string;
  name: string | null;
  status: "started" | "completed" | "failed";
  summary: string;
  preview: string;
  truncated: boolean;
  detail: string | null;
  detailState: "idle" | "loading" | "loaded" | "error";
}>;

export type ToolLogEvent = Readonly<{
  toolId: string;
  type: "start" | "result" | "failure" | "detail-loading" | "detail-loaded" | "detail-error";
  name?: string;
  summary?: string;
  content?: string;
}>;

function boundedPreview(value: string, maxChars: number): Readonly<{ preview: string; truncated: boolean }> {
  if (value.length <= maxChars) return { preview: value, truncated: false };
  return { preview: value.slice(0, maxChars), truncated: true };
}

/** Merges out-of-order tool events by durable tool ID and never clears answer content. */
export function reduceToolLog(
  entries: readonly ToolLogEntry[],
  event: ToolLogEvent,
  maxPreviewChars: number = DEFAULT_CHAT_RENDER_BUDGETS.maxToolPreviewChars,
): readonly ToolLogEntry[] {
  if (!event.toolId) return entries;
  if (!Number.isInteger(maxPreviewChars) || maxPreviewChars < 1) {
    throw new RangeError("maxPreviewChars must be a positive integer");
  }
  const index = entries.findIndex((entry) => entry.toolId === event.toolId);
  const existing: ToolLogEntry = index >= 0 ? entries[index] : {
    toolId: event.toolId,
    name: null,
    status: "started",
    summary: "",
    preview: "",
    truncated: false,
    detail: null,
    detailState: "idle",
  };
  const content = event.content ?? existing.detail ?? existing.preview;
  const preview = boundedPreview(content, maxPreviewChars);
  const terminal = existing.status === "completed" || existing.status === "failed";
  const next: ToolLogEntry = {
    ...existing,
    name: event.name || existing.name,
    summary: event.summary ?? existing.summary,
    preview: preview.preview,
    truncated: preview.truncated,
    status: event.type === "result" ? "completed"
      : event.type === "failure" ? "failed"
      : terminal ? existing.status : "started",
    detail: event.type === "detail-loaded" ? (event.content ?? "") : existing.detail,
    detailState: event.type === "detail-loading" ? "loading"
      : event.type === "detail-loaded" ? "loaded"
      : event.type === "detail-error" ? "error"
      : existing.detailState,
  };
  if (index < 0) return [...entries, next];
  return entries.map((entry, entryIndex) => entryIndex === index ? next : entry);
}

export type AnnouncementEvent = Readonly<{
  executionId: string;
  kind: "token" | "completed" | "interrupted" | "failed";
  reportId?: string | null;
}>;

/** Returns a polite live-region announcement only for a new terminal state. */
export function terminalAnnouncement(
  event: AnnouncementEvent,
  announcedKeys: ReadonlySet<string>,
): Readonly<{ key: string; message: string }> | null {
  if (event.kind === "token") return null;
  const key = `${event.executionId}:${event.kind}`;
  if (announcedKeys.has(key)) return null;
  const reportSuffix = event.reportId ? ` 보고 ID ${event.reportId}.` : "";
  const message = event.kind === "completed" ? "응답이 완료되었습니다."
    : event.kind === "interrupted" ? "응답이 중단되었습니다. 다시 시도할 수 있습니다."
    : "응답 생성에 실패했습니다. 다시 시도할 수 있습니다.";
  return { key, message: `${message}${reportSuffix}` };
}
