import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { messages, SEED, SIZES } from "./fixtures.mjs";
import { loadPageFunctions, source } from "./source-loader.mjs";

// C01/C11-C13/C29 / FR08/FR38 / INV03/INV09/INV15 / ADR03/ADR11 / T08/T38.
const { mergeServerMessagesPreservingLocal } = loadPageFunctions(["mergeServerMessagesPreservingLocal"]);
const fixtures = SIZES.map((count) => {
  const payload = JSON.stringify(messages(count));
  return {
    count,
    bytes: Buffer.byteLength(payload),
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
});
const merge = [40, 150].map((count) => {
  const input = messages(count);
  const samplesMs = [];
  let result = [];
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    result = mergeServerMessagesPreservingLocal(input, input);
    samplesMs.push(Number((performance.now() - started).toFixed(3)));
  }
  if (result.length !== count) throw new Error(`merge lost fixture rows: ${count} -> ${result.length}`);
  return { count, samplesMs, p95Ms: [...samplesMs].sort((a, b) => a - b).at(-1) };
});
console.log(JSON.stringify({
  schema: 1,
  seed: SEED,
  node: process.version,
  pageSha256: createHash("sha256").update(source("src/app/chat/page.tsx")).digest("hex"),
  fixtures,
  merge,
  unknown: [
    "browser layout and gesture/RAF races",
    "latency/INP/heap from the complete /chat route",
    "physical Korean IME and assistive technology",
    "DB/Redis concurrency and production provider behavior",
  ],
}, null, 2));
