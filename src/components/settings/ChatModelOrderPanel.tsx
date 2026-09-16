"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

/** 채팅창 모델 노출 순서.
 *
 * LLM 레지스트리 패널 안에 있던 것을 떼어내 '모델 설정' 탭으로 옮겼다.
 * 이건 "어떤 모델이 등록돼 있나"(레지스트리)가 아니라 "채팅창에 무엇을 어떤
 * 순서로 띄울까"(정책)라서, 러너 모델·지시서 생성·모델 라우팅과 같은 층이다.
 *
 * 모델 179개를 항상 다 그려 10,530px 이었다. 순서를 바꾸는 일은 보통 상위 몇
 * 개에서 일어나므로 검색 + 20개씩으로 줄인다. 순서 이동은 원본 배열 index 로
 * 해야 하므로 필터된 목록에도 원본 index 를 달고 다닌다 — 필터 후 index 로
 * 옮기면 엉뚱한 모델이 움직인다.
 *
 * 설계: aads-docs/docs/PRD-SETTINGS-UNIFIED-ACCOUNT-CARD-v1.0.md
 */

interface LlmRegistryModel {
  provider: string;
  model_id: string;
  display_name?: string;
  input_cost?: string | number | null;
  output_cost?: string | number | null;
  is_active?: boolean;
}

interface ChatModelPreference {
  preference_key?: string;
  provider?: string;
  model_id: string;
  display_order: number;
  is_hidden: boolean;
  is_favorite: boolean;
  is_pinned: boolean;
}

interface ChatModelConfigRow extends ChatModelPreference {
  preference_key: string;
  display_name: string;
  provider: string;
  cost_label: string;
}

function formatCostLabel(model: LlmRegistryModel): string {
  const input = Number(model.input_cost);
  const output = Number(model.output_cost);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return "변동";
  if (input === 0 && output === 0) return "무료";
  return `$${input}/$${output}`;
}

function compareChatModelRows(a: ChatModelConfigRow, b: ChatModelConfigRow): number {
  if (a.model_id === "mixture") return -1;
  if (b.model_id === "mixture") return 1;
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
  if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
  return a.display_name.localeCompare(b.display_name);
}

function buildChatPreferenceKey(provider: string | undefined, modelId: string): string {
  const normalizedModel = (modelId || "").trim();
  if (!normalizedModel || normalizedModel === "mixture" || normalizedModel === "auto") return "mixture";
  const normalizedProvider = (provider || "legacy").trim().toLowerCase();
  return `${normalizedProvider}:${normalizedModel}`;
}

function buildChatPreferenceMap(preferences: ChatModelPreference[]): Map<string, ChatModelPreference> {
  const preferenceMap = new Map<string, ChatModelPreference>();
  for (const item of preferences) {
    const key = item.preference_key || buildChatPreferenceKey(item.provider, item.model_id);
    preferenceMap.set(key, item);
    if (!item.preference_key && item.model_id) {
      preferenceMap.set(item.model_id, item);
    }
  }
  return preferenceMap;
}

function normalizeChatModelRows(rows: ChatModelConfigRow[]): ChatModelConfigRow[] {
  const sorted = [...rows].sort(compareChatModelRows);
  return sorted.map((row, index) => ({
    ...row,
    display_order: row.preference_key === "mixture" ? 0 : (index + 1) * 10,
  }));
}

function buildChatModelConfigs(
  models: LlmRegistryModel[],
  preferences: ChatModelPreference[],
): ChatModelConfigRow[] {
  const preferenceMap = buildChatPreferenceMap(preferences);
  const modelIdCounts = models.reduce((acc, model) => {
    acc.set(model.model_id, (acc.get(model.model_id) || 0) + 1);
    return acc;
  }, new Map<string, number>());
  const mixturePref = preferenceMap.get("mixture");
  const baseRows: ChatModelConfigRow[] = [
    {
      preference_key: "mixture",
      model_id: "mixture",
      display_name: "자동 라우팅 (혼합)",
      provider: "auto",
      cost_label: "자동",
      display_order: mixturePref?.display_order ?? 0,
      is_hidden: mixturePref?.is_hidden ?? false,
      is_favorite: mixturePref?.is_favorite ?? false,
      is_pinned: mixturePref?.is_pinned ?? true,
    },
    ...models.map((model, index) => {
      const preferenceKey = buildChatPreferenceKey(model.provider, model.model_id);
      const legacyPref = modelIdCounts.get(model.model_id) === 1 ? preferenceMap.get(model.model_id) : undefined;
      const pref = preferenceMap.get(preferenceKey) || legacyPref;
      return {
        preference_key: preferenceKey,
        model_id: model.model_id,
        display_name: model.display_name || model.model_id,
        provider: model.provider,
        cost_label: formatCostLabel(model),
        display_order: pref?.display_order ?? (index + 2) * 10,
        is_hidden: pref?.is_hidden ?? false,
        is_favorite: pref?.is_favorite ?? false,
        is_pinned: pref?.is_pinned ?? false,
      };
    }),
  ];
  return normalizeChatModelRows(baseRows);
}

export default function ChatModelOrderPanel() {
  const [chatRegistryModels, setChatRegistryModels] = useState<LlmRegistryModel[]>([]);
  const [chatModelConfigs, setChatModelConfigs] = useState<ChatModelConfigRow[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [modelLimit, setModelLimit] = useState(20);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const flash = useCallback((text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preferencesRes, modelsRes] = await Promise.allSettled([
        api.getChatModelPreferences(),
        api.getLlmModels({ active_only: true }),
      ]);
      const activeModels =
        modelsRes.status === "fulfilled" && Array.isArray(modelsRes.value.models) ? modelsRes.value.models : [];
      const preferences =
        preferencesRes.status === "fulfilled" && Array.isArray(preferencesRes.value.preferences)
          ? preferencesRes.value.preferences
          : [];
      setChatRegistryModels(activeModels);
      setChatModelConfigs(buildChatModelConfigs(activeModels, preferences));
      setMsg(
        [preferencesRes, modelsRes].some((r) => r.status === "rejected") ? "일부 데이터 로드 실패" : "",
      );
    } catch {
      setMsg("채팅 모델 설정 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const moveChatModel = useCallback((index: number, dir: -1 | 1) => {
    setChatModelConfigs((prev) => {
      const next = [...prev];
      if (next[index]?.preference_key === "mixture") return prev;
      const target = index + dir;
      if (target <= 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, idx) => ({
        ...item,
        display_order: item.preference_key === "mixture" ? 0 : (idx + 1) * 10,
      }));
    });
  }, []);

  const toggleChatModelFlag = useCallback((preferenceKey: string, field: "is_hidden" | "is_favorite" | "is_pinned") => {
    setChatModelConfigs((prev) => {
      const next = prev.map((item) =>
        item.preference_key === preferenceKey ? { ...item, [field]: !item[field] } : item
      );
      return normalizeChatModelRows(next);
    });
  }, []);

  const visibleChatModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const withIndex = chatModelConfigs.map((item, index) => ({ item, index }));
    const matched = q
      ? withIndex.filter(({ item }) =>
          `${item.display_name} ${item.provider} ${item.preference_key}`.toLowerCase().includes(q))
      : withIndex;
    return { matched, shown: matched.slice(0, modelLimit) };
  }, [chatModelConfigs, modelQuery, modelLimit]);

  const saveChatModelPreferences = useCallback(async () => {
    setSavingPrefs(true);
    try {
      const payload = chatModelConfigs.map((item, index) => ({
        preference_key: item.preference_key,
        provider: item.provider,
        model_id: item.model_id,
        display_order: item.preference_key === "mixture" ? 0 : (index + 1) * 10,
        is_hidden: item.is_hidden,
        is_favorite: item.is_favorite,
        is_pinned: item.is_pinned,
      }));
      const res = await api.updateChatModelPreferences(payload);
      const preferences = Array.isArray(res.preferences) ? res.preferences : [];
      setChatModelConfigs(buildChatModelConfigs(chatRegistryModels, preferences));
      flash("채팅 모델 노출 설정 저장 완료");
    } catch {
      flash("채팅 모델 노출 설정 저장 실패");
    } finally {
      setSavingPrefs(false);
    }
  }, [chatModelConfigs, chatRegistryModels, flash]);

  if (loading) {
    return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>불러오는 중...</p>;
  }

  return (
    <div className="space-y-2">
      {msg && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{msg}</p>}
    {/* 검색 + 저장을 한 줄에. 카드 제목은 바깥 섹션이 갖는다. */}
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <input
        value={modelQuery}
        onChange={(e) => { setModelQuery(e.target.value); setModelLimit(20); }}
        placeholder="모델 검색 (이름 · provider · 키)"
        className="text-xs rounded px-2 py-1.5 flex-1 min-w-[180px]"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      />
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {visibleChatModels.shown.length} / {visibleChatModels.matched.length}
        {modelQuery ? ` (전체 ${chatModelConfigs.length})` : ""}
      </span>
      <button
        onClick={() => void saveChatModelPreferences()}
        disabled={savingPrefs}
        className="px-4 py-2 rounded-lg text-sm font-bold"
        style={{ background: "var(--accent)", color: "#fff", opacity: savingPrefs ? 0.6 : 1 }}
      >
        {savingPrefs ? "저장 중..." : "채팅 모델 설정 저장"}
      </button>
    </div>

    <div className="space-y-2">
      {visibleChatModels.shown.map(({ item, index }) => (
        <div key={item.preference_key} className="rounded-lg px-3 py-3 flex items-center gap-3 flex-wrap" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <span className="text-xs font-bold w-6 text-center" style={{ color: item.preference_key === "mixture" ? "var(--accent)" : "var(--text-secondary)" }}>
            {item.preference_key === "mixture" ? "A" : index}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {item.is_pinned ? "📌 " : item.is_favorite ? "★ " : ""}{item.display_name}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                {item.provider}
              </span>
              <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{item.preference_key}</span>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.cost_label}</span>
              {item.is_hidden && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>
                  hidden
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => moveChatModel(index, -1)}
              disabled={item.preference_key === "mixture" || index <= 1}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
            >
              ▲
            </button>
            <button
              onClick={() => moveChatModel(index, 1)}
              disabled={item.preference_key === "mixture" || index === chatModelConfigs.length - 1}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
            >
              ▼
            </button>
            <button
              onClick={() => toggleChatModelFlag(item.preference_key, "is_pinned")}
              className="px-2 py-1 rounded text-xs"
              style={{ background: item.is_pinned ? "rgba(14,165,233,0.16)" : "var(--bg-primary)", color: item.is_pinned ? "#0ea5e9" : "var(--text-primary)" }}
            >
              상단 고정
            </button>
            <button
              onClick={() => toggleChatModelFlag(item.preference_key, "is_favorite")}
              className="px-2 py-1 rounded text-xs"
              style={{ background: item.is_favorite ? "rgba(245,158,11,0.16)" : "var(--bg-primary)", color: item.is_favorite ? "#f59e0b" : "var(--text-primary)" }}
            >
              즐겨찾기
            </button>
            <button
              onClick={() => toggleChatModelFlag(item.preference_key, "is_hidden")}
              className="px-2 py-1 rounded text-xs"
              style={{ background: item.is_hidden ? "rgba(239,68,68,0.16)" : "var(--bg-primary)", color: item.is_hidden ? "var(--danger)" : "var(--text-primary)" }}
            >
              {item.is_hidden ? "숨김 해제" : "숨김"}
            </button>
          </div>
        </div>
      ))}
    </div>

    {visibleChatModels.shown.length < visibleChatModels.matched.length && (
      <button
        onClick={() => setModelLimit((n) => n + 20)}
        className="w-full mt-3 py-2 rounded-lg text-sm"
        style={{ border: "1px dashed var(--border)", color: "var(--accent)", background: "transparent" }}
      >
        더 보기 ({visibleChatModels.matched.length - visibleChatModels.shown.length}개 남음)
      </button>
    )}
    </div>
  );
}
