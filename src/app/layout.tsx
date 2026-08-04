import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export async function generateViewport(): Promise<Viewport> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isKakaobot = host.includes("kakaobot");
  const isUnniNaengmyeon = host.split(":")[0] === "unni.newtalk.kr";
  const isGomyungheeNaengmyeon = host.split(":")[0] === "gomyunghee.newtalk.kr";

  return {
    themeColor: isKakaobot ? "#FFE812" : isUnniNaengmyeon || isGomyungheeNaengmyeon ? "#f45d48" : "#00d4ff",
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
  const isUnniNaengmyeon = host.split(":")[0] === "unni.newtalk.kr";
  const isGomyungheeNaengmyeon = host.split(":")[0] === "gomyunghee.newtalk.kr";

  if (isUnniNaengmyeon || isGomyungheeNaengmyeon) {
    const isGomyunghee = isGomyungheeNaengmyeon;
    return {
      title: isGomyunghee ? "고명희냉면 | 배달 냉면" : "언니냉면 | 성신여대 배달 냉면",
      description: isGomyunghee ? "배달전문 냉면 브랜드, 고명희냉면입니다." : "성신여대 앞 배달전문 냉면 브랜드, 언니냉면입니다.",
      icons: {
        icon: [{ url: isGomyunghee ? "/brands/gomyunghee-naengmyeon/logo.svg" : "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png", type: isGomyunghee ? "image/svg+xml" : "image/png" }],
        apple: [{ url: isGomyunghee ? "/brands/gomyunghee-naengmyeon/logo.svg" : "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png" }],
      },
      appleWebApp: { capable: true, statusBarStyle: "default", title: isGomyunghee ? "고명희냉면" : "언니냉면" },
    };
  }

  return {
    title: isKakaobot ? "카카오봇 - AI 메시지 서비스" : "OHVIS",
    description: isKakaobot ? "AI 기반 카카오톡 자동 메시지 서비스" : "OHVIS AI Assistant",
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
      title: isKakaobot ? "카카오봇" : "OHVIS",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isUnniNaengmyeon = host.split(":")[0] === "unni.newtalk.kr";
  const isGomyungheeNaengmyeon = host.split(":")[0] === "gomyunghee.newtalk.kr";

  return (
    <html lang="ko">
      <head>
        {!isUnniNaengmyeon && !isGomyungheeNaengmyeon && (
          <script dangerouslySetInnerHTML={{ __html: `if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}` }} />
        )}
      </head>
      <body>
        <ClientLayout isPublicHost={isUnniNaengmyeon || isGomyungheeNaengmyeon}>{children}</ClientLayout>
      </body>
    </html>
  );
}
