const AGENTS = [
  "pm", "supervisor", "architect", "developer",
  "qa", "judge", "devops", "researcher",
];

const agentEmoji: Record<string, string> = {
  pm: "📋", supervisor: "🎯", architect: "🏗️", developer: "💻",
  qa: "🧪", judge: "⚖️", devops: "🚀", researcher: "🔬",
};

interface Props {
  currentAgent: string | null;
  progress: number;
}

export default function AgentStatus({ currentAgent, progress }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">에이전트 파이프라인</h3>
        <span className="text-sm text-gray-500">{progress}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {AGENTS.map((agent) => (
          <div
            key={agent}
            className={`p-2 rounded-lg text-center text-xs ${
              currentAgent === agent
                ? "bg-blue-100 border-2 border-blue-500 font-semibold"
                : "bg-gray-50 border border-gray-200 text-gray-500"
            }`}
          >
            <div className="text-base mb-0.5">{agentEmoji[agent]}</div>
            <div className="capitalize">{agent}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
