"use client";
import { useState } from "react";
import Header from "@/components/Header";

const GENSPARK_URL = "https://www.genspark.ai/";

export default function GensparkPage() {
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Genspark AI" />
      {iframeError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
            Genspark AI는 iframe 임베딩을 지원하지 않습니다.
          </p>
          <a
            href={GENSPARK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            🌐 새 탭에서 Genspark AI 열기
          </a>
        </div>
      ) : (
        <iframe
          src={GENSPARK_URL}
          className="flex-1 w-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          onError={() => setIframeError(true)}
          title="Genspark AI"
        />
      )}
    </div>
  );
}
