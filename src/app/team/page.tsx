"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTenantInvite,
  listTenantInvites,
  listTenantMembers,
  listTenants,
  switchTenant,
  type TeamInviteInput,
  type TeamInviteRole,
  type TenantInvite,
  type TenantMember,
  type TenantSummary,
} from "@/lib/auth";

const ROLE_OPTIONS: { value: TeamInviteRole; label: string }[] = [
  { value: "member", label: "멤버" },
  { value: "admin", label: "관리자" },
  { value: "viewer", label: "뷰어" },
];

function canInvite(role?: string) {
  return role === "owner" || role === "admin";
}

function roleLabel(role?: string) {
  if (role === "owner") return "소유자";
  if (role === "admin") return "관리자";
  if (role === "member") return "멤버";
  if (role === "viewer") return "뷰어";
  return role || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function TeamPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState("");
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TenantInvite[]>([]);
  const [createdInvites, setCreatedInvites] = useState<TenantInvite[]>([]);
  const [invite, setInvite] = useState<TeamInviteInput>({ email: "", role: "member" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const currentTenant = useMemo(
    () => tenants.find((tenant) => tenant.tenant_id === currentTenantId),
    [currentTenantId, tenants],
  );
  const inviteAllowed = canInvite(currentTenant?.role) && currentTenant?.kind !== "internal";

  const buildInviteLink = useCallback((token?: string) => {
    if (!token || !origin) return "";
    return `${origin}/invite/accept?token=${encodeURIComponent(token)}`;
  }, [origin]);

  const copyInviteLink = async (item: TenantInvite) => {
    const link = buildInviteLink(item.token);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedId(item.invite_id);
    window.setTimeout(() => setCopiedId(null), 1400);
  };

  const loadTeam = useCallback(async (tenantId?: string) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const tenantData = await listTenants();
      const nextTenantId = tenantId || tenantData.current_tenant_id || tenantData.tenants[0]?.tenant_id || "";
      setTenants(tenantData.tenants || []);
      setCurrentTenantId(nextTenantId);
      if (!nextTenantId) {
        setMembers([]);
        setPendingInvites([]);
        return;
      }

      const selected = (tenantData.tenants || []).find((item) => item.tenant_id === nextTenantId);
      const [memberRows, inviteRows] = await Promise.all([
        listTenantMembers(nextTenantId),
        canInvite(selected?.role) && selected?.kind !== "internal"
          ? listTenantInvites(nextTenantId).catch(() => [])
          : Promise.resolve([]),
      ]);
      setMembers(memberRows);
      setPendingInvites(inviteRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "팀 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void loadTeam();
  }, [loadTeam]);

  const handleTenantChange = async (tenantId: string) => {
    if (!tenantId || tenantId === currentTenantId) return;
    setLoading(true);
    setError("");
    try {
      await switchTenant(tenantId);
      setCreatedInvites([]);
      await loadTeam(tenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조직 전환 실패");
      setLoading(false);
    }
  };

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentTenantId || !inviteAllowed) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createTenantInvite(currentTenantId, invite);
      setCreatedInvites((current) => [created, ...current]);
      setInvite({ email: "", role: "member" });
      setMessage("초대 링크가 생성되었습니다.");
      await loadTeam(currentTenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "초대 생성 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <main className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>AADS Team</p>
            <h1 className="mt-1 text-2xl font-bold">조직과 팀원</h1>
          </div>
          <a
            href="/onboarding"
            className="inline-flex w-fit items-center rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            온보딩 열기
          </a>
        </header>

        <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_140px] md:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>현재 조직</span>
              <select
                value={currentTenantId}
                onChange={(event) => void handleTenantChange(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.tenant_id} value={tenant.tenant_id}>
                    {tenant.name} ({roleLabel(tenant.role)})
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>역할</span>
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                {roleLabel(currentTenant?.role)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadTeam(currentTenantId)}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              새로고침
            </button>
          </div>
        </section>

        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        {message && <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">{message}</p>}

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={submitInvite} className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-base font-semibold">팀원 초대</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>이메일</span>
                <input
                  type="email"
                  required
                  value={invite.email}
                  onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))}
                  disabled={!inviteAllowed}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  placeholder="team@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>권한</span>
                <select
                  value={invite.role}
                  onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value as TeamInviteRole }))}
                  disabled={!inviteAllowed}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ background: "var(--bg-primary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={!inviteAllowed || saving || !invite.email.trim()}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {saving ? "생성 중..." : "초대 링크 생성"}
              </button>
              {!inviteAllowed && (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  customer 조직의 owner/admin만 팀원을 초대할 수 있습니다.
                </p>
              )}
            </div>

            {createdInvites.length > 0 && (
              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold">방금 생성한 링크</h3>
                {createdInvites.map((item) => {
                  const link = buildInviteLink(item.token);
                  return (
                    <div key={item.invite_id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{item.email}</span>
                        <button
                          type="button"
                          onClick={() => void copyInviteLink(item)}
                          className="shrink-0 rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {copiedId === item.invite_id ? "복사됨" : "복사"}
                        </button>
                      </div>
                      <p className="mt-2 break-all text-xs" style={{ color: "var(--text-secondary)" }}>{link}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </form>

          <div className="flex flex-col gap-5">
            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">팀원</h2>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{members.length}명</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead style={{ color: "var(--text-secondary)" }}>
                    <tr>
                      <th className="border-b py-2 pr-3 font-medium" style={{ borderColor: "var(--border)" }}>사용자</th>
                      <th className="border-b py-2 pr-3 font-medium" style={{ borderColor: "var(--border)" }}>권한</th>
                      <th className="border-b py-2 pr-3 font-medium" style={{ borderColor: "var(--border)" }}>상태</th>
                      <th className="border-b py-2 font-medium" style={{ borderColor: "var(--border)" }}>추가일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.membership_id}>
                        <td className="border-b py-2 pr-3" style={{ borderColor: "var(--border)" }}>
                          <div className="font-medium">{member.email}</div>
                          {member.name && <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{member.name}</div>}
                        </td>
                        <td className="border-b py-2 pr-3" style={{ borderColor: "var(--border)" }}>{roleLabel(member.role)}</td>
                        <td className="border-b py-2 pr-3" style={{ borderColor: "var(--border)" }}>{member.status}</td>
                        <td className="border-b py-2" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>{formatDate(member.created_at)}</td>
                      </tr>
                    ))}
                    {!loading && members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                          팀원이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">대기 중인 초대</h2>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{pendingInvites.length}건</span>
              </div>
              <div className="space-y-2">
                {pendingInvites.map((item) => (
                  <div key={item.invite_id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_90px_160px]" style={{ borderColor: "var(--border)" }}>
                    <span className="truncate">{item.email}</span>
                    <span>{roleLabel(item.role)}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{formatDate(item.expires_at)}</span>
                  </div>
                ))}
                {!loading && pendingInvites.length === 0 && (
                  <p className="py-4 text-sm" style={{ color: "var(--text-secondary)" }}>대기 중인 초대가 없습니다.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
