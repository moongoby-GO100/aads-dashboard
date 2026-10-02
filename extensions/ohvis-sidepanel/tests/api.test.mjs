import test from "node:test";
import assert from "node:assert/strict";
import { createApi, readTokenFromCookies, ApiError, BASE_URL } from "../lib/api.js";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeApi(handler, token = "TEST_TOKEN") {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { api: createApi({ fetchImpl, getToken: async () => token }), calls };
}

test("Bearer 토큰과 omit credentials 로 승인 대기 목록 조회", async () => {
  const { api, calls } = makeApi(() => jsonResponse(200, { requests: [{ id: "r1" }], count: 1 }));
  const list = await api.listPending();
  assert.deepEqual(list, [{ id: "r1" }]);
  assert.equal(calls[0].url, `${BASE_URL}/api/v1/browser-tasks/permissions/pending?decision=pending&limit=50`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer TEST_TOKEN");
  assert.equal(calls[0].init.credentials, "omit");
});

test("토큰이 없으면 네트워크 호출 없이 auth 오류", async () => {
  const { api, calls } = makeApi(() => jsonResponse(200, {}), "");
  await assert.rejects(api.listTasks(), (e) => e instanceof ApiError && e.kind === "auth");
  assert.equal(calls.length, 0);
});

test("401 은 auth, 403 은 forbidden, 500 은 server 로 분류", async () => {
  for (const [status, kind] of [[401, "auth"], [403, "forbidden"], [404, "not_found"], [409, "conflict"], [500, "server"], [422, "client"]]) {
    const { api } = makeApi(() => jsonResponse(status, { detail: "x" }));
    await assert.rejects(api.listTasks(), (e) => e.kind === kind && e.status === status, `status ${status}`);
  }
});

test("fetch 예외는 network 오류, 토큰은 오류 메시지에 포함되지 않음", async () => {
  const api = createApi({
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    getToken: async () => "SECRET_TOKEN_VALUE",
  });
  await assert.rejects(api.listTasks(), (e) => {
    assert.equal(e.kind, "network");
    assert.ok(!e.message.includes("SECRET_TOKEN_VALUE"));
    return true;
  });
});

test("작업 목록은 limit=10 쿼리, tasks 배열 반환", async () => {
  const { api, calls } = makeApi(() => jsonResponse(200, { tasks: [{ id: "t1" }, { id: "t2" }], count: 2 }));
  assert.equal((await api.listTasks(10)).length, 2);
  assert.equal(calls[0].url, `${BASE_URL}/api/v1/browser-tasks?limit=10`);
});

test("승인/거부는 POST 로 올바른 경로와 본문 전송", async () => {
  const { api, calls } = makeApi(() => jsonResponse(200, { status: "ok" }));
  await api.approve("abc-1");
  await api.reject("abc-2", "사유");
  assert.equal(calls[0].url, `${BASE_URL}/api/v1/browser-tasks/permissions/abc-1/approve`);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {});
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[1].url, `${BASE_URL}/api/v1/browser-tasks/permissions/abc-2/reject`);
  assert.deepEqual(JSON.parse(calls[1].init.body), { reason: "사유" });
});

test("경로 인자는 URL 인코딩된다", async () => {
  const { api, calls } = makeApi(() => jsonResponse(200, {}));
  await api.approve("a/../b");
  assert.ok(calls[0].url.includes("/permissions/a%2F..%2Fb/approve"));
});

test("작업 상세: events/steps/live-frame 병합, live-frame 404 는 무시", async () => {
  const { api, calls } = makeApi((url) => {
    if (url.includes("/events")) return jsonResponse(200, { events: [{ event_type: "navigate" }] });
    if (url.includes("/steps")) return jsonResponse(200, { steps: [{ step: "navigate" }] });
    return jsonResponse(404, { detail: "none" });
  });
  const detail = await api.getTaskDetail("t1");
  assert.equal(calls.length, 3);
  assert.deepEqual(detail, { events: [{ event_type: "navigate" }], steps: [{ step: "navigate" }], frame: null });
});

test("작업 상세: live-frame 이 있으면 frame 반환, 401 은 전파", async () => {
  const ok = makeApi((url) => {
    if (url.includes("/live-frame")) return jsonResponse(200, { frame: { frame_base64: "AAAA" } });
    return jsonResponse(200, { events: [], steps: [] });
  });
  assert.deepEqual((await ok.api.getTaskDetail("t1")).frame, { frame_base64: "AAAA" });
  const denied = makeApi(() => jsonResponse(401, {}));
  await assert.rejects(denied.api.getTaskDetail("t1"), (e) => e.kind === "auth");
});

test("재시도: POST /{id}/retry, 409 는 conflict", async () => {
  const ok = makeApi(() => jsonResponse(200, { status: "queued" }));
  assert.equal((await ok.api.retryTask("t1")).status, "queued");
  assert.equal(ok.calls[0].url, `${BASE_URL}/api/v1/browser-tasks/t1/retry`);
  assert.equal(ok.calls[0].init.method, "POST");
  const conflict = makeApi(() => jsonResponse(409, { detail: "approval_or_authentication_required" }));
  await assert.rejects(conflict.api.retryTask("t1"), (e) => e.kind === "conflict");
});

test("쿠키 읽기: aads.newtalk.kr 의 aads_token 만 조회", async () => {
  let query;
  const cookies = { get: async (q) => { query = q; return { value: "JWT" }; } };
  assert.equal(await readTokenFromCookies(cookies), "JWT");
  assert.deepEqual(query, { url: BASE_URL, name: "aads_token" });
  assert.equal(await readTokenFromCookies({ get: async () => null }), "");
});
