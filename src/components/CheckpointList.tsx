import type { Checkpoint } from "@/types";

const stageLabels: Record<string, string> = {
  requirements: "요구사항 확인",
  design_review: "설계 승인",
  code_review: "코드 리뷰",
  test_results: "테스트 결과",
  deploy_approval: "배포 승인",
  final_review: "최종 검수",
};

export default function CheckpointList({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const stages = ["requirements", "design_review", "code_review", "test_results", "deploy_approval", "final_review"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">HITL 체크포인트 (6단계)</h3>
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const cp = checkpoints.find((c) => c.stage === stage);
          return (
            <div key={stage} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  cp?.status === "approved"
                    ? "bg-green-500 text-white"
                    : cp?.status === "rejected"
                    ? "bg-red-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className={`text-sm ${cp ? "text-gray-800" : "text-gray-400"}`}>
                  {stageLabels[stage]}
                </p>
                {cp?.timestamp && (
                  <p className="text-xs text-gray-400">
                    {new Date(cp.timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    {cp.feedback && ` — ${cp.feedback}`}
                  </p>
                )}
              </div>
              <span className="text-sm">
                {cp?.status === "approved" ? "✅" : cp?.status === "rejected" ? "❌" : "⏳"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
