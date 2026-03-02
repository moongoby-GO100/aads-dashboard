"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Header({ title }: { title: string }) {
  const [health, setHealth] = useState<string>("checking...");

  useEffect(() => {
    api.getHealth()
      .then(() => setHealth("✅ API 연결"))
      .catch(() => setHealth("❌ API 오프라인"));
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <span className="text-sm text-gray-500">{health}</span>
    </header>
  );
}
