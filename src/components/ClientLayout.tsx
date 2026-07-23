"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initGlobalErrorHandlers } from "@/services/errorReporter";
import { getMe, type CurrentUser } from "@/lib/auth";

const INTERNAL_ADMIN_PATH_PREFIXES = [
  "/",
  "/admin",
  "/assistant",
  "/project-status",
  "/conversations",
  "/channels",
  "/managers",
  "/decisions",
  "/tasks",
  "/design",
  "/projects",
  "/ops",
  "/lessons",
  "/flow",
  "/reports",
  "/server-status",
];

function isInternalAdminPath(pathname: string): boolean {
  return INTERNAL_ADMIN_PATH_PREFIXES.some((prefix) => (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

export default function ClientLayout({
  children,
  isPublicHost = false,
}: {
  children: React.ReactNode;
  isPublicHost?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isKakaobot] = useState(() =>
    typeof window !== "undefined" && window.location.hostname.includes("kakaobot"),
  );
  const isUnniNaengmyeon = isPublicHost;
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { initGlobalErrorHandlers(); }, []);

  useEffect(() => {
    let cancelled = false;
    const publicPath =
      pathname === "/login" ||
      pathname === "/signup" ||
      pathname.startsWith("/invite/accept") ||
      pathname.startsWith("/unni-naengmyeon") ||
      pathname.startsWith("/kakaobot");

    if (publicPath || isKakaobot || isUnniNaengmyeon) return;

    getMe()
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        const isInternalAdmin = Boolean(user?.is_internal_admin);
        if (isInternalAdminPath(pathname) && !isInternalAdmin) {
          router.replace("/chat");
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, [isKakaobot, isUnniNaengmyeon, pathname, router]);

  const hideSidebar =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/invite/accept") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/unni-naengmyeon") ||
    pathname.startsWith("/kakaobot") ||
    isKakaobot ||
    isUnniNaengmyeon;

  if (hideSidebar) {
    return <>{children}</>;
  }

  const isInternalAdmin = Boolean(currentUser?.is_internal_admin);
  if (!authChecked) {
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-sm text-gray-400">권한 확인 중...</div>;
  }
  if (isInternalAdminPath(pathname) && !isInternalAdmin) {
    return <div className="flex h-screen items-center justify-center bg-gray-950 text-sm text-gray-400">이동 중...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar
        isOpen={isMenuOpen}
        isInternalAdmin={isInternalAdmin}
        onOpen={() => setIsMenuOpen(true)}
        onClose={() => setIsMenuOpen(false)}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
