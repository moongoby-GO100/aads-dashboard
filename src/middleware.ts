import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/invite/accept", "/braming/shared", "/unni-naengmyeon", "/brands", "/fonts", "/apps", "/static", "/screenshots", "/_next", "/favicon.ico", "/api", "/manifest.json", "/manifest-kakaobot.json", "/icon-", "/apple-touch-icon.png", "/sw.js", "/manifest.webmanifest"];

const KAKAOBOT_ALLOWED = ["/kakaobot", "/login", "/signup", "/api", "/_next", "/favicon.ico", "/manifest.json", "/manifest-kakaobot.json", "/icon-", "/apple-touch-icon.png", "/sw.js", "/manifest.webmanifest"];

const PUBLIC_REPORT_FILE = /^\/reports\/[^/]+\.(?:html|htm|pdf|txt|md|csv|json)$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const isKakaobot = hostname.includes("kakaobot.newtalk.kr");
  const isFoodBiz = hostname.includes("fb.newtalk.kr");

  if (pathname === "/apps/yeoljeong-finance" || pathname === "/apps/yeoljeong-finance/") {
    return NextResponse.redirect(new URL("/apps/yeoljeong-finance/index.html", request.url));
  }

  if (isFoodBiz && pathname === "/") {
    return NextResponse.redirect(new URL("/apps/yeoljeong-finance/index.html", request.url));
  }

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
    loginUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|manifest-kakaobot\\.json|icon-|apple-touch-icon|sw\\.js|manifest\\.webmanifest).*)"],
};
