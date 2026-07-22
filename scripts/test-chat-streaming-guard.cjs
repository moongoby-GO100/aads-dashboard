const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = mkdtempSync(path.join(tmpdir(), "aads-chat-stream-guard-"));
execFileSync(
  process.env.TSC_BIN || path.join(root, "node_modules", ".bin", "tsc"),
  [
    path.join(root, "src/lib/chatStreamingGuard.ts"),
    "--target", "ES2020",
    "--module", "commonjs",
    "--outDir", outDir,
    "--skipLibCheck",
  ],
  { stdio: "inherit" },
);

const { shouldIgnoreStreamingStatus } = require(path.join(outDir, "chatStreamingGuard.js"));
const pending = { requestId: 2, sessionId: "session-a", previousExecutionId: "exec-old" };
const check = (status, pendingRequest = pending, expectedExecutionId = null) =>
  shouldIgnoreStreamingStatus({
    sessionId: "session-a",
    status,
    pendingRequest,
    expectedExecutionId,
  });

assert.equal(check({ is_streaming: false, just_completed: true, execution_id: "exec-old" }), true);
assert.equal(check({ is_streaming: false, just_completed: false, execution_id: null }), true);
assert.equal(check({ is_streaming: true, execution_id: null }), true);
assert.equal(check({ is_streaming: true, execution_id: "exec-old" }), true);
assert.equal(check({ is_streaming: true, execution_id: "exec-new" }), false);
assert.equal(check({ is_streaming: true, execution_id: "exec-other" }, null, "exec-new"), true);
assert.equal(check({ is_streaming: false, just_completed: true, execution_id: "exec-new" }, null, "exec-new"), false);
assert.equal(check({ is_streaming: false, just_completed: false, execution_id: null }, null, "exec-new"), false);

console.log("chat streaming generation guard: 8 assertions passed");
