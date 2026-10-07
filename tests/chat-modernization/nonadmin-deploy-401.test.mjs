import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

function makeEnv(status) {
  const removed = [];
  const location = { pathname: "/chat", search: "", href: "/chat", protocol: "https:" };
  const calls = [];
  const globals = {
    process: { env: {} },
    window: { location },
    document: { cookie: "" },
    localStorage: {
      getItem: () => "tok",
      setItem: () => {},
      removeItem: (k) => removed.push(k),
    },
    fetch: async (url) => {
      calls.push(url);
      return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => "denied",
        json: async () => ({}),
      };
    },
  };
  const api = loadSource("src/app/chat/api.ts", globals, new Map());
  return { api, location, removed, calls };
}

test("softAuth 401 (non-admin deploy status) does not log out and throws ChatApiError", async () => {
  const { api, location, removed } = makeEnv(401);
  await assert.rejects(
    api.chatApi("/ops/deploy/status", undefined, { softAuth: true }),
    (e) => e instanceof api.ChatApiError && e.status === 401,
  );
  assert.equal(location.href, "/chat");
  assert.deepEqual(removed, []);
});

test("softAuth 403 does not log out", async () => {
  const { api, location, removed } = makeEnv(403);
  await assert.rejects(
    api.chatApi("/ops/deploy/status", undefined, { softAuth: true }),
    (e) => e.status === 403,
  );
  assert.equal(location.href, "/chat");
  assert.deepEqual(removed, []);
});

test("ordinary chat API 401 still triggers the global session-expired logout", async () => {
  const { api, location, removed } = makeEnv(401);
  await assert.rejects(api.chatApi("/chat/sessions"), /401/);
  assert.ok(location.href.startsWith("/login?next="));
  assert.ok(location.href.includes("reason=session_expired"));
  assert.ok(removed.includes("aads_token"));
});

test("softAuth and default calls to the same path do not share a coalesced request", async () => {
  const { api, location } = makeEnv(401);
  const soft = api.chatApi("/ops/deploy/status", undefined, { softAuth: true }).catch((e) => e);
  const plain = api.chatApi("/ops/deploy/status").catch((e) => e);
  await Promise.all([soft, plain]);
  assert.ok(location.href.startsWith("/login"), "default call keeps its own 401 handling");
});

test("panel skips the admin-only call for non-admins and shows the admin-only message", () => {
  const panel = source("src/app/chat/ChatArtifactPanel.tsx");
  assert.ok(panel.includes('"배포 상태는 관리자만 볼 수 있습니다"'));
  assert.ok(panel.includes("me && !me.is_internal_admin"));
  assert.ok(panel.includes('"/ops/deploy/status", undefined, { softAuth: true }'));
  assert.ok(panel.includes("e instanceof ChatApiError && (e.status === 401 || e.status === 403)"));
  const guard = panel.indexOf("me && !me.is_internal_admin");
  const call = panel.indexOf('"/ops/deploy/status"');
  assert.ok(guard > 0 && guard < call, "admin check precedes the request");
});
