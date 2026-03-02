import type { CostInfo } from "@/types";

export default function CostTracker({ costs }: { costs: CostInfo }) {
  const maxCost = Math.max(...Object.values(costs.by_agent ?? {}).map((a) => a.cost_usd), 0.001);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">비용 추적</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">총 비용</p>
          <p className="text-xl font-bold text-blue-600">${costs.total_usd.toFixed(4)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LLM 호출</p>
          <p className="text-xl font-bold text-purple-600">
            {costs.llm_calls_count}
            <span className="text-sm text-gray-400">/15</span>
          </p>
        </div>
      </div>

      {Object.entries(costs.by_agent ?? {}).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 mb-1">에이전트별 비용</p>
          {Object.entries(costs.by_agent).map(([agent, info]) => (
            <div key={agent}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-600 capitalize">{agent}</span>
                <span className="text-gray-500 font-mono">${info.cost_usd.toFixed(4)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${(info.cost_usd / maxCost) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
