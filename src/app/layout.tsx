import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const geist = Geist({ subsets: ["latin"] });

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
    themeColor: isKakaobot ? "#FFE812" : "#00d4ff",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <script dangerouslySetInnerHTML={{ __html: `if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}` }} />
      </head>
      <body className={geist.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
