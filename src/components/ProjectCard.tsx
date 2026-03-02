import Link from "next/link";
import type { Project } from "@/types";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">
            {project.description}
          </p>
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
              statusColors[project.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {project.status}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {new Date(project.created_at).toLocaleString("ko-KR")}
        </p>
        <p className="text-xs text-gray-400 font-mono truncate mt-1">#{project.id.slice(0, 8)}</p>
      </div>
    </Link>
  );
}
