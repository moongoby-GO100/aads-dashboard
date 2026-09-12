import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./source-loader.mjs";

const draftModule = loadSource("src/features/chat/composer/draftStore.ts");
const keyboardModule = loadSource("src/features/chat/composer/keyboardPolicy.ts");
const uploadModule = loadSource("src/features/chat/composer/uploadQueue.ts");
const artifactModule = loadSource("src/features/chat/queries/artifactRequestPolicy.ts");
const provenanceModule = loadSource("src/features/chat/domain/modelProvenance.ts");

function memoryStorage({ failWrites = false } = {}) {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (failWrites) throw new Error("quota");
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
    values,
  };
}

const scope = {
  tenantId: "tenant-a",
  userId: "user-a",
  sessionId: "session-a",
  branchId: "branch-a",
  tabId: "tab-a",
};
const draft = {
  version: 1,
  text: "작성 중인 지시",
  selection: { start: 2, end: 4, direction: "forward" },
  requestedModelId: "model-a",
  responseMode: "quality",
  uploadedFileIds: ["file-1"],
  updatedAt: "2026-09-13T00:00:00Z",
};

test("T16/T27: drafts are fully scoped, degrade to memory and purge at tenant/logout boundaries", () => {
  const storage = memoryStorage();
  const store = draftModule.createDraftStore({ storage });
  assert.equal(store.save(scope, { ...draft, credential: "must-not-persist" }), "session");
  assert.equal(store.load(scope).text, draft.text);
  assert.equal(storage.getItem(draftModule.draftStorageKey(scope)).includes("must-not-persist"), false);
  assert.equal(store.load({ ...scope, tabId: "tab-b" }), null);
  store.save({ ...scope, tenantId: "tenant-b" }, { ...draft, text: "B" });
  store.purgeTenant("tenant-a");
  assert.equal(store.load(scope), null);
  assert.equal(store.load({ ...scope, tenantId: "tenant-b" }).text, "B");
  store.purgeAll();
  assert.equal(store.load({ ...scope, tenantId: "tenant-b" }), null);

  const reasons = [];
  const fallback = draftModule.createDraftStore({
    storage: memoryStorage({ failWrites: true }),
    onDegraded: (reason) => reasons.push(reason),
  });
  assert.equal(fallback.save(scope, draft), "memory");
  assert.equal(fallback.mode(), "memory");
  assert.equal(fallback.load(scope).text, draft.text);
  assert.deepEqual(reasons, ["write-failed"]);
});

test("T17: the single keyboard policy gives IME and menu selection precedence over submit", () => {
  const base = {
    key: "Enter", shiftKey: false, isComposing: false, nativeIsComposing: false,
    keyCode: 13, activeMenu: null, hasActiveOption: false, repeat: false, submitPending: false,
  };
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, nativeIsComposing: true }).reason, "ime-composition");
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, keyCode: 229 }).action, "ignore");
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, activeMenu: "slash", hasActiveOption: true }).action, "select-slash");
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, activeMenu: "mention", hasActiveOption: true }).action, "select-mention");
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, shiftKey: true }).action, "newline");
  assert.equal(keyboardModule.decideComposerKeyAction({ ...base, submitPending: true }).reason, "duplicate-submit-guard");
  assert.equal(keyboardModule.decideComposerKeyAction(base).action, "submit");
});

test("T18: uploads reject late scope/generation callbacks and clean resources exactly once", () => {
  const item = {
    id: "upload-1", scopeKey: "tenant-a:user-a:session-a", generation: 2, attemptId: "attempt-2",
    displayName: "photo.png", mimeType: "image/png", byteSize: 12, status: "uploading",
    progress: 10, serverFileId: null, errorCode: null,
  };
  const wrongScope = uploadModule.reduceUploadQueue([item], {
    id: item.id, scopeKey: "tenant-b:user-a:session-a", generation: 2, attemptId: "attempt-2",
    type: "complete", serverFileId: "foreign",
  }, item.scopeKey);
  assert.equal(wrongScope.applied, false);
  assert.equal(wrongScope.ignoredReason, "scope");
  const stale = uploadModule.reduceUploadQueue([item], {
    id: item.id, scopeKey: item.scopeKey, generation: 1, attemptId: "attempt-1", type: "complete", serverFileId: "late",
  }, item.scopeKey);
  assert.equal(stale.ignoredReason, "generation");

  const calls = [];
  const cleanup = uploadModule.createUploadResourceCleanup({
    abort: () => calls.push("abort"),
    tracks: [{ stop: () => calls.push("track") }],
    objectUrls: ["blob:one"],
    revokeObjectUrl: (url) => calls.push(url),
  });
  assert.equal(cleanup.cleanup().complete, true);
  assert.equal(cleanup.cleanup().performed, false);
  assert.deepEqual(calls, ["abort", "track", "blob:one"]);

  const failureCalls = [];
  const failureCleanup = uploadModule.createUploadResourceCleanup({
    abort: () => { throw new Error("abort failed"); },
    tracks: [{ stop: () => failureCalls.push("track-still-stopped") }],
    objectUrls: ["blob:still-revoked"],
    revokeObjectUrl: (url) => failureCalls.push(url),
  });
  const failureResult = failureCleanup.cleanup();
  assert.equal(failureResult.complete, false);
  assert.deepEqual(Array.from(failureResult.failedSteps), ["abort"]);
  assert.deepEqual(failureCalls, ["track-still-stopped", "blob:still-revoked"]);
});

test("T24: hidden artifact panels are lazy and stale request tokens fail closed", () => {
  const hidden = artifactModule.planArtifactFetch({
    panelOpen: false, directArtifactId: null, listCached: false, detailCached: false,
  });
  assert.equal(hidden.fetchList, false);
  assert.equal(hidden.fetchArtifactId, null);
  const direct = artifactModule.planArtifactFetch({
    panelOpen: false, directArtifactId: "artifact-1", listCached: false, detailCached: false,
  });
  assert.equal(direct.fetchArtifactId, "artifact-1");

  const guard = artifactModule.createArtifactRequestGuard();
  const scopeA = { tenantId: "a", userId: "u", sessionId: "s1" };
  const scopeB = { tenantId: "a", userId: "u", sessionId: "s2" };
  const requestA = guard.begin(scopeA, "artifact-a");
  const requestB = guard.begin(scopeB, "artifact-b");
  assert.equal(guard.accepts(requestA, scopeA, "artifact-a"), false);
  assert.equal(guard.accepts(requestB, scopeB, "artifact-b"), true);
  guard.invalidate();
  assert.equal(guard.accepts(requestB, scopeB, "artifact-b"), false);
});

test("T23: requested selection is immutable and actual fallback usage remains ledger-scoped", () => {
  const requested = provenanceModule.captureRequestedModelSelection({
    commandId: "command-1", requestedModelId: "claude", requestedAccountId: "account-a",
    requestedRoleId: "cto", selectionVersion: 3, capturedAt: "2026-09-13T00:00:00Z",
  });
  let provenance = provenanceModule.createModelProvenance(requested);
  provenance = provenanceModule.appendActualModelAttempt(provenance, {
    commandId: "command-1", executionId: "execution-1", attemptId: "attempt-1", attemptNumber: 1,
    actualModelId: "gemini", actualAccountId: null, fallbackReason: "quota",
    inputTokens: 10, outputTokens: 20, costUsd: "0.0042",
  });
  assert.equal(provenance.requested.requestedModelId, "claude");
  assert.equal(provenance.actual.actualModelId, "gemini");
  assert.equal(provenance.fallbackApplied, true);
  assert.throws(() => provenanceModule.appendActualModelAttempt(provenance, {
    ...provenance.actual, commandId: "command-2", attemptId: "attempt-2", attemptNumber: 2,
  }), /scope mismatch/);
});
