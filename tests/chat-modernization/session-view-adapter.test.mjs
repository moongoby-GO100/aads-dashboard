import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./source-loader.mjs";

const { adaptChatSessionView } = loadSource("src/features/chat/transport/snapshotAdapter.ts");
const { createChatRuntime } = loadSource("src/features/chat/runtime/createChatRuntime.ts");

function view(overrides = {}) {
  return {
    schema_version: 2,
    contract_version: 2,
    production_ready: true,
    session_id: "session-1",
    messages: {
      schema_version: 2,
      contract_version: 2,
      session_id: "session-1",
      projection: "render",
      session_revision: "4",
      message_revision: "3",
      messages: [{ id: "message-1", content: "saved", content_version: "3" }],
      page: { direction: "before", next_cursor: "opaque.signed.cursor", has_more: true },
    },
    execution: { id: "execution-1", phase: "running", owner_epoch: "7" },
    revisions: {
      session: "4",
      message: "3",
      artifact: "2",
      execution: "1",
    },
    checkpoint: {
      execution_id: "execution-1",
      generation_id: "generation-1",
      content_version: "3",
      covers_through_event_id: "42-0",
    },
    snapshot_at: "2026-09-13T03:00:00+09:00",
    server_high_watermark: "43-0",
    ...overrides,
  };
}

test("WP04 adapter preserves opaque cursor and maps atomic checkpoint", () => {
  const adapted = adaptChatSessionView(view());
  assert.equal(adapted.ok, true);
  assert.equal(adapted.view.nextCursor, "opaque.signed.cursor");
  assert.equal(adapted.view.snapshot.coversThroughEventId, "42-0");
  assert.equal(adapted.view.snapshot.serverHighWatermark, "43-0");
  assert.equal(adapted.view.snapshot.generationId, "generation-1");
  assert.equal(adapted.view.snapshot.messageRevision, "3");
  assert.equal(adapted.view.snapshot.executionPhase, "running");
  assert.equal(adapted.view.snapshot.executionOwnerEpoch, "7");
  assert.equal(adapted.view.revisions.messageRevision, "3");
});

test("WP04 adapter fails closed on cross-execution checkpoint", () => {
  const adapted = adaptChatSessionView(view({
    checkpoint: {
      execution_id: "execution-stale",
      generation_id: "generation-1",
      content_version: 3,
      covers_event_id: "42-0",
    },
  }));
  assert.equal(adapted.ok, false);
  assert.equal(adapted.reason, "session-view-execution-mismatch");
});

test("runtime refuses a valid but not activated WP04 contract", () => {
  const runtime = createChatRuntime();
  runtime.openSession("session-1");
  const guard = runtime.captureSnapshotGuard();
  assert.equal(runtime.applySessionView(view({ production_ready: false }), guard), false);
  assert.equal(runtime.snapshot.messages.size, 0);
});

test("runtime applies an activated WP04 snapshot with the existing stale guard", () => {
  const runtime = createChatRuntime();
  runtime.openSession("session-1");
  const guard = runtime.captureSnapshotGuard();
  assert.equal(runtime.applySessionView(view(), guard), true);
  assert.equal(runtime.snapshot.messages.get("message-1").content, "saved");
  assert.equal(runtime.snapshot.cursors.lastAppliedEventId, "42-0");
  assert.equal(runtime.snapshot.view.messageRevision, "3");
  assert.equal(runtime.snapshot.execution.phase, "running");
  assert.equal(runtime.snapshot.execution.ownerEpoch, "7");
  assert.equal(runtime.applySessionView(view(), guard), false);
});

test("WP04 adapter rejects malformed revisions and cursor types", () => {
  assert.equal(adaptChatSessionView(view({ revisions: { session: -1 } })).ok, false);
  assert.equal(adaptChatSessionView(view({
    messages: { ...view().messages, page: { direction: "before", next_cursor: {}, has_more: true } },
  })).ok, false);
});

test("WP04 adapter rejects nested page scope and revision mismatches", () => {
  assert.equal(adaptChatSessionView(view({
    messages: { ...view().messages, session_id: "session-other" },
  })).ok, false);
  assert.equal(adaptChatSessionView(view({
    messages: { ...view().messages, message_revision: "2" },
  })).ok, false);
});

test("WP04 adapter rejects malformed execution fencing state", () => {
  assert.equal(adaptChatSessionView(view({
    execution: { id: "execution-1", phase: "completed", owner_epoch: "old" },
  })).ok, false);
});
