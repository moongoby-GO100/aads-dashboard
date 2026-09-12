import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadSource, root, source } from "./source-loader.mjs";
import { verifyChangeImpact } from "../../docs/chat-modernization-20260912/verify-change-impact.mjs";

const { createChatTelemetryRecord, metricSeriesKey } = loadSource(
  "src/features/chat/observability/chatTelemetry.ts",
);
const manifest = JSON.parse(source("docs/chat-modernization-20260912/change-impact.json"));
const template = source(".github/pull_request_template.md");

test("T37 telemetry excludes secrets and high-cardinality identifiers from metric labels", () => {
  const valid = createChatTelemetryRecord({
    name: "chat.event_apply",
    labels: { event_type: "message_delta", outcome: "applied" },
    measurements: { sequence: 42 },
    correlation: { releaseId: "2883fab", reportId: "report-01JABC" },
    observedAtMs: 1_789_234_567_000,
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(Object.keys(valid.record.labels).sort(), ["event_type", "outcome"]);
  assert.equal(metricSeriesKey(valid.record), "chat.event_apply|event_type=message_delta,outcome=applied");
  assert.equal(JSON.stringify(valid.record.labels).includes("report-01JABC"), false);
  assert.equal(JSON.stringify(valid.record.labels).includes("2883fab"), false);

  for (const unsafe of [
    { content: "secret-sentinel" },
    { labels: { event_type: "message_delta", session_id: "session-1" } },
    { labels: { event_type: "token=secret-sentinel", outcome: "applied" } },
    { correlation: { releaseId: "2883fab", reportId: "Bearer secret-sentinel" } },
    { correlation: { releaseId: "2883fab", reportId: "report-01JABC", sessionId: "session-1" } },
    { measurements: { sequence: 1, token_count_raw: 2 } },
  ]) {
    const result = createChatTelemetryRecord({
      name: "chat.event_apply",
      labels: { event_type: "message_delta", outcome: "applied" },
      measurements: { sequence: 42 },
      correlation: { releaseId: "2883fab", reportId: "report-01JABC" },
      ...unsafe,
    });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("secret-sentinel"), false);
  }
});

test("T37 telemetry has finite event/label vocabularies and bounded numeric values", () => {
  const result = createChatTelemetryRecord({
    name: "chat.query",
    labels: { projection: "render", outcome: "fetched", skip_reason: "none" },
    measurements: { rows: Number.MAX_SAFE_INTEGER, bytes: 2048, latency_ms: 80 },
    correlation: { releaseId: "release:2883fab", reportId: "report-01JDEF" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.measurements.rows, 1_000_000_000);
  assert.equal(createChatTelemetryRecord({
    name: "chat.query",
    labels: { projection: "session-123", outcome: "fetched" },
    correlation: { releaseId: "2883fab", reportId: "report-01JDEF" },
  }).ok, false);
});

test("T38 CI keeps type, lint, regression, security, baseline and documentation gates mandatory", () => {
  const pkg = JSON.parse(source("package.json"));
  for (const command of ["typecheck", "lint:chat", "selftest", "test:chat", "test:chat:security", "test:chat:baseline", "test:chat:docs", "test:chat:change-impact"]) {
    assert.match(pkg.scripts["test:chat:ci"], new RegExp(`npm run ${command.replaceAll(":", "\\:")}`));
  }
  const workflow = source(".github/workflows/chat-regression.yml");
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /CHAT_CHANGE_BASE:/);
  assert.match(workflow, /npm run test:chat:ci/);
});

test("T41 checker rejects missing impact updates and incomplete hotfix lifecycle", () => {
  const missingImpact = verifyChangeImpact({
    manifest,
    template,
    changedFiles: ["src/features/chat/runtime/createChatRuntime.ts"],
    root,
  });
  assert.ok(missingImpact.some((error) => error.includes("requires docs/chat-modernization-20260912/change-impact.json update")));

  const incompleteHotfix = structuredClone(manifest);
  incompleteHotfix.entries[0].temporary_hotfix = { enabled: true, owner: "", expires_on: "soon" };
  const errors = verifyChangeImpact({ manifest: incompleteHotfix, template, root });
  assert.ok(errors.some((error) => error.includes("temporary_hotfix.owner")));
  assert.ok(errors.some((error) => error.includes("temporary_hotfix.expires_on")));
  assert.ok(errors.some((error) => error.includes("temporary_hotfix.removal_condition")));
});

test("T41 repository manifest, documentation and PR template are drift-free", () => {
  assert.deepEqual(verifyChangeImpact({ manifest, template, root }), []);
  for (const entry of manifest.entries) {
    for (const file of [...entry.affected_paths, ...entry.documentation]) {
      assert.equal(fs.existsSync(path.join(root, file)), true, file);
    }
  }
});
