"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncTokenCookieFromStorage } from "@/lib/auth";

const APP_SUFFIX = "AADS";
const CHAT_SUFFIX = "AADS Chat";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

type RouteTitleRule = {
  pattern: RegExp;
  title: string | ((match: RegExpMatchArray) => string);
};

const EXACT_ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/agent-vault": "Agent Vault",
  "/agenda": "아젠다",
  "/assistant": "Assistant Hub",
  "/braming": "브레인스토밍",
  "/browser-tasks": "브라우저 실행",
  "/channels": "대화창 관리",
  "/chat": "AI Chat",
  "/chat/terminal": "Chat Terminal",
  "/conversations": "Conversations",
  "/decisions": "CEO Decisions",
  "/docs": "문서 통합",
  "/flow": "FLOW",
  "/genspark": "Genspark",
  "/home": "고객 홈",
  "/lessons": "교훈",
  "/login": "로그인",
  "/managers": "Managers",
  "/marketing/ably": "에이블리 광고분석",
  "/memory": "Memory",
  "/onboarding": "Onboarding",
  "/ops": "운영 현황",
  "/ops/memory": "메모리",
  "/ops/mobile-agent": "Mobile Agent",
  "/ops/pc-agents": "PC Agent",
  "/ops/recovery": "Recovery",
  "/ops/servers": "Servers",
  "/project-status": "Project Status",
  "/projects": "Pipeline",
  "/reports": "Reports",
  "/settings": "Settings",
  "/settings/api-keys": "AI API",
  "/settings/servers": "내 서버 실행",
  "/signup": "회원가입",
  "/tasks": "Tasks",
  "/team": "Team",
};

const DYNAMIC_ROUTE_TITLES: RouteTitleRule[] = [
  { pattern: /^\/admin\/app-settings$/, title: "오비스 앱 설정" },
  { pattern: /^\/admin\/agents$/, title: "Agent Registry" },
  { pattern: /^\/admin\/deploy$/, title: "배포 현황" },
  { pattern: /^\/admin\/emergency$/, title: "Emergency" },
  { pattern: /^\/admin\/governance$/, title: "Governance" },
  { pattern: /^\/admin\/loops$/, title: "루프 관리" },
  { pattern: /^\/admin\/model-parity$/, title: "모델 패리티" },
  { pattern: /^\/admin\/model-routing$/, title: "모델 라우팅" },
  { pattern: /^\/admin\/prompts$/, title: "Prompts" },
  { pattern: /^\/admin\/sessions$/, title: "세션 리플레이" },
  { pattern: /^\/admin\/tasks$/, title: "Task Board" },
  { pattern: /^\/admin\/users$/, title: "사용자 현황" },
  { pattern: /^\/design\/modifications$/, title: "Design Studio" },
  { pattern: /^\/design\/modifications\/new$/, title: "새 디자인 요청" },
  { pattern: /^\/design\/modifications\/([^/]+)\/context$/, title: "디자인 컨텍스트" },
  { pattern: /^\/design\/modifications\/([^/]+)\/workbench$/, title: "디자인 워크벤치" },
  { pattern: /^\/invite\/accept$/, title: "초대 수락" },
  { pattern: /^\/kakaobot$/, title: "KakaoBot" },
  { pattern: /^\/kakaobot\/agent$/, title: "PC 에이전트" },
  { pattern: /^\/kakaobot\/ai-writer$/, title: "AI 문구 생성기" },
  { pattern: /^\/kakaobot\/anniversaries$/, title: "기념일 캘린더" },
  { pattern: /^\/kakaobot\/contacts$/, title: "연락처 관리" },
  { pattern: /^\/kakaobot\/history$/, title: "발송 이력" },
  { pattern: /^\/kakaobot\/scheduled$/, title: "예약 발송" },
  { pattern: /^\/kakaobot\/settings$/, title: "설정" },
  { pattern: /^\/kakaobot\/templates$/, title: "템플릿 관리" },
  { pattern: /^\/project-status\/([^/]+)$/, title: (match) => `Project Status ${decodeRoutePart(match[1])}` },
  { pattern: /^\/projects\/([^/]+)$/, title: (match) => `Project ${decodeRoutePart(match[1])}` },
  { pattern: /^\/projects\/([^/]+)\/approve-plan$/, title: "계획 승인" },
  { pattern: /^\/projects\/([^/]+)\/costs$/, title: "프로젝트 비용" },
  { pattern: /^\/projects\/([^/]+)\/full-cycle$/, title: "Full Cycle" },
  { pattern: /^\/projects\/([^/]+)\/select-item$/, title: "작업 선택" },
  { pattern: /^\/projects\/([^/]+)\/stream$/, title: "실시간 로그" },
  { pattern: /^\/server-status$/, title: "Server Status" },
  { pattern: /^\/unni-naengmyeon$/, title: "언니냉면" },
  { pattern: /^\/unni-naengmyeon\/brand\/banners$/, title: "언니냉면 입간판" },
  { pattern: /^\/unni-naengmyeon\/brand\/logo$/, title: "언니냉면 로고" },
  { pattern: /^\/unni-naengmyeon\/recipes$/, title: "언니냉면 조리법" },
  { pattern: /^\/gomyunghee-naengmyeon$/, title: "고명희냉면" },
];

function decodeRoutePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fallbackRouteTitle(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeRoutePart(segment).replace(/[-_]+/g, " "))
    .map((segment) => segment.replace(/\b[a-z]/g, (char) => char.toUpperCase()));
  return segments.join(" · ") || "Dashboard";
}

function resolveRouteTitle(pathname: string): string {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const exact = EXACT_ROUTE_TITLES[cleanPath];
  if (exact) return exact;
  for (const rule of DYNAMIC_ROUTE_TITLES) {
    const match = cleanPath.match(rule.pattern);
    if (!match) continue;
    return typeof rule.title === "function" ? rule.title(match) : rule.title;
  }
  return fallbackRouteTitle(cleanPath);
}

function formatDocumentTitle(title: string, suffix = APP_SUFFIX): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned} | ${suffix}` : suffix;
}

function currentChatSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function fetchChatSessionTitle(sessionId: string, signal: AbortSignal): Promise<string | null> {
  const token = syncTokenCookieFromStorage();
  const res = await fetch(`${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null) as { title?: unknown } | null;
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  return title || null;
}

export default function PageTitleManager({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (disabled || typeof document === "undefined") return;
    let abortController: AbortController | null = null;

    const applyTitle = () => {
      if (abortController) abortController.abort();
      abortController = null;

      if (pathname === "/chat") {
        const sessionId = currentChatSessionId();
        document.title = formatDocumentTitle("AI Chat", CHAT_SUFFIX);
        if (!sessionId) return;
        abortController = new AbortController();
        fetchChatSessionTitle(sessionId, abortController.signal)
          .then((title) => {
            if (title) document.title = formatDocumentTitle(title, CHAT_SUFFIX);
          })
          .catch(() => {
            // Keep the route-level title if session lookup fails.
          });
        return;
      }

      document.title = formatDocumentTitle(resolveRouteTitle(pathname));
    };

    applyTitle();
    window.addEventListener("hashchange", applyTitle);
    window.addEventListener("popstate", applyTitle);
    return () => {
      window.removeEventListener("hashchange", applyTitle);
      window.removeEventListener("popstate", applyTitle);
      if (abortController) abortController.abort();
    };
  }, [disabled, pathname]);

  return null;
}
