const API_BASE = typeof window !== "undefined"
  ? "/api/v1"
  : (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1");

export const TOKEN_KEY = "aads_token";
const COOKIE_MAX_AGE = 24 * 7 * 3600; // 7일로 변경
const ME_CACHE_TTL_MS = 30_000;

let cachedMe: { token: string; user: CurrentUser; expiresAt: number } | null = null;

export type TeamInviteRole = "admin" | "member" | "viewer";

export interface TeamInviteInput {
  email: string;
  role: TeamInviteRole;
}

export interface RegisterOptions {
  organizationName?: string;
  teamInvites?: TeamInviteInput[];
}

export interface TenantSummary {
  tenant_id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  role: TeamInviteRole | "owner";
  membership_status: string;
  metadata?: Record<string, unknown>;
}

export interface TenantInvite {
  invite_id: string;
  tenant_id: string;
  email: string;
  role: TeamInviteRole;
  status: string;
  expires_at?: string;
  created_at?: string;
  token?: string;
  invited_by_email?: string;
}

export interface TenantMember {
  membership_id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  name?: string | null;
  role: TeamInviteRole | "owner";
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface TenantListResponse {
  current_tenant_id: string;
  tenants: TenantSummary[];
}

export interface CurrentUser {
  user_id: string;
  email: string;
  is_admin?: boolean;
  is_internal_admin?: boolean;
  tenant_id?: string | null;
  tenant_role?: string | null;
  user_role?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  tenant?: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    status: string;
  } | null;
  membership?: {
    tenant_id: string;
    user_id: string;
    role: string;
    status: string;
  } | null;
}

function setTokenCookie(token: string) {
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function syncTokenCookieFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) setTokenCookie(token);
  return token;
}

function clearTokenCookie() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

let _refreshLock: Promise<string | null> | null = null;

export async function refreshAuthToken(tokenOverride?: string | null): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (_refreshLock) return _refreshLock;
  _refreshLock = _doRefreshAuthToken(tokenOverride);
  try {
    return await _refreshLock;
  } finally {
    _refreshLock = null;
  }
}

async function _doRefreshAuthToken(tokenOverride?: string | null): Promise<string | null> {
  const token = tokenOverride || syncTokenCookieFromStorage();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
    cachedMe = null;
    return data.token;
  } catch {
    return null;
  }
}

export async function isAuthSessionStillValid(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const token = syncTokenCookieFromStorage();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) return true;
    if (res.status !== 401) return true;
    const refreshed = await refreshAuthToken(token);
    if (!refreshed) return false;
    const retry = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${refreshed}` },
      cache: "no-store",
    });
    return retry.ok;
  } catch {
    // Network or transient API failures must not be treated as confirmed logout.
    return true;
  }
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

export async function getMe(): Promise<CurrentUser | null> {
  if (typeof window === "undefined") return null;
  const token = syncTokenCookieFromStorage();
  if (!token) return null;
  const now = Date.now();
  if (cachedMe && cachedMe.token === token && cachedMe.expiresAt > now) {
    return cachedMe.user;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const refreshed = await refreshAuthToken(token);
      if (refreshed) {
        const retryRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${refreshed}` },
        });
        if (retryRes.ok) {
          const user = await retryRes.json();
          cachedMe = { token: refreshed, user, expiresAt: Date.now() + ME_CACHE_TTL_MS };
          return user;
        }
      }
      return null;
    }
    if (!res.ok) return null;
    const user = await res.json();
    cachedMe = { token, user, expiresAt: now + ME_CACHE_TTL_MS };
    return user;
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      void fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    clearTokenCookie();
  }
  cachedMe = null;
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
): Promise<{ token: string; tenant?: TenantSummary; invites: TenantInvite[] }> {
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
  return { token: data.token || token, tenant: data.tenant, invites: data.invites || [] };
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return syncTokenCookieFromStorage();
}

function requireToken(): string {
  const token = getToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = requireToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `API error ${res.status}` }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

export async function listTenants(): Promise<TenantListResponse> {
  return authRequest<TenantListResponse>("/auth/tenants");
}

export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const data = await authRequest<{ members: TenantMember[] }>(`/auth/tenants/${tenantId}/members`);
  return data.members || [];
}

export async function listTenantInvites(tenantId: string): Promise<TenantInvite[]> {
  const data = await authRequest<{ invites: TenantInvite[] }>(`/auth/tenants/${tenantId}/invites`);
  return data.invites || [];
}

export async function createTenantInvite(
  tenantId: string,
  invite: TeamInviteInput,
  expiresInHours = 24 * 7,
): Promise<TenantInvite> {
  return authRequest<TenantInvite>(`/auth/tenants/${tenantId}/invites`, {
    method: "POST",
    body: JSON.stringify({
      email: invite.email.trim(),
      role: invite.role,
      expires_in_hours: expiresInHours,
    }),
  });
}

export async function switchTenant(tenantId: string): Promise<string> {
  const data = await authRequest<{ token: string }>(`/auth/tenants/${tenantId}/switch`, { method: "POST" });
  if (typeof window !== "undefined" && data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
  }
  return data.token;
}

export async function acceptInvite(token: string, password: string, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, name: name.trim() || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "초대 수락 실패" }));
    throw new Error(err.detail || "초대 수락 실패");
  }
  const data = await res.json();
  if (typeof window !== "undefined" && data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setTokenCookie(data.token);
  }
  return data.token;
}
