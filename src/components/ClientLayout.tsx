"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initGlobalErrorHandlers } from "@/services/errorReporter";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  // AADS-190: 글로벌 에러 핸들러 1회 초기화
  useEffect(() => { initGlobalErrorHandlers(); }, []);

  if (pathname === "/login" || pathname.startsWith("/chat")) {
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
