"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initGlobalErrorHandlers } from "@/services/errorReporter";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isKakaobot] = useState(() =>
    typeof window !== "undefined" && window.location.hostname.includes("kakaobot"),
  );
  const pathname = usePathname();

  useEffect(() => { initGlobalErrorHandlers(); }, []);

  const hideSidebar =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/invite/accept") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/kakaobot") ||
    isKakaobot;

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar
        isOpen={isMenuOpen}
        onOpen={() => setIsMenuOpen(true)}
        onClose={() => setIsMenuOpen(false)}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
