import { afterEach, describe, expect, it, vi } from "vitest";
import { collectClientEnv, deviceClassFrom, getDeviceOverride, setDeviceOverride } from "./clientEnv";

function stubBrowser(opts: { ua: string; w: number; h: number; hints?: unknown; touch?: number }) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    innerWidth: opts.w,
    innerHeight: opts.h,
    matchMedia: () => ({ matches: opts.h >= opts.w }),
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  vi.stubGlobal("navigator", { userAgent: opts.ua, maxTouchPoints: opts.touch ?? 0, userAgentData: opts.hints });
}

afterEach(() => vi.unstubAllGlobals());

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
const TABLET_UA = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

describe("collectClientEnv", () => {
  it("never includes the raw user agent string", () => {
    stubBrowser({ ua: DESKTOP_UA, w: 1920, h: 1080 });
    const env = collectClientEnv();
    expect(JSON.stringify(env)).not.toMatch(/Mozilla|AppleWebKit|120\.0/);
    expect(env?.device_class).toBe("pc");
    expect(env?.os_family).toBe("windows");
    expect(env?.browser_family).toBe("chrome");
    expect(env?.orientation).toBe("landscape");
    expect(env?.viewport_w).toBe(1920);
    expect(env?.viewport_h).toBe(1080);
  });

  it("only reports the whitelisted fields", () => {
    stubBrowser({ ua: DESKTOP_UA, w: 1920, h: 1080 });
    const allowed = ["device_class", "viewport_w", "viewport_h", "orientation", "os_family", "browser_family", "source", "user_override"];
    for (const key of Object.keys(collectClientEnv() ?? {})) expect(allowed).toContain(key);
  });

  it("a narrow desktop window is not reported as mobile", () => {
    stubBrowser({ ua: DESKTOP_UA, w: 380, h: 800 });
    expect(collectClientEnv()?.device_class).toBe("pc");
  });

  it("detects a phone from the UA family", () => {
    stubBrowser({ ua: PHONE_UA, w: 390, h: 844, touch: 5 });
    const env = collectClientEnv();
    expect(env?.device_class).toBe("mobile");
    expect(env?.os_family).toBe("android");
    expect(env?.orientation).toBe("portrait");
  });

  it("detects tablets (Android without Mobile, iPad)", () => {
    stubBrowser({ ua: TABLET_UA, w: 800, h: 1280, touch: 5 });
    expect(collectClientEnv()?.device_class).toBe("tablet");
    stubBrowser({ ua: IPAD_UA, w: 820, h: 1180, touch: 5 });
    expect(collectClientEnv()?.device_class).toBe("tablet");
  });

  it("prefers Client Hints when available", () => {
    stubBrowser({
      ua: PHONE_UA,
      w: 390,
      h: 844,
      hints: { mobile: true, platform: "Android", brands: [{ brand: "Chromium", version: "120" }] },
    });
    const env = collectClientEnv();
    expect(env?.source).toBe("client_hints");
    expect(env?.device_class).toBe("mobile");
    expect(env?.browser_family).toBe("chrome");
  });

  it("user override wins and is reported as user_set", () => {
    stubBrowser({ ua: DESKTOP_UA, w: 1920, h: 1080 });
    setDeviceOverride("tablet");
    expect(getDeviceOverride()).toBe("tablet");
    const env = collectClientEnv();
    expect(env?.device_class).toBe("tablet");
    expect(env?.user_override).toBe("tablet");
    expect(env?.source).toBe("user_set");
    setDeviceOverride(null);
    expect(getDeviceOverride()).toBeNull();
    expect(collectClientEnv()?.device_class).toBe("pc");
  });

  it("returns undefined outside a browser", () => {
    expect(collectClientEnv()).toBeUndefined();
  });

  it("returns undefined instead of throwing when the environment is broken", () => {
    vi.stubGlobal("window", {
      get innerWidth(): number {
        throw new Error("boom");
      },
    });
    vi.stubGlobal("navigator", { userAgent: DESKTOP_UA });
    expect(collectClientEnv()).toBeUndefined();
  });
});

describe("deviceClassFrom", () => {
  it("unknown platform stays unknown", () => {
    expect(deviceClassFrom("", "other", undefined, 500)).toBe("unknown");
  });
});
