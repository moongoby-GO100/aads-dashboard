"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

interface LlmKey {
  id: number;
  provider: string;
  key_name: string;
  masked_value: string;
  label: string;
  priority: number;
  is_active: boolean;
  rate_limited_until: string | null;
  last_used_at: string | null;
  last_verified_at?: string | null;
  notes: string;
}

interface LlmModelProviderSummary {
  provider: string;
  display_name: string;
  status: string;
  active_key_count: number;
  available_key_count: number;
  rate_limited_key_count: number;
  verified_key_count: number;
  active_model_count: number;
  template_model_count: number;
  discovered_model_count?: number;
  selectable_model_count?: number;
  executable_model_count?: number;
  template_active_model_count?: number;
  discovery_active_model_count?: number;
  active_model_source?: string;
  runtime_executable?: boolean;
  auto_discovery_supported?: boolean;
  discovery_requirement?: string | null;
  discovery_mode?: string | null;
  last_seen_at?: string | null;
  linked_key_name: string | null;
  requires_admin_review: boolean;
}

interface LlmModelSummaryResponse {
  providers: LlmModelProviderSummary[];
  total: number;
  active_provider_count: number;
  rate_limited_provider_count: number;
  review_required_providers: string[];
  last_sync_at: string | null;
  last_sync_reason: string | null;
  last_sync_actor: string | null;
  normalized_providers: Record<string, number>;
}

interface LlmRegistryModel {
  provider: string;
  model_id: string;
  display_name?: string;
  input_cost?: string | number | null;
  output_cost?: string | number | null;
  is_active?: boolean;
  supports_tools?: boolean;
  supports_thinking?: boolean;
  supports_vision?: boolean;
  supports_coding?: boolean;
}

interface ProviderTimelineItem {
  id: number;
  provider: string;
  key_name: string;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface ChatModelPreference {
  preference_key?: string;
  provider?: string;
  model_id: string;
  display_order: number;
  is_hidden: boolean;
  is_favorite: boolean;
  is_pinned: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

interface ChatModelConfigRow extends ChatModelPreference {
  preference_key: string;
  display_name: string;
  provider: string;
  cost_label: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#d4a017",
  codex: "#0ea5e9",
  deepseek: "#06b6d4",
  gemini: "#4285f4",
  groq: "#ff6b6b",
  kimi: "#ec4899",
  minimax: "#8b5cf6",
  openai: "#10a37f",
  openrouter: "#64748b",
  qwen: "#f97316",
};

const REGISTRY_STATUS_COLORS: Record<string, string> = {
  active: "var(--success)",
  rate_limited: "var(--warning)",
  inactive: "var(--text-secondary)",
  review_required: "var(--danger)",
};

function toKst(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function isRateLimited(key: LlmKey): boolean {
  return !!key.rate_limited_until && new Date(key.rate_limited_until) > new Date();
}

function formatCostLabel(model: LlmRegistryModel): string {
  const input = Number(model.input_cost);
  const output = Number(model.output_cost);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return "변동";
  if (input === 0 && output === 0) return "무료";
  return `$${input}/$${output}`;
}

function formatDiscoveryMode(provider: LlmModelProviderSummary): string {
  if (provider.auto_discovery_supported) return "자동 discovery";
  if (provider.runtime_executable) return "실행 가능 / discovery 제한";
  return "템플릿 대기";
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

function buildTimelineLabel(item: ProviderTimelineItem): string {
  const details = item.details || {};
  switch (item.event_type) {
    case "provider_sync":
      return `${String(details.status || "unknown")} · 모델 ${details.active_model_count || 0}/${details.template_model_count || 0}`;
    case "registry_sync":
      return "전체 레지스트리 동기화";
    case "create":
      return `${item.key_name} 키 등록`;
    case "update":
      return `${item.key_name} 키 업데이트`;
    case "activate":
      return `${item.key_name} 키 활성화`;
    case "deactivate":
      return `${item.key_name} 키 비활성화`;
    default:
      return item.event_type;
  }
}

function buildTimelineSubtext(item: ProviderTimelineItem): string {
  const details = item.details || {};
  const reason = typeof details.reason === "string" ? details.reason : "";
  const actor = item.actor || "system";
  if (reason) return `${actor} · ${reason}`;
  return actor;
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

export default function LlmRegistryWorkspacePanel() {
  const [keys, setKeys] = useState<LlmKey[]>([]);
  const [summary, setSummary] = useState<LlmModelSummaryResponse | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, LlmRegistryModel[]>>({});
  const [providerTimeline, setProviderTimeline] = useState<Record<string, ProviderTimelineItem[]>>({});
  const [providerLoading, setProviderLoading] = useState<Record<string, boolean>>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [chatRegistryModels, setChatRegistryModels] = useState<LlmRegistryModel[]>([]);
  const [chatModelConfigs, setChatModelConfigs] = useState<ChatModelConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState({
    provider: "anthropic",
    key_name: "",
    value: "",
    label: "",
    priority: 1,
    notes: "",
  });

  const flash = useCallback((text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(""), 3000);
  }, []);

  const loadProviderDetails = useCallback(async (provider: string, force = false) => {
    if (!force && providerModels[provider] && providerTimeline[provider]) return;
    setProviderLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const [modelRes, timelineRes] = await Promise.allSettled([
        api.getLlmModels({ provider, active_only: true }),
        api.getLlmProviderTimeline(provider, 12),
      ]);
      setProviderModels((prev) => ({
        ...prev,
        [provider]:
          modelRes.status === "fulfilled" && Array.isArray(modelRes.value.models) ? modelRes.value.models : [],
      }));
      setProviderTimeline((prev) => ({
        ...prev,
        [provider]:
          timelineRes.status === "fulfilled" && Array.isArray(timelineRes.value.timeline) ? timelineRes.value.timeline : [],
      }));
    } finally {
      setProviderLoading((prev) => ({ ...prev, [provider]: false }));
    }
  }, [providerModels, providerTimeline]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, summaryRes, preferencesRes, modelsRes] = await Promise.allSettled([
        api.getLlmKeys(),
        api.getLlmModelSummary(),
        api.getChatModelPreferences(),
        api.getLlmModels({ active_only: true }),
      ]);
      const normalizedKeys =
        keysRes.status === "fulfilled" && Array.isArray(keysRes.value) ? keysRes.value : [];
      const summaryValue = summaryRes.status === "fulfilled" ? summaryRes.value : null;
      const activeModels =
        modelsRes.status === "fulfilled" && Array.isArray(modelsRes.value.models) ? modelsRes.value.models : [];
      const preferences =
        preferencesRes.status === "fulfilled" && Array.isArray(preferencesRes.value.preferences)
          ? preferencesRes.value.preferences
          : [];
      setKeys(normalizedKeys);
      setSummary(summaryValue);
      setChatRegistryModels(activeModels);
      setChatModelConfigs(buildChatModelConfigs(activeModels, preferences));
      const hasFailure = [keysRes, summaryRes, preferencesRes, modelsRes].some((result) => result.status === "rejected");
      setMsg(hasFailure ? "일부 LLM 운영 데이터 로드 실패" : "");
    } catch {
      setMsg("LLM 운영 화면 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const keysByProvider = useMemo(() => {
    return keys.reduce<Record<string, LlmKey[]>>((acc, key) => {
      if (!acc[key.provider]) acc[key.provider] = [];
      acc[key.provider].push(key);
      return acc;
    }, {});
  }, [keys]);

  const providerCards = useMemo(() => {
    const summaryMap = new Map((summary?.providers || []).map((item) => [item.provider, item]));
    const providers = new Set<string>([
      ...Object.keys(keysByProvider),
      ...(summary?.providers || []).map((item) => item.provider),
    ]);
    return Array.from(providers)
      .sort((a, b) => a.localeCompare(b))
      .map((provider) => {
        const summaryRow = summaryMap.get(provider);
        const providerKeys = keysByProvider[provider] || [];
        return {
          provider,
          display_name: summaryRow?.display_name || provider.toUpperCase(),
          status: summaryRow?.status || (providerKeys.some((key) => key.is_active) ? "active" : "inactive"),
          active_key_count: summaryRow?.active_key_count ?? providerKeys.filter((key) => key.is_active).length,
          available_key_count: summaryRow?.available_key_count ?? providerKeys.filter((key) => key.is_active && !isRateLimited(key)).length,
          rate_limited_key_count: summaryRow?.rate_limited_key_count ?? providerKeys.filter(isRateLimited).length,
          verified_key_count: summaryRow?.verified_key_count ?? providerKeys.filter((key) => !!key.last_verified_at).length,
          active_model_count: summaryRow?.active_model_count ?? (providerModels[provider]?.length || 0),
          template_model_count: summaryRow?.template_model_count ?? (providerModels[provider]?.length || 0),
          discovered_model_count: summaryRow?.discovered_model_count ?? 0,
          selectable_model_count: summaryRow?.selectable_model_count ?? (providerModels[provider]?.length || 0),
          executable_model_count: summaryRow?.executable_model_count ?? (providerModels[provider]?.length || 0),
          template_active_model_count: summaryRow?.template_active_model_count ?? 0,
          discovery_active_model_count: summaryRow?.discovery_active_model_count ?? 0,
          active_model_source: summaryRow?.active_model_source ?? "none",
          runtime_executable: summaryRow?.runtime_executable ?? false,
          auto_discovery_supported: summaryRow?.auto_discovery_supported ?? false,
          discovery_requirement: summaryRow?.discovery_requirement ?? null,
          discovery_mode: summaryRow?.discovery_mode ?? null,
          last_seen_at: summaryRow?.last_seen_at ?? null,
          linked_key_name: summaryRow?.linked_key_name || providerKeys[0]?.key_name || null,
          requires_admin_review: summaryRow?.requires_admin_review ?? false,
          keys: providerKeys,
        };
      });
  }, [keysByProvider, providerModels, summary]);

  const normalizedEntries = useMemo(
    () => Object.entries(summary?.normalized_providers || {}),
    [summary?.normalized_providers],
  );

  const toggleExpandProvider = useCallback((provider: string) => {
    const nextExpanded = !expandedProviders[provider];
    setExpandedProviders((prev) => ({ ...prev, [provider]: nextExpanded }));
    if (nextExpanded) {
      void loadProviderDetails(provider);
    }
  }, [expandedProviders, loadProviderDetails]);

  const reloadExpandedProviders = useCallback(async () => {
    const providers = Object.keys(expandedProviders).filter((provider) => expandedProviders[provider]);
    await Promise.all(providers.map((provider) => loadProviderDetails(provider, true)));
  }, [expandedProviders, loadProviderDetails]);

  const toggleKey = useCallback(async (key: LlmKey) => {
    await api.updateLlmKey(key.id, { is_active: !key.is_active });
    await load();
    if (expandedProviders[key.provider]) {
      await loadProviderDetails(key.provider, true);
    }
    flash(key.is_active ? "키 비활성화 완료" : "키 활성화 완료");
  }, [expandedProviders, flash, load, loadProviderDetails]);

  const saveEdit = useCallback(async (key: LlmKey) => {
    if (!editVal.trim()) return;
    await api.updateLlmKey(key.id, { value: editVal.trim() });
    setEditId(null);
    setEditVal("");
    await load();
    if (expandedProviders[key.provider]) {
      await loadProviderDetails(key.provider, true);
    }
    flash("키 값 업데이트 완료");
  }, [editVal, expandedProviders, flash, load, loadProviderDetails]);

  const addKey = useCallback(async () => {
    if (!newKey.key_name.trim() || !newKey.value.trim()) {
      flash("key_name과 value는 필수입니다");
      return;
    }
    await api.createLlmKey({
      provider: newKey.provider.trim(),
      key_name: newKey.key_name.trim(),
      value: newKey.value.trim(),
      label: newKey.label.trim(),
      priority: newKey.priority,
      notes: newKey.notes.trim(),
    });
    setShowAdd(false);
    setNewKey({ provider: "anthropic", key_name: "", value: "", label: "", priority: 1, notes: "" });
    await load();
    flash("키 추가 완료");
  }, [flash, load, newKey]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await api.syncLlmModelRegistry();
      await load();
      await reloadExpandedProviders();
      flash("모델 레지스트리 동기화 완료");
    } catch {
      flash("모델 레지스트리 동기화 실패");
    } finally {
      setSyncing(false);
    }
  }, [flash, load, reloadExpandedProviders]);

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
    return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;
  }

  return (
    <div className="space-y-5">
      {msg && (
        <p
          className="text-sm px-3 py-2 rounded"
          style={{
            background: msg.includes("실패") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            color: msg.includes("실패") ? "var(--danger)" : "var(--success)",
          }}
        >
          {msg}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>활성 Provider</p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{summary?.active_provider_count ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Rate-Limited</p>
          <p className="text-lg font-bold" style={{ color: "var(--warning)" }}>{summary?.rate_limited_provider_count ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>검토 필요</p>
          <p className="text-lg font-bold" style={{ color: "var(--danger)" }}>{summary?.review_required_providers?.length ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>마지막 동기화</p>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{toKst(summary?.last_sync_at)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={syncNow}
          disabled={syncing}
          className="px-4 py-2 rounded-lg text-sm font-bold"
          style={{ background: "var(--accent)", color: "#fff", opacity: syncing ? 0.6 : 1 }}
        >
          {syncing ? "동기화 중..." : "레지스트리 수동 동기화"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          reason={summary?.last_sync_reason || "—"} / actor={summary?.last_sync_actor || "—"}
        </span>
      </div>

      {normalizedEntries.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>최근 provider 정규화</p>
          <div className="flex flex-wrap gap-2">
            {normalizedEntries.map(([rule, count]) => (
              <span key={rule} className="px-2 py-1 rounded text-xs font-mono" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                {rule} x{count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {providerCards.map((provider) => (
          <div key={provider.provider} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}>
            <button
              onClick={() => toggleExpandProvider(provider.provider)}
              className="w-full px-4 py-4 text-left"
              style={{ background: "transparent" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: PROVIDER_COLORS[provider.provider] ?? "var(--accent)", color: "#fff" }}
                  >
                    {provider.provider.toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{provider.display_name}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      키 {provider.available_key_count} usable / {provider.active_key_count} active · 모델 {provider.active_model_count}/{provider.template_model_count}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--bg-primary)", color: REGISTRY_STATUS_COLORS[provider.status] || "var(--text-primary)" }}>
                    {provider.status}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {expandedProviders[provider.provider] ? "접기" : "펼치기"}
                  </span>
                </div>
              </div>
            </button>

            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>Linked Key</p>
                  <p className="font-mono mt-1" style={{ color: "var(--text-primary)" }}>{provider.linked_key_name || "—"}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>Rate-Limited</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{provider.rate_limited_key_count}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>등록 키</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{provider.keys.length}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>Discovery</p>
                  <p className="font-semibold mt-1" style={{ color: provider.auto_discovery_supported ? "var(--success)" : "var(--warning)" }}>
                    {formatDiscoveryMode(provider)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>활성 소스</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{provider.active_model_source || "none"}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>실행 가능 모델</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{provider.executable_model_count ?? provider.active_model_count}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>Discovery 활성</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{provider.discovery_active_model_count ?? 0}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                  <p style={{ color: "var(--text-secondary)" }}>마지막 반영</p>
                  <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{toKst(provider.last_seen_at)}</p>
                </div>
              </div>

              {provider.runtime_executable && !provider.auto_discovery_supported && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                  현재 이 provider는 실행은 가능하지만 catalog discovery는 제한됩니다. 자동 반영은 템플릿 기반이며, 조건: {provider.discovery_requirement || "별도 API 키 필요"}
                </div>
              )}

              {provider.requires_admin_review && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.24)", color: "var(--danger)" }}>
                  관리자 검토 필요: 템플릿이 없거나 review_required 상태의 모델이 포함됩니다.
                </div>
              )}

              <div className="space-y-2">
                {provider.keys.length === 0 ? (
                  <div className="rounded-lg p-3 text-xs" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    등록된 키가 없습니다.
                  </div>
                ) : (
                  provider.keys.map((key) => (
                    <div
                      key={key.id}
                      className="rounded-lg p-3 flex items-center gap-3 flex-wrap"
                      style={{ background: key.is_active ? "var(--bg-primary)" : "rgba(0,0,0,0.15)", border: "1px solid var(--border)", opacity: key.is_active ? 1 : 0.6 }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold" style={{ color: "var(--text-primary)" }}>{key.key_name}</span>
                          {key.label && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{key.label}</span>}
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>P{key.priority}</span>
                          {isRateLimited(key) && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)" }}>
                              Rate-limited
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {editId === key.id ? (
                            <>
                              <input
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                placeholder="새 키 값 입력..."
                                className="text-xs font-mono rounded px-2 py-1 flex-1"
                                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                              />
                              <button onClick={() => void saveEdit(key)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>저장</button>
                              <button onClick={() => { setEditId(null); setEditVal(""); }} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>취소</button>
                            </>
                          ) : (
                            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{key.masked_value}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <span>최근 사용: {toKst(key.last_used_at)}</span>
                          <span>최근 검증: {toKst(key.last_verified_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {editId !== key.id && (
                          <button
                            onClick={() => { setEditId(key.id); setEditVal(""); }}
                            className="text-xs px-2 py-1 rounded"
                            style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          >
                            키 변경
                          </button>
                        )}
                        <button
                          onClick={() => void toggleKey(key)}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: key.is_active ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: key.is_active ? "var(--danger)" : "var(--success)" }}
                        >
                          {key.is_active ? "비활성화" : "활성화"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {expandedProviders[provider.provider] && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-1">
                  <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>실행 가능 모델</h4>
                      {providerLoading[provider.provider] && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>로딩 중...</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(providerModels[provider.provider] || []).length === 0 ? (
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>활성 모델이 없습니다.</span>
                      ) : (
                        (providerModels[provider.provider] || []).map((model) => (
                          <div key={model.model_id} className="px-3 py-2 rounded-lg text-xs" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{model.display_name || model.model_id}</div>
                            <div style={{ color: "var(--text-secondary)" }}>{formatCostLabel(model)}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {model.supports_coding && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9" }}>coding</span>}
                              {model.supports_thinking && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>thinking</span>}
                              {model.supports_vision && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>vision</span>}
                              {model.supports_tools && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>tools</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>Provider Sync 이력</h4>
                    <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                      {(providerTimeline[provider.provider] || []).length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>표시할 이력이 없습니다.</p>
                      ) : (
                        (providerTimeline[provider.provider] || []).map((item) => (
                          <div key={item.id} className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{buildTimelineLabel(item)}</span>
                              <span style={{ color: "var(--text-secondary)" }}>{toKst(item.created_at)}</span>
                            </div>
                            <div className="mt-1" style={{ color: "var(--text-secondary)" }}>{buildTimelineSubtext(item)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>채팅창 모델 노출 순서</h3>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              채팅창 selector의 노출 순서, 즐겨찾기, 상단 고정, 숨김 여부를 설정합니다.
            </p>
          </div>
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
          {chatModelConfigs.map((item, index) => (
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
      </div>

      {showAdd ? (
        <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>새 키 추가</h4>
          <div className="grid grid-cols-2 gap-3">
            {[["provider", "Provider (예: anthropic)"], ["key_name", "Key Name (예: ANTHROPIC_AUTH_TOKEN_3)"], ["label", "Label (예: primary)"], ["value", "API Key 값"]].map(([field, ph]) => (
              <input
                key={field}
                value={newKey[field as keyof typeof newKey] as string | number}
                onChange={(e) => setNewKey((prev) => ({ ...prev, [field]: field === "priority" ? Number(e.target.value) : e.target.value }))}
                placeholder={ph}
                type={field === "value" ? "password" : "text"}
                className="text-sm rounded px-3 py-2"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", gridColumn: field === "value" ? "1 / -1" : undefined }}
              />
            ))}
            <input
              type="number"
              value={newKey.priority}
              onChange={(e) => setNewKey((prev) => ({ ...prev, priority: Number(e.target.value) }))}
              placeholder="우선순위 (낮을수록 먼저)"
              className="text-sm rounded px-3 py-2"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void addKey()} className="px-4 py-2 rounded text-sm font-bold" style={{ background: "var(--accent)", color: "#fff" }}>추가</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>취소</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2 rounded-lg text-sm font-bold border-dashed"
          style={{ border: "1px dashed var(--border)", color: "var(--accent)", background: "transparent" }}
        >
          + 새 LLM API 키 추가
        </button>
      )}
    </div>
  );
}
