import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export async function generateViewport(): Promise<Viewport> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isKakaobot = host.includes("kakaobot");

  return {
    themeColor: isKakaobot ? "#FFE812" : "#00d4ff",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "resizes-content",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isKakaobot = host.includes("kakaobot");

  return {
    title: isKakaobot ? "카카오봇 — AI 메시지 서비스" : "AADS Dashboard",
    description: isKakaobot ? "AI 기반 카카오톡 자동 메시지 서비스" : "Autonomous AI Development System — Phase 2 Dashboard",
    manifest: isKakaobot ? "/manifest-kakaobot.json" : "/manifest.json",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: isKakaobot ? "카카오봇" : "AADS",
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}` }} />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
