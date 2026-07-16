"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import CostTracker from "@/components/CostTracker";
import type { CostInfo } from "@/types";

export default function CostsPage() {
  const { id } = useParams<{ id: string }>();
  const [costs, setCosts] = useState<CostInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getProjectCosts(id)
      .then((data) => setCosts(data.costs))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="flex flex-col h-full">
      <Header title={`비용 추적 #${id?.slice(0, 8)}`} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 text-sm text-gray-500">
          <Link href={`/projects/${id}`} className="hover:text-blue-600">← 프로젝트 상세</Link>
        </div>
        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : costs ? (
          <div className="max-w-lg">
            <CostTracker costs={costs} />
          </div>
        ) : (
          <div className="text-center text-gray-400 py-12">비용 데이터 없음</div>
        )}
      </div>
    </div>
  );
}
