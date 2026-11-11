"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { api, type AutoRouting } from "@/lib/api";
import {
  buildRegistryOptions,
  groupByProvider,
  useModelRegistry,
  type RegistryStatus,
} from "@/lib/modelRegistry";

// 모델 목록은 DB(llm_models) 레지스트리를 API 로 조회한다. 여기에는 모델 ID 를 두지 않는다.
// 저장 형식(선택값 = model_id, 중복 시 provider:model_id)과 기본 선택값만 호환용으로 유지한다.
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_CHAT_MODEL = "claude-sonnet-5-5";

export interface ChatModelOption {
  id: string;
  label: string;
  cost: string;
  description: string;
  isDeepResearch?: boolean;
  isSelectable?: boolean;
}

// 레지스트리 모델이 아닌 "모드" 항목(자동 라우팅·Deep Research)만 고정.
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: "auto",          label: "Auto",          cost: "자동", description: "인텐트 기반 자동 라우팅" },
  { id: "deep-research", label: "Deep Research", cost: "~$3",  description: "심층 연구 모드", isDeepResearch: true },
];

// ─── chat-preferences API 타입 ──────────────────────────────────────────────

interface ChatModelPreference {
  preference_key: string;
  provider: string;
  model_id: string;
  display_order: number;
  is_hidden: boolean;
  is_favorite: boolean;
  is_pinned: boolean;
}

// ─── preferences 적용 헬퍼 ──────────────────────────────────────────────────

/**
 * CHAT_MODEL_OPTIONS를 chat-preferences API 결과로 필터·정렬한다.
 * - mixture / auto 는 항상 맨 위 고정
 * - is_hidden=true 모델 제외 (단, 현재 선택된 value 는 유지)
 * - is_pinned=true → 상단, is_favorite=true → 그 다음, display_order → 오름차순
 * - preferences 에 없는 항목은 원본 순서 유지
 * - preferences 가 비어 있으면 원본 반환 (폴백)
 */
function applyPreferences(
  options: ChatModelOption[],
  preferences: ChatModelPreference[],
  currentValue: string,
): ChatModelOption[] {
  if (preferences.length === 0) return options;

  const prefMap = new Map<string, ChatModelPreference>();
  for (const pref of preferences) {
    prefMap.set(pref.model_id, pref);
    if (pref.preference_key && pref.preference_key !== pref.model_id) {
      prefMap.set(pref.preference_key, pref);
    }
  }

  const mixtureIds = new Set(["mixture", "auto"]);
  const mixtureOptions = options.filter((o) => mixtureIds.has(o.id));
  const restOptions    = options.filter((o) => !mixtureIds.has(o.id));

  const originalOrder = new Map(restOptions.map((o, i) => [o.id, i]));

  const filtered = restOptions.filter((o) => {
    const pref = prefMap.get(o.id);
    if (pref?.is_hidden && o.id !== currentValue) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const pa = prefMap.get(a.id);
    const pb = prefMap.get(b.id);
    if (!!pa?.is_pinned !== !!pb?.is_pinned) return pa?.is_pinned ? -1 : 1;
    if (!!pa?.is_favorite !== !!pb?.is_favorite) return pa?.is_favorite ? -1 : 1;
    const ao = pa?.display_order ?? 1000;
    const bo = pb?.display_order ?? 1000;
    if (ao !== bo) return ao - bo;
    return (originalOrder.get(a.id) ?? 9999) - (originalOrder.get(b.id) ?? 9999);
  });

  return [...mixtureOptions, ...sorted];
}

// ─── API 호출 ────────────────────────────────────────────────────────────────

const _API_BASE =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "https://aads.newtalk.kr/api/v1";

async function fetchChatPreferences(): Promise<ChatModelPreference[]> {
  try {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${_API_BASE}/llm-models/chat-preferences`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data: { preferences?: ChatModelPreference[] } = await res.json();
    return Array.isArray(data.preferences) ? data.preferences : [];
  } catch {
    return [];
  }
}

function useAutoRouting() {
  const [routing, setRouting] = useState<AutoRouting>();
  useEffect(() => {
    let live = true;
    const refresh = () => {
      api.getModelRoutingPreferences().then((res: { auto_routing?: AutoRouting }) => {
        if (live) setRouting(res.auto_routing);
      }).catch(() => { if (live) setRouting(undefined); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("focus", refresh); };
  }, []);
  return routing;
}

function autoLabel(routing?: AutoRouting) {
  const model = routing?.default_model;
  return model ? `자동 · ${model.display_name || model.model_id}` : "자동";
}

function intentDescription(routing?: AutoRouting) {
  return routing?.intent_policies.slice(0, 3).map((policy) => `${policy.intent}: ${policy.model_id}`).join(" · ") || "";
}

// ─── 공용 UI ─────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  codex: "Codex CLI (GPT)",
  google: "Google",
  gemini: "Gemini",
  groq: "Groq",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  alibaba: "Alibaba/Qwen",
  qwen: "Qwen",
  kimi: "Kimi (Moonshot)",
  minimax: "MiniMax",
};

/** 목록 로드 실패(캐시도 없음) 시 복구 UI. 하드코딩 폴백을 대신한다. */
function RegistryRecovery({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 text-xs min-w-0" style={{ color: "var(--text-secondary)" }}>
      <span>모델 목록을 불러오지 못했습니다 ·</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 min-w-11 px-3 rounded-lg cursor-pointer"
        style={{ border: "1px solid var(--border)", color: "var(--text-primary)", background: "var(--bg-main)" }}
      >
        다시 시도
      </button>
    </div>
  );
}

function useRegistryGroups(autoRefresh: boolean) {
  const { rows, status, retry } = useModelRegistry({ autoRefresh });
  const options = buildRegistryOptions(rows);
  return { options, groups: groupByProvider(options), status: status as RegistryStatus, retry };
}

// ─── ChatModelSelector ───────────────────────────────────────────────────────

interface ChatModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  compact?: boolean;
}

export function ChatModelSelector({ value, onChange, compact }: ChatModelSelectorProps) {
  const routing = useAutoRouting();
  const { options, groups, status, retry } = useRegistryGroups(true);
  const [prefs, setPrefs] = useState<ChatModelPreference[]>([]);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let live = true;
    const refresh = () => {
      void fetchChatPreferences().then((next) => {
        if (live) setPrefs(next);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (status === "error" && options.length === 0) return <RegistryRecovery onRetry={() => void retry()} />;

  const modeOptions: ChatModelOption[] = CHAT_MODEL_OPTIONS.map((o) => ({ ...o, isSelectable: true }));
  const registryOptions: ChatModelOption[] = options.map((o) => ({
    id: o.value,
    label: o.label,
    cost: o.cost,
    description: o.provider,
    isSelectable: true,
  }));
  const visible = applyPreferences([...modeOptions, ...registryOptions], prefs, value);
  const visibleIds = new Set(visible.map((o) => o.id));
  const providerOf = new Map(options.map((o) => [o.value, o.provider]));
  const isMode = (id: string) => CHAT_MODEL_OPTIONS.some((m) => m.id === id);
  const modes = visible.filter((o) => isMode(o.id) || o.id === "mixture");
  // 현재 선택값이 목록에 없어도(기존 세션 호환) select 가 값을 잃지 않도록 항목을 하나 유지한다.
  const orphan = value && !visibleIds.has(value) && value !== "mixture" ? value : null;
  const selected = visible.find((m) => m.id === value) ?? visible[0];
  const grouped = groups
    .map(([provider]) => [provider, visible.filter((o) => providerOf.get(o.id) === provider)] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <div className={`relative flex flex-wrap min-w-0 items-center ${compact ? "gap-1" : "gap-2"}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg cursor-pointer min-h-11 max-w-full"
        style={{
          background: "var(--bg-main)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
          padding: compact ? "4px 6px" : "6px 10px",
          minWidth: compact ? "120px" : "160px",
        }}
        aria-label="채팅 모델 선택"
        title={["auto", "mixture"].includes(value) ? intentDescription(routing) : selected?.description}
      >
        {modes.map((m) => (
          <Fragment key={m.id}>
            <option value={m.id}>
              {["auto", "mixture"].includes(m.id) ? autoLabel(routing) : m.label} ({m.cost})
            </option>
            {["auto", "mixture"].includes(m.id) && routing?.intent_policies.slice(0, 3).map((policy, index) => <option key={index} disabled>인텐트 정책 · {policy.intent}: {policy.model_id}</option>)}
          </Fragment>
        ))}
        {orphan && <option value={orphan}>{orphan} (목록에 없음)</option>}
        {grouped.map(([provider, list]) => (
          <optgroup key={provider} label={PROVIDER_LABELS[provider] || provider}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>{m.label} ({m.cost})</option>
            ))}
          </optgroup>
        ))}
      </select>
      {status === "cached" && !compact && (
        <button
          type="button"
          onClick={() => void retry()}
          title="저장된 마지막 목록을 표시 중입니다. 눌러서 다시 불러오기"
          className="text-xs min-h-11 min-w-11 px-2 rounded cursor-pointer"
          style={{ color: "var(--text-secondary)", background: "var(--bg-hover)" }}
        >
          ⟳ 캐시
        </button>
      )}
      {!compact && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: selected?.isDeepResearch ? "rgba(139,92,246,0.15)" : "var(--bg-hover)",
            color: selected?.isDeepResearch ? "#a78bfa" : "var(--text-secondary)",
          }}
        >
          {selected?.cost}
        </span>
      )}
    </div>
  );
}

// ─── ModelSelector (settings / full-page selector) ──────────────────────────

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({ value, onChange }: Props) {
  const routing = useAutoRouting();
  const { options, groups, status, retry } = useRegistryGroups(false);
  if (status === "error" && options.length === 0) return <RegistryRecovery onRetry={() => void retry()} />;
  const selected = options.find((m) => m.value === value);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 min-w-0">
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        모델:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-md px-2 py-1.5 min-h-11 min-w-0 max-w-full cursor-pointer"
        style={{
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          outline: "none",
        }}
      >
        <option value="mixture">{autoLabel(routing)} (자동)</option>
        {routing?.intent_policies.slice(0, 3).map((policy, index) => <option key={index} disabled>인텐트 정책 · {policy.intent}: {policy.model_id}</option>)}
        {value && value !== "mixture" && !selected && <option value={value}>{value} (목록에 없음)</option>}
        {groups.map(([provider, list]) => (
          <optgroup key={provider} label={PROVIDER_LABELS[provider] || provider}>
            {list.map((m) => (
              <option key={m.value} value={m.value}>{m.label} ({m.cost}{["무료", "변동"].includes(m.cost) ? "" : "/M"})</option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && (
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
          {selected.cost}{["무료", "변동"].includes(selected.cost) ? "" : " /M"}
        </span>
      )}
    </div>
  );
}
