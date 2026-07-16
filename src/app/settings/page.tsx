"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Header from "@/components/Header";
import DatabaseOverviewPanel from "@/components/settings/DatabaseOverviewPanel";
import LlmRegistryWorkspacePanel from "@/components/settings/LlmRegistryWorkspacePanel";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/types";

const QUICK_LINKS = [
  { label: "HANDOVER", url: "https://aads.newtalk.kr/api/v1/context/handover", desc: "현재 핸드오버 문서" },
  { label: "CEO DIRECTIVES", url: "https://aads.newtalk.kr/api/v1/context/system/ceo_directives", desc: "CEO 지시사항" },
  { label: "Public Summary", url: "https://aads.newtalk.kr/api/v1/context/public-summary", desc: "공개 요약 정보" },
  { label: "Watchdog Summary", url: "https://aads.newtalk.kr/api/v1/watchdog/summary", desc: "에러 자동감시 현황" },
  { label: "API Docs", url: "https://aads.newtalk.kr/api/v1/docs", desc: "FastAPI Swagger" },
  { label: "API Health", url: "https://aads.newtalk.kr/api/v1/health", desc: "서버 헬스체크" },
];

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "AI_REVIEW"];
const SIZE_LABELS: Record<string, string> = {
  XS: "XS (초소형)",
  S: "S (소형)",
  M: "M (중형)",
  L: "L (대형)",
  XL: "XL (초대형)",
  AI_REVIEW: "AI Review (코드 리뷰)",
};



const LEGACY_AVAILABLE_MODELS = [
  { group: "Claude (월정액)", models: ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"] },
  { group: "Codex/GPT (월정액)", models: ["codex:gpt-5.5", "codex:gpt-5.4", "codex:gpt-5.4-mini", "codex:gpt-5.3-codex", "codex:gpt-5.3-codex-spark", "codex:gpt-5.2"] },
  { group: "MiniMax (월정액)", models: ["litellm:minimax-m2.7", "litellm:minimax-m2.5"] },
  { group: "Groq (무료)", models: ["litellm:groq-llama-70b", "litellm:groq-qwen3-32b", "litellm:groq-kimi-k2", "litellm:groq-llama4-scout"] },
  { group: "Gemini", models: ["litellm:gemini-2.5-flash", "litellm:gemini-2.5-pro", "litellm:gemini-3-flash-preview", "litellm:gemini-3-pro-preview", "litellm:gemini-3.1-flash-lite-preview", "litellm:gemini-3.1-pro-preview"] },
  { group: "Qwen", models: ["qwen-turbo", "litellm:qwen3-coder-plus", "litellm:qwen3-235b", "litellm:qwen3-max", "litellm:qwen3-coder-flash"] },
  { group: "DeepSeek", models: ["litellm:deepseek-chat", "litellm:deepseek-reasoner"] },
  { group: "Kimi", models: ["litellm:kimi-k2", "litellm:kimi-k2.5"] },
  { group: "OpenRouter", models: ["litellm:openrouter-grok-4-fast", "litellm:openrouter-deepseek-v3"] },
];

interface RunnerRegistryModel {
  provider: string;
  model_id: string;
  display_name?: string;
  metadata?: Record<string, unknown>;
}

interface RunnerAvailableModelOption {
  value: string;
  label: string;
}

interface RunnerAvailableModelGroup {
  group: string;
  models: RunnerAvailableModelOption[];
}

interface ModelConfig {
  size: string;
  models: string[];
  updated_at: string | null;
  updated_by: string;
}

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

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#d4a017",
  gemini: "#4285f4",
  deepseek: "#00bcd4",
  groq: "#ff6b6b",
  openai: "#10a37f",
};

const REGISTRY_STATUS_COLORS: Record<string, string> = {
  active: "var(--success)",
  rate_limited: "var(--warning)",
  inactive: "var(--text-secondary)",
  review_required: "var(--danger)",
};

const RUNNER_PROVIDER_GROUP_LABELS: Record<string, string> = {
  anthropic: "Claude (월정액)",
  codex: "Codex/GPT (월정액)",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  groq: "Groq (무료)",
  kimi: "Kimi",
  minimax: "MiniMax (월정액)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  qwen: "Qwen",
};

const RUNNER_PROVIDER_ORDER = [
  "anthropic",
  "codex",
  "openai",
  "gemini",
  "deepseek",
  "qwen",
  "groq",
  "kimi",
  "minimax",
  "openrouter",
];

function buildRunnerModelValue(model: RunnerRegistryModel): string {
  const provider = (model.provider || "").trim().toLowerCase();
  const backend = String(model.metadata?.["execution_backend"] || "").trim().toLowerCase();
  if (provider === "codex") return `codex:${model.model_id}`;
  if (
    backend === "litellm_proxy" ||
    provider === "gemini" ||
    provider === "groq" ||
    provider === "openrouter" ||
    provider === "litellm"
  ) {
    return `litellm:${model.model_id}`;
  }
  return model.model_id;
}

function buildRunnerModelGroups(models: RunnerRegistryModel[]): RunnerAvailableModelGroup[] {
  const grouped = new Map<string, RunnerAvailableModelOption[]>();
  const seen = new Set<string>();
  const sorted = [...models].sort((a, b) => {
    const providerOrder =
      RUNNER_PROVIDER_ORDER.indexOf((a.provider || "").toLowerCase()) -
      RUNNER_PROVIDER_ORDER.indexOf((b.provider || "").toLowerCase());
    if (providerOrder !== 0) return providerOrder;
    return (a.display_name || a.model_id).localeCompare(b.display_name || b.model_id);
  });

  for (const model of sorted) {
    const value = buildRunnerModelValue(model);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const provider = (model.provider || "").trim().toLowerCase();
    const group = RUNNER_PROVIDER_GROUP_LABELS[provider] || provider.toUpperCase();
    const item = { value, label: model.display_name || model.model_id };
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(item);
  }

  return Array.from(grouped.entries()).map(([group, items]) => ({ group, models: items }));
}

function toKst(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function LlmKeyManager() {
  const [keys, setKeys] = useState<LlmKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState({ provider: "anthropic", key_name: "", value: "", label: "", priority: 1, notes: "" });

  const load = useCallback(() => {
    setLoading(true);
    (api as any).getLlmKeys()
      .then((r: LlmKey[]) => setKeys(r))
      .catch(() => setMsg("로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const toggle = async (k: LlmKey) => {
    await (api as any).updateLlmKey(k.id, { is_active: !k.is_active });
    load(); flash(k.is_active ? "비활성화됨" : "활성화됨");
  };

  const saveEdit = async (id: number) => {
    if (!editVal.trim()) return;
    await (api as any).updateLlmKey(id, { value: editVal.trim() });
    setEditId(null); setEditVal(""); load(); flash("키 값 업데이트 완료");
  };

  const addKey = async () => {
    if (!newKey.key_name || !newKey.value) { flash("key_name과 value는 필수입니다"); return; }
    await (api as any).createLlmKey(newKey);
    setShowAdd(false); setNewKey({ provider: "anthropic", key_name: "", value: "", label: "", priority: 1, notes: "" });
    load(); flash("키 추가 완료");
  };

  const byProvider = keys.reduce((acc, k) => {
    if (!acc[k.provider]) acc[k.provider] = [];
    acc[k.provider].push(k);
    return acc;
  }, {} as Record<string, LlmKey[]>);

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm px-3 py-2 rounded" style={{ background: msg.includes("실패") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: msg.includes("실패") ? "var(--danger)" : "var(--success)" }}>{msg}</p>}

      {Object.entries(byProvider).map(([provider, pKeys]) => (
        <div key={provider} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2 flex items-center gap-2" style={{ background: "var(--bg-hover)" }}>
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: PROVIDER_COLORS[provider] ?? "var(--accent)", color: "#fff" }}>{provider.toUpperCase()}</span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{pKeys.length}개 키</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {pKeys.map((k) => (
              <div key={k.id} className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: k.is_active ? "var(--bg-primary)" : "rgba(0,0,0,0.15)", opacity: k.is_active ? 1 : 0.6 }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold" style={{ color: "var(--text-primary)" }}>{k.key_name}</span>
                    {k.label && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>{k.label}</span>}
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>P{k.priority}</span>
                    {k.rate_limited_until && new Date(k.rate_limited_until) > new Date() && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)" }}>Rate-limited</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {editId === k.id ? (
                      <>
                        <input value={editVal} onChange={(e) => setEditVal(e.target.value)}
                          placeholder="새 키 값 입력..."
                          className="text-xs font-mono rounded px-2 py-1 flex-1"
                          style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        <button onClick={() => saveEdit(k.id)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>저장</button>
                        <button onClick={() => { setEditId(null); setEditVal(""); }} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>취소</button>
                      </>
                    ) : (
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{k.masked_value}</span>
                    )}
                  </div>
                  {k.last_used_at && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                      최근 사용: {new Date(k.last_used_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editId !== k.id && (
                    <button onClick={() => { setEditId(k.id); setEditVal(""); }} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>키 변경</button>
                  )}
                  <button onClick={() => toggle(k)} className="text-xs px-2 py-1 rounded" style={{ background: k.is_active ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: k.is_active ? "var(--danger)" : "var(--success)" }}>
                    {k.is_active ? "비활성화" : "활성화"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd ? (
        <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>새 키 추가</h4>
          <div className="grid grid-cols-2 gap-3">
            {[["provider", "Provider (예: anthropic)"], ["key_name", "Key Name (예: ANTHROPIC_AUTH_TOKEN_3)"], ["label", "Label (예: moong3@gmail)"], ["value", "API Key 값"]].map(([field, ph]) => (
              <input key={field} value={(newKey as any)[field]} onChange={(e) => setNewKey((p) => ({ ...p, [field]: e.target.value }))}
                placeholder={ph} type={field === "value" ? "password" : "text"}
                className="text-sm rounded px-3 py-2"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", gridColumn: field === "value" ? "1 / -1" : undefined }} />
            ))}
            <input type="number" value={newKey.priority} onChange={(e) => setNewKey((p) => ({ ...p, priority: +e.target.value }))}
              placeholder="우선순위 (낮을수록 먼저)"
              className="text-sm rounded px-3 py-2"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={addKey} className="px-4 py-2 rounded text-sm font-bold" style={{ background: "var(--accent)", color: "#fff" }}>추가</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full py-2 rounded-lg text-sm font-bold border-dashed"
          style={{ border: "1px dashed var(--border)", color: "var(--accent)", background: "transparent" }}>
          + 새 LLM API 키 추가
        </button>
      )}
    </div>
  );
}

function LlmModelRegistryPanel() {
  const [summary, setSummary] = useState<LlmModelSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    (api as any).getLlmModelSummary()
      .then((res: LlmModelSummaryResponse) => {
        setSummary(res);
        setMsg("");
      })
      .catch(() => setMsg("레지스트리 상태 로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await (api as any).syncLlmModelRegistry();
      setSummary(res);
      flash("모델 레지스트리 동기화 완료");
      load();
    } catch {
      flash("모델 레지스트리 동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  const providers = summary?.providers || [];
  const normalizedEntries = Object.entries(summary?.normalized_providers || {});

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {providers.map((provider) => (
          <div key={provider.provider} className="rounded-lg p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{provider.display_name}</p>
                <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{provider.provider}</p>
              </div>
              <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--bg-primary)", color: REGISTRY_STATUS_COLORS[provider.status] || "var(--text-primary)" }}>
                {provider.status}
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Active Models</span>
                <span style={{ color: "var(--text-primary)" }}>{provider.active_model_count} / {provider.template_model_count}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Keys</span>
                <span style={{ color: "var(--text-primary)" }}>{provider.available_key_count} usable / {provider.active_key_count} active</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Rate-Limited</span>
                <span style={{ color: "var(--text-primary)" }}>{provider.rate_limited_key_count}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Linked Key</span>
                <span className="font-mono" style={{ color: "var(--text-primary)" }}>{provider.linked_key_name || "—"}</span>
              </div>
            </div>
            {provider.requires_admin_review && (
              <p className="text-xs mt-3 font-semibold" style={{ color: "var(--danger)" }}>
                관리자 검토 필요: 템플릿이 없는 provider입니다.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RunnerModelConfig() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [registryModels, setRegistryModels] = useState<RunnerRegistryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [newModel, setNewModel] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api.getRunnerModels(),
      (api as any).getLlmModels({ active_only: true }),
    ])
      .then(([configsRes, registryRes]) => {
        if (configsRes.status === "fulfilled") {
          const sorted = (configsRes.value.configs || []).sort(
            (a: ModelConfig, b: ModelConfig) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
          );
          setConfigs(sorted);
        } else {
          setMsg("러너 설정 로드 실패");
        }

        if (registryRes.status === "fulfilled" && Array.isArray(registryRes.value.models)) {
          setRegistryModels(registryRes.value.models);
        } else {
          setRegistryModels([]);
          setMsg((prev) => prev || "모델 레지스트리 로드 실패");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const registryGroups = useMemo<RunnerAvailableModelGroup[]>(() => {
    const groups = buildRunnerModelGroups(registryModels);
    if (groups.length > 0) return groups;
    return LEGACY_AVAILABLE_MODELS.map((group) => ({
      group: group.group,
      models: group.models.map((value) => ({ value, label: value })),
    }));
  }, [registryModels]);

  const availableRegistryValues = useMemo(() => {
    const values = new Set<string>();
    for (const group of registryGroups) {
      for (const model of group.models) {
        values.add(model.value);
      }
    }
    return values;
  }, [registryGroups]);

  const moveModel = (sizeIdx: number, modelIdx: number, dir: -1 | 1) => {
    const next = [...configs];
    const arr = [...next[sizeIdx].models];
    const target = modelIdx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[modelIdx], arr[target]] = [arr[target], arr[modelIdx]];
    next[sizeIdx] = { ...next[sizeIdx], models: arr };
    setConfigs(next);
  };

  const removeModel = (sizeIdx: number, modelIdx: number) => {
    const next = [...configs];
    const arr = next[sizeIdx].models.filter((_, i) => i !== modelIdx);
    if (arr.length === 0) return;
    next[sizeIdx] = { ...next[sizeIdx], models: arr };
    setConfigs(next);
  };

  const addModel = (sizeIdx: number) => {
    const size = configs[sizeIdx].size;
    const val = (newModel[size] || "").trim();
    if (!val) return;
    const next = [...configs];
    next[sizeIdx] = { ...next[sizeIdx], models: [...next[sizeIdx].models, val] };
    setConfigs(next);
    setNewModel((p) => ({ ...p, [size]: "" }));
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const payload = configs.map((c) => ({ size: c.size, models: c.models }));
      const res: any = await api.updateRunnerModels(payload);
      setMsg(res.message || "저장 완료");
      load();
    } catch {
      setMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {configs.map((cfg, si) => (
        <div key={cfg.size} className="rounded-lg p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          {(() => {
            const missingModels = cfg.models.filter((model) => !availableRegistryValues.has(model));
            return missingModels.length > 0 ? (
              <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                레지스트리에 현재 노출되지 않는 모델: {missingModels.join(", ")}
              </div>
            ) : null;
          })()}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: cfg.size === "AI_REVIEW" ? "var(--accent)" : "var(--text-primary)" }}>
              {SIZE_LABELS[cfg.size] || cfg.size}
            </h3>
            {cfg.updated_at && (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {new Date(cfg.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {cfg.models.map((model, mi) => (
              <div key={mi} className="flex items-center gap-2 rounded px-3 py-2" style={{ background: "var(--bg-primary)" }}>
                <span className="text-xs font-bold w-5 text-center" style={{ color: mi === 0 ? "var(--success)" : "var(--text-secondary)" }}>
                  {mi + 1}
                </span>
                <span className="flex-1 text-sm font-mono truncate" style={{ color: "var(--text-primary)" }}>{model}</span>
                <button onClick={() => moveModel(si, mi, -1)} disabled={mi === 0}
                  className="px-1.5 py-0.5 rounded text-xs disabled:opacity-30" style={{ background: "var(--bg-hover)" }}>▲</button>
                <button onClick={() => moveModel(si, mi, 1)} disabled={mi === cfg.models.length - 1}
                  className="px-1.5 py-0.5 rounded text-xs disabled:opacity-30" style={{ background: "var(--bg-hover)" }}>▼</button>
                <button onClick={() => removeModel(si, mi)} disabled={cfg.models.length <= 1}
                  className="px-1.5 py-0.5 rounded text-xs disabled:opacity-30" style={{ color: "var(--danger)" }}>✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <select
              value={newModel[cfg.size] || ""}
              onChange={(e) => setNewModel((p) => ({ ...p, [cfg.size]: e.target.value }))}
              className="flex-1 rounded px-3 py-1.5 text-sm font-mono"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <option value="">모델 선택...</option>
              {registryGroups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.models.filter((m) => !cfg.models.includes(m.value)).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={() => addModel(si)} className="px-3 py-1.5 rounded text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}>추가</button>
          </div>
        </div>
      ))}
      </div>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        러너 모델 추가 목록은 활성 레지스트리 기준으로 자동 갱신되며, 레지스트리 조회 실패 시에만 정적 목록으로 폴백됩니다.
      </p>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-bold"
          style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
          {saving ? "저장 중..." : "설정 저장"}
        </button>
        <button onClick={load} className="px-4 py-2 rounded-lg text-sm"
          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>초기화</button>
        {msg && <span className="text-sm" style={{ color: msg.includes("실패") ? "var(--danger)" : "var(--success)" }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHealth()
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ok = (v: boolean | undefined) =>
    v === undefined ? "var(--text-secondary)" : v ? "var(--success)" : "var(--danger)";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Settings" />
      <div className="flex-1 p-3 md:p-6 overflow-auto space-y-5">

        {/* 러너 모델 설정 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>러너 모델 우선순위</h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            Size별 모델 실행 순서를 설정합니다. 1순위 실패 시 다음 순위로 자동 폴백됩니다.
          </p>
          <RunnerModelConfig />
        </section>
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>LLM 키 및 모델 레지스트리</h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            등록된 API 키 기준 실행 가능 모델 집합, 최근 동기화 상태, 채팅창 노출 순서를 한 화면에서 관리합니다.
          </p>
          <LlmRegistryWorkspacePanel />
        </section>

        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>DB 연결 상태</h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
            내부 PostgreSQL, Graph DB, DB Pool, 원격 프로젝트 DB 접근 상태를 확인합니다.
          </p>
          <DatabaseOverviewPanel graphReady={health?.graph_ready} />
        </section>



        {/* API 상태 요약 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>시스템 상태</h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
          ) : health ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>서버 상태</p>
                <p className="font-bold" style={{ color: ok(health.status === "ok") }}>
                  {health.status?.toUpperCase() ?? "UNKNOWN"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Graph DB</p>
                <p className="font-bold" style={{ color: ok(health.graph_ready) }}>
                  {health.graph_ready ? "READY" : "LOADING"}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>API 버전</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {health.version ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>서버 응답 없음</p>
          )}
        </section>

        {/* 버전 / 인프라 정보 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>버전 정보</h2>
          <div className="space-y-2 text-sm">
            {[
              ["Dashboard", "v0.5.3 (Runner Model + AI Review Config)"],
              ["HANDOVER", "v5.22 (T-038 Watchdog)"],
              ["서버", "68 (aads.newtalk.kr)"],
              ["API Base", "https://aads.newtalk.kr/api/v1"],
              ["API Version", health?.version ?? "—"],
              ["DB", "PostgreSQL 15 (aads-postgres:5433)"],
              ["Watchdog", "aads-watchdog.service · 30초 주기"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-1"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontSize: 12 }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 빠른 링크 */}
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>빠른 링크</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => (
              <a key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-3 block transition-colors"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--accent)" }}>{link.label}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{link.desc}</p>
              </a>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
