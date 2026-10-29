import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ getAuthHeaders: () => ({ Authorization: "Bearer user-token" }) }));

const SID = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";
const REV = "44444444-4444-4444-8444-444444444444";
const MSG = "55555555-5555-4555-8555-555555555555";

const target = (reviewId: string, generation = 7) => ({
  sessionId: SID, project: "AADS", reviewId, revisionId: REV, artifactId: null, screenId: null, title: reviewId.slice(0, 4), generation,
});

function installBrowserStubs() {
  const mem = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/chat", search: "", hash: "", href: "" },
    sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("localStorage", { removeItem: () => undefined });
}

const jsonRes = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

async function load() {
  vi.resetModules();
  const store = await import("./mockupTargetStore");
  store.mockupTargetStore.resetForSession(SID);
  return store;
}

beforeEach(() => {
  installBrowserStubs();
  vi.unstubAllGlobals();
  installBrowserStubs();
});

describe("mockup change intake", () => {
  it("registers only after the saved user message is found, sending the user's token and the pinned review", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { mockupTargetStore, registerMockupChangeAfterSend } = await load();
    mockupTargetStore.arm(target(R1));
    const r = await registerMockupChangeAfterSend({
      target: target(R1), content: "버튼을 키워줘", sentAt: Date.now(), replyToId: null,
      loadMessages: async () => [{ id: MSG, role: "user", content: "버튼을 키워줘", created_at: new Date().toISOString() }],
    });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/projects/AADS/mockup-reviews/change-intake");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ review_id: R1, expected_generation: 7, source_message_id: MSG, session_id: SID });
    expect(mockupTargetStore.get().notice?.kind).toBe("registered");
    expect(mockupTargetStore.get().armed).toBeNull();
    expect(mockupTargetStore.pendingIntents()).toHaveLength(0);
  });

  it("does not call the server when the saved message cannot be found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { mockupTargetStore, registerMockupChangeAfterSend } = await load();
    const r = await registerMockupChangeAfterSend({
      target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null, loadMessages: async () => [],
    });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const n = mockupTargetStore.get().notice;
    expect(n?.kind === "failed" && n.reason).toBe("message_not_found");
  });

  it("keeps the intent with the same idempotency key after a network failure and retries safely", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { mockupTargetStore, registerMockupChangeAfterSend, submitPendingIntent } = await load();
    const first = await registerMockupChangeAfterSend({
      target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null,
      loadMessages: async () => [{ id: MSG, role: "user", content: "수정", created_at: new Date().toISOString() }],
    });
    expect(first.ok).toBe(false);
    const kept = mockupTargetStore.pendingIntents();
    expect(kept).toHaveLength(1);
    const key = kept[0].body.idempotency_key;
    const second = await submitPendingIntent(kept[0]);
    expect(second.ok).toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).idempotency_key).toBe(key);
    expect(mockupTargetStore.pendingIntents()).toHaveLength(0);
  });

  it("drops the intent on a permission or stale-version rejection and surfaces the server reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(409, { detail: { code: "stale_revision", latest_revision: 3 } })));
    const { mockupTargetStore, registerMockupChangeAfterSend } = await load();
    const r = await registerMockupChangeAfterSend({
      target: target(R1, 1), content: "수정", sentAt: Date.now(), replyToId: null,
      loadMessages: async () => [{ id: MSG, role: "user", content: "수정", created_at: new Date().toISOString() }],
    });
    expect(r.ok).toBe(false);
    expect(mockupTargetStore.pendingIntents()).toHaveLength(0);
    const n = mockupTargetStore.get().notice;
    expect(n?.kind === "failed" && n.error?.status).toBe(409);
  });

  it("403 is not retried automatically and keeps no pending intent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(403, { detail: "forbidden" })));
    const { mockupTargetStore, registerMockupChangeAfterSend } = await load();
    await registerMockupChangeAfterSend({
      target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null,
      loadMessages: async () => [{ id: MSG, role: "user", content: "수정", created_at: new Date().toISOString() }],
    });
    expect(mockupTargetStore.pendingIntents()).toHaveLength(0);
    const n = mockupTargetStore.get().notice;
    expect(n?.kind === "failed" && n.error?.status).toBe(403);
  });
});

describe("mockup target pinning", () => {
  it("blocks sending when the armed target differs from the replied card", async () => {
    const { mockupTargetStore } = await load();
    mockupTargetStore.resetForSession(SID);
    mockupTargetStore.setReply(SID, target(R2));
    mockupTargetStore.arm(target(R1));
    expect(mockupTargetStore.sendResolution().kind).toBe("ambiguous");
    mockupTargetStore.choose(`AADS:${R1}`);
    const r = mockupTargetStore.sendResolution();
    expect(r.kind === "target" && r.target.reviewId).toBe(R1);
  });

  it("is not a change request unless armed, and resets on session change", async () => {
    const { mockupTargetStore } = await load();
    mockupTargetStore.resetForSession(SID);
    mockupTargetStore.setPanel(SID, target(R1));
    expect(mockupTargetStore.sendResolution().kind).toBe("none");
    mockupTargetStore.arm(target(R1));
    mockupTargetStore.resetForSession("66666666-6666-4666-8666-666666666666");
    expect(mockupTargetStore.get().armed).toBeNull();
    expect(mockupTargetStore.sendResolution().kind).toBe("none");
  });

  it("never blocks ordinary chat: unarmed sends resolve to none even when reply, panel and candidates disagree", async () => {
    const { mockupTargetStore } = await load();
    mockupTargetStore.resetForSession(SID);
    mockupTargetStore.setReply(SID, target(R2));
    mockupTargetStore.setPanel(SID, target(R1));
    mockupTargetStore.setCandidates(SID, [target(R1), target(R2)]);
    expect(mockupTargetStore.sendResolution().kind).toBe("none");
    mockupTargetStore.arm(target(R1));
    expect(mockupTargetStore.sendResolution().kind).toBe("ambiguous");
    mockupTargetStore.disarm();
    expect(mockupTargetStore.sendResolution().kind).toBe("none");
  });

  it("keeps the candidate-lookup failure visible and clears it with the session", async () => {
    const { mockupTargetStore } = await load();
    mockupTargetStore.resetForSession(SID);
    mockupTargetStore.setCandidates(SID, [target(R1)], true);
    expect(mockupTargetStore.get().candidatesFailed).toBe(true);
    mockupTargetStore.setCandidates(SID, [target(R1)]);
    expect(mockupTargetStore.get().candidatesFailed).toBe(false);
    mockupTargetStore.setCandidates(SID, [], true);
    mockupTargetStore.resetForSession("66666666-6666-4666-8666-666666666666");
    expect(mockupTargetStore.get().candidatesFailed).toBe(false);
    expect(mockupTargetStore.get().candidates).toHaveLength(0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const OTHER = "66666666-6666-4666-8666-666666666666";

describe("async completion UI fences", () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])("fences intake completion (failure=%s, returnToA=%s)", async (failure, returnToA) => {
    const network = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => network.promise));
    const { mockupTargetStore: store, submitPendingIntent } = await load();
    store.arm(target(R1));
    const intent = { intentId: MSG, project: "AADS", createdAt: Date.now(), body: {
      session_id: SID, review_id: R1, expected_generation: 7, source_message_id: MSG,
      change_request_id: MSG, idempotency_key: MSG, comment: "수정",
      artifact_id: null, reply_to_id: null, screen_id: null,
    } };
    const pending = submitPendingIntent(intent);
    store.resetForSession(OTHER);
    if (returnToA) store.resetForSession(SID);
    const next = { ...target(R2), sessionId: returnToA ? SID : OTHER };
    store.arm(next);
    if (failure) network.reject(new Error("offline")); else network.resolve(jsonRes(200, {}));
    await pending;
    expect(store.get().sessionId).toBe(next.sessionId);
    expect(store.get().armed).toEqual(next);
    expect(store.get().notice).toBeNull();
  });

  it.each(["success", "failure", "missing", "lookup-error"])("fences delayed %s lookup across A → B → A", async (outcome) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(outcome === "failure" ? jsonRes(403, {}) : jsonRes(200, {})));
    const { mockupTargetStore: store, registerMockupChangeAfterSend } = await load();
    const lookup = deferred<Array<{id: string; role: string; content: string}>>();
    store.arm(target(R1));
    const pending = registerMockupChangeAfterSend({ target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null, loadMessages: () => lookup.promise });
    store.resetForSession(OTHER);
    store.arm({ ...target(R2), sessionId: OTHER });
    store.resetForSession(SID);
    store.arm(target(R2));
    if (outcome === "lookup-error") lookup.reject(new Error("lookup"));
    else lookup.resolve(outcome === "missing" ? [] : [{ id: MSG, role: "user", content: "수정" }]);
    await pending;
    expect(store.get().armed?.reviewId).toBe(R2);
    expect(store.get().notice).toBeNull();
    expect(store.get().sessionId).toBe(SID);
  });

  it("preserves a newly armed target in the same session", async () => {
    const network = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => network.promise));
    const { mockupTargetStore: store, registerMockupChangeAfterSend } = await load();
    store.arm(target(R1));
    const pending = registerMockupChangeAfterSend({ target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null,
      loadMessages: async () => [{ id: MSG, role: "user", content: "수정" }] });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    store.arm(target(R2));
    network.resolve(jsonRes(200, {}));
    await pending;
    expect(store.get().armed?.reviewId).toBe(R2);
    expect(store.get().notice).toBeNull();
    expect(store.pendingIntents()).toHaveLength(0);
  });

  it("ignores old-session candidate, reply and panel writes", async () => {
    const { mockupTargetStore: store } = await load();
    store.resetForSession(OTHER);
    store.arm({ ...target(R2), sessionId: OTHER });
    store.setCandidates(SID, [target(R1)], true);
    store.setReply(SID, target(R1));
    store.setPanel(SID, target(R1));
    expect(store.get()).toMatchObject({ sessionId: OTHER, candidates: [], candidatesFailed: false, panel: null, reply: null });
  });
});

it("keeps the send-time fence when registration starts after revisiting A", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(200, {})));
  const { mockupTargetStore: store, captureMockupUiFence, registerMockupChangeAfterSend } = await load();
  store.arm(target(R1));
  store.disarm();
  const uiFence = captureMockupUiFence(SID);
  store.resetForSession(OTHER);
  store.resetForSession(SID);
  store.arm(target(R2));
  await registerMockupChangeAfterSend({ uiFence, target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null,
    loadMessages: async () => [{ id: MSG, role: "user", content: "수정" }] });
  expect(store.get().armed?.reviewId).toBe(R2);
  expect(store.get().notice).toBeNull();
});

it("lets the newer request own the notice in the same session", async () => {
  const first = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(jsonRes(403, {})));
  const { mockupTargetStore: store, registerMockupChangeAfterSend } = await load();
  const opts = { target: target(R1), content: "수정", sentAt: Date.now(), replyToId: null,
    loadMessages: async () => [{ id: MSG, role: "user", content: "수정" }] };
  const older = registerMockupChangeAfterSend(opts);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await registerMockupChangeAfterSend({ ...opts, target: target(R2), loadMessages: async () => [{ id: R2, role: "user", content: "수정" }] });
  const notice = store.get().notice;
  expect(notice?.kind).toBe("failed");
  first.resolve(jsonRes(200, {}));
  await older;
  expect(store.get().notice).toEqual(notice);
});
