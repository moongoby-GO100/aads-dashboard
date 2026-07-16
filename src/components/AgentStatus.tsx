const AGENTS = [
  { id: "pm", label: "PM", emoji: "📋" },
  { id: "supervisor", label: "Supervisor", emoji: "🎯" },
  { id: "architect", label: "Architect", emoji: "🏗️" },
  { id: "developer", label: "Developer", emoji: "💻" },
  { id: "qa", label: "QA", emoji: "🧪" },
  { id: "judge", label: "Judge", emoji: "⚖️" },
  { id: "devops", label: "DevOps", emoji: "🚀" },
  { id: "researcher", label: "Researcher", emoji: "🔬" },
];

interface Props {
  currentAgent: string | null;
  progress: number;
  completedAgents?: string[];
  failedAgents?: string[];
}

export default function AgentStatus({ currentAgent, progress, completedAgents = [], failedAgents = [] }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">8-agent 파이프라인</h3>
        <span className="text-sm font-medium text-blue-600">{progress}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {AGENTS.map((agent) => {
          const isActive = currentAgent === agent.id;
          const isDone = completedAgents.includes(agent.id);
          const isFailed = failedAgents.includes(agent.id);
          return (
            <div
              key={agent.id}
              className={`p-2 rounded-lg text-center text-xs transition-all ${
                isFailed
                  ? "bg-red-50 border-2 border-red-400"
                  : isDone
                  ? "bg-green-50 border border-green-300"
                  : isActive
                  ? "bg-blue-50 border-2 border-blue-500 shadow-sm"
                  : "bg-gray-50 border border-gray-200 text-gray-400"
              }`}
            >
              <div className="text-base mb-0.5">{agent.emoji}</div>
              <div className={`font-medium ${isActive ? "text-blue-700" : isDone ? "text-green-700" : isFailed ? "text-red-700" : "text-gray-500"}`}>
                {agent.label}
              </div>
              {isActive && <div className="text-blue-500 mt-0.5 text-[10px]">실행 중</div>}
              {isDone && <div className="text-green-500 mt-0.5 text-[10px]">완료</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
