import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const selector = readFileSync(
  new URL("../../src/components/chat/ModelSelector.tsx", import.meta.url),
  "utf8",
);

test("Opus 5.5 remains selectable when the model registry request fails", () => {
  assert.match(selector, /export const MODEL_OPTIONS:[\s\S]*?id: "claude-opus-5-5"/);
  assert.match(selector, /export const CHAT_MODEL_OPTIONS:[\s\S]*?id: "claude-opus-5-5"/);
  assert.match(selector, /registeredModels\.length > 0 \? registeredModels : CHAT_MODEL_OPTIONS/);
});

test("an open chat refreshes its model registry without remounting", () => {
  assert.match(selector, /addEventListener\("focus", refreshModels\)/);
  assert.match(selector, /addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(selector, /setInterval\(refreshWhenVisible, 60_000\)/);
});
