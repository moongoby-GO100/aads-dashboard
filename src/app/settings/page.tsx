"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Header from "@/components/Header";
import DatabaseOverviewPanel from "@/components/settings/DatabaseOverviewPanel";
import LlmRegistryWorkspacePanel from "@/components/settings/LlmRegistryWorkspacePanel";
import ModelSettingsPanel from "@/components/settings/ModelSettingsPanel";
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
  { group: "Codex/GPT (월정액)", models: ["codex:gpt-5.6-sol", "codex:gpt-5.6-terra", "codex:gpt-5.6-luna", "codex:gpt-5.5", "codex:gpt-5.4", "codex:gpt-5.4-mini", "codex:gpt-5.3-codex", "codex:gpt-5.3-codex-spark", "codex:gpt-5.2"] },
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
  is_active?: boolean;
  is_selectable?: boolean;
  is_executable?: boolean;
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
  effective_models?: string[];
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
  const aliasOf = String(model.metadata?.["alias_of"] || "").trim();
  if (aliasOf) return "";
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

function isRunnerRegistryModelSelectable(model: RunnerRegistryModel): boolean {
  const metadata = model.metadata || {};
  if (metadata["alias_of"] || metadata["model_source"] === "accepted_alias") return false;
  return model.is_selectable === true && model.is_active !== false;
}

function buildRunnerModelGroups(models: RunnerRegistryModel[]): RunnerAvailableModelGroup[] {
  const grouped = new Map<string, RunnerAvailableModelOption[]>();
  const seen = new Set<string>();
  const sorted = models.filter(isRunnerRegistryModelSelectable).sort((a, b) => {
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

type AccountBinding = {
  target: string;
  kind: "codex" | "claude";
  account: string;
  bound: boolean;
  needs_login: boolean;
  subscription?: string | null;
  login_in_progress: boolean;
  login_id: string | null;
};

type LoginSession = {
  login_id: string;
  kind: string;
  account: string;
  needs_code: boolean;
  state: string;
  message: string;
  url: string | null;
  user_code: string | null;
  expires_in: number;
};

const LOGIN_STATE_TEXT: Record<string, string> = {
  starting: "시작하는 중",
  awaiting_browser: "브라우저 인증 대기",
  awaiting_code: "코드 입력 대기",
  verifying: "확인 중",
  success: "로그인 완료",
  failed: "실패",
  expired: "시간 초과",
  cancelled: "취소됨",
};

/** 재로그인 진행창.
 *
 * 두 CLI 의 흐름이 다르다. 코덱스는 URL 과 일회용 코드를 보여주면 CLI 가 스스로
 * 폴링해 끝내고, 클로드는 인증 후 받은 코드를 되돌려 줘야 한다(needs_code).
 * 그래서 입력칸은 needs_code 일 때만 띄운다.
 */
function AccountLoginModal({ target, onClose, onDone }: { target: string; onClose: () => void; onDone: () => void }) {
  const [sess, setSess] = useState<LoginSession | null>(null);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (api as any).startAccountLogin(target)
      .then((r: LoginSession) => { if (alive) setSess(r); })
      .catch((e: any) => { if (alive) setErr(e?.message || "로그인을 시작하지 못했습니다"); });
    return () => { alive = false; };
  }, [target]);

  // 진행 상태는 서버가 안다 — 끝날 때까지 2초마다 확인한다.
  useEffect(() => {
    if (!sess?.login_id) return;
    if (["success", "failed", "expired", "cancelled"].includes(sess.state)) {
      if (sess.state === "success") onDone();
      return;
    }
    const t = setTimeout(() => {
      (api as any).getAccountLogin(sess.login_id)
        .then((r: LoginSession) => setSess(r))
        .catch(() => {/* 다음 주기에 다시 본다 */});
    }, 2000);
    return () => clearTimeout(t);
  }, [sess, onDone]);

  const sendCode = async () => {
    if (!sess || !code.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      setSess(await (api as any).submitAccountLoginCode(sess.login_id, code.trim()));
      setCode("");
    } catch (e: any) {
      setErr(e?.message || "코드 전달 실패");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (sess && !["success", "failed", "expired", "cancelled"].includes(sess.state)) {
      try { await (api as any).cancelAccountLogin(sess.login_id); } catch { /* 닫기는 막지 않는다 */ }
    }
    onClose();
  };

  const done = sess?.state === "success";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            재로그인 — {sess?.account || target}
          </h3>
          <button onClick={close} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>닫기</button>
        </div>

        {err && <p className="text-xs mb-3" style={{ color: "#dc2626" }}>{err}</p>}
        {!sess && !err && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>로그인 세션을 여는 중...</p>}

        {sess && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded font-semibold"
                style={{ background: done ? "rgba(22,163,74,0.12)" : "rgba(217,119,6,0.12)", color: done ? "#16a34a" : "#d97706" }}>
                {LOGIN_STATE_TEXT[sess.state] || sess.state}
              </span>
              {!done && sess.expires_in > 0 && (
                <span style={{ color: "var(--text-secondary)" }}>{Math.ceil(sess.expires_in / 60)}분 남음</span>
              )}
            </div>

            {sess.message && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{sess.message}</p>}

            {!done && sess.url && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>1. 아래 주소를 열어 로그인하세요</p>
                <a href={sess.url} target="_blank" rel="noreferrer" className="text-xs break-all underline" style={{ color: "#2563eb" }}>{sess.url}</a>
                {sess.user_code && (
                  <>
                    <p className="text-xs font-semibold pt-1" style={{ color: "var(--text-primary)" }}>2. 이 일회용 코드를 입력하세요</p>
                    <div className="flex items-center gap-2">
                      <code className="text-base font-bold tracking-widest px-3 py-1 rounded" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>{sess.user_code}</code>
                      <button onClick={() => navigator.clipboard?.writeText(sess.user_code || "")}
                        className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>복사</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {!done && sess.needs_code && (
              <div className="space-y-1">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {sess.user_code ? "3." : "2."} 인증 후 받은 코드를 붙여넣으세요
                </p>
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="인증 코드"
                    disabled={sess.state !== "awaiting_code" || busy}
                    className="flex-1 text-xs px-2 py-1 rounded"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <button onClick={sendCode} disabled={sess.state !== "awaiting_code" || busy || !code.trim()}
                    className="text-xs px-3 py-1 rounded font-semibold"
                    style={{ background: "var(--accent, #2563eb)", color: "#fff", opacity: sess.state !== "awaiting_code" || busy || !code.trim() ? 0.5 : 1 }}>
                    {busy ? "전달 중..." : "전달"}
                  </button>
                </div>
              </div>
            )}

            {done && (
              <button onClick={onClose} className="w-full text-xs px-3 py-2 rounded font-semibold" style={{ background: "#16a34a", color: "#fff" }}>
                완료 — 닫기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 구독 계정 로그인 상태 — DB 등록이 아니라 실제 자격증명 파일 유무를 본다.
 *
 * 2026-09-16: 진아 계정이 DB 에는 있는데 CLI 자격증명이 없어 한 번도 쓰이지
 * 않은 채 하루 넘게 방치됐다. 그 상태가 화면 어디에도 안 보였던 것이 문제였다.
 */
function OAuthBindingPanel() {
  const [rows, setRows] = useState<AccountBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    (api as any).getAccountBindings()
      .then((r: any) => { setRows(r.bindings || []); setErr(""); })
      .catch(() => setErr("계정 상태를 불러오지 못했습니다 (릴레이 응답 없음)"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>불러오는 중...</p>;
  if (err) return <p className="text-xs" style={{ color: "#dc2626" }}>{err}</p>;

  const needing = rows.filter((r) => r.needs_login);

  return (
    <div className="space-y-2">
      {needing.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.35)", color: "var(--text-primary)" }}>
          ⚠ 로그인이 필요한 계정 {needing.length}건 — 등록만 되어 있고 실제 호출에는 쓰이지 않습니다
        </div>
      )}

      {rows.map((r) => (
        <div key={r.target} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
          style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {r.kind === "codex" ? "코덱스" : "클로드"} · {r.account.replace("CODEX_OAUTH_", "")}
            </span>
            {r.subscription && <span className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>{r.subscription}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold" style={{ color: r.needs_login ? "#d97706" : "#16a34a" }}>
              {r.needs_login ? "로그인 필요" : "정상"}
            </span>
            <button onClick={() => setLoginTarget(r.target)} className="text-xs px-2 py-1 rounded"
              style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              {r.needs_login ? "로그인" : "재로그인"}
            </button>
          </div>
        </div>
      ))}

      <button onClick={load} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>새로고침</button>

      {loginTarget && (
        <AccountLoginModal target={loginTarget} onClose={() => { setLoginTarget(null); load(); }} onDone={load} />
      )}
    </div>
  );
}

type CodexAccount = {
  key_name: string;
  label: string;
  is_active: boolean;
  rate_limited: boolean;
  rate_limited_until: string | null;
  used_percent: number | null;
  resets_at: string | null;
  snapshot_age_hours: number | null;
  ok_72h: number;
  limit_72h: number;
  has_snapshot: boolean;
};

const KST = "Asia/Seoul";
const fmtKst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: KST, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

/** 코덱스 사용량 — 계정 단위로만 보여준다.
 *
 * 릴레이 세션(36개)을 나열하지 않는 이유: 세션은 계정이 아니라 작업 격리 단위다.
 * 세션별로 늘어놓으면 같은 계정의 같은 한도를 수십 번 반복해 보여주게 되고,
 * 2026-09-16 보고에서 실제로 그렇게 오독했다.
 */
function CodexUsagePanel() {
  const [data, setData] = useState<{ accounts: CodexAccount[]; usable_count: number; total_count: number; collected_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    (api as any).getCodexUsage()
      .then((r: any) => { setData(r); setErr(""); })
      .catch(() => setErr("사용량 로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>불러오는 중...</p>;
  if (err) return <p className="text-xs" style={{ color: "var(--danger, #dc2626)" }}>{err}</p>;
  if (!data || data.accounts.length === 0) {
    return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>등록된 코덱스 계정이 없습니다.</p>;
  }

  const allDown = data.usable_count === 0;

  return (
    <div className="space-y-3">
      {allDown && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)", color: "var(--text-primary)" }}>
          ⛔ 가용 계정 없음 — 코덱스 호출은 모두 실패합니다
        </div>
      )}

      {data.accounts.map((a) => {
        const pct = a.used_percent;
        const state = !a.is_active ? "비활성"
          : a.rate_limited ? "한도정지"
          : !a.has_snapshot ? "기록없음"
          : pct !== null && pct >= 80 ? "임박"
          : "정상";
        const color = state === "한도정지" || state === "비활성" ? "#dc2626"
          : state === "임박" ? "#d97706"
          : state === "기록없음" ? "var(--text-secondary)"
          : "#16a34a";
        const stale = a.snapshot_age_hours !== null && a.snapshot_age_hours > 24;

        return (
          <div key={a.key_name} className="rounded-lg p-3" style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{a.key_name.replace("CODEX_OAUTH_", "")}</span>
                <span className="text-xs ml-2 truncate" style={{ color: "var(--text-secondary)" }}>{a.label}</span>
              </div>
              <span className="text-xs font-semibold shrink-0" style={{ color }}>{state}</span>
            </div>

            {pct !== null ? (
              <>
                <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span>{pct.toFixed(0)}% 사용</span>
                  <span>
                    {a.rate_limited ? `${fmtKst(a.rate_limited_until)} 복귀` : a.resets_at ? `${fmtKst(a.resets_at)} 리셋` : ""}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {a.has_snapshot ? "사용률 기록이 아직 없습니다 — 호출이 1회 완료되면 채워집니다."
                  : "수집된 사용량 기록이 없습니다."}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>72h 성공 {a.ok_72h} / 한도실패 {a.limit_72h}</span>
              {/* 스냅샷이 낡았다는 사실을 숨기면 안 된다. 한도에 걸린 호출은
                  사용률을 갱신해주지 않아, 값만 보면 남아 있는 것처럼 오해한다. */}
              {stale && <span style={{ color: "#d97706" }}>스냅샷 {a.snapshot_age_hours?.toFixed(0)}시간 전</span>}
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>가용 계정 {data.usable_count} / {data.total_count} · 갱신 {fmtKst(data.collected_at)}</span>
        <button onClick={load} className="px-2 py-1 rounded" style={{ border: "1px solid var(--border)" }}>새로고침</button>
      </div>
    </div>
  );
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


interface DirectiveModelConfigItem {
  role: string;
  role_label: string;
  models: string[];
  timeout_seconds: number;
  max_tokens: number;
  updated_at: string | null;
  updated_by: string;
}

function DirectiveModelConfig() {
  const [configs, setConfigs] = useState<DirectiveModelConfigItem[]>([]);
  const [registryModels, setRegistryModels] = useState<RunnerRegistryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [newModel, setNewModel] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      (api as any).getDirectiveModels(),
      (api as any).getLlmModels({ active_only: true }),
    ])
      .then(([configsRes, registryRes]) => {
        if (configsRes.status === "fulfilled") setConfigs(configsRes.value.configs || []);
        else setMsg("지시서 모델 설정 로드 실패");
        if (registryRes.status === "fulfilled" && Array.isArray(registryRes.value.models))
          setRegistryModels(registryRes.value.models);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const registryGroups = useMemo<RunnerAvailableModelGroup[]>(() => {
    const groups = buildRunnerModelGroups(registryModels);
    if (groups.length > 0) return groups;
    return LEGACY_AVAILABLE_MODELS.map((g) => ({ group: g.group, models: g.models.map((v) => ({ value: v, label: v })) }));
  }, [registryModels]);

  const moveModel = (ci: number, mi: number, dir: -1 | 1) => {
    const next = [...configs];
    const arr = [...next[ci].models];
    const target = mi + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[mi], arr[target]] = [arr[target], arr[mi]];
    next[ci] = { ...next[ci], models: arr };
    setConfigs(next);
  };

  const removeModel = (ci: number, mi: number) => {
    const next = [...configs];
    const arr = next[ci].models.filter((_, i) => i !== mi);
    if (arr.length === 0) return;
    next[ci] = { ...next[ci], models: arr };
    setConfigs(next);
  };

  const addModel = (ci: number) => {
    const role = configs[ci].role;
    const val = (newModel[role] || "").trim();
    if (!val) return;
    const next = [...configs];
    next[ci] = { ...next[ci], models: [...next[ci].models, val] };
    setConfigs(next);
    setNewModel((p) => ({ ...p, [role]: "" }));
  };

  const updateParam = (ci: number, key: "timeout_seconds" | "max_tokens", val: number) => {
    const next = [...configs];
    next[ci] = { ...next[ci], [key]: val };
    setConfigs(next);
  };

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const payload = configs.map((c) => ({ role: c.role, models: c.models, timeout_seconds: c.timeout_seconds, max_tokens: c.max_tokens }));
      const res: any = await (api as any).updateDirectiveModels(payload);
      setMsg(res.message || "저장 완료");
      load();
    } catch { setMsg("저장 실패"); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;

  return (
    <div className="space-y-4">
      {configs.map((cfg, ci) => (
        <div key={cfg.role} className="rounded-lg p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--accent)" }}>{cfg.role_label || cfg.role}</h3>
            {cfg.updated_at && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {new Date(cfg.updated_at).toLocaleString("ko-KR")} · {cfg.updated_by}
              </span>
            )}
          </div>
          <ol className="space-y-1 mb-3">
            {cfg.models.map((model, mi) => (
              <li key={mi} className="flex items-center gap-2 text-xs rounded px-2 py-1" style={{ background: "var(--bg-primary)" }}>
                <span className="w-5 text-center font-mono" style={{ color: mi === 0 ? "var(--accent)" : "var(--text-tertiary)" }}>{mi + 1}</span>
                <span className="flex-1 font-mono" style={{ color: "var(--text-primary)" }}>{model}</span>
                <button onClick={() => moveModel(ci, mi, -1)} disabled={mi === 0} className="px-1 opacity-50 hover:opacity-100">↑</button>
                <button onClick={() => moveModel(ci, mi, 1)} disabled={mi === cfg.models.length - 1} className="px-1 opacity-50 hover:opacity-100">↓</button>
                <button onClick={() => removeModel(ci, mi)} disabled={cfg.models.length <= 1} className="px-1 text-red-400 hover:text-red-300">✕</button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 mb-3">
            <select value={newModel[cfg.role] || ""} onChange={(e) => setNewModel((p) => ({ ...p, [cfg.role]: e.target.value }))}
              className="flex-1 text-xs rounded px-2 py-1" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              <option value="">모델 추가...</option>
              {registryGroups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.models.filter((m) => !cfg.models.includes(m.value)).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={() => addModel(ci)} className="text-xs px-3 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>추가</button>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              타임아웃(초)
              <input type="number" min={30} max={120} value={cfg.timeout_seconds}
                onChange={(e) => updateParam(ci, "timeout_seconds", Number(e.target.value))}
                className="w-16 text-xs rounded px-2 py-1" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
            </label>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              최대 토큰
              <input type="number" min={500} max={4000} step={100} value={cfg.max_tokens}
                onChange={(e) => updateParam(ci, "max_tokens", Number(e.target.value))}
                className="w-20 text-xs rounded px-2 py-1" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
            </label>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded font-medium"
          style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
          {saving ? "저장 중..." : "저장"}
        </button>
        {msg && <span className="text-xs" style={{ color: msg.includes("실패") ? "#ef4444" : "var(--accent)" }}>{msg}</span>}
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
          {Array.isArray(cfg.effective_models) && cfg.effective_models.length > 0 && (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "rgba(16,163,127,0.08)", border: "1px solid rgba(16,163,127,0.18)" }}>
              <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--success)" }}>실제 자동 폴백 체인</p>
              <p className="text-[11px] font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                {cfg.effective_models.join(" → ")}
              </p>
            </div>
          )}
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
        러너는 저장된 size 순서를 먼저 쓰고, 실패하거나 비어 있으면 AI Review 설정과 LLM 라우팅 순서로 자동 폴백합니다.
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

function ClaudeAccountSwitcher() {
  const [accounts, setAccounts] = useState<Array<{ id: number; label: string; description: string; has_token: boolean }>>([]);
  const [current, setCurrent] = useState<number>(1);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState("");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ops/claude-accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setCurrent(data.current_account || 1);
    } catch {
      /* ignore */
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const switchAccount = async (id: number) => {
    if (id === current || switching) return;
    setSwitching(true);
    setSwitchMsg("");
    try {
      const res = await fetch("/api/v1/ops/claude-account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrent(data.current_account);
        setSwitchMsg(`전환 완료: ${data.label}`);
      } else {
        setSwitchMsg(data.detail || "전환 실패");
      }
    } catch {
      setSwitchMsg("서버 오류");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div>
      {loadingAccounts ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
      ) : (
        <>
          <div className="flex gap-3">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => switchAccount(acc.id)}
                disabled={switching || !acc.has_token}
                className="flex-1 rounded-lg p-3 text-left transition-all"
                style={{
                  background: current === acc.id ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                  border: `2px solid ${current === acc.id ? "#6366f1" : "var(--border)"}`,
                  cursor: current === acc.id || !acc.has_token ? "default" : "pointer",
                  opacity: switching ? 0.6 : 1,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: current === acc.id ? "#6366f1" : "var(--border)",
                      color: "white",
                    }}
                  >
                    {current === acc.id ? "● 사용 중" : `계정 ${acc.id}`}
                  </span>
                  {!acc.has_token && (
                    <span className="text-xs" style={{ color: "var(--danger)" }}>토큰 미설정</span>
                  )}
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{acc.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{acc.description}</p>
              </button>
            ))}
          </div>
          {switchMsg && (
            <p className="text-xs mt-2" style={{ color: switchMsg.includes("완료") ? "#22c55e" : "var(--danger)" }}>
              {switchMsg}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [modelSubTab, setModelSubTab] = useState(0);

  useEffect(() => {
    api.getHealth()
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ok = (v: boolean | undefined) =>
    v === undefined ? "var(--text-secondary)" : v ? "var(--success)" : "var(--danger)";

  const TABS = ["모델 설정", "LLM 관리", "시스템"];
  const MODEL_SUB_TABS = ["러너 모델", "지시서 생성", "모델 라우팅"];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Settings" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top tabs */}
        <div className="shrink-0 px-3 md:px-6 pt-3" style={{ background: "var(--bg-primary)" }}>
          <div className="flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
            {TABS.map((label, i) => (
              <button
                key={label}
                onClick={() => setActiveTab(i)}
                className="px-4 py-2.5 text-sm font-semibold transition-colors relative"
                style={{
                  color: activeTab === i ? "var(--accent)" : "var(--text-secondary)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {label}
                {activeTab === i && (
                  <span style={{ position: "absolute", bottom: 0, left: 8, right: 8, height: 2, background: "var(--accent)", borderRadius: 1 }} />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-3 md:p-6 overflow-auto space-y-5">
          {/* Tab 0: 모델 설정 */}
          {activeTab === 0 && (
            <>
              <div className="flex gap-2 flex-wrap">
                {MODEL_SUB_TABS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setModelSubTab(i)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-full transition-colors"
                    style={{
                      background: modelSubTab === i ? "var(--accent)" : "var(--bg-hover)",
                      color: modelSubTab === i ? "#fff" : "var(--text-secondary)",
                      border: modelSubTab === i ? "1px solid var(--accent)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {modelSubTab === 0 && (
                <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>러너 모델 우선순위</h2>
                  <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                    Size별 모델 실행 순서를 설정합니다. 1순위 실패 시 다음 순위로 자동 폴백됩니다.
                  </p>
                  <RunnerModelConfig />
                </section>
              )}

              {modelSubTab === 1 && (
                <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>지시서 생성 모델 설정</h2>
                  <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                    지시서 자동생성에 사용하는 모델 우선순위를 설정합니다. 1순위 실패 시 다음 순위로 자동 폴백됩니다.
                  </p>
                  <DirectiveModelConfig />
                </section>
              )}

              {modelSubTab === 2 && (
                <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>모델 라우팅 · 인텐트 정책</h2>
                  <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                    라우트별 기본 모델 및 인텐트별 모델 정책 — 변경 즉시 적용
                  </p>
                  <ModelSettingsPanel />
                </section>
              )}
            </>
          )}

          {/* Tab 1: LLM 관리 */}
          {activeTab === 1 && (
            <>
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>LLM 키 및 모델 레지스트리</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  등록된 API 키 기준 실행 가능 모델 집합, 최근 동기화 상태, 채팅창 노출 순서를 한 화면에서 관리합니다.
                </p>
                <LlmRegistryWorkspacePanel />
              </section>
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>코덱스 사용량</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  ChatGPT 구독 인증이라 청구 대시보드가 없습니다. 계정별 주간 한도 소진율을 10분마다 수집해 표시합니다.
                </p>
                <CodexUsagePanel />
              </section>
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>구독 계정 로그인 상태</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  코덱스·클로드 구독 계정은 DB 등록과 별개로 서버에 자격증명 파일이 있어야 실제 호출에 쓰입니다. 여기서 바로 재로그인할 수 있습니다.
                </p>
                <OAuthBindingPanel />
              </section>
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Claude 계정 관리</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  AADS에서 사용할 Claude OAuth 계정을 전환합니다. 서버 Max(운영) ↔ CEO PC(moongoby) 전환 가능합니다.
                </p>
                <ClaudeAccountSwitcher />
              </section>
            </>
          )}

          {/* Tab 2: 시스템 */}
          {activeTab === 2 && (
            <>
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>DB 연결 상태</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  내부 PostgreSQL, Graph DB, DB Pool, 원격 프로젝트 DB 접근 상태를 확인합니다.
                </p>
                <DatabaseOverviewPanel graphReady={health?.graph_ready} />
              </section>
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
              <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>버전 정보</h2>
                <div className="space-y-2 text-sm">
                  {[
                    ["Dashboard", "v0.5.4 (Tabbed Settings)"],
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
