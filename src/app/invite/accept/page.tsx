"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { acceptInvite } from "@/lib/auth";

function InviteAcceptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(searchParams.get("token") || "");
  }, [searchParams]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token.trim()) {
      setError("초대 token이 필요합니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite(token.trim(), password, name);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "초대 수락 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">초대 token</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="초대 링크의 token"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">이름</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="홍길동"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">비밀번호 확인</span>
        <input
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "수락 중..." : "초대 수락"}
      </button>
    </form>
  );
}

export default function InviteAcceptPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <main className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg sm:p-8">
        <header className="mb-6">
          <p className="text-sm font-medium text-blue-600">AADS 초대</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">팀 초대 수락</h1>
        </header>
        <Suspense fallback={<div className="text-sm text-gray-500">로딩 중...</div>}>
          <InviteAcceptForm />
        </Suspense>
        <p className="mt-4 text-center text-sm text-gray-500">
          계정이 있으면 같은 이메일의 기존 비밀번호를 입력하세요.{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">로그인</Link>
        </p>
      </main>
    </div>
  );
}
