"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, type TeamInviteInput, type TeamInviteRole } from "@/lib/auth";

const ROLE_OPTIONS: { value: TeamInviteRole; label: string }[] = [
  { value: "member", label: "멤버" },
  { value: "admin", label: "관리자" },
  { value: "viewer", label: "뷰어" },
];

function emptyInvite(): TeamInviteInput {
  return { email: "", role: "member" };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [teamInvites, setTeamInvites] = useState<TeamInviteInput[]>([emptyInvite()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      await completeOnboarding(organizationName, teamInvites);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "온보딩 저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <main className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-lg sm:p-8">
        <header className="mb-6">
          <p className="text-sm font-medium text-blue-600">AADS 온보딩</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">조직과 팀 권한 설정</h1>
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
              <h2 className="text-sm font-semibold text-gray-800">팀원 초대</h2>
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
      </main>
    </div>
  );
}
