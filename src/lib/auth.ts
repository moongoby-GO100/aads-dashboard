const API_BASE = typeof window !== "undefined"
  ? "/api/v1"
  : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");

export const TOKEN_KEY = "aads_token";
const COOKIE_MAX_AGE = 24 * 3600;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
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

export async function register(email: string, password: string, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || getCookie(TOKEN_KEY);
}
