import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { largeAnswer, messages, SEED, SIZES, toolEvents } from "./fixtures.mjs";
import { loadPageFunctions, loadSource, source } from "./source-loader.mjs";

// C03-C06 / FR01-FR04 / INV01-INV02 / ADR03 / T01-T04.
test("existing scroll policy and replacement selftests execute", () => {
  loadSource("src/lib/chatScrollPolicy.selftest.ts");
  loadSource("src/lib/chatReplacementGuard.selftest.ts");
  loadSource("src/lib/chatInterruptReceipt.selftest.ts");
});

test("manual follow remains user-owned for thirty seconds of synthetic ticks", () => {
  const policy = loadSource("src/lib/chatScrollPolicy.ts");
  for (let tick = 0; tick <= 300; tick += 1) {
    assert.equal(policy.decideChatFollow({
      mode: "manual",
      isNearBottom: true,
      activeReply: true,
      bottomStickActive: tick % 2 === 0,
      messageCountGrew: tick % 3 === 0,
    }), "none");
  }
  assert.equal(policy.CHAT_BOTTOM_THRESHOLD_PX, 300);
});

// C10 / FR06-FR07 / INV05-INV06 / ADR06 / T06-T07 moved to the
// executable WP03 common runtime test; the four inline legacy parsers no
// longer exist in page.tsx.

// C11-C13/C22 / FR08/FR22 / INV03/INV09 / ADR03 / T08/T22.
test("message visibility keeps user content and meaningful interrupted partials", () => {
  const functions = loadPageFunctions([
    "isHiddenSystemChatMessage",
    "hasMeaningfulDisplayContent",
    "isInterruptedLikeMessage",
  ]);
  const base = messages(2)[1];
  const partial = {
    ...base,
    id: "synthetic-partial",
    intent: "interrupted_partial",
    model_used: "interrupted",
    content: "보존해야 하는 의미 있는 부분 응답입니다. ".repeat(4),
  };
  assert.equal(functions.isHiddenSystemChatMessage(partial), false);
  assert.equal(functions.hasMeaningfulDisplayContent(partial), true);
  assert.equal(functions.isInterruptedLikeMessage(partial), true);
  assert.equal(functions.isHiddenSystemChatMessage({ ...base, role: "user", intent: "system_trigger", content: "[시스템] 합성" }), true);
  assert.equal(functions.isHiddenSystemChatMessage({ ...base, intent: "runner_notification", content: "짧은 내부 알림" }), true);
});

test("finalization preserves bubble identity and preview cannot replace full content", () => {
  const functions = loadPageFunctions([
    "mergeServerMessageWithExisting",
    "replaceStreamingPlaceholderWithFinal",
  ]);
  const placeholder = {
    ...messages(2)[1],
    id: "ai-streaming-synthetic",
    render_id: "stable-synthetic-render",
    execution_id: "synthetic-execution-stable",
    intent: "streaming_placeholder",
    model_used: "streaming",
    content: "부분 응답",
  };
  const final = {
    ...placeholder,
    id: "00000000-0000-4000-8000-000000000001",
    render_id: undefined,
    intent: undefined,
    model_used: "claude-sonnet",
    content: "최종 응답",
  };
  const result = functions.replaceStreamingPlaceholderWithFinal([placeholder], final);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, placeholder.id);
  assert.equal(result[0].render_id, placeholder.render_id);
  assert.equal(result[0].execution_id, final.execution_id);
  assert.equal(result[0].content, "최종 응답");

  const full = { ...final, content: "합성 전체 본문 ".repeat(100), is_truncated: false };
  const preview = { ...full, content: "합성 미리보기", is_truncated: true };
  assert.equal(functions.mergeServerMessageWithExisting(full, preview).content, full.content);

  const versionedFull = {
    ...final,
    content: "버전 7 전체 본문",
    content_version: "7",
    content_completeness: "full",
  };
  const versionedPreview = {
    ...versionedFull,
    content: "버전 7 미리보기",
    content_completeness: "preview",
  };
  assert.equal(
    functions.replaceStreamingPlaceholderWithFinal([versionedFull], versionedPreview)[0].content,
    versionedFull.content,
  );
  const shorterEdit = {
    ...versionedFull,
    content: "짧은 편집",
    content_version: "8",
  };
  assert.equal(
    functions.replaceStreamingPlaceholderWithFinal([versionedFull], shorterEdit)[0].content,
    shorterEdit.content,
  );
});

test("a different execution cannot erase an interrupted partial", () => {
  const { mergeServerMessagesPreservingLocal } = loadPageFunctions(["mergeServerMessagesPreservingLocal"]);
  const partial = {
    ...messages(2)[1],
    id: "00000000-0000-4000-8000-000000000010",
    execution_id: "synthetic-execution-old",
    intent: "interrupted_partial",
    model_used: "interrupted",
    content: "이전 실행에서 보존된 의미 있는 부분 응답입니다. ".repeat(3),
  };
  const final = {
    ...messages(4)[3],
    id: "00000000-0000-4000-8000-000000000011",
    execution_id: "synthetic-execution-new",
    content: "새 실행의 독립 최종 응답",
  };
  const merged = mergeServerMessagesPreservingLocal([partial], [final]);
  assert.deepEqual(new Set(merged.map((message) => message.id)), new Set([partial.id, final.id]));
});

// C29 / FR38 / INV15 / ADR11 / T38.
for (const count of SIZES) {
  test(`fixture ${count} has deterministic, unique identities`, () => {
    const first = messages(count);
    const second = messages(count);
    assert.deepEqual(first, second);
    assert.equal(new Set(first.map((message) => message.id)).size, count);
    assert.equal(
      createHash("sha256").update(JSON.stringify(first)).digest("hex"),
      createHash("sha256").update(JSON.stringify(second)).digest("hex"),
    );
  });
}

test("fixture boundaries include large content, tools, and exact source symbols", () => {
  assert.equal(SEED, "wp00-20260912-v1");
  assert.ok(Buffer.byteLength(largeAnswer) > 100_000);
  assert.equal(toolEvents.length, 2000);
  assert.equal(new Set(toolEvents.map((event) => event.tool_use_id)).size, 1000);
  const page = source("src/app/chat/page.tsx");
  for (const marker of [
    'from "./ChatInput"',
    'from "./MarkdownRenderer"',
    'from "./ChatArtifactPanel"',
    'createEventStream("direct")',
    'createEventStream("replay")',
    'createEventStream("resume")',
    'createEventStream("regenerate")',
  ]) assert.ok(page.includes(marker), `missing source marker: ${marker}`);
  assert.equal(page.includes('from "@/components/chat/ChatInput"'), false);
  assert.equal(page.includes('from "@/hooks/useChatSSE"'), false);
});
