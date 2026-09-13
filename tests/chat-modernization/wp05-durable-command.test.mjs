import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./source-loader.mjs";

const {
  runChatCommand,
  supportsDurableChatCommands,
} = loadSource("src/features/chat/commands/durableCommandClient.ts", { process });

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("legacy endpoint remains the fail-safe until chat.protocol.v2 is advertised", async () => {
  assert.equal(supportsDurableChatCommands([]), false);
  let legacyCalls = 0;
  const result = await runChatCommand({
    sessionId: "session-1",
    commandType: "stop",
    advertisedCapabilities: ["chat.command_lifecycle.v2"],
    legacyRequest: async () => {
      legacyCalls += 1;
      return { stopped: true };
    },
  }, {
    request: async () => assert.fail("durable endpoint must stay gated"),
  });
  assert.deepEqual(result, { stopped: true });
  assert.equal(legacyCalls, 1);
});

test("advertised v2 submits once and unwraps the authoritative result", async () => {
  const storage = memoryStorage();
  const calls = [];
  const result = await runChatCommand({
    sessionId: "session-2",
    commandType: "interrupt",
    payload: { content: "continue", attachments: [] },
    advertisedCapabilities: ["chat.protocol.v2"],
    legacyRequest: async () => assert.fail("legacy endpoint must not run"),
  }, {
    storage,
    createId: () => "fixed-id",
    request: async (path, init) => {
      calls.push({ path, init });
      return {
        command_id: "command-1",
        status: "succeeded",
        terminal: true,
        result: { queued: true },
      };
    },
  });
  assert.deepEqual(result, { queued: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/chat/sessions/session-2/commands");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "web-interrupt-fixed-id");
  assert.equal(storage.values.size, 0);
});

test("an in-flight replay is polled and keeps one persisted idempotency key", async () => {
  const storage = memoryStorage();
  const keys = [];
  let calls = 0;
  const result = await runChatCommand({
    sessionId: "session-3",
    commandType: "resume",
    payload: { model_override: null, reset_retry_count: false },
    advertisedCapabilities: ["chat.protocol.v2"],
    legacyRequest: async () => assert.fail("legacy endpoint must not run"),
  }, {
    storage,
    createId: () => "resume-id",
    sleep: async () => {},
    request: async (_path, init) => {
      calls += 1;
      if (init?.headers) keys.push(init.headers["Idempotency-Key"]);
      if (calls === 1) {
        return { command_id: "command-2", status: "running", terminal: false };
      }
      return {
        command_id: "command-2",
        status: "succeeded",
        terminal: true,
        result: { resumed: true },
      };
    },
  });
  assert.deepEqual(result, { resumed: true });
  assert.deepEqual(keys, ["web-resume-resume-id"]);
  assert.equal(calls, 2);
  assert.equal(storage.values.size, 0);
});

test("network uncertainty preserves the idempotency key for the next retry", async () => {
  const storage = memoryStorage();
  const options = {
    sessionId: "session-4",
    commandType: "stop",
    advertisedCapabilities: ["chat.protocol.v2"],
    legacyRequest: async () => assert.fail("legacy endpoint must not run"),
  };
  const seenKeys = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => runChatCommand(options, {
      storage,
      createId: () => `id-${attempt}`,
      request: async (_path, init) => {
        seenKeys.push(init.headers["Idempotency-Key"]);
        throw new Error("connection lost");
      },
    }), /connection lost/);
  }
  assert.equal(storage.values.size, 1);
  assert.deepEqual(seenKeys, ["web-stop-id-0", "web-stop-id-0"]);
});
