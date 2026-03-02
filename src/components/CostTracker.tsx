import type { CostInfo } from "@/types";

export default function CostTracker({ costs }: { costs: CostInfo }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">비용 추적</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">총 비용</p>
          <p className="text-lg font-bold text-blue-600">${costs.total_usd.toFixed(4)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">LLM 호출</p>
          <p className="text-lg font-bold text-purple-600">{costs.llm_calls_count}/15</p>
        </div>
      </div>
      {Object.entries(costs.by_agent ?? {}).length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1 text-gray-500">에이전트</th>
              <th className="text-right py-1 text-gray-500">비용</th>
              <th className="text-right py-1 text-gray-500">호출</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(costs.by_agent).map(([agent, info]) => (
              <tr key={agent} className="border-b border-gray-50">
                <td className="py-1 capitalize">{agent}</td>
                <td className="py-1 text-right">${info.cost_usd.toFixed(4)}</td>
                <td className="py-1 text-right">{info.llm_calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
