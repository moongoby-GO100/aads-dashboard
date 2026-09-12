import { rollbackOptimisticInterruptReceipt } from "./chatInterruptReceipt";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const result = rollbackOptimisticInterruptReceipt(
  ["실패 지시", "독립 지시", "실패 지시"],
  "실패 지시",
  [{ id: "keep" }, { id: "interrupt-failed" }, { id: "keep-2" }],
  "interrupt-failed",
);

assert(
  JSON.stringify(result.queue) === JSON.stringify(["독립 지시", "실패 지시"]),
  "only the failed receipt must leave the optimistic queue",
);
assert(
  JSON.stringify(result.messages.map((message) => message.id)) === JSON.stringify(["keep", "keep-2"]),
  "only the failed optimistic bubble must be removed",
);

console.log("PASS: interrupt receipt rollback is command-scoped");
