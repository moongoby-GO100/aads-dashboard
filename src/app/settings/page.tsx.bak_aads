"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
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



const AVAILABLE_MODELS = [
  { group: "Claude (월정액)", models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"] },
  { group: "Codex/GPT (월정액)", models: ["codex:gpt-5.4", "codex:gpt-5.4-mini", "codex:gpt-5.3-codex"] },
  { group: "MiniMax (월정액)", models: ["litellm:minimax-m2.7", "litellm:minimax-m2.5"] },
  { group: "Groq (무료)", models: ["litellm:groq-llama-70b", "litellm:groq-qwen3-32b", "litellm:groq-kimi-k2", "litellm:groq-llama4-scout"] },
  { group: "Gemini", models: ["litellm:gemini-2.5-flash", "litellm:gemini-2.5-pro", "litellm:gemini-3-flash-preview", "litellm:gemini-3-pro-preview", "litellm:gemini-3.1-flash-lite-preview", "litellm:gemini-3.1-pro-preview"] },
  { group: "Qwen", models: ["qwen-turbo", "litellm:qwen3-coder-plus", "litellm:qwen3-235b", "litellm:qwen3-max", "litellm:qwen3-coder-flash"] },
  { group: "DeepSeek", models: ["litellm:deepseek-chat", "litellm:deepseek-reasoner"] },
  { group: "Kimi", models: ["litellm:kimi-k2", "litellm:kimi-k2.5"] },
  { group: "OpenRouter", models: ["litellm:openrouter-grok-4-fast", "litellm:openrouter-deepseek-v3"] },
];

interface ModelConfig {
  size: string;
  models: string[];
  updated_at: string | null;
  updated_by: string;
}

function RunnerModelConfig() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [newModel, setNewModel] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    api.getRunnerModels()
      .then((r: any) => {
        const sorted = (r.configs || []).sort(
          (a: ModelConfig, b: ModelConfig) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
        );
        setConfigs(sorted);
      })
      .catch(() => setMsg("로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
              {AVAILABLE_MODELS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.models.filter((m) => !cfg.models.includes(m)).map((m) => (
                    <option key={m} value={m}>{m}</option>
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
