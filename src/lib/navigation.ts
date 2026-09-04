export type AppNavItem = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  highlight?: boolean;
  external?: boolean;
  pageTitle?: string;
};

export type RouteTitleRule = {
  pattern: RegExp;
  title: string | ((match: RegExpMatchArray) => string);
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "Dashboard", icon: "🏠", adminOnly: true },
  { href: "/home", label: "고객 홈", icon: "🏠" },
  { href: "/chat", label: "AI Chat", icon: "💬", highlight: true },
  { href: "/assistant", label: "Assistant Hub", icon: "🧭", adminOnly: true },
  { href: "/braming", label: "브레인스토밍", icon: "🧠", adminOnly: true },
  { href: "/project-status", label: "Project Status", icon: "📊", adminOnly: true },
  { href: "/conversations", label: "Conversations", icon: "🗨️", adminOnly: true },
  { href: "/channels", label: "대화창 관리", icon: "📌", adminOnly: true },
  { href: "/managers", label: "Managers", icon: "👥", adminOnly: true },
  { href: "/team", label: "Team", icon: "👥", adminOnly: true },
  { href: "/agenda", label: "아젠다", icon: "📌", adminOnly: true },
  { href: "/marketing/ably", label: "에이블리 광고분석", icon: "📈", adminOnly: true },
  { href: "/decisions", label: "CEO Decisions", icon: "🎯", adminOnly: true },
  { href: "/tasks", label: "Tasks", icon: "📋", adminOnly: true },
  { href: "/docs", label: "문서 통합", icon: "📄", adminOnly: true },
  { href: "/design/modifications", label: "Design Studio", icon: "🎨", adminOnly: true },
  { href: "/projects", label: "Pipeline", icon: "🔧", adminOnly: true },
  { href: "/ops", label: "운영 현황", icon: "📊", adminOnly: true },
  { href: "/ops/recovery", label: "Recovery", icon: "🔄", adminOnly: true },
  { href: "/ops/servers", label: "Servers", icon: "🖥️", adminOnly: true },
  { href: "/ops/memory", label: "메모리", icon: "🧠", adminOnly: true },
  { href: "/ops/pc-agents", label: "PC Agent", icon: "💻", adminOnly: true },
  { href: "/browser-tasks", label: "브라우저 실행", icon: "🌐", adminOnly: true },
  { href: "/authenticated-collector", label: "로그인 수집 허브", icon: "🔐", adminOnly: true },
  { href: "/agent-vault", label: "Agent Vault", icon: "🔐", adminOnly: true },
  { href: "/ops/mobile-agent", label: "Mobile Agent", icon: "📱", adminOnly: true },
  { href: "/lessons", label: "교훈", icon: "💡", adminOnly: true },
  { href: "/flow", label: "FLOW", icon: "🔄", adminOnly: true },
  { href: "/reports", label: "Reports", icon: "📊", adminOnly: true },
  { href: "/kakaobot", label: "KakaoBot", icon: "💬", adminOnly: true },
  { href: "/settings/api-keys", label: "AI API", icon: "🔑" },
  { href: "/settings/servers", label: "내 서버 실행", icon: "🖥️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/admin/users", label: "사용자 현황", icon: "👤", adminOnly: true },
  { href: "/admin/prompts", label: "Prompts", icon: "📝", adminOnly: true },
  { href: "/admin/tasks", label: "Task Board", icon: "🗂️", adminOnly: true },
  { href: "/admin/agents", label: "Agent Registry", icon: "🧩", adminOnly: true },
  { href: "/admin/governance", label: "Governance", icon: "🏛️", adminOnly: true },
  { href: "/admin/model-routing", label: "모델 라우팅", icon: "🧭", adminOnly: true },
  { href: "/admin/model-parity", label: "모델 패리티", icon: "⚖️", adminOnly: true },
  { href: "/exports/llm-models-current.html", label: "LLM 모델 현황 2026", icon: "🤖", adminOnly: true, external: true },
  { href: "/admin/deploy", label: "배포 현황", icon: "🚀", adminOnly: true },
  { href: "/admin/app-settings", label: "오비스 앱 설정", icon: "📱", adminOnly: true },
  { href: "/admin/loops", label: "루프 관리", icon: "🔁", adminOnly: true },
  { href: "/admin/sessions", label: "세션 리플레이", icon: "📹", adminOnly: true },
  { href: "/admin/emergency", label: "Emergency", icon: "🚨", adminOnly: true },
];

const EXTRA_STATIC_ROUTE_TITLES: Record<string, string> = {
  "/login": "로그인",
  "/signup": "회원가입",
  "/onboarding": "Onboarding",
  "/chat/terminal": "Chat Terminal",
  "/server-status": "Server Status",
  "/memory": "Memory",
  "/genspark": "Genspark",
};

export const STATIC_ROUTE_TITLES: Record<string, string> = {
  ...Object.fromEntries(APP_NAV_ITEMS.map((item) => [item.href, item.pageTitle || item.label])),
  ...EXTRA_STATIC_ROUTE_TITLES,
};

export const DYNAMIC_ROUTE_TITLES: RouteTitleRule[] = [
  { pattern: /^\/design\/modifications\/new$/, title: "새 디자인 요청" },
  { pattern: /^\/design\/modifications\/([^/]+)\/context$/, title: "디자인 컨텍스트" },
  { pattern: /^\/design\/modifications\/([^/]+)\/workbench$/, title: "디자인 워크벤치" },
  { pattern: /^\/invite\/accept$/, title: "초대 수락" },
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

export function resolveRouteTitle(pathname: string): string {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const exact = STATIC_ROUTE_TITLES[cleanPath];
  if (exact) return exact;
  for (const rule of DYNAMIC_ROUTE_TITLES) {
    const match = cleanPath.match(rule.pattern);
    if (!match) continue;
    return typeof rule.title === "function" ? rule.title(match) : rule.title;
  }
  return fallbackRouteTitle(cleanPath);
}
