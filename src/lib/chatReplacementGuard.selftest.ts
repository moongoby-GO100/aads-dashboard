import { allowReplyReplacement, shouldQueueAdditionalInstruction } from "./chatReplacementGuard";

async function main() {
  const run = async (options: { local?: boolean; active?: boolean[]; accept?: boolean; fail?: boolean; switched?: boolean }) => {
    const calls: string[] = [];
    const active = [...(options.active || [true, false])];
    const allowed = await allowReplyReplacement({
      isCurrentSession: () => !options.switched,
      isLocallyActive: () => Boolean(options.local),
      readActive: async () => {
        calls.push("read");
        if (options.fail) throw new Error("offline");
        return active.shift() || false;
      },
      confirm: () => { calls.push("confirm"); return options.accept !== false; },
      stop: async () => { calls.push("stop"); },
    }).catch(() => false);
    return { allowed, calls: calls.join(",") };
  };
  const cases = [
    [await run({ accept: false }), { allowed: false, calls: "read,confirm" }],
    [await run({}), { allowed: true, calls: "read,confirm,stop,read" }],
    [await run({ active: [true, true] }), { allowed: false, calls: "read,confirm,stop,read" }],
    [await run({ active: [false] }), { allowed: true, calls: "read" }],
    [await run({ local: true, active: [false, false] }), { allowed: true, calls: "read,confirm,stop,read" }],
    [await run({ fail: true }), { allowed: false, calls: "read" }],
    [await run({ switched: true }), { allowed: false, calls: "read" }],
  ];
  for (const [actual, expected] of cases) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
  }
  if (!shouldQueueAdditionalInstruction(true, false)) throw new Error("new supplied text must queue");
  if (shouldQueueAdditionalInstruction(true, true)) throw new Error("idempotent retry must not queue");
  if (shouldQueueAdditionalInstruction(false, false)) throw new Error("idle send must start normally");
  console.log("PASS: 10 reply replacement / additional instruction cases");
}
void main();
