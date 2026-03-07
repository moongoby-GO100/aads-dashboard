"use client";

export interface ModelOption {
  id: string;
  name: string;
  icon: string;
  cost: string;
  desc: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "claude-opus-4-6",           name: "Claude Opus 4.6",   icon: "🟣", cost: "$5/$25",      desc: "복잡한 전략·설계" },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6", icon: "🔵", cost: "$3/$15",      desc: "일반 개발·분석" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",  icon: "💙", cost: "$0.80/$4",    desc: "빠른 조회·정리" },
  { id: "gpt-5",                     name: "GPT-5",             icon: "🟢", cost: "$10/$30",     desc: "OpenAI 고성능" },
  { id: "gpt-5-mini",                name: "GPT-5 mini",        icon: "🟩", cost: "$0.25/$2",    desc: "OpenAI DevOps·스크립트" },
  { id: "gemini-2.5-flash",          name: "Gemini 2.5 Flash",  icon: "🟡", cost: "$0.30/$2.50", desc: "Google 가벼운 조회·요약" },
  { id: "mixture",                   name: "혼합 에이전트",       icon: "🔴", cost: "자동",         desc: "여러 모델 자동 라우팅" },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({ value, onChange }: Props) {
  const selected = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[1];

  return (
    <div className="flex flex-wrap gap-1.5 items-center mb-2">
      <span className="text-xs mr-1" style={{ color: "var(--text-secondary)" }}>모델:</span>
      {MODEL_OPTIONS.map((m) => {
        const isActive = m.id === value;
        return (
          <button
            key={m.id}
            title={`${m.name} — ${m.desc} (${m.cost}/M tokens)`}
            onClick={() => onChange(m.id)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all"
            style={
              isActive
                ? { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }
                : { background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }
            }
          >
            <span>{m.icon}</span>
            <span className="hidden sm:inline">{m.name}</span>
            <span className="sm:hidden">{m.name.split(" ").pop()}</span>
          </button>
        );
      })}
      <span className="text-xs ml-1" style={{ color: "var(--text-secondary)" }}>
        {selected.cost} /M
      </span>
    </div>
  );
}
