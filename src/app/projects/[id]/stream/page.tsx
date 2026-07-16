"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SSEMonitor from "@/components/SSEMonitor";

export default function StreamPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col h-full">
      <Header title={`실시간 모니터 #${id?.slice(0, 8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 text-sm text-gray-500">
          <Link href={`/projects/${id}`} className="hover:text-blue-600">← 프로젝트 상세</Link>
        </div>
        {id && <SSEMonitor projectId={id} />}
      </div>
    </div>
  );
}
