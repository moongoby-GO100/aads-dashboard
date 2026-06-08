const API_BASE = typeof window !== "undefined"
  ? "/api/v1"
  : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");

export const TOKEN_KEY = "aads_token";
const COOKIE_MAX_AGE = 24 * 7 * 3600; // 7일로 변경

export type TeamInviteRole = "admin" | "member" | "viewer";

export interface TeamInviteInput {
  email: string;
  role: TeamInviteRole;
}

export interface RegisterOptions {
  organizationName?: string;
  teamInvites?: TeamInviteInput[];
}

function setTokenCookie(token: string) {
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearTokenCookie() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
  }
  return data.token;
}

export async function getMe(): Promise<{ user_id: string; email: string } | null> {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { logout(); return null; }
    return res.json();
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    clearTokenCookie();
  }
}

export async function register(
  email: string,
  password: string,
  name: string,
  options: RegisterOptions = {},
): Promise<string> {
  const teamInvites = (options.teamInvites || [])
    .map((invite) => ({ email: invite.email.trim(), role: invite.role }))
    .filter((invite) => invite.email);
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name,
      organization_name: options.organizationName?.trim() || undefined,
      team_invites: teamInvites,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "회원가입 실패" }));
    throw new Error(err.detail || "회원가입 실패");
  }
  const data = await res.json();
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
  }
  return data.token;
}

export async function completeOnboarding(
  organizationName: string,
  teamInvites: TeamInviteInput[],
): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  const res = await fetch(`${API_BASE}/auth/onboarding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      organization_name: organizationName,
      team_invites: teamInvites
        .map((invite) => ({ email: invite.email.trim(), role: invite.role }))
        .filter((invite) => invite.email),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "온보딩 저장 실패" }));
    throw new Error(err.detail || "온보딩 저장 실패");
  }

  const data = await res.json();
  if (typeof window !== "undefined" && data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
  }
  return data.token || token;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
