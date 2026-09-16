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

/** 확정 블록의 최소 길이. 너무 잘면 DOM 만 늘고, 너무 크면 재파싱이 안 준다. */
export const STREAM_FREEZE_MIN_CHARS = 1200;

export type StreamingMarkdownSplit = Readonly<{
  frozen: readonly string[];
  tail: string;
}>;

/**
 * 스트리밍 본문을 "다시 안 바뀌는 앞부분" 과 "지금 써지는 꼬리" 로 나눈다.
 *
 * 매 갱신마다 본문 전체를 다시 파싱하는 것이 느려서, 예전에는 앞부분을
 * 8,000자에서 잘라 버렸다(AADS-BUBBLE-FLASH-P1). 읽고 있던 글이 사라지는
 * 것을 대표님이 2026-09-16 에 지적하셨다.
 *
 * 자르는 대신 나눈다. 경계는 한 번 정해지면 움직이지 않는다 — 경계가 앞쪽
 * 내용만으로 결정되기 때문이다. 그래서 확정 블록의 문자열이 불변이고
 * React.memo 가 재파싱을 막는다. 꼬리만 매번 다시 파싱하면 되므로 본문이
 * 얼마나 길든 비용은 꼬리 길이에 비례한다.
 *
 * 코드펜스 안에서는 끊지 않는다 — 반쪽 펜스는 전혀 다른 것으로 렌더된다.
 * 표는 안에 빈 줄이 없어 통째로 꼬리에 있다가 함께 확정된다.
 */
export function splitStreamingMarkdown(source: string): StreamingMarkdownSplit {
  if (!source || source.length < STREAM_FREEZE_MIN_CHARS) {
    return { frozen: [], tail: source || "" };
  }

  const lines = source.split("\n");
  const frozen: string[] = [];
  let blockStart = 0;
  let blockChars = 0;
  let fenceOpen = false;

  // 마지막 줄은 아직 써지는 중이므로 경계 후보에서 뺀다.
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    blockChars += line.length + 1;
    if (line.trimStart().startsWith("```")) {
      fenceOpen = !fenceOpen;
      continue;
    }
    if (fenceOpen) continue;
    if (line.trim() !== "") continue;
    if ((lines[i + 1] ?? "").trim() === "") continue;  // 연속 빈 줄은 뒤쪽을 경계로
    if (blockChars < STREAM_FREEZE_MIN_CHARS) continue;
    frozen.push(lines.slice(blockStart, i + 1).join("\n"));
    blockStart = i + 1;
    blockChars = 0;
  }

  if (frozen.length === 0) return { frozen: [], tail: source };
  return { frozen, tail: lines.slice(blockStart).join("\n") };
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
