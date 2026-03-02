"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 12;

  useEffect(() => {
    setLoading(true);
    api.getProjects(limit, page * limit)
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="flex flex-col h-full">
      <Header title="프로젝트 목록" />
      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                이전
              </button>
              <span className="px-3 py-1 text-sm text-gray-500">{page + 1} 페이지</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={projects.length < limit}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                다음
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
