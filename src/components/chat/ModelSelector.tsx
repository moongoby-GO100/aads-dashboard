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
  // -- Google Gemini --
  { id: "gemini-2.5-pro",            name: "Gemini 2.5 Pro",            provider: "google",   cost: "$7/$21" },
  { id: "gemini-3.1-pro-preview",    name: "Gemini 3.1 Pro Preview",    provider: "google",   cost: "$2/$12" },
  { id: "gemini-2.5-flash",          name: "Gemini 2.5 Flash",          provider: "google",   cost: "$0.30/$2.50" },
  { id: "gemini-2.0-flash",          name: "Gemini 2.0 Flash",          provider: "google",   cost: "$0.075/$0.30" },
  { id: "gemini-1.5-pro",            name: "Gemini 1.5 Pro",            provider: "google",   cost: "$3.50/$10.50" },
  { id: "gemini-1.5-flash",          name: "Gemini 1.5 Flash",          provider: "google",   cost: "$0.075/$0.30" },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";

const PROVIDER_LABELS: Record<string, string> = {
  auto: "자동",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({ value, onChange }: Props) {
  const selected = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[1];

  // Group by provider for optgroup
  const providers = ["auto", "anthropic", "openai", "google"];

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
