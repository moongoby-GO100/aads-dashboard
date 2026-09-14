export type NavGroup =
  | "대화·결정"
  | "문서·기록"
  | "일·프로젝트"
  | "운영·서버"
  | "자동화"
  | "사람·고객"
  | "관리자"
  | "설정"
  | "기타";

// 묶음 순서. 자주 여는 것을 위에 둔다 — 7일 실사용 기준(/chat 113회,
// /reports 17회, 나머지는 3~8회).
export const NAV_GROUP_ORDER: NavGroup[] = [
  "대화·결정",
  "문서·기록",
  "일·프로젝트",
  "운영·서버",
  "자동화",
  "사람·고객",
  "관리자",
  "설정",
  "기타",
];

export type AppNavItem = {
  href: string;
  label: string;
  icon: string;
  group?: NavGroup;
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
  { href: "/", label: "Dashboard", icon: "🏠", adminOnly: true, group: "관리자" },
  { href: "/home", label: "고객 홈", icon: "🏠", group: "대화·결정" },
  { href: "/chat", label: "AI Chat", icon: "💬", highlight: true, group: "대화·결정" },
  { href: "/assistant", label: "Assistant Hub", icon: "🧭", adminOnly: true, group: "대화·결정" },
  { href: "/braming", label: "브레인스토밍", icon: "🧠", adminOnly: true, group: "대화·결정" },
  { href: "/project-status", label: "Project Status", icon: "📊", adminOnly: true, group: "일·프로젝트" },
  { href: "/conversations", label: "Conversations", icon: "🗨️", adminOnly: true, group: "대화·결정" },
  { href: "/channels", label: "대화창 관리", icon: "📌", adminOnly: true, group: "대화·결정" },
  { href: "/managers", label: "Managers", icon: "👥", adminOnly: true, group: "사람·고객" },
  { href: "/team", label: "Team", icon: "👥", adminOnly: true, group: "사람·고객" },
  { href: "/agenda", label: "아젠다", icon: "📌", adminOnly: true, group: "일·프로젝트" },
  { href: "/marketing/ably", label: "에이블리 광고분석", icon: "📈", adminOnly: true, group: "사람·고객" },
  { href: "/decisions", label: "CEO Decisions", icon: "🎯", adminOnly: true, group: "대화·결정" },
  { href: "/tasks", label: "Tasks", icon: "📋", adminOnly: true, group: "일·프로젝트" },
  { href: "/goals", label: "Goal Control", icon: "🎯", adminOnly: true, group: "일·프로젝트" },
  { href: "/docs", label: "문서 통합", icon: "📄", adminOnly: true, group: "문서·기록" },
  { href: "/handovers", label: "핸드오버", icon: "🧾", adminOnly: true, group: "일·프로젝트" },
  { href: "/design/modifications", label: "Design Studio", icon: "🎨", adminOnly: true, group: "자동화" },
  { href: "/projects", label: "Pipeline", icon: "🔧", adminOnly: true, group: "일·프로젝트" },
  { href: "/ops", label: "운영 현황", icon: "📊", adminOnly: true, group: "운영·서버" },
  { href: "/ops/recovery", label: "Recovery", icon: "🔄", adminOnly: true, group: "운영·서버" },
  { href: "/ops/servers", label: "Servers", icon: "🖥️", adminOnly: true, group: "운영·서버" },
  { href: "/ops/memory", label: "메모리", icon: "🧠", adminOnly: true, group: "운영·서버" },
  { href: "/ops/pc-agents", label: "PC Agent", icon: "💻", adminOnly: true, group: "운영·서버" },
  { href: "/browser-tasks", label: "브라우저 실행", icon: "🌐", adminOnly: true, group: "자동화" },
  { href: "/authenticated-collector", label: "로그인 수집 허브", icon: "🔐", adminOnly: true, group: "자동화" },
  { href: "/agent-vault", label: "Agent Vault", icon: "🔐", adminOnly: true, group: "자동화" },
  { href: "/ops/mobile-agent", label: "Mobile Agent", icon: "📱", adminOnly: true, group: "운영·서버" },
  { href: "/ops/traces", label: "LLM Traces", icon: "🔍", adminOnly: true, group: "운영·서버" },
  { href: "/ops/evals", label: "LLM 평가", icon: "📐", adminOnly: true, group: "운영·서버" },
  { href: "/lessons", label: "교훈", icon: "💡", adminOnly: true, group: "일·프로젝트" },
  { href: "/flow", label: "FLOW", icon: "🔄", adminOnly: true, group: "일·프로젝트" },
  { href: "/reports", label: "Reports", icon: "📊", adminOnly: true, group: "문서·기록" },
  { href: "/kakaobot", label: "KakaoBot", icon: "💬", adminOnly: true, group: "사람·고객" },
  { href: "/settings/api-keys", label: "AI API", icon: "🔑", group: "설정" },
  { href: "/settings/servers", label: "내 서버 실행", icon: "🖥️", group: "설정" },
  { href: "/settings", label: "Settings", icon: "⚙️", group: "설정" },
  { href: "/admin/users", label: "사용자 현황", icon: "👤", adminOnly: true, group: "관리자" },
  { href: "/admin/prompts", label: "Prompts", icon: "📝", adminOnly: true, group: "관리자" },
  { href: "/admin/tasks", label: "Task Board", icon: "🗂️", adminOnly: true, group: "관리자" },
  { href: "/admin/agents", label: "Agent Registry", icon: "🧩", adminOnly: true, group: "관리자" },
  { href: "/admin/governance", label: "Governance", icon: "🏛️", adminOnly: true, group: "관리자" },
  { href: "/admin/model-routing", label: "모델 라우팅", icon: "🧭", adminOnly: true, group: "관리자" },
  { href: "/admin/model-parity", label: "모델 패리티", icon: "⚖️", adminOnly: true, group: "관리자" },
  { href: "/education/index.html", label: "교육자료 포털", icon: "📘", adminOnly: true, external: true, group: "문서·기록" },
  { href: "/exports/llm-models-current.html", label: "LLM 모델 현황 2026", icon: "🤖", adminOnly: true, external: true, group: "문서·기록" },
  { href: "/admin/deploy", label: "배포 현황", icon: "🚀", adminOnly: true, group: "관리자" },
  { href: "/approvals", label: "승인 대기", icon: "✅", adminOnly: true, group: "운영·서버" },
  { href: "/changes", label: "변경 이력", icon: "📝", adminOnly: true, group: "문서·기록" },
  { href: "/graph", label: "지식 그래프", icon: "🕸️", adminOnly: true, group: "문서·기록" },
  { href: "/admin/app-settings", label: "오비스 앱 설정", icon: "📱", adminOnly: true, group: "관리자" },
  { href: "/admin/loops", label: "루프 관리", icon: "🔁", adminOnly: true, group: "관리자" },
  { href: "/admin/sessions", label: "세션 리플레이", icon: "📹", adminOnly: true, group: "관리자" },
  { href: "/admin/emergency", label: "Emergency", icon: "🚨", adminOnly: true, group: "관리자" },
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
