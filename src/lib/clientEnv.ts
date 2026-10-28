/**
 * 메시지 전송 시점의 접속 환경(client_env) 수집.
 * 원문 User-Agent·IP·기기 모델명은 서버로 보내지 않는다 — 계열(family)과 화면 크기만.
 * 계산에 실패하면 undefined 를 돌려주고 호출부는 필드를 생략한다.
 */

export type ClientEnvDeviceClass = "pc" | "mobile" | "tablet" | "unknown";
export type ClientEnvSource = "client_hints" | "user_agent" | "user_set" | "unknown";

export interface ClientEnv {
  device_class: ClientEnvDeviceClass;
  viewport_w?: number;
  viewport_h?: number;
  orientation?: "portrait" | "landscape";
  os_family?: string;
  browser_family?: string;
  source: ClientEnvSource;
  /** 사용자가 직접 지정한 기기 종류. 있으면 자동 판별보다 우선한다. */
  user_override?: "pc" | "mobile" | "tablet";
}

const DEVICE_OVERRIDE_KEY = "aads.chat.deviceOverride";

export function getDeviceOverride(): "pc" | "mobile" | "tablet" | null {
  try {
    const v = window.localStorage.getItem(DEVICE_OVERRIDE_KEY);
    return v === "pc" || v === "mobile" || v === "tablet" ? v : null;
  } catch {
    return null;
  }
}

/** null 이면 자동 판별로 되돌린다. 이후 보내는 메시지부터 적용된다. */
export function setDeviceOverride(value: "pc" | "mobile" | "tablet" | null): void {
  try {
    if (value) window.localStorage.setItem(DEVICE_OVERRIDE_KEY, value);
    else window.localStorage.removeItem(DEVICE_OVERRIDE_KEY);
  } catch {
    /* 저장소를 못 쓰는 환경이면 자동 판별만 쓴다 */
  }
}

interface UaBrand {
  brand: string;
  version: string;
}

interface UaDataLike {
  mobile?: boolean;
  platform?: string;
  brands?: UaBrand[];
}

const OS_BY_HINT_PLATFORM: Array<[RegExp, string]> = [
  [/windows/i, "windows"],
  [/mac/i, "macos"],
  [/android/i, "android"],
  [/chrome ?os|cros/i, "chromeos"],
  [/ios|iphone|ipad/i, "ios"],
  [/linux/i, "linux"],
];

export function osFromPlatformHint(platform: string): string {
  for (const [re, name] of OS_BY_HINT_PLATFORM) if (re.test(platform)) return name;
  return "other";
}

export function osFromUserAgent(ua: string, maxTouchPoints = 0): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ 는 데스크톱 Safari 로 위장한다 — 터치 지원 Macintosh 는 iPad.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "other";
}

export function browserFromBrands(brands: UaBrand[]): string | undefined {
  const names = brands.map((b) => b.brand.toLowerCase());
  if (names.some((n) => n.includes("edge"))) return "edge";
  if (names.some((n) => n.includes("samsung"))) return "samsung";
  if (names.some((n) => n.includes("chrom"))) return "chrome";
  if (names.some((n) => n.includes("firefox"))) return "firefox";
  if (names.some((n) => n.includes("safari"))) return "safari";
  return undefined;
}

export function browserFromUserAgent(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  // iOS 의 Chrome(CriOS)도 Chromium 계열로 본다.
  if (/Chrome|Chromium|CriOS/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

export function deviceClassFrom(
  ua: string,
  os: string,
  isMobileHint: boolean | undefined,
  viewportW: number | undefined,
): ClientEnvDeviceClass {
  if (/iPad|Tablet/i.test(ua) || (os === "ios" && /Macintosh/i.test(ua))) return "tablet";
  if (os === "android" && !/Mobile/i.test(ua) && ua) return "tablet";
  if (isMobileHint === true) return "mobile";
  if (/Mobi|iPhone|iPod/i.test(ua)) return "mobile";
  if (os === "windows" || os === "macos" || os === "linux" || os === "chromeos") return "pc";
  if (os === "ios" || os === "android") return viewportW && viewportW >= 768 ? "tablet" : "mobile";
  return "unknown";
}

function positiveInt(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 10000 ? Math.round(n) : undefined;
}

export function collectClientEnv(): ClientEnv | undefined {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return undefined;

    const nav = navigator as Navigator & { userAgentData?: UaDataLike };
    const ua = navigator.userAgent || "";
    const hints = nav.userAgentData;
    const viewport_w = positiveInt(window.innerWidth);
    const viewport_h = positiveInt(window.innerHeight);

    let orientation: ClientEnv["orientation"];
    if (typeof window.matchMedia === "function") {
      orientation = window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
    } else if (viewport_w && viewport_h) {
      orientation = viewport_h >= viewport_w ? "portrait" : "landscape";
    }

    let os_family: string | undefined;
    let browser_family: string | undefined;
    let source: ClientEnvSource = "unknown";
    if (hints?.platform) {
      os_family = osFromPlatformHint(hints.platform);
      browser_family = hints.brands ? browserFromBrands(hints.brands) : undefined;
      source = "client_hints";
    }
    if (!os_family && ua) {
      os_family = osFromUserAgent(ua, navigator.maxTouchPoints || 0);
      source = "user_agent";
    }
    if (!browser_family && ua) {
      browser_family = browserFromUserAgent(ua);
      if (source === "unknown") source = "user_agent";
    }
    // iPadOS 는 Client Hints 가 없으므로 위에서 이미 user_agent 로 판정된다.

    const override = getDeviceOverride();
    const device_class = override ?? deviceClassFrom(ua, os_family ?? "other", hints?.mobile, viewport_w);
    if (override) source = "user_set";

    const env: ClientEnv = { device_class, source };
    if (override) env.user_override = override;
    if (viewport_w) env.viewport_w = viewport_w;
    if (viewport_h) env.viewport_h = viewport_h;
    if (orientation) env.orientation = orientation;
    if (os_family) env.os_family = os_family;
    if (browser_family) env.browser_family = browser_family;
    return env;
  } catch {
    return undefined;
  }
}
