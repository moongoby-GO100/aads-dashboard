"use client";
import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";

function LoginForm({ isKakaobot }: { isKakaobot: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // AADS-AUTH-401: 세션 만료로 리다이렉트된 경우 안내 배너
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "session_expired") {
      setError("세션이 만료되었습니다. 다시 로그인해주세요.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await login(email, password);
      const redirect = searchParams.get("redirect") || searchParams.get("next") || "/";
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2";
  const inputStyle = isKakaobot
    ? { borderColor: "#E5E7EB", color: "#1A1A1A" }
    : { color: "#111827", backgroundColor: "#fff" };
  const focusRingClass = isKakaobot ? "focus:ring-yellow-400" : "focus:ring-blue-500 border-gray-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: isKakaobot ? "#1A1A1A" : "#374151" }}>이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="user@example.com"
          className={`${inputClass} ${focusRingClass}`}
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: isKakaobot ? "#1A1A1A" : "#374151" }}>비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={`${inputClass} ${focusRingClass}`}
          style={inputStyle}
        />
      </div>
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors"
        style={isKakaobot
          ? { background: "#FFE812", color: "#3C1E1E", fontWeight: "600" }
          : { background: "#2563eb", color: "#fff" }
        }
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>
      <p className="text-center text-sm mt-4" style={{ color: isKakaobot ? "#6B7280" : "#6B7280" }}>
        계정이 없으신가요?{" "}
        <Link href="/signup" className="hover:underline font-medium" style={{ color: isKakaobot ? "#3C1E1E" : "#2563eb" }}>
          회원가입
        </Link>
      </p>
    </form>
  );
}

function LoginPageInner() {
  const [isKakaobot, setIsKakaobot] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsKakaobot(window.location.hostname.includes("kakaobot"));
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (isKakaobot) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, #FFF9DB 0%, #FFF3A3 50%, #FAFAFA 100%)" }}
      >
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 w-full max-w-sm sm:max-w-md" style={{ border: "1px solid #E5E7EB" }}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-yellow-400 rounded-xl px-4 py-2 mb-3" style={{ background: "#FFE812" }}>
              <span style={{ fontSize: "22px" }}>💬</span>
              <span style={{ fontSize: "18px", fontWeight: "700", color: "#3C1E1E" }}>카카오봇</span>
            </div>
            <p className="text-sm mt-1" style={{ color: "#6B7280" }}>AI 기반 카카오톡 자동 메시지 서비스</p>
          </div>
          <Suspense fallback={<div className="text-center text-sm" style={{ color: "#6B7280" }}>로딩 중...</div>}>
            <LoginForm isKakaobot={true} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 w-full max-w-sm sm:max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-600">AADS</h1>
          <p className="text-sm text-gray-500 mt-1">Autonomous AI Development System</p>
        </div>
        <Suspense fallback={<div className="text-center text-gray-400 text-sm">로딩 중...</div>}>
          <LoginForm isKakaobot={false} />
        </Suspense>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">로딩 중...</div></div>}>
      <LoginPageInner />
    </Suspense>
  );
}
