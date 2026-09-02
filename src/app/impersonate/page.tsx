"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const TOKEN_KEY = "aads_token";
const COOKIE_MAX_AGE = 24 * 7 * 3600;

function ImpersonateInner() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const next = params.get("next") || "/chat";
    const redirectTo = next.startsWith("/") && !next.startsWith("//") ? next : "/chat";
    localStorage.setItem(TOKEN_KEY, token);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    window.location.href = redirectTo;
  }, [params, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-secondary)" }}>
      로그인 처리 중...
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-secondary)" }}>로그인 처리 중...</div>}>
      <ImpersonateInner />
    </Suspense>
  );
}
