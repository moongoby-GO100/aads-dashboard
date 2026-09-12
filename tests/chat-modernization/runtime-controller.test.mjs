import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

// C07-C11 / FR05-FR09/FR21/FR36 / INV03-INV09/INV15 / ADR03/ADR06/ADR07 / T05-T09/T21/T36.
test("WP03 runtime state-sequence selftest executes", async () => {
  loadSource("src/features/chat/runtime/chatRuntime.selftest.ts");
  await new Promise((resolve) => setImmediate(resolve));
});

test("all live chat readers use the common parser and status polling is completion-scheduled", () => {
  const route = source("src/app/chat/page.tsx");
  for (const entry of ["direct", "replay", "resume", "regenerate"]) {
    assert.match(route, new RegExp(`createEventStream\\(\"${entry}\"\\)`));
  }
  assert.equal(route.includes("new TextDecoder"), false);
  assert.equal(route.includes("setInterval(async"), false);
  assert.match(route, /new SingleFlightStatusScheduler/);
  assert.doesNotMatch(route, /lastEventIdRef/);
});
