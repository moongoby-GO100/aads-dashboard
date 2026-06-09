"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, type TeamInviteInput, type TeamInviteRole, type TenantInvite } from "@/lib/auth";

const ROLE_OPTIONS: { value: TeamInviteRole; label: string }[] = [
  { value: "member", label: "멤버 - 실행 가능" },
  { value: "admin", label: "관리자 - 설정 가능" },
  { value: "viewer", label: "뷰어 - 읽기 전용" },
];

function emptyInvite(): TeamInviteInput {
  return { email: "", role: "member" };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [teamInvites, setTeamInvites] = useState<TeamInviteInput[]>([emptyInvite()]);
  const [createdInvites, setCreatedInvites] = useState<TenantInvite[]>([]);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const buildInviteLink = (token?: string) => {
    if (!token || typeof window === "undefined") return "";
    return `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
  };

  const copyInviteLink = async (invite: TenantInvite) => {
    const link = buildInviteLink(invite.token);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedInviteId(invite.invite_id);
    window.setTimeout(() => setCopiedInviteId(null), 1600);
  };

  const updateInvite = (index: number, patch: Partial<TeamInviteInput>) => {
    setTeamInvites((current) =>
      current.map((invite, inviteIndex) => (inviteIndex === index ? { ...invite, ...patch } : invite)),
    );
  };

  const removeInvite = (index: number) => {
    setTeamInvites((current) => current.filter((_, inviteIndex) => inviteIndex !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!organizationName.trim()) {
      setError("조직명을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const normalizedInvites = teamInvites
        .map((invite) => ({ email: invite.email.trim(), role: invite.role }))
        .filter((invite) => invite.email);
      const result = await completeOnboarding(organizationName.trim(), normalizedInvites);
      if (result.invites.length > 0) {
        setCreatedInvites(result.invites);
        return;
      }
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "온보딩 저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <main className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg sm:p-8">
        <header className="mb-6">
          <p className="text-sm font-medium text-blue-600">AADS 온보딩</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">조직과 팀 권한 설정</h1>
          <p className="mt-2 text-sm text-gray-600">
            채팅 워크스페이스는 이 조직의 tenant membership 역할을 기준으로 접근 권한이 결정됩니다.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">조직명</span>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
              placeholder="예: Moon Studio"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">팀원 초대와 권한 역할</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  초대하지 않아도 시작할 수 있으며, 팀원은 선택한 역할로 이 조직에만 추가됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTeamInvites((current) => [...current, emptyInvite()])}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                추가
              </button>
            </div>

            <div className="space-y-2">
              {teamInvites.map((invite, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px_72px]">
                  <input
                    type="email"
                    value={invite.email}
                    onChange={(e) => updateInvite(index, { email: e.target.value })}
                    placeholder="team@example.com"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={invite.role}
                    onChange={(e) => updateInvite(index, { role: e.target.value as TeamInviteRole })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeInvite(index)}
                    disabled={teamInvites.length === 1}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "저장 중..." : "시작하기"}
            </button>
          </div>
        </form>

        {createdInvites.length > 0 && (
          <section className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-950">초대 링크 생성 완료</h2>
                <p className="mt-1 text-xs text-gray-600">링크는 지금 화면에서만 전체 token을 확인할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/chat")}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                채팅으로 이동
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {createdInvites.map((invite) => {
                const link = buildInviteLink(invite.token);
                return (
                  <div key={invite.invite_id} className="rounded-lg border border-blue-100 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-950">{invite.email}</p>
                        <p className="text-xs text-gray-500">{invite.role} · {invite.expires_at ? new Date(invite.expires_at).toLocaleString("ko-KR") : "만료일 없음"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyInviteLink(invite)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {copiedInviteId === invite.invite_id ? "복사됨" : "링크 복사"}
                      </button>
                    </div>
                    <p className="mt-2 break-all rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{link}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
