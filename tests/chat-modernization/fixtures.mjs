// WP00 / C03-C22 / FR01-FR22 / INV01-INV09 / ADR03-ADR11 / T01-T22.
// Synthetic public data only: fixed clock, IDs, byte order, and scope.
export const SEED = "wp00-20260912-v1";
export const CLOCK = "2026-09-12T00:00:00.000Z";
export const SIZES = Object.freeze([0, 1, 40, 150, 500, 5000]);
export const SCOPE = Object.freeze({
  tenant_id: "synthetic-tenant-a",
  user_id: "synthetic-user-a",
  session_id: "synthetic-session-a",
  branch_id: "synthetic-branch-a",
});

const samples = Object.freeze([
  "합성 질문과 답변입니다. 한글 👩🏽‍💻 café e\u0301\r\n다음 줄",
  "| 항목 | 값 |\n| --- | --- |\n| 합성 | 42 |",
  "```typescript\nconst answer = \"합성 👋\";\n```",
  "> 합성 인용\n\n- 첫 항목\n- 두 번째 항목",
  "```typescript\nconst incomplete = \"미완성",
  `[합성 문서](/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=synthetic.md)`,
  `긴 URL https://fixture.invalid/${"x".repeat(220)}`,
]);

export function messages(count, overrides = {}) {
  if (!Number.isInteger(count) || count < 0 || count > 5000) {
    throw new RangeError("fixture size must be 0..5000");
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-message-${String(index).padStart(5, "0")}`,
    ...SCOPE,
    execution_id: `synthetic-execution-${Math.floor(index / 2)}`,
    render_id: `synthetic-render-${index}`,
    role: index % 2 ? "assistant" : "user",
    content: `${index}: ${samples[index % samples.length]}`,
    status: "completed",
    // Deliberately put 100 messages on each timestamp boundary (C15/T10).
    created_at: new Date(Date.parse(CLOCK) + Math.floor(index / 100) * 1000).toISOString(),
    ...overrides,
  }));
}

export const largeAnswer = "합성 긴 답변 👩🏽‍💻\n".repeat(6000);
export const toolEvents = Object.freeze(Array.from({ length: 2000 }, (_, index) => ({
  type: index % 2 ? "tool_result" : "tool_use",
  tool_name: "synthetic_read",
  tool_use_id: `synthetic-tool-${Math.floor(index / 2)}`,
  content: `합성 결과 ${index}`,
})));

export function frame(id, event, newline = "\n") {
  return `id: ${id}${newline}data: ${JSON.stringify(event)}${newline}${newline}`;
}

const first = frame("10-1", { type: "delta", content: "한글 👩🏽‍💻 " });
const second = frame("10-2", { type: "delta", content: "두 번째" });
const done = frame("10-3", { type: "resume_done" });
export const sequences = Object.freeze({
  normal: first + second + done,
  duplicate: first + first + second + done,
  outOfOrder: second + first + done,
  crlf: frame("10-1", { type: "delta", content: "한글 👩🏽‍💻 " }, "\r\n"),
  multiline: "id: 10-1\ndata: {\"type\":\"delta\",\ndata: \"content\":\"한글 👩🏽‍💻 \"}\n\n",
  noSpace: "id:10-1\ndata:{\"type\":\"delta\",\"content\":\"한글 👩🏽‍💻 \"}\n\n",
  incomplete: "id: 10-1\ndata: {\"type\":\"delta\",\"content\":\"한글 👩🏽‍💻 \"}\n",
  invalid: "id: 10-9\ndata: {invalid}\n\n",
  disconnectResume: Object.freeze([first, first + second + done]),
});

export function chunks(text, chunkBytes = 1) {
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1) {
    throw new RangeError("positive chunkBytes required");
  }
  const bytes = new TextEncoder().encode(text);
  return Array.from(
    { length: Math.ceil(bytes.length / chunkBytes) },
    (_, index) => bytes.slice(index * chunkBytes, (index + 1) * chunkBytes),
  );
}

export function byteSplits(text) {
  const bytes = new TextEncoder().encode(text);
  return Array.from({ length: bytes.length + 1 }, (_, index) => [
    bytes.slice(0, index),
    bytes.slice(index),
  ]);
}
