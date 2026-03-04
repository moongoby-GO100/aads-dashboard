"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const loadProjects = () => {
    setLoading(true);
    api.getProjects()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProjects(); }, []);

  const handleCreate = async () => {
    if (!description.trim()) return;
    setCreating(true);
    try {
      await api.createProject(description);
      setDescription("");
      loadProjects();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="AADS 대시보드" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        {/* New project form */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">새 프로젝트 생성</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="예: Python CLI Calculator 개발"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !description.trim()}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? "생성 중..." : "생성"}
            </button>
          </div>
        </div>

        {/* Projects grid */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            프로젝트 목록 ({projects.length})
          </h2>
          <button onClick={loadProjects} className="text-xs text-blue-600 hover:underline">
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-4xl mb-3">🤖</p>
            <p>아직 프로젝트가 없습니다.</p>
            <p className="text-sm mt-1">위 폼에서 첫 프로젝트를 생성하세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
