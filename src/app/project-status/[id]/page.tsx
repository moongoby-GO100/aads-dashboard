"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import Header from "@/components/Header";

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [project, setProject] = useState<any>(null);
  const [inbox, setInbox] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProjectDetail(id).then(setProject).catch((e) => setError(e.message)),
      api.getManagerInbox(id).then(setInbox).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const conversations: any[] = project?.conversations ?? project?.recent_conversations ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title={`프로젝트: ${id}`} />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/project-status" className="text-xs" style={{ color: "var(--accent)" }}>← Project Status</Link>
        </div>

        {loading && (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        )}
        {error && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
            API 오류: {error}
          </div>
        )}

        {project && (
          <>
            {/* 프로젝트 헤더 */}
            <div className="rounded-xl p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{project.name || id}</h1>
                  <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {project.manager && <span>👤 매니저: {project.manager}</span>}
                    {project.server && <span>🖥 서버: {project.server}</span>}
                    <span className="px-2 py-0.5 rounded" style={{ background: "var(--bg-hover)" }}>{project.status || "active"}</span>
                  </div>
                </div>
                {project.handover_url && (
                  <a href={project.handover_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded font-semibold"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    HANDOVER
                  </a>
                )}
              </div>
              {/* 진행률 바 */}
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  <span>진행률</span>
                  <span>{project.progress ?? 0}%</span>
                </div>
                <div className="h-2.5 rounded-full" style={{ background: "var(--bg-hover)" }}>
                  <div className="h-2.5 rounded-full" style={{ background: "var(--accent)", width: `${project.progress ?? 0}%` }} />
                </div>
              </div>
            </div>

            {/* 최근 대화 타임라인 */}
            {conversations.length > 0 && (
              <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="font-semibold mb-3 text-sm" style={{ color: "var(--text-primary)" }}>최근 대화 타임라인</h2>
                <div className="space-y-3">
                  {conversations.map((c: any, i: number) => (
                    <div key={c.id || i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full mt-1" style={{ background: "var(--accent)" }} />
                        {i < conversations.length - 1 && <div className="w-0.5 flex-1 my-1" style={{ background: "var(--border)" }} />}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>{c.logged_at || c.updated_at}</p>
                        <p className="text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>{c.snapshot || "(내용 없음)"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 매니저 inbox 요약 */}
            {inbox && (
              <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="font-semibold mb-3 text-sm" style={{ color: "var(--text-primary)" }}>매니저 Inbox 요약</h2>
                <pre className="text-xs overflow-auto" style={{ color: "var(--text-secondary)" }}>
                  {JSON.stringify(inbox, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
