"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import AgentStatus from "@/components/AgentStatus";
import CheckpointList from "@/components/CheckpointList";
import CostTracker from "@/components/CostTracker";
import type { ProjectStatus } from "@/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = () => {
      api.getProjectStatus(id)
        .then(setStatus)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [id]);

  return (
    <div className="flex flex-col h-full">
      <Header title={`프로젝트 상세 #${id?.slice(0, 8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600">대시보드</Link>
          <span>/</span>
          <Link href="/projects" className="hover:text-blue-600">프로젝트</Link>
          <span>/</span>
          <span className="font-mono">{id?.slice(0, 8)}</span>
          <span className="ml-2">
            <Link href={`/projects/${id}/stream`} className="text-blue-600 hover:underline text-xs">
              📡 실시간 모니터 →
            </Link>
          </span>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : error ? (
          <div className="text-center text-red-500 py-12">{error}</div>
        ) : status ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AgentStatus currentAgent={status.current_agent} progress={status.progress_percent} />
            <CostTracker costs={status.costs} />
            <div className="lg:col-span-2">
              <CheckpointList checkpoints={status.checkpoints} />
            </div>
            {status.error_log.length > 0 && (
              <div className="lg:col-span-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-red-700 mb-2">오류 로그</h3>
                {status.error_log.map((msg, i) => (
                  <p key={i} className="text-xs text-red-600 font-mono">{msg}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
