"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

type ClaudeSlotUsage = {
  slot: string;
  label?: string;
  // AADS 소유가 아닌 계정. 1·2 가 모두 불가능할 때만 쓰인다.
  last_resort?: boolean;
  // 최후 수단 계정은 대표님이 켠 동안에만 폴백 후보가 된다.
  enabled?: boolean;
  gate_changed_at?: string | null;
  // 스스로 갱신하지 못하는 슬롯의 유일한 신호.
  token_alive?: boolean;
  token_checked_at?: number | null;
  token_status?: number | null;
  source?: string;
  sampled_at?: string | null;
  primary: { used_percent: number | null; window_minutes: number; resets_at?: string | null };
  secondary: { used_percent: number | null; window_minutes: number; resets_at?: string | null };
};

type TokenLabel = {
  label?: string;
  key_name?: string;
  priority?: number;
  slot?: string;
};

type UsageData = {
  claude_slots?: ClaudeSlotUsage[];
  token_labels?: TokenLabel[];
  claude_max?: {
    plan_type: string;
    source?: string;
    primary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
    secondary: { used_percent: number; window_minutes: number; total_tokens: number; resets_at?: string };
  };
};

type CodexLimit = {
  limit_id?: string;
  plan_type?: string;
  primary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number; resets_at_iso?: string };
  secondary?: { used_percent?: number; window_minutes?: number; resets_in_sec?: number; resets_at_iso?: string };
};

/** 주계정 상태. CLI 가 실제로 어느 계정으로 도는지는 이것이 정답이다 —
 *  token_labels 의 priority 를 훑어 짐작하던 값과 달리 서버가 직접 말해 준다. */
type PrimaryAccount = {
  key_name: string; label: string; priority: number; is_active: boolean;
  has_quota: boolean; headroom_pct: number | null;
  resets_at: string | null; rate_limited_until: string | null;
};
type PrimaryState = {
  providers: Record<string, { mode: "auto" | "manual"; primary: string; accounts: PrimaryAccount[] }>;
};

type CodexData = {
  ok?: boolean;
  plan_type?: string;
  limits?: CodexLimit[];
};

type RelayAcquireMetric = {
  attempts?: number;
  successes?: number;
  timeouts?: number;
  wait_attempts?: number;
  waited_successes?: number;
  wait_success_rate_pct?: number;
  avg_success_wait_sec?: number;
  max_wait_sec?: number;
};

type RelayCapacity = {
  status: "ok" | "unavailable";
  max_concurrent: number;
  desired_max_concurrent?: number;
  capacity_transition_pending?: boolean;
  capacity_transition_blocked_by_active_leases?: number;
  used: number;
  available: number;
  usage_percent: number;
  active_leases: { claude?: number; codex?: number; antigravity?: number };
  acquire_metrics?: Record<string, RelayAcquireMetric>;
  sampled_at?: string;
  stale?: boolean;
  stale_age_sec?: number;
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function barColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 50) return "#f59e0b";
  return "#22c55e";
}

function formatResetTime(isoStr?: string): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = Date.now();
    const diffMin = Math.max(0, Math.round((d.getTime() - now) / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d${h % 24}h`;
  } catch {
    return "";
  }
}

function formatResetSeconds(seconds?: number): string {
  if (seconds == null || seconds <= 0) return "";
  const totalMin = Math.max(0, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const hours = h % 24;
  return hours > 0 ? `${days}d${hours}h` : `${days}d`;
}

// pct 가 null 이면 **아직 측정값이 없다**는 뜻이다. 막대 자리는 그대로 두고
// 숫자만 "—" 로 적는다. 0% 로 그리면 "한도를 하나도 안 썼다" 는 주장이 되는데,
// 그건 측정한 사실이 아니다. 자리를 비우면 계정마다 줄이 어긋나 읽기 어렵다.
function MiniBar({ pct, label, detail, resetIn, width = 48 }: { pct: number | null; label: string; detail: string; resetIn?: string; width?: number }) {
  const unknown = pct == null;
  const clampedPct = unknown ? 0 : Math.min(pct, 100);
  const remaining = unknown ? "—" : `${(100 - clampedPct).toFixed(0)}%`;
  const textColor = unknown ? "var(--ct-text3, #999)" : barColor(clampedPct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }} title={detail}>
      <span style={{ fontSize: "10px", color: "var(--ct-text2)", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
      <div style={{
        width: `${width}px`, height: "6px", borderRadius: "3px",
        background: "var(--ct-border)", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          width: `${clampedPct}%`, height: "100%", borderRadius: "3px",
          background: barColor(clampedPct), transition: "width 0.3s",
        }} />
      </div>
      <span style={{ fontSize: "10px", color: textColor, fontWeight: 600, whiteSpace: "nowrap" }}>
        {remaining}
      </span>
      {resetIn && (
        <span style={{ fontSize: "9px", color: "var(--ct-text3, #999)", whiteSpace: "nowrap" }}>
          ({resetIn})
        </span>
      )}
    </div>
  );
}

type OverviewAccount = {
  key_name: string; provider: string; label: string; slot: string | null;
  state: string; priority: number;
  windows: Array<{ window_minutes: number | null; used_percent: number; resets_at: string | null }>;
  rate_limited_until: string | null;
};

/** 창 길이로 이름을 정한다. primary/secondary 순서에 기대면 안 된다 —
 *  코덱스의 primary 는 주간이고 클로드의 primary 는 5시간이라, 순서로 읽으면
 *  코덱스의 주간 소진을 '5시간' 자리에 그리게 된다(2026-09-16 실측 버그). */
function windowName(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes >= 10080) return "주간";
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

export default function UsageBar() {
  // 기본은 접힘. 채팅 중 알아야 할 것은 "지금 쓰는 계정이 얼마나 남았나" 하나다.
  // 나머지(릴레이 진단·프로젝트 배정·게이트)는 펼쳤을 때와 설정 화면에 있다.
  const [collapsed, setCollapsed] = useState(true);
  const [overview, setOverview] = useState<{ accounts: OverviewAccount[] } | null>(null);
  const [primaryInfo, setPrimaryInfo] = useState<PrimaryState | null>(null);
  const [claude, setClaude] = useState<UsageData | null>(null);
  const [codex, setCodex] = useState<CodexData | null>(null);
  const [relay, setRelay] = useState<RelayCapacity | null>(null);
  const [relayStale, setRelayStale] = useState(false);
  const [error, setError] = useState(false);

  const fetchUsage = useCallback(async () => {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const [usageRes, codexRes, primaryRes] = await Promise.allSettled([
        fetch(`${BASE}/ops/usage-stats`, { headers }).then((r) => r.json()),
        fetch(`${BASE}/ops/codex-usage`, { headers }).then((r) => r.json()),
        fetch(`${BASE}/ops/account-primary`, { headers }).then((r) => r.json()),
      ]);
      if (usageRes.status === "fulfilled") setClaude(usageRes.value);
      if (codexRes.status === "fulfilled") setCodex(codexRes.value);
      // 서버가 아직 이 API 를 모르는 배포 창에서는 조용히 넘어간다 —
      // 주계정 칩만 안 뜨고 나머지 막대는 그대로 보인다.
      if (primaryRes.status === "fulfilled" && primaryRes.value?.providers) {
        setPrimaryInfo(primaryRes.value);
      }
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // 계정 전환은 상단 칩에서 바로 한다. 하단에 따로 토글을 두면 사용률을 보고도
  // 다른 곳으로 내려가 눌러야 해서, 어느 계정이 여유 있는지 모른 채 바꾸게 된다.
  const switchPrimary = useCallback(async (
    provider: string, keyName: string, label: string, exhausted: boolean,
  ) => {
    if (!keyName || switching) return;
    if (exhausted && !window.confirm(`${label} 계정도 한도를 모두 썼습니다. 그래도 주계정으로 바꿀까요?`)) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    setSwitching(keyName);
    setSwitchError(null);
    try {
      // 클로드·코덱스가 같은 경로를 쓴다. 선택 경로가 전부
      // llm_api_keys.priority 를 보므로 그것을 바꾸는 것이 전환의 본체다.
      const res = await fetch(`${BASE}/ops/account-primary`, {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ provider, mode: "manual", key_name: keyName }),
      });
      if (!res.ok) {
        // 옛 구현은 실패를 통째로 삼켜서 버튼이 그냥 안 먹는 것처럼 보였다.
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status} ${detail.slice(0, 120)}`);
      }
      await fetchUsage();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "전환 실패");
    } finally {
      setSwitching(null);
    }
  }, [switching, fetchUsage]);

  const [gating, setGating] = useState<string | null>(null);

  // 최후 수단 계정 스위치. 켠 직후 서버가 그 계정에 최소 호출 한 번을 보내
  // 한도 헤더를 받아오므로, 새로고침하면 바로 숫자가 찬다.
  const toggleSlot = useCallback(async (slot: string, name: string, next: boolean) => {
    if (gating) return;
    if (next && !window.confirm(
      `${name} 계정을 사용 가능으로 바꿉니다.\n\n` +
      "우리 계정(슬롯 1·2)이 모두 불가능할 때만 이 계정으로 응답합니다. " +
      "쓰이면 그쪽 주간 한도가 줄어들고, 쓰이는 순간 알림이 올라갑니다.")) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    setGating(slot);
    setSwitchError(null);
    try {
      const res = await fetch(`${BASE}/settings/auth-keys/slot-enabled`, {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ slot, enabled: next }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`);
      await fetchUsage();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "스위치 적용 실패");
    } finally {
      setGating(null);
    }
  }, [gating, fetchUsage]);

  // 슬롯별 프로젝트 배정. 비어 있으면 모든 프로젝트가 쓴다는 뜻이다.
  const [slotProjects, setSlotProjects] = useState<Record<string, string[]>>({});

  const fetchSlotProjects = useCallback(async () => {
    try {
      const r = await api.getSlotProjects() as { slots?: Record<string, string[]> };
      setSlotProjects(r.slots || {});
    } catch { /* 배정 조회 실패가 사용량 표시를 막으면 안 된다 */ }
  }, []);

  useEffect(() => { void fetchSlotProjects(); }, [fetchSlotProjects]);

  // 접힘 여부는 대표님 선택이므로 브라우저에 남긴다.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aads_usagebar_collapsed");
      if (saved !== null) setCollapsed(saved === "1");
    } catch { /* 저장소를 못 읽어도 기본값(접힘)으로 돈다 */ }
  }, []);

  // 접힘 줄은 설정 화면과 같은 단일 응답을 쓴다. 두 화면이 서로 다른 경로로
  // 같은 숫자를 계산하면 값이 어긋난다 — 2026-09-16 오전에 그렇게 어긋났다.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const d = await (api as unknown as { getLlmOverview: () => Promise<{ accounts: OverviewAccount[] }> }).getLlmOverview();
        if (alive) setOverview(d);
      } catch { /* 접힘 줄만 비고, 펼침은 기존 경로로 돈다 */ }
    };
    void run();
    const iv = window.setInterval(run, 30_000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  // 등록된 프로젝트 목록. 드롭다운으로 고르게 하려면 목록이 있어야 한다 —
  // 쉼표 입력은 오타 하나로 배정이 통째로 빗나간다.
  const [knownProjects, setKnownProjects] = useState<string[]>([]);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);

  useEffect(() => {
    api.getChatWorkspaces()
      .then((r: any) => {
        const keys = Array.from(new Set(
          (r?.workspaces || r || [])
            .map((w: any) => String(w.project_key || "").toUpperCase())
            .filter(Boolean),
        )) as string[];
        setKnownProjects(keys.sort());
      })
      .catch(() => setKnownProjects([]));
  }, []);

  const toggleProject = useCallback(async (slot: string, key: string) => {
    const current = new Set(slotProjects[slot] || []);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    try {
      await api.setSlotProjects(slot, Array.from(current).sort());
      await fetchSlotProjects();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "배정을 저장하지 못했습니다");
    }
  }, [slotProjects, fetchSlotProjects]);

  // 토큰 교체. 리프레시가 없는 슬롯은 죽으면 사람이 새 값을 넣는 수밖에 없다 —
  // 서버에 들어가 .env 를 고치지 않고 여기서 끝내게 한다.
  const replaceToken = useCallback(async (slot: string, name: string) => {
    const token = window.prompt(
      `${name} 계정의 새 OAuth 토큰을 붙여넣어 주십시오.\n` +
      "이 계정은 리프레시 토큰이 없어 자동 갱신이 되지 않습니다.",
    );
    if (!token || !token.trim()) return;
    try {
      await api.replaceSlotToken(slot, token.trim());
      await fetchUsage();
      setSwitchError(null);
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "토큰을 바꾸지 못했습니다");
    }
  }, [fetchUsage]);

  const fetchRelayCapacity = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
    try {
      const response = await fetch(`${BASE}/health/relay-capacity`, { cache: "no-store" });
      if (!response.ok) throw new Error(`relay capacity ${response.status}`);
      const data = await response.json() as RelayCapacity;
      setRelay(data);
      setRelayStale(data.status !== "ok" || data.stale === true);
    } catch {
      setRelayStale(true);
    }
  }, []);

  useEffect(() => {
    const run = () => {
      void fetchUsage();
    };
    const initial = window.setTimeout(run, 0);
    const iv = window.setInterval(run, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(iv);
    };
  }, [fetchUsage]);

  useEffect(() => {
    // 2026-09-14 /chat 실측: 16초 동안 이 호출이 **7회** 나갔다. 2초 주기라
    // 탭 하나당 시간당 1,800회다. 릴레이 여유 슬롯 표시는 그 정도로 자주
    // 볼 이유가 없다 — 20초로 늘리고 탭이 안 보이면 건너뛴다.
    //
    // 탭 복귀(visibilitychange)에는 즉시 한 번 부른다. 숨어 있는 동안
    // 바뀐 값을 바로 보여주려면 그 한 번이 필요하다.
    const RELAY_POLL_MS = 20_000;
    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchRelayCapacity();
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchRelayCapacity();
      }
    };
    const initial = window.setTimeout(run, 0);
    const iv = window.setInterval(run, RELAY_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchRelayCapacity]);

  if (error && !relay) return null;
  if (!claude && !codex && !relay) return null;

  const cm = claude?.claude_max;
  const cxAll = codex?.ok ? (codex.limits ?? []) : [];
  const slots = claude?.claude_slots ?? [];
  const tokenLabels = claude?.token_labels ?? [];
  const slotMeta = (slot: string) => tokenLabels.find((t) => String(t.slot ?? "") === slot);
  // CLI 가 실제로 어느 슬롯으로 도는가. 서버가 말해 주는 주계정을 먼저 믿고,
  // 그 API 를 모르는 배포 창에서만 예전처럼 priority 1 을 훑어 짐작한다.
  // (짐작은 슬롯 4 처럼 priority 가 0 이거나 순번이 밀린 계정에서 틀린다)
  const primaryClaudeKey = primaryInfo?.providers?.anthropic?.primary ?? "";
  const activeSlot = (primaryClaudeKey
    ? tokenLabels.find((t) => t.key_name === primaryClaudeKey)?.slot ?? null
    : null)
    ?? tokenLabels.reduce<string | null>(
      (best, t) => (t.priority === 1 && t.slot ? String(t.slot) : best), null);
  const isLive = cm?.source === "claude_ai_api" || cm?.source === "db_snapshot";
  const sourceLabel = cm?.source === "claude_ai_api" ? "" : cm?.source === "db_snapshot" ? " (db)" : cm?.source === "anthropic_header" ? " (hdr)" : " (est)";
  const relayMetrics = relay ? Object.values(relay.acquire_metrics ?? {}) : [];
  const waitAttempts = relayMetrics.reduce((sum, metric) => sum + (metric.wait_attempts ?? 0), 0);
  const waitedSuccesses = relayMetrics.reduce((sum, metric) => sum + (metric.waited_successes ?? 0), 0);
  const waitSuccessPct = waitAttempts > 0 ? (100 * waitedSuccesses / waitAttempts) : null;
  const desiredRelayMax = relay?.desired_max_concurrent ?? 15;
  const relayTransitionPending = relay
    ? (relay.capacity_transition_pending ?? relay.max_concurrent !== desiredRelayMax)
    : false;
  const relayTransitionBlockers = relay?.capacity_transition_blocked_by_active_leases
    ?? Object.values(relay?.active_leases ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);
  const relayColor = relayStale || relay?.status !== "ok"
    ? "#94a3b8"
    : (relay?.usage_percent ?? 0) >= 90
      ? "#ef4444"
      : (relay?.usage_percent ?? 0) >= 70
        ? "#f59e0b"
        : "#22c55e";
  const relayTitle = relay?.status === "ok"
    ? [
        `릴레이 점유 ${relay.used}/${relay.max_concurrent} · 가용 ${relay.available}`,
        relayTransitionPending
          ? `목표 ${desiredRelayMax} · 활성 ${relayTransitionBlockers}건 종료 후 무중단 전환`
          : `적용 용량 ${relay.max_concurrent}`,
        `Claude ${relay.active_leases.claude ?? 0} · Codex ${relay.active_leases.codex ?? 0}`,
        waitSuccessPct == null
          ? "슬롯 대기 표본 없음"
          : `슬롯 대기 성공 ${waitedSuccesses}/${waitAttempts} (${waitSuccessPct.toFixed(1)}%)`,
        relay.sampled_at ? `측정 ${new Date(relay.sampled_at).toLocaleTimeString()}` : "",
        relay.stale ? `최근 정상값 (${(relay.stale_age_sec ?? 0).toFixed(1)}초 전)` : "",
      ].filter(Boolean).join("\n")
    : "릴레이 상태를 불러오지 못했습니다. 2초마다 자동 재시도합니다.";

  // ── 접힘 줄에 쓸 값 ──────────────────────────────────────────────
  // 지금 쓰는 클로드 슬롯과, 새 세션이 배정받을 코덱스 계정 하나씩만 고른다.
  const ovAccounts = overview?.accounts ?? [];
  const curClaude = ovAccounts.find((a) => a.provider === "anthropic" && a.slot === `slot${activeSlot}`)
    ?? ovAccounts.find((a) => a.provider === "anthropic" && a.state === "ok")
    ?? null;
  const curCodex = ovAccounts.filter((a) => a.provider === "codex")
    .sort((a, b) => a.priority - b.priority)
    .find((a) => a.state === "ok")
    ?? ovAccounts.find((a) => a.provider === "codex")
    ?? null;
  // 잔량이 가장 적은 창 = 가장 먼저 막히는 창. 경고는 그것만 띄운다.
  const tightest = [curClaude, curCodex]
    .flatMap((a) => (a ? a.windows.map((w) => ({ acc: a, w })) : []))
    .sort((x, y) => (100 - x.w.used_percent) - (100 - y.w.used_percent))[0];
  const tightRemain = tightest ? 100 - tightest.w.used_percent : 100;
  // 공급자를 합쳐 "정지 N" 으로 표시하면 Codex 한 계정만 막힌 경우에도
  // Claude·Codex 전체가 멈춘 것처럼 읽힌다. 설정 화면과 같은 판정으로
  // provider 별 가용 여부와 한도정지 계정 수를 함께 보여 준다.
  const limitStatuses = ([
    { provider: "codex", label: "코덱스" },
    { provider: "anthropic", label: "클로드" },
  ] as const).flatMap(({ provider, label }) => {
    const accounts = ovAccounts.filter((a) => a.provider === provider);
    const stoppedAccounts = accounts.filter((a) => a.state === "rate_limited");
    if (stoppedAccounts.length === 0) return [];
    const usable = accounts.some((a) => a.state === "ok");
    return [{
      provider,
      text: `${label} ${usable ? "사용 가능" : "사용 불가"} · 정지 ${stoppedAccounts.length}`,
      color: usable ? "#d97706" : "#ef4444",
      title: stoppedAccounts
        .map((a) => `${a.label}: ${a.rate_limited_until ?? "복귀 시각 미확인"}`)
        .join(" / "),
    }];
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("aads_usagebar_collapsed", next ? "1" : "0"); } catch { /* 저장 못 해도 동작엔 지장 없다 */ }
      return next;
    });
  };

  /** 접기·펴기 버튼은 하나다. 예전에는 접힘용(오른쪽 끝)과 펼침용(왼쪽 첫
   *  자리)이 따로 있어서, 누를 때마다 버튼이 줄 반대편으로 건너뛰었다 —
   *  한 번 더 누르려면 눈으로 다시 찾아야 했다(2026-09-17 대표님 지적).
   *  두 화면 모두 같은 자리(줄 맨 앞)에 두고 화살표만 바꾼다. */
  const renderToggle = () => (
    <button type="button" onClick={toggle} title={collapsed ? "펼치기" : "접기"}
      aria-expanded={!collapsed} aria-label={collapsed ? "사용량 바 펼치기" : "사용량 바 접기"}
      style={{ border: "none", background: "transparent", color: "var(--ct-text3, #999)",
               cursor: "pointer", fontSize: "11px", padding: "0 2px", lineHeight: "16px",
               flexShrink: 0 }}>
      {collapsed ? "▸" : "▾"}
    </button>
  );

  const summaryChip = (acc: OverviewAccount | null, kind: string) => {
    if (!acc) return null;
    // 한 줄에 다 들어가야 한다. 도메인과 괄호 주석은 떼고 계정 이름만 남긴다 —
    // moong76@gmail → moong76, jinah-biseo(244) → jinah-biseo.
    const name = (acc.label || acc.key_name).split(" ")[0].split("@")[0].split("(")[0];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)" }}>{kind}</span>
        <span style={{ fontSize: "10px", color: "var(--ct-text)" }}>{name}</span>
        {acc.windows.length === 0
          ? <span style={{ fontSize: "10px", color: "var(--ct-text3, #999)" }}>기록 없음</span>
          : acc.windows.map((w) => (
              <MiniBar key={w.window_minutes ?? "n"} pct={w.used_percent} width={34}
                label={windowName(w.window_minutes)}
                detail={`${name} ${windowName(w.window_minutes)} 잔량 ${(100 - w.used_percent).toFixed(0)}%`} />
            ))}
      </span>
    );
  };

  if (collapsed) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        padding: "3px 14px", borderBottom: "1px solid var(--ct-border)",
        background: "var(--ct-sb)", fontSize: "10px",
      }}>
        {renderToggle()}
        {!overview ? (
          <span style={{ fontSize: "10px", color: "var(--ct-text3, #999)" }}>사용량 확인 중…</span>
        ) : (
          <>
            {/* 접힌 줄에서도 CLI 가 어느 계정으로 도는지 먼저 읽히게 한다.
                모드(자동/수동)까지 붙여야 계정이 저절로 바뀐 것처럼 안 보인다. */}
            {summaryChip(curClaude, activeSlot ? `CLI 슬롯${activeSlot}` : "CLI 슬롯")}
            {summaryChip(curCodex, "코덱스")}
            {primaryInfo && (
              <span style={{ fontSize: "10px", color: "var(--ct-text3, #999)", whiteSpace: "nowrap" }}
                    title={"자동: 한도 남은 계정 중 곧 리셋될 것부터 씁니다\n수동: 고른 계정을 고정합니다"}>
                {primaryInfo.providers?.anthropic?.mode === "auto" ? "자동" : "수동"}
              </span>
            )}
            {/* 릴레이 여유는 접었을 때 더 급한 정보다 — 대기가 걸리는 순간을
                알아야 하는데, 펼쳐야만 보이면 막힌 뒤에 확인하게 된다
                (2026-09-17 대표님 지적). */}
            {relay && (
              <span data-relay-capacity="true" title={relayTitle}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px",
                             whiteSpace: "nowrap", fontSize: "10px", color: "var(--ct-text2)" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: relayColor }} />
                <strong style={{ color: relayColor }}>
                  Relay {relay.status === "ok" ? `${relay.used}/${relay.max_concurrent}` : "확인 중"}
                </strong>
                {relay.status === "ok" && <span>여유 {relay.available}</span>}
              </span>
            )}
            {tightRemain <= 20 && tightest && (
              <span style={{ fontSize: "10px", color: tightRemain <= 10 ? "#ef4444" : "#f59e0b", whiteSpace: "nowrap" }}>
                ⚠ {windowName(tightest.w.window_minutes)} {tightRemain.toFixed(0)}% 남음
              </span>
            )}
            {limitStatuses.map((status) => (
              <span key={`limit-status-${status.provider}`}
                    data-usage-provider-status={status.provider}
                    style={{ fontSize: "10px", color: status.color, whiteSpace: "nowrap" }}
                    title={status.title}>
                {status.text}
              </span>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      padding: "3px 14px", borderBottom: "1px solid var(--ct-border)",
      background: "var(--ct-sb)", fontSize: "10px",
    }}>
      {renderToggle()}
      {relay && (
        <span
          data-relay-capacity="true"
          title={relayTitle}
          style={{
            display: "inline-flex", alignItems: "center", gap: "5px", minHeight: "18px",
            padding: "1px 7px", border: `1px solid ${relayColor}55`, borderRadius: "9px",
            color: "var(--ct-text2)", whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: relayColor }} />
          <strong style={{ color: relayColor }}>
            Relay {relay.status === "ok"
              ? `${relay.used}/${relay.max_concurrent}${relayTransitionPending ? ` → 목표 ${desiredRelayMax}` : ""}`
              : "확인 중"}
          </strong>
          {relay.status === "ok" && (
            <>
              {relayTransitionPending && (
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                  전환대기 {relayTransitionBlockers}
                </span>
              )}
              <span>여유 {relay.available}</span>
              <span>C {relay.active_leases.claude ?? 0}</span>
              <span>X {relay.active_leases.codex ?? 0}</span>
              <span>대기성공 {waitSuccessPct == null ? "표본없음" : `${waitSuccessPct.toFixed(0)}%`}</span>
            </>
          )}
        </span>
      )}
      {slots.length > 0 ? (
        slots.map((sl) => {
          const name = sl.label || `slot ${sl.slot}`;
          const lastResort = sl.last_resort === true;
          // 최후 수단 계정은 색부터 다르다. 같은 초록·파랑으로 그리면
          // 대표님이 남의 한도가 줄고 있는 것을 우리 계정으로 읽는다.
          const slotOn = !lastResort || sl.enabled === true;
          const dot = lastResort ? (slotOn ? "\uD83D\uDFE0" : "\u26AA") : sl.slot === "1" ? "\uD83D\uDD35" : "\uD83D\uDFE2";
          const detailText = (window_: string, pct: number | null) =>
            pct == null
              ? `${name} ${window_} \uc794\ub7c9: \uc544\uc9c1 \uce21\uc815\uac12\uc774 \uc5c6\uc2b5\ub2c8\ub2e4`
              : `${name} ${window_} \uc794\ub7c9: ${(100 - pct).toFixed(0)}%`;
          const keyName = slotMeta(sl.slot)?.key_name ?? "";
          const isActive = activeSlot === sl.slot;
          const exhausted = (sl.secondary.used_percent ?? 0) >= 100;
          return (
            <React.Fragment key={`claude-slot-${sl.slot}`}>
              <button
                type="button"
                disabled={lastResort || isActive || !keyName || switching !== null}
                onClick={() => void switchPrimary("anthropic", keyName, name, exhausted)}
                title={[
                  lastResort
                    ? "\uCD5C\uD6C4 \uC218\uB2E8 \uACC4\uC815 \u2014 \uC2AC\uB86F 1\u00B72 \uAC00 \uBAA8\uB450 \uBD88\uAC00\uB2A5\uD560 \uB54C\uB9CC \uC4F0\uC785\uB2C8\uB2E4. 1\uC21C\uC704\uB85C \uC9C0\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
                    : isActive ? "\uD604\uC7AC 1\uC21C\uC704 \uACC4\uC815" : keyName ? `\uD074\uB9AD\uD558\uBA74 ${name} \uC744(\uB97C) 1\uC21C\uC704\uB85C` : "",
                  sl.sampled_at ? `\uCE21\uC815 ${new Date(sl.sampled_at).toLocaleTimeString()} (${sl.source || "-"})` : "\uC544\uC9C1 \uCE21\uC815\uAC12 \uC5C6\uC74C",
                  exhausted ? "\uC8FC\uAC04 \uD55C\uB3C4 \uC18C\uC9C4" : "",
                ].filter(Boolean).join("\n")}
                style={{
                  fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
                  padding: "1px 7px", borderRadius: "9px",
                  border: `1px solid ${lastResort ? (slotOn ? "#f59e0b66" : "var(--ct-border)") : isActive ? "#22c55e88" : "var(--ct-border)"}`,
                  background: lastResort && slotOn ? "#f59e0b12" : isActive ? "#22c55e18" : "transparent",
                  color: exhausted ? "var(--ct-text3, #999)" : "var(--ct-text2)",
                  opacity: switching === keyName ? 0.5 : exhausted && !isActive ? 0.6 : 1,
                  cursor: lastResort || isActive || !keyName || switching !== null ? "default" : "pointer",
                }}
              >
                {dot} {name}{isActive ? " \u25CF" : ""}
                {lastResort && (
                  <span style={{ marginLeft: "4px", fontSize: "9px", fontWeight: 700, color: "#f59e0b" }}>
                    {"\uCD5C\uD6C4\uC218\uB2E8"}
                  </span>
                )}
              </button>
              {/* 토큰 상태. 자동 갱신이 안 되는 슬롯은 이것이 유일한 신호다.
                  죽었으면 눌러서 그 자리에서 새 값을 넣는다 — 서버에 들어가
                  .env 를 고치러 가지 않는다. */}
              {lastResort && sl.token_alive === false && (
                <button
                  type="button"
                  onClick={() => void replaceToken(sl.slot, name)}
                  title={"\uD1A0\uD070\uC774 \uB9CC\uB8CC\uB410\uC2B5\uB2C8\uB2E4. \uB204\uB974\uBA74 \uC0C8 \uAC12\uC744 \uB123\uC2B5\uB2C8\uB2E4."}
                  style={{
                    fontSize: "9px", fontWeight: 800, whiteSpace: "nowrap",
                    padding: "1px 6px", borderRadius: "9px", marginLeft: "-6px",
                    border: "1px solid #ef4444", background: "#ef444418",
                    color: "#ef4444", cursor: "pointer",
                  }}
                >
                  {"\uD1A0\uD070 \uB9CC\uB8CC \u2014 \uAD50\uCCB4"}
                </button>
              )}
              {/* 배정된 프로젝트. 비어 있으면 '전체' — 누르면 고른다. */}
              <button
                type="button"
                onClick={() => setEditingSlot(editingSlot === sl.slot ? null : sl.slot)}
                title={(slotProjects[sl.slot] || []).length > 0
                  ? "\uC774 \uD504\uB85C\uC81D\uD2B8\uB4E4\uC774 \uC774 \uACC4\uC815\uC744 \uBA3C\uC800 \uC500\uB2C8\uB2E4. \uB204\uB974\uBA74 \uACE0\uCE69\uB2C8\uB2E4."
                  : "\uBAA8\uB4E0 \uD504\uB85C\uC81D\uD2B8\uAC00 \uC500\uB2C8\uB2E4. \uB204\uB974\uBA74 \uBC30\uC815\uD569\uB2C8\uB2E4."}
                style={{
                  fontSize: "9px", fontWeight: 700, whiteSpace: "nowrap",
                  padding: "1px 6px", borderRadius: "9px", marginLeft: "-6px",
                  border: "1px dashed var(--ct-border)", background: "transparent",
                  color: (slotProjects[sl.slot] || []).length > 0 ? "#2563eb" : "var(--ct-text3, #999)",
                  cursor: "pointer",
                }}
              >
                {(slotProjects[sl.slot] || []).length > 0
                  ? (slotProjects[sl.slot] || []).join(",")
                  : "\uC804\uCCB4"}
              </button>
              {editingSlot === sl.slot && (
                <span style={{ position: "relative", display: "inline-block" }}>
                  <span style={{
                    position: "absolute", top: "14px", left: 0, zIndex: 40,
                    minWidth: "160px", maxHeight: "260px", overflowY: "auto",
                    padding: "6px", borderRadius: "8px",
                    border: "1px solid var(--ct-border)", background: "var(--ct-bg)",
                    boxShadow: "0 8px 24px rgba(0,0,0,.28)",
                  }}>
                    <span style={{ display: "block", fontSize: "9.5px", color: "var(--ct-text3, #999)", padding: "2px 4px 4px" }}>
                      {"\uACE0\uB978 \uD504\uB85C\uC81D\uD2B8\uAC00 \uC774 \uACC4\uC815\uC744 \uBA3C\uC800 \uC500\uB2C8\uB2E4. \uBE44\uC6B0\uBA74 \uC804\uCCB4."}
                    </span>
                    {knownProjects.map((key) => {
                      const on = (slotProjects[sl.slot] || []).includes(key);
                      return (
                        <label key={key} style={{
                          display: "flex", gap: "6px", alignItems: "center",
                          padding: "3px 4px", fontSize: "11px", cursor: "pointer",
                          color: "var(--ct-text2)",
                        }}>
                          <input type="checkbox" checked={on}
                                 onChange={() => void toggleProject(sl.slot, key)} />
                          {key}
                        </label>
                      );
                    })}
                    <button type="button" onClick={() => setEditingSlot(null)}
                      style={{ marginTop: "4px", width: "100%", padding: "3px",
                               fontSize: "10px", borderRadius: "6px",
                               border: "1px solid var(--ct-border)",
                               background: "transparent", color: "var(--ct-text2)",
                               cursor: "pointer" }}>
                      {"\uB2EB\uAE30"}
                    </button>
                  </span>
                </span>
              )}
              {lastResort && (
                // 켜짐/꺼짐이 한눈에 보여야 한다. 꺼져 있으면 이 계정은
                // 폴백 후보에도 오르지 않는다 — 회색이 그 뜻이다.
                <button
                  type="button"
                  disabled={gating !== null}
                  onClick={() => void toggleSlot(sl.slot, name, !slotOn)}
                  title={slotOn
                    ? "\uB204\uB974\uBA74 \uB055\uB2C8\uB2E4. \uAEBC\uC9C0\uBA74 \uD3F4\uBC31 \uD6C4\uBCF4\uC5D0\uC11C \uBE60\uC9D1\uB2C8\uB2E4."
                    : "\uB204\uB974\uBA74 \uCF2D\uB2C8\uB2E4. \uC2AC\uB86F 1\u00B72 \uAC00 \uBAA8\uB450 \uBD88\uAC00\uB2A5\uD560 \uB54C\uB9CC \uC4F0\uC785\uB2C8\uB2E4."}
                  style={{
                    fontSize: "9px", fontWeight: 800, whiteSpace: "nowrap",
                    padding: "1px 7px", borderRadius: "9px", marginLeft: "-6px",
                    border: `1px solid ${slotOn ? "#f59e0b" : "var(--ct-border)"}`,
                    background: slotOn ? "#f59e0b" : "transparent",
                    color: slotOn ? "#1a1a1a" : "var(--ct-text3, #999)",
                    opacity: gating === sl.slot ? 0.5 : 1,
                    cursor: gating !== null ? "default" : "pointer",
                  }}
                >
                  {slotOn ? "\uCF1C\uC9D0" : "\uAEBC\uC9D0"}
                </button>
              )}
              {/* 계정마다 같은 자리에 같은 막대를 둔다. 측정값이 없는 계정만
                  따로 글자를 적으면 줄이 어긋나 한눈에 비교가 안 된다.
                  측정 전에는 막대는 비고 숫자만 "—" 로 나온다. */}
              <MiniBar
                pct={sl.primary.used_percent}
                label="5h"
                detail={detailText("5\uc2dc\uac04", sl.primary.used_percent)}
                resetIn={formatResetTime(sl.primary.resets_at ?? undefined)}
              />
              <MiniBar
                pct={sl.secondary.used_percent}
                label="1w"
                detail={detailText("1\uc8fc", sl.secondary.used_percent)}
                resetIn={formatResetTime(sl.secondary.resets_at ?? undefined)}
              />
            </React.Fragment>
          );
        })
      ) : cm ? (
        <>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)" }}>
            Claude{isLive ? sourceLabel : " (est)"}
          </span>
          <MiniBar
            pct={cm.primary.used_percent}
            label="5h"
            detail={`5\uc2dc\uac04 \uc794\ub7c9: ${(100 - cm.primary.used_percent).toFixed(0)}% | ${formatTokens(cm.primary.total_tokens)} tok \uc0ac\uc6a9`}
            resetIn={formatResetTime(cm.primary.resets_at)}
          />
          <MiniBar
            pct={cm.secondary.used_percent}
            label="1w"
            detail={`1\uc8fc \uc794\ub7c9: ${(100 - cm.secondary.used_percent).toFixed(0)}% | ${formatTokens(cm.secondary.total_tokens)} tok \uc0ac\uc6a9`}
            resetIn={formatResetTime(cm.secondary.resets_at)}
          />
        </>
      ) : null}
      {switchError && (
        <span style={{ fontSize: "10px", color: "#ef4444", whiteSpace: "nowrap" }}
              title={switchError}>
          \uACC4\uC815 \uC804\uD658 \uC2E4\uD328
        </span>
      )}
      {/* 코덱스 계정 칩. 여기에는 지금 쓰는 계정 하나만 막대로 나오고 나머지
          계정은 화면 어디에도 없었다 — 어느 계정이 남아 있는지 모른 채
          한도가 끊겼다(2026-09-17 대표님 지적). 클로드 슬롯 칩과 같은 방식으로
          전부 띄우고, 눌러서 주계정을 바꾼다. */}
      {(primaryInfo?.providers?.codex?.accounts ?? []).map((acc) => {
        const isPrimary = primaryInfo?.providers?.codex?.primary === acc.key_name;
        const short = (acc.label || acc.key_name).split(" ")[0].split("@")[0].split("(")[0];
        const auto = primaryInfo?.providers?.codex?.mode === "auto";
        return (
          <button
            key={`codex-acct-${acc.key_name}`}
            type="button"
            disabled={isPrimary || switching !== null || auto}
            onClick={() => void switchPrimary("codex", acc.key_name, short, !acc.has_quota)}
            title={[
              isPrimary ? "현재 주계정" : auto ? "자동 모드 — 규칙이 정합니다" : `클릭하면 ${short} 을(를) 주계정으로`,
              acc.has_quota ? "" : "한도 소진",
              acc.resets_at ? `${new Date(acc.resets_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 갱신` : "",
            ].filter(Boolean).join("\n")}
            style={{
              fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
              padding: "1px 7px", borderRadius: "9px", marginLeft: "4px",
              border: `1px solid ${isPrimary ? "#22c55e88" : "var(--ct-border)"}`,
              background: isPrimary ? "#22c55e18" : "transparent",
              color: acc.has_quota ? "var(--ct-text2)" : "var(--ct-text3, #999)",
              opacity: switching === acc.key_name ? 0.5 : acc.has_quota || isPrimary ? 1 : 0.6,
              cursor: isPrimary || auto || switching !== null ? "default" : "pointer",
            }}
          >
            {"🟣"} {short}{isPrimary ? " ●" : ""}
          </button>
        );
      })}
      {/* 계정별 사용량. 릴레이의 /codex-usage 는 limit_id(codex_bengalfox 등)로만
          답해서 어느 계정 값인지 이어 붙일 수 없었다 — 그래서 주계정을 펼쳐도
          사용량이 비어 보였다(2026-09-17 대표님 지적). 계정에 귀속된 값은
          codex_usage_snapshots 기반의 account-primary 쪽이므로 그것을 쓴다. */}
      {(primaryInfo?.providers?.codex?.accounts ?? []).map((acc) => {
        if (acc.headroom_pct == null) return null;
        const short = (acc.label || acc.key_name).split(" ")[0].split("@")[0].split("(")[0];
        return (
          <MiniBar
            key={`codex-usage-${acc.key_name}`}
            pct={100 - acc.headroom_pct}
            width={34}
            label={short.slice(0, 8)}
            detail={`${short} 주간 잔량 ${acc.headroom_pct.toFixed(0)}%${
              acc.resets_at
                ? ` · ${new Date(acc.resets_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 갱신`
                : ""}`}
          />
        );
      })}
      {cxAll.map((cx, i) => {
        const cname = cx.limit_id && cx.limit_id !== "codex" ? `Codex:${cx.limit_id.replace(/^codex_/, "")}` : "Codex";
        return (
          <React.Fragment key={`codex-${cx.limit_id || i}`}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--ct-text2)", marginLeft: "4px" }}>{cname}</span>
            {/* \ucc3d \uc774\ub984\uc744 window_minutes \ub85c \uc815\ud55c\ub2e4. 'primary=5h' \ub85c \ubc15\uc544\ub450\uba74
                \ucf54\ub371\uc2a4\uc758 \uc8fc\uac04 \uc18c\uc9c4\uc774 5\uc2dc\uac04 \uc790\ub9ac\uc5d0 \uadf8\ub824\uc9c4\ub2e4 \u2014 2026-09-16 \uc2e4\uce21:
                primary \uac00 window_minutes=10080(\uc8fc\uac04) \uc778\ub370 "5h 0%" \ub85c \ubcf4\uc600\uace0,
                \uc606\uc758 "1w 100%" \ub294 \uac12\uc774 \uc5c6\ub294 secondary \uc600\ub2e4.
                \uac12\uc774 \uc5c6\ub294 \ucc3d\uc740 \uc544\uc608 \uadf8\ub9ac\uc9c0 \uc54a\ub294\ub2e4. */}
            {[cx.primary, cx.secondary].map((w, wi) =>
              w && w.used_percent != null ? (
                <MiniBar
                  key={`cx-w-${wi}`}
                  pct={w.used_percent}
                  label={windowName(w.window_minutes ?? null)}
                  detail={`${cname} ${windowName(w.window_minutes ?? null)} \uc794\ub7c9: ${(100 - w.used_percent).toFixed(0)}%`}
                  resetIn={formatResetSeconds(w.resets_in_sec)}
                />
              ) : null,
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
