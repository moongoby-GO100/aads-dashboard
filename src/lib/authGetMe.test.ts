import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-11-04: /auth/me 가 504 를 내자 getMe() 가 토큰을 지워 재로그인 화면으로
// 튕겼다. 토큰 삭제는 서버가 인증을 거절한 401/403 에서만 일어나야 한다.

const TOKEN = "tok-abc";
const USER = { user_id: "u1", email: "ceo@example.com", is_internal_admin: true };

let store: Map<string, string>;
let cookie: string;

function installBrowser() {
  store = new Map([["aads_token", TOKEN]]);
  cookie = "";
  vi.stubGlobal("window", { location: { protocol: "https:" } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("document", {
    get cookie() { return cookie; },
    set cookie(v: string) { cookie = v; },
  });
}

function respond(status: number, body: unknown = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

async function loadAuth() {
  vi.resetModules();
  return import("./auth");
}

describe("getMe() 토큰 보존 규칙", () => {
  beforeEach(() => {
    installBrowser();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([500, 502, 503, 504])("%i 이면 토큰을 지우지 않는다", async (status) => {
    vi.stubGlobal("fetch", vi.fn(() => respond(status)));
    const { getMe } = await loadAuth();
    expect(await getMe()).toBeNull();
    expect(store.get("aads_token")).toBe(TOKEN);
    expect(cookie).not.toContain("max-age=0");
  });

  it("네트워크 오류이면 토큰을 지우지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const { getMe } = await loadAuth();
    expect(await getMe()).toBeNull();
    expect(store.get("aads_token")).toBe(TOKEN);
  });

  it.each([401, 403])("%i 이면 토큰을 지운다", async (status) => {
    vi.stubGlobal("fetch", vi.fn(() => respond(status)));
    const { getMe } = await loadAuth();
    expect(await getMe()).toBeNull();
    expect(store.has("aads_token")).toBe(false);
    expect(cookie).toContain("max-age=0");
  });

  it("캐시가 만료된 뒤 504 가 나면 같은 토큰의 직전 사용자를 돌려준다", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => respond(200, USER))
      .mockImplementationOnce(() => respond(504));
    vi.stubGlobal("fetch", fetchMock);
    const { getMe } = await loadAuth();
    expect(await getMe()).toEqual(USER);
    vi.advanceTimersByTime(31_000);
    expect(await getMe()).toEqual(USER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.get("aads_token")).toBe(TOKEN);
  });

  it("토큰이 바뀌었으면 직전 사용자를 재사용하지 않는다", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => respond(200, USER))
      .mockImplementationOnce(() => respond(504));
    vi.stubGlobal("fetch", fetchMock);
    const { getMe } = await loadAuth();
    expect(await getMe()).toEqual(USER);
    store.set("aads_token", "tok-other");
    expect(await getMe()).toBeNull();
  });
});
