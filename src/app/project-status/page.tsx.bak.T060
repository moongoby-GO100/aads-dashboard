"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function ProjectStatusPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProjectDashboard()
      .then((r) => setProjects(r.projects ?? r ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Project Status" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>프로젝트 현황</h1>
          <Link href="/" className="text-xs" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        {loading && (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        )}
        {error && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
            API 오류: {error}
          </div>
        )}

        {!loading && projects.length === 0 && !error && (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            프로젝트 데이터가 없습니다.
          </div>
        )}

        <div className="space-y-3">
          {projects.map((p: any) => {
            const id = p.id || p.project_id || p.name;
            return (
              <Link key={id} href={`/project-status/${id}`}
                className="block rounded-xl p-5 transition-colors"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>{p.name || p.project_id}</h2>
                  <span className="text-xs px-2 py-1 rounded font-semibold"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    {p.status || "active"}
                  </span>
                </div>
                {/* 진행률 바 */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    <span>진행률</span>
                    <span>{p.progress ?? 0}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-2 rounded-full transition-all" style={{ background: "var(--accent)", width: `${p.progress ?? 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {p.conversation_count !== undefined && (
                    <span>💬 대화: {p.conversation_count}</span>
                  )}
                  {p.server && <span>🖥 서버: {p.server}</span>}
                  {p.manager && <span>👤 매니저: {p.manager}</span>}
                  {p.last_activity && <span>🕐 {p.last_activity}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
