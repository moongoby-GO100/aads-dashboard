"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initGlobalErrorHandlers } from "@/services/errorReporter";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isKakaobot, setIsKakaobot] = useState(false);
  const pathname = usePathname();

  useEffect(() => { initGlobalErrorHandlers(); }, []);
  useEffect(() => { setIsKakaobot(window.location.hostname.includes("kakaobot")); }, []);

  const hideSidebar =
    pathname === "/login" ||
    pathname === "/signup" ||
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
