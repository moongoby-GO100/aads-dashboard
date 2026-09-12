import { captureChatRuntimeFeatures, deriveChatCapabilities } from "../domain/capabilities";
import { initialExecutionState, reduceExecutionState } from "../domain/executionReducer";
import { mergeMessageProjection } from "../domain/messageReducer";
import type { ChatStreamEntry, RuntimeMessageProjection } from "../domain/runtimeTypes";
import { FetchSseParser } from "../transport/sseParser";
import { createChatRuntime } from "./createChatRuntime";
import { SingleFlightStatusScheduler, type StatusTaskContext } from "./statusScheduler";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function equal<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

const encoder = new TextEncoder();
const frame = (id: string, data: string) => encoder.encode(`id:${id}\r\ndata:${data}\r\n\r\n`);

// T06: WHATWG CRLF, multi-data, data without a space, comments and split UTF-8.
{
  const parser = new FetchSseParser();
  const wire = encoder.encode(
    ":heartbeat\r\nid:evt-1\r\ndata: {\"type\":\"delta\",\r\ndata:\"content\":\"한글🙂\"}\r\nretry: 2500\r\n\r\n",
  );
  const frames = [];
  for (const byte of wire) frames.push(...parser.push(Uint8Array.of(byte)));
  frames.push(...parser.finish());
  equal(frames.length, 1, "split UTF-8 yields one frame");
  equal(frames[0].id, "evt-1", "CRLF id");
  equal(frames[0].retry, 2500, "retry field");
  equal(JSON.parse(frames[0].data).content, "한글🙂", "multi-data/no-space payload");
}

// T05/T06: every stream entry uses the same parser+dispatcher result.
for (const source of ["direct", "replay", "resume", "regenerate"] as ChatStreamEntry[]) {
  const runtime = createChatRuntime();
  runtime.openSession("session-a");
  runtime.setTransport("connecting", source);
  const stream = runtime.createEventStream(source);
  const results = stream.push(frame("evt-1", '{"type":"delta","content":"안녕"}'));
  equal(results[0]?.status, "applied", `${source} applies through common dispatcher`);
  equal(runtime.snapshot.cursors.lastAppliedEventId, "evt-1", `${source} applied cursor`);
  equal(runtime.snapshot.execution.phase, "running", `${source} execution running`);
  runtime.setTransport("reconnecting", source);
  equal(runtime.snapshot.execution.phase, "running", `${source} EOF does not terminate execution`);
  equal(runtime.snapshot.transport.state, "reconnecting", `${source} transport separated`);
}

// T06/T07: invalid JSON does not advance the applied cursor; watermark is advisory.
{
  const runtime = createChatRuntime();
  runtime.openSession("session-a");
  const stream = runtime.createEventStream("replay");
  equal(stream.push(frame("bad-9", "{not-json"))[0]?.status, "invalid", "invalid JSON rejected");
  equal(runtime.snapshot.cursors.lastAppliedEventId, "", "invalid JSON cursor non-advance");
  runtime.observeServerHighWatermark("server-20");
  equal(runtime.snapshot.cursors.serverHighWatermark, "server-20", "server watermark recorded");
  equal(runtime.snapshot.cursors.lastAppliedEventId, "", "watermark does not move applied cursor");
  const snapshotGuard = runtime.captureSnapshotGuard();
  assert(runtime.applySnapshot({
    session_id: "session-a",
    session_revision: "7",
    execution_id: "execution-a",
    generation_id: "generation-a",
    covers_through_event_id: "snapshot-7",
    server_high_watermark: "server-20",
    messages: [{ id: "message-a", content: "full", content_version: "1", content_completeness: "full" }],
  }, snapshotGuard), "valid atomic snapshot applies");
  equal(runtime.snapshot.cursors.lastAppliedEventId, "snapshot-7", "snapshot coverage becomes applied cursor");
  equal(runtime.snapshot.cursors.snapshotCoversThroughEventId, "snapshot-7", "snapshot coverage remains separate");
  equal(runtime.snapshot.cursors.serverHighWatermark, "server-20", "snapshot high watermark remains separate");

  const staleSnapshotGuard = runtime.captureSnapshotGuard();
  stream.push(frame("event-after-snapshot", '{"type":"heartbeat"}'));
  assert(!runtime.applySnapshot({
    session_id: "session-a",
    session_revision: "7",
    execution_id: "execution-a",
    generation_id: "generation-a",
    covers_through_event_id: "stale-coverage",
    server_high_watermark: "server-21",
    messages: [{ id: "message-a", content: "stale" }],
  }, staleSnapshotGuard), "snapshot racing a replay event is rejected");
  equal(runtime.snapshot.cursors.lastAppliedEventId, "event-after-snapshot", "stale snapshot cannot rewind cursor");
}

// T08: render identity survives promotion, preview cannot shrink full, real edit may.
{
  const full = mergeMessageProjection<RuntimeMessageProjection>(undefined, {
    id: "optimistic-a",
    render_id: "bubble-a",
    content: "complete response",
    content_version: "7",
    content_completeness: "full",
  });
  const downgraded = mergeMessageProjection(full, {
    id: "server-a",
    content: "complete…",
    content_version: "7",
    content_completeness: "minimal",
    is_truncated: true,
  });
  equal(downgraded.content, "complete response", "minimal response cannot shrink full content");
  equal(downgraded.render_key, "bubble-a", "server promotion keeps render identity");
  const edited = mergeMessageProjection(downgraded, {
    id: "server-a",
    content: "short",
    content_version: "8",
    content_completeness: "full",
  });
  equal(edited.content, "short", "higher version accepts shorter edit");
  equal(edited.render_key, "bubble-a", "edit keeps render identity");
}

// T21: stopping is not terminal, and a terminal execution rejects old callbacks.
{
  const running = reduceExecutionState(initialExecutionState(), { executionId: "execution-a", ownerEpoch: "4", phase: "running" });
  const stopping = reduceExecutionState(running, { phase: "stopping", ownerEpoch: "4" });
  equal(stopping.phase, "stopping", "stop request is distinct from terminal state");
  const completed = reduceExecutionState(stopping, { phase: "completed", ownerEpoch: "5", finalMessageReady: true });
  equal(completed.phase, "completed", "new owner may complete");
  equal(reduceExecutionState(completed, { phase: "running", ownerEpoch: "4" }).phase, "completed", "old owner cannot reopen terminal");
  equal(reduceExecutionState(completed, { phase: "failed", ownerEpoch: "6" }).phase, "completed", "terminal phase is immutable");
}

async function schedulerCases() {
  // T09: a slow task cannot overlap its next tick; a stale resolved response is ignored.
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const schedule = (callback: () => void) => { const id = nextTimer++; timers.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; };
  const cancel = (handle: ReturnType<typeof setTimeout>) => { timers.delete(handle as unknown as number); };
  const flushTimer = () => {
    const entry = timers.entries().next().value as [number, () => void] | undefined;
    assert(entry, "scheduled status tick missing");
    timers.delete(entry[0]);
    entry[1]();
  };
  let resolveSlow = () => {};
  const slow = new Promise<void>((resolve) => { resolveSlow = resolve; });
  let calls = 0;
  const applied: string[] = [];
  const scheduler = new SingleFlightStatusScheduler({ initialDelayMs: 0, delayMs: 10, schedule, cancel });
  scheduler.start("session-a", async (context) => {
    calls += 1;
    await slow;
    if (context.isCurrent() && context.acceptRevision("1")) applied.push("A");
  });
  flushTimer();
  await Promise.resolve();
  equal(calls, 1, "first status request starts");
  equal(timers.size, 0, "slow response schedules no overlapping tick");

  scheduler.start("session-b", async (context) => {
    calls += 1;
    if (context.isCurrent() && context.acceptRevision("2")) applied.push("B");
  });
  flushTimer();
  await Promise.resolve();
  await Promise.resolve();
  resolveSlow();
  await Promise.resolve();
  await Promise.resolve();
  equal(applied.join(","), "B", "aborted session response cannot apply after newer scope");
  scheduler.stop();

  const revisionScheduler = new SingleFlightStatusScheduler({ initialDelayMs: 0, delayMs: 10, schedule, cancel });
  const accepted: string[] = [];
  revisionScheduler.start("session-r", async (context: StatusTaskContext) => {
    if (context.acceptRevision("10")) accepted.push("10");
    if (context.acceptRevision("9")) accepted.push("9");
  });
  flushTimer();
  await Promise.resolve();
  equal(accepted.join(","), "10", "lower numeric revision is rejected");
  revisionScheduler.stop();
}

// T36: v1 fallback, v2 normalization, additive unknown and fixed session flags.
{
  const features = captureChatRuntimeFeatures({
    runtimeV2: true,
    protocolV2: true,
    advertised: ["chat.protocol.v2", "chat.command.stop"],
  });
  const runtime = createChatRuntime({ features });
  runtime.openSession("session-a", features);
  const changedFlags = captureChatRuntimeFeatures({ runtimeV2: false, protocolV2: false });
  runtime.openSession("session-a", changedFlags);
  equal(runtime.snapshot.features.protocolMode, "v2", "live session does not hot-swap adapter");

  const v1 = runtime.applyFrame({ data: '{"type":"heartbeat"}', event: "message", id: "v1-1", lastEventId: "v1-1", retry: null }, "direct");
  equal(v1.status, "applied", "v2 frontend accepts v1 event");
  const future = runtime.applyFrame({
    data: JSON.stringify({
      schema_version: 2,
      event_id: "v2-2",
      session_id: "session-a",
      execution_id: "execution-a",
      type: "presentation.hint",
      payload: { color: "blue" },
    }),
    event: "message",
    id: "v2-2",
    lastEventId: "v2-2",
    retry: null,
  }, "replay");
  equal(future.status, "applied", "unknown additive v2 event is non-destructive");
  assert(future.event?.unknownAdditive, "unknown event is observable");
  const criticalInvalid = runtime.applyFrame({
    data: JSON.stringify({ schema_version: 2, event_id: "v2-3", session_id: "session-a", type: "message.delta", payload: {} }),
    event: "message",
    id: "v2-3",
    lastEventId: "v2-3",
    retry: null,
  }, "resume");
  equal(criticalInvalid.status, "invalid", "critical schema mismatch rejected");
  equal(runtime.snapshot.cursors.lastAppliedEventId, "v2-2", "critical invalid event does not advance cursor");
  equal(deriveChatCapabilities(runtime.snapshot).protocolMode, "v2", "capability adapter exposes captured protocol");
}

void schedulerCases().then(() => {
  console.log("PASS: WP03 runtime/SSE/status/capability T05-T09, T21, T36 cases");
});
