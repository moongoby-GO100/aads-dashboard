"use client";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  cost: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  // -- 자동 라우팅 --
  { id: "mixture",                   name: "자동 라우팅 (혼합)",         provider: "auto",     cost: "자동" },
  // -- Anthropic Claude --
  { id: "claude-opus-4-6",           name: "Claude Opus 4.6",           provider: "anthropic", cost: "$5/$25" },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6",         provider: "anthropic", cost: "$3/$15" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",          provider: "anthropic", cost: "$0.80/$4" },
  { id: "claude-opus-4-5",           name: "Claude Opus 4.5",           provider: "anthropic", cost: "$5/$25" },
  { id: "claude-sonnet-4-5",         name: "Claude Sonnet 4.5",         provider: "anthropic", cost: "$3/$15" },
  { id: "claude-3-5-sonnet-20241022",name: "Claude 3.5 Sonnet",         provider: "anthropic", cost: "$3/$15" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku",          provider: "anthropic", cost: "$0.80/$4" },
  { id: "claude-3-opus-20240229",    name: "Claude 3 Opus",             provider: "anthropic", cost: "$15/$75" },
  { id: "claude-3-sonnet-20240229",  name: "Claude 3 Sonnet",           provider: "anthropic", cost: "$3/$15" },
  { id: "claude-3-haiku-20240307",   name: "Claude 3 Haiku",            provider: "anthropic", cost: "$0.25/$1.25" },
  { id: "claude-2.1",                name: "Claude 2.1",                provider: "anthropic", cost: "$8/$24" },
  // -- OpenAI GPT --
  { id: "gpt-5",                     name: "GPT-5",                     provider: "openai",   cost: "$10/$30" },
  { id: "gpt-5-mini",                name: "GPT-5 mini",                provider: "openai",   cost: "$0.25/$2" },
  { id: "gpt-5.2-chat-latest",       name: "GPT-5.2 Chat",             provider: "openai",   cost: "$5/$15" },
  { id: "gpt-4o",                    name: "GPT-4o",                    provider: "openai",   cost: "$5/$15" },
  { id: "gpt-4o-mini",               name: "GPT-4o mini",              provider: "openai",   cost: "$0.15/$0.60" },
  { id: "gpt-4-turbo",               name: "GPT-4 Turbo",              provider: "openai",   cost: "$10/$30" },
  { id: "gpt-4",                     name: "GPT-4",                     provider: "openai",   cost: "$30/$60" },
  { id: "gpt-3.5-turbo",             name: "GPT-3.5 Turbo",            provider: "openai",   cost: "$0.50/$1.50" },
  { id: "o1",                        name: "o1",                        provider: "openai",   cost: "$15/$60" },
  { id: "o1-mini",                   name: "o1-mini",                   provider: "openai",   cost: "$3/$12" },
  { id: "o3-mini",                   name: "o3-mini",                   provider: "openai",   cost: "$1.10/$4.40" },
  // -- Google Gemini 3.1 --
  { id: "gemini-3.1-pro-preview",    name: "Gemini 3.1 Pro Preview",    provider: "google",   cost: "$2/$12" },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite Preview", provider: "google", cost: "$0.02/$0.10" },
  // -- Google Gemini 3.0 --
  { id: "gemini-3-pro-preview",      name: "Gemini 3.0 Pro Preview",    provider: "google",   cost: "$2/$12" },
  { id: "gemini-3-flash-preview",    name: "Gemini 3.0 Flash Preview",  provider: "google",   cost: "$0.15/$0.60" },
  // -- Google Gemini 2.5 --
  { id: "gemini-2.5-pro",            name: "Gemini 2.5 Pro",            provider: "google",   cost: "$7/$21" },
  { id: "gemini-2.5-flash",          name: "Gemini 2.5 Flash",          provider: "google",   cost: "$0.15/$0.60" },
  { id: "gemini-2.5-flash-lite",     name: "Gemini 2.5 Flash-Lite",     provider: "google",   cost: "$0.02/$0.10" },
  { id: "gemini-2.5-flash-image",    name: "Gemini 2.5 Flash Image",    provider: "google",   cost: "$0.15/$0.60" },
  // -- Google Gemma 3 (오픈소스) --
  { id: "gemma-3-27b-it",            name: "Gemma 3 27B",               provider: "google",   cost: "무료" },
  // -- Groq (초고속 무료) --
  { id: "groq-qwen3-32b",            name: "Qwen3 32B",                 provider: "groq",     cost: "무료" },
  { id: "groq-kimi-k2",              name: "Kimi K2",                   provider: "groq",     cost: "무료" },
  { id: "groq-llama4-scout",         name: "Llama 4 Scout",             provider: "groq",     cost: "무료" },
  { id: "groq-llama4-maverick",      name: "Llama 4 Maverick",          provider: "groq",     cost: "무료" },
  { id: "groq-llama-70b",            name: "Llama 3.3 70B",             provider: "groq",     cost: "무료" },
  { id: "groq-gpt-oss-120b",         name: "GPT-OSS 120B",              provider: "groq",     cost: "무료" },
  { id: "groq-compound",             name: "Groq Compound",             provider: "groq",     cost: "무료" },
  // -- DeepSeek --
  { id: "deepseek-chat",             name: "DeepSeek V3",               provider: "deepseek",   cost: "$0.28/$0.42" },
  { id: "deepseek-reasoner",         name: "DeepSeek R1",               provider: "deepseek",   cost: "$0.55/$2.19" },
  // -- OpenRouter --
  { id: "openrouter-grok-4-fast",    name: "Grok 4.1 Fast",             provider: "openrouter", cost: "변동" },
  { id: "openrouter-deepseek-v3",    name: "DeepSeek V3.2",             provider: "openrouter", cost: "변동" },
  { id: "openrouter-mistral-small",  name: "Mistral Small",             provider: "openrouter", cost: "변동" },
  { id: "openrouter-nemotron-free",  name: "Nemotron Free",             provider: "openrouter", cost: "무료" },
  { id: "openrouter-minimax-m2",     name: "MiniMax M2.7",              provider: "openrouter", cost: "변동" },
  // -- Alibaba/Qwen (DashScope) — 플래그십 --
  { id: "qwen3-235b",              name: "Qwen3 235B",              provider: "alibaba", cost: "$0.60/$2.40" },
  { id: "qwen3-235b-instruct",     name: "Qwen3 235B Instruct",     provider: "alibaba", cost: "$0.60/$2.40" },
  { id: "qwen3-235b-thinking",     name: "Qwen3 235B Thinking",     provider: "alibaba", cost: "$0.60/$2.40" },
  { id: "qwen3-next-80b",          name: "Qwen3 Next 80B",          provider: "alibaba", cost: "$0.30/$1.20" },
  { id: "qwen3-max",               name: "Qwen3 Max",               provider: "alibaba", cost: "$0.40/$1.20" },
  { id: "qwen3-32b",               name: "Qwen3 32B",               provider: "alibaba", cost: "$0.08/$0.32" },
  { id: "qwen3-30b-a3b",           name: "Qwen3 30B-A3B",           provider: "alibaba", cost: "$0.07/$0.28" },
  { id: "qwen3-14b",               name: "Qwen3 14B",               provider: "alibaba", cost: "$0.04/$0.16" },
  { id: "qwen3-8b",                name: "Qwen3 8B",                provider: "alibaba", cost: "$0.02/$0.08" },
  // -- Alibaba/Qwen — 코더 --
  { id: "qwen3-coder-480b",        name: "Qwen3 Coder 480B",        provider: "alibaba", cost: "$1.20/$4.80" },
  { id: "qwen3-coder-plus",        name: "Qwen3 Coder Plus",        provider: "alibaba", cost: "$0.35/$1.40" },
  { id: "qwen3-coder-flash",       name: "Qwen3 Coder Flash",       provider: "alibaba", cost: "$0.07/$0.28" },
  { id: "qwen-coder-plus",         name: "Qwen Coder Plus",         provider: "alibaba", cost: "$0.35/$1.40" },
  // -- Alibaba/Qwen 3.5 --
  { id: "qwen3.5-plus",            name: "Qwen3.5 Plus",            provider: "alibaba", cost: "$0.40/$1.20" },
  { id: "qwen3.5-flash",           name: "Qwen3.5 Flash",           provider: "alibaba", cost: "$0.07/$0.28" },
  // -- Alibaba/Qwen (안정 릴리스) --
  { id: "qwen-max",                name: "Qwen Max",                provider: "alibaba", cost: "$0.40/$1.20" },
  { id: "qwen-max-latest",         name: "Qwen Max Latest",         provider: "alibaba", cost: "$0.40/$1.20" },
  { id: "qwen-plus",               name: "Qwen Plus",               provider: "alibaba", cost: "$0.08/$0.32" },
  { id: "qwen-plus-latest",        name: "Qwen Plus Latest",        provider: "alibaba", cost: "$0.08/$0.32" },
  { id: "qwen-turbo",              name: "Qwen Turbo",              provider: "alibaba", cost: "$0.02/$0.06" },
  { id: "qwen-turbo-latest",       name: "Qwen Turbo Latest",       provider: "alibaba", cost: "$0.02/$0.06" },
  { id: "qwen-flash",              name: "Qwen Flash",              provider: "alibaba", cost: "$0.01/$0.03" },
  { id: "qwen2.5-72b-instruct",    name: "Qwen2.5 72B Instruct",    provider: "alibaba", cost: "$0.30/$0.90" },
  // -- Alibaba/Qwen — 추론 --
  { id: "qwq-plus",                name: "QwQ Plus",                provider: "alibaba", cost: "$0.60/$2.40" },
  // -- Alibaba/Qwen — 멀티모달 --
  { id: "qwen-vl-max",             name: "Qwen VL Max",             provider: "alibaba", cost: "$0.40/$1.20" },
  { id: "qwen-vl-plus",            name: "Qwen VL Plus",            provider: "alibaba", cost: "$0.08/$0.32" },
  { id: "qwen3-vl-plus",           name: "Qwen3 VL Plus",           provider: "alibaba", cost: "$0.35/$1.40" },
  { id: "qwen3-vl-235b",           name: "Qwen3 VL 235B",           provider: "alibaba", cost: "$0.60/$2.40" },
  { id: "qwen-omni-turbo",         name: "Qwen Omni Turbo",         provider: "alibaba", cost: "$0.02/$0.06" },
  // -- DashScope DeepSeek (Alibaba 호스팅) --
  { id: "dashscope-deepseek-v3.2", name: "DeepSeek V3.2 (DashScope)", provider: "alibaba", cost: "$0.28/$0.42" },
  // -- Kimi (Moonshot AI) --
  { id: "kimi-k2.5",              name: "Kimi K2.5",              provider: "kimi",    cost: "$0.60/$3" },
  { id: "kimi-k2",                name: "Kimi K2",                provider: "kimi",    cost: "$0.50/$2" },
  { id: "kimi-latest",            name: "Kimi Latest",            provider: "kimi",    cost: "변동" },
  { id: "kimi-128k",              name: "Moonshot V1 128K",       provider: "kimi",    cost: "변동" },
  { id: "kimi-8k",                name: "Moonshot V1 8K",         provider: "kimi",    cost: "변동" },
  // -- MiniMax --
  { id: "minimax-m2.7",           name: "MiniMax M2.7",           provider: "minimax", cost: "변동" },
  { id: "minimax-m2.5",           name: "MiniMax M2.5",           provider: "minimax", cost: "변동" },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";

// ─── Chat-First 모델 (AADS-172-B) ───────────────────────────────────────────

export interface ChatModelOption {
  id: string;
  label: string;
  cost: string;
  description: string;
  isDeepResearch?: boolean;
}

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: "auto",                    label: "Auto",              cost: "자동",   description: "인텐트 기반 자동 라우팅" },
  { id: "deepseek-reasoner",       label: "DeepSeek R1",       cost: "$0.55/$2.19", description: "벤치마크 1위 · 추론 최강" },
  { id: "gemini-3.1-pro-preview",  label: "Gemini 3.1 Pro",    cost: "$1/$4", description: "속도 1위 · 최신 Gemini" },
  { id: "qwen3-235b-thinking",     label: "Qwen3 235B Think",  cost: "$0.60/$2.40", description: "한국어 1위 · Alibaba 최고" },
  { id: "claude-sonnet-4-6",       label: "Sonnet 4.6",        cost: "$3/$15",  description: "안정성 1위 · 도구 활용" },
  { id: "claude-opus-4-6",         label: "Opus 4.6",          cost: "$5/$25",  description: "최고 성능 · 복잡 작업" },
  { id: "gemini-2.5-flash",        label: "Flash 2.5",         cost: "$0.15/$0.60", description: "빠름 · 저비용" },
  { id: "groq-qwen3-32b",          label: "Qwen3 32B",         cost: "무료",   description: "Groq 초고속 · 무료" },
  { id: "groq-kimi-k2",            label: "Kimi K2",           cost: "무료",   description: "수학/금융 최강 · 무료" },
  { id: "groq-llama4-maverick",    label: "Llama 4 Maverick",  cost: "무료",   description: "Groq · Llama 4 Maverick" },
  { id: "deepseek-chat",           label: "DeepSeek V3",       cost: "$0.28/$0.42", description: "초저가 범용" },
  { id: "openrouter-grok-4-fast",      label: "Grok 4.1 Fast",     cost: "변동",   description: "OpenRouter · Grok 최신" },
  { id: "openrouter-deepseek-v3",      label: "DeepSeek V3.2",     cost: "변동",   description: "OpenRouter · DeepSeek 최신" },
  { id: "openrouter-mistral-small",    label: "Mistral Small",     cost: "변동",   description: "OpenRouter · Mistral 경량" },
  { id: "openrouter-nemotron-free",    label: "Nemotron Free",     cost: "무료",   description: "OpenRouter · NVIDIA 무료" },
  { id: "openrouter-minimax-m2",       label: "MiniMax M2.7",      cost: "변동",   description: "OpenRouter · MiniMax 최신" },
  // Alibaba/Qwen 대표 모델
  { id: "qwen3-235b",              label: "Qwen3 235B",        cost: "$0.60/$2.40", description: "Alibaba · 최고 성능" },
  { id: "qwen3-next-80b",          label: "Qwen3 Next 80B",    cost: "$0.003", description: "Alibaba · 차세대 80B" },
  { id: "qwen3-32b",               label: "Qwen3 32B",         cost: "$0.001", description: "Alibaba · 균형 성능" },
  { id: "qwen3-14b",               label: "Qwen3 14B",         cost: "$0.0004",description: "Alibaba · 경량 고성능" },
  { id: "qwen3-8b",                label: "Qwen3 8B",          cost: "$0.0002",description: "Alibaba · 초경량" },
  { id: "qwen3-coder-480b",        label: "Qwen3 Coder 480B",  cost: "$0.012", description: "Alibaba · 코딩 최강" },
  { id: "qwen3-coder-plus",        label: "Qwen3 Coder+",      cost: "$0.003", description: "Alibaba · 코딩 특화" },
  { id: "qwen3-coder-flash",       label: "Qwen3 Coder Flash", cost: "$0.0007",description: "Alibaba · 코딩 경량" },
  { id: "qwen3.5-plus",            label: "Qwen3.5 Plus",      cost: "$0.004", description: "Alibaba · Qwen3.5 균형" },
  { id: "qwen3.5-flash",           label: "Qwen3.5 Flash",     cost: "$0.0007",description: "Alibaba · Qwen3.5 경량" },
  { id: "qwen-max",                label: "Qwen Max",          cost: "$0.004", description: "Alibaba · 안정 플래그십" },
  { id: "qwen-plus",               label: "Qwen Plus",         cost: "$0.001", description: "Alibaba · 안정 균형" },
  { id: "qwen-turbo",              label: "Qwen Turbo",        cost: "$0.0002",description: "Alibaba · 초저가" },
  { id: "qwen-flash",              label: "Qwen Flash",        cost: "$0.0001",description: "Alibaba · 최저가" },
  { id: "qwen2.5-72b-instruct",    label: "Qwen2.5 72B",       cost: "$0.003", description: "Alibaba · Qwen2.5 최대" },
  { id: "qwq-plus",                label: "QwQ Plus",          cost: "$0.006", description: "Alibaba · 추론 특화" },
  { id: "qwen3-vl-235b",           label: "Qwen3 VL 235B",     cost: "$0.006", description: "Alibaba · 비전 최강" },
  { id: "qwen-omni-turbo",         label: "Qwen Omni Turbo",   cost: "$0.0002",description: "Alibaba · 멀티모달 경량" },
  { id: "dashscope-deepseek-v3.2", label: "DS V3.2 (Ali)",     cost: "$0.28/$0.42", description: "DashScope · DeepSeek V3.2" },
  { id: "kimi-k2.5",               label: "Kimi K2.5",        cost: "$0.60/$3", description: "Moonshot AI · 멀티모달 최신" },
  { id: "kimi-k2",                 label: "Kimi K2",          cost: "$0.50/$2", description: "Moonshot AI · 코딩 강자" },
  { id: "minimax-m2.7",            label: "MiniMax M2.7",     cost: "변동",       description: "MiniMax · 에이전트 최신" },
  { id: "minimax-m2.5",            label: "MiniMax M2.5",     cost: "변동",       description: "MiniMax · 코딩/도구 특화" },
  { id: "deep-research",           label: "Deep Research",     cost: "~$3",    description: "심층 연구 모드", isDeepResearch: true },
];

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";

interface ChatModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  compact?: boolean;
}

export function ChatModelSelector({ value, onChange, compact }: ChatModelSelectorProps) {
  const selected = CHAT_MODEL_OPTIONS.find((m) => m.id === value) ?? CHAT_MODEL_OPTIONS[0];

  return (
    <div className={`relative flex items-center ${compact ? "gap-1" : "gap-2"}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg cursor-pointer"
        style={{
          background: "var(--bg-main)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
          padding: compact ? "4px 6px" : "6px 10px",
          minWidth: compact ? "120px" : "160px",
        }}
        title={selected.description}
      >
        {CHAT_MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.cost})
          </option>
        ))}
      </select>
      {!compact && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: selected.isDeepResearch ? "rgba(139,92,246,0.15)" : "var(--bg-hover)",
            color: selected.isDeepResearch ? "#a78bfa" : "var(--text-secondary)",
          }}
        >
          {selected.cost}
        </span>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  auto: "자동",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  groq: "Groq (무료)",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  alibaba: "Alibaba/Qwen",
  kimi: "Kimi (Moonshot)",
  minimax: "MiniMax",
};

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({ value, onChange }: Props) {
  const selected = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[1];

  // Group by provider for optgroup
  const providers = ["auto", "deepseek", "anthropic", "openai", "google", "groq", "openrouter", "alibaba", "kimi", "minimax"];

  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>모델:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-md px-2 py-1.5 min-w-[220px] max-w-[320px] cursor-pointer"
        style={{
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
        }}
      >
        {providers.map((prov) => {
          const group = MODEL_OPTIONS.filter((m) => m.provider === prov);
          if (group.length === 0) return null;
          return (
            <optgroup key={prov} label={PROVIDER_LABELS[prov] || prov}>
              {group.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.cost}/M)
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        {selected.cost} /M
      </span>
    </div>
  );
}
