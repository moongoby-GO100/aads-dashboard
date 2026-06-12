import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/invite/accept", "/_next", "/favicon.ico", "/api", "/manifest.json", "/manifest-kakaobot.json", "/icon-", "/apple-touch-icon.png", "/sw.js", "/manifest.webmanifest"];

const KAKAOBOT_ALLOWED = ["/kakaobot", "/login", "/signup", "/api", "/_next", "/favicon.ico", "/manifest.json", "/manifest-kakaobot.json", "/icon-", "/apple-touch-icon.png", "/sw.js", "/manifest.webmanifest"];

const PUBLIC_REPORT_FILE = /^\/reports\/[^/]+\.(?:html|htm|pdf|txt|md|csv|json)$/;

const INTERNAL_ADMIN_PATH_PREFIXES = [
  "/",
  "/admin",
  "/project-status",
  "/conversations",
  "/channels",
  "/managers",
  "/decisions",
  "/tasks",
  "/design",
  "/projects",
  "/ops",
  "/lessons",
  "/flow",
  "/reports",
  "/server-status",
];

function isInternalAdminPath(pathname: string): boolean {
  return INTERNAL_ADMIN_PATH_PREFIXES.some((prefix) => (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

function authMeUrl(request: NextRequest): URL {
  const internalApiBase = process.env.AADS_INTERNAL_API_URL || "http://aads-server:8080/api/v1";
  try {
    return new URL("auth/me", internalApiBase.endsWith("/") ? internalApiBase : `${internalApiBase}/`);
  } catch {
    return new URL("/api/v1/auth/me", request.url);
  }
}

async function hasInternalAdminAccess(request: NextRequest, token: string): Promise<boolean> {
  try {
    const meUrl = authMeUrl(request);
    const res = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.is_internal_admin);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const isKakaobot = hostname.includes("kakaobot.newtalk.kr");

  // kakaobot.newtalk.kr 호스트: /kakaobot/* 만 허용
  if (isKakaobot) {
    // 루트 → /kakaobot 리다이렉트
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/kakaobot", request.url));
    }

    // manifest.json → manifest-kakaobot.json 리라이트
    if (pathname === "/manifest.json") {
      return NextResponse.rewrite(new URL("/manifest-kakaobot.json", request.url));
    }

    // 허용 경로 체크
    const allowed = KAKAOBOT_ALLOWED.some((p) => pathname.startsWith(p));
    if (!allowed) {
      return NextResponse.redirect(new URL("/kakaobot", request.url));
    }
    // kakaobot 허용 경로는 인증 없이 통과
    return NextResponse.next();
  }

  // 공개 경로는 인증 불필요
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || PUBLIC_REPORT_FILE.test(pathname)) {
    return NextResponse.next();
  }

  // 인증 체크
  const token = request.cookies.get("aads_token")?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isInternalAdminPath(pathname)) {
    const allowed = await hasInternalAdminAccess(request, token);
    if (!allowed) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|manifest-kakaobot\\.json|icon-|apple-touch-icon|sw\\.js|manifest\\.webmanifest).*)"],
};
