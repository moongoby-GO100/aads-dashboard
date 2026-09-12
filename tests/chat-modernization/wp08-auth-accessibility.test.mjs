import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./source-loader.mjs";

const auth = loadSource("src/features/chat/auth/chatAuthPolicy.ts");
const accessibility = loadSource("src/features/chat/accessibility/chatAccessibilityPolicy.ts");

test("T27 login return preserves path, search and hash but rejects redirect injection", () => {
  assert.equal(auth.sanitizeChatReturnTarget(
    "/chat?panel=docs#session-123", "https://aads.newtalk.kr",
  ), "/chat?panel=docs#session-123");
  assert.equal(auth.sanitizeChatReturnTarget(
    "https://aads.newtalk.kr/chat?panel=docs#session-123", "https://aads.newtalk.kr",
  ), "/chat?panel=docs#session-123");
  for (const attack of [
    "https://evil.example/chat", "//evil.example/chat", "javascript:alert(1)",
    "\\\\evil.example\\chat", "/login?next=https://evil.example", " /chat#session-123",
  ]) assert.equal(auth.sanitizeChatReturnTarget(attack, "https://aads.newtalk.kr"), null, attack);
  assert.equal(auth.buildChatLoginRedirect({
    applicationOrigin: "https://aads.newtalk.kr",
    pathname: "/chat",
    search: "?panel=docs",
    hash: "#session-123",
  }), "/login?next=%2Fchat%3Fpanel%3Ddocs%23session-123&reason=session_expired");
});

test("T27 logout and tenant changes plan atomic cleanup without deleting the new principal", () => {
  const resources = [
    { key: "old-runtime", kind: "runtime", tenantId: "tenant-a", userId: "user-a" },
    { key: "old-draft", kind: "draft", tenantId: "tenant-a", userId: "user-a" },
    { key: "new-cache", kind: "query_cache", tenantId: "tenant-b", userId: "user-a" },
  ];
  const changed = auth.planChatPrivateCleanup(
    { tenantId: "tenant-a", userId: "user-a" },
    { tenantId: "tenant-b", userId: "user-a" },
    resources,
  );
  assert.equal(changed.reason, "principal_changed");
  assert.deepEqual([...changed.purgeKeys], ["old-draft", "old-runtime"]);
  assert.equal(changed.effects.includes("abort_transports"), true);
  assert.equal(changed.effects.includes("clear_drafts"), true);
  const logout = auth.planChatPrivateCleanup(
    { tenantId: "tenant-b", userId: "user-a" }, null, resources,
  );
  assert.equal(logout.reason, "logout");
  assert.deepEqual([...logout.purgeKeys], ["new-cache", "old-draft", "old-runtime"]);
  const coldLogin = auth.planChatPrivateCleanup(
    null, { tenantId: "tenant-b", userId: "user-a" }, resources,
  );
  assert.deepEqual([...coldLogin.purgeKeys], ["old-draft", "old-runtime"]);
  assert.match(auth.createChatPrivateStorageKey(
    { tenantId: "tenant:a", userId: "user/a" }, "draft", "session#1",
  ), /^aads-chat:/);
});

test("T28 server capability mapping is scope-bound and fail-closed", () => {
  const expected = { tenantId: "tenant-a", userId: "user-a" };
  const viewer = auth.mapServerChatCapabilities({
    schema_version: 1,
    tenant_id: "tenant-a",
    user_id: "user-a",
    role: "viewer",
    capabilities: ["chat.read", "chat.send", "chat.artifact.read", "future.additive"],
  }, expected);
  assert.equal(viewer.valid, true);
  assert.equal(viewer.canRead, true);
  assert.equal(viewer.canSend, false);
  assert.equal(viewer.canReadArtifacts, true);
  const wrongTenant = auth.mapServerChatCapabilities({
    schema_version: 1,
    tenant_id: "tenant-b",
    user_id: "user-a",
    role: "admin",
    capabilities: ["chat.read", "chat.admin.repair"],
  }, expected);
  assert.equal(wrongTenant.valid, false);
  assert.equal(wrongTenant.canRead, false);
  assert.equal(wrongTenant.canRepair, false);
  assert.equal(auth.mapServerChatCapabilities({ role: "admin" }, expected).canRepair, false);
});

test("T27/T28 cookie mutations require exact origin and CSRF while bearer mode cannot mix cookies", () => {
  const base = {
    applicationOrigin: "https://aads.newtalk.kr",
    requestOrigin: "https://aads.newtalk.kr",
    authMode: "same-origin-cookie",
    credentials: "include",
  };
  assert.equal(auth.evaluateChatRequestPolicy({ ...base, method: "GET" }).allowed, true);
  assert.equal(auth.evaluateChatRequestPolicy({
    ...base, method: "POST", csrfHeaderToken: "csrf-fixture", csrfExpectedToken: "csrf-fixture",
  }).allowed, true);
  assert.equal(auth.evaluateChatRequestPolicy({ ...base, method: "POST" }).allowed, false);
  assert.equal(auth.evaluateChatRequestPolicy({
    ...base,
    method: "POST",
    requestOrigin: "https://evil.example",
    csrfHeaderToken: "csrf-fixture",
    csrfExpectedToken: "csrf-fixture",
  }).allowed, false);
  assert.equal(auth.evaluateChatRequestPolicy({
    ...base, method: "POST", hasBearerAuthorization: true,
  }).reason, "mixed_auth_mode");
  assert.equal(auth.evaluateChatRequestPolicy({
    method: "POST",
    applicationOrigin: "https://aads.newtalk.kr",
    requestOrigin: null,
    authMode: "legacy-bearer",
    credentials: "omit",
    hasBearerAuthorization: true,
  }).allowed, true);
});

test("T31 focus and live announcements preserve user control and suppress token flood", () => {
  assert.equal(accessibility.planChatFocus({
    cause: "message_update", currentFocusConnected: true,
  }).action, "preserve");
  assert.equal(accessibility.planChatFocus({
    cause: "dialog_close", currentFocusConnected: false,
    triggerId: "open-artifact", triggerConnected: true,
  }).targetId, "open-artifact");
  assert.equal(accessibility.planChatFocus({
    cause: "virtual_row_unmount", currentFocusConnected: false, focusedRowId: "message-42",
  }).action, "pin_virtual_row");
  assert.equal(accessibility.planChatAnnouncement({
    previousPhase: "running", nextPhase: "running",
    completionToken: "completion-1", lastAnnouncedToken: null,
  }).announce, false);
  const completion = accessibility.planChatAnnouncement({
    previousPhase: "finalizing", nextPhase: "completed",
    completionToken: "completion-1", lastAnnouncedToken: null,
  });
  assert.equal(completion.announce, true);
  assert.equal(completion.politeness, "polite");
  assert.equal(accessibility.planChatAnnouncement({
    previousPhase: "running", nextPhase: "completed",
    completionToken: "completion-1", lastAnnouncedToken: "completion-1",
  }).announce, false);
});

test("T31/T32 virtual rows expose position and reduced-motion/mobile policies are deterministic", () => {
  const row = accessibility.virtualRowAccessibility({ labelId: "message-42-label", index: 41, total: 5000 });
  assert.equal(row.role, "article");
  assert.equal(row.positionInSet, 42);
  assert.equal(row.setSize, 5000);
  assert.equal(accessibility.chatMotionPolicy(true).viewportBehavior, "auto");
  assert.equal(accessibility.chatMotionPolicy(true).animateDecorations, false);
  assert.equal(accessibility.mobileTargetPolicy(44, 44).compliant, true);
  assert.equal(accessibility.mobileTargetPolicy(43, 80).compliant, false);
  assert.equal(accessibility.mobileTargetPolicy(43, 80).minWidthPx, 44);
});
