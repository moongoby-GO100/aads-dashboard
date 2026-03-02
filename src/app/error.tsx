"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl mb-4">⚠️</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">오류가 발생했습니다</h2>
        <p className="text-sm text-gray-500 mb-6">{error.message || "알 수 없는 오류"}</p>
        <button onClick={reset} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          다시 시도
        </button>
      </div>
    </div>
  );
}
