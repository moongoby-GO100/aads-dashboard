"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import AccountLoginModal from "./AccountLoginModal";

/** LLM 계정 통합 카드.
 *
 * 카드 4장(레지스트리 · 코덱스 사용량 · 구독 계정 로그인 상태 · Claude 계정 관리)을
 * 한 장으로 합친 것이다. 넷이 같은 키를 각각 다시 그리면서 속성을 하나씩만
 * 보여줬고, 그래서 탭 하나가 25,680px(28.5 화면)이 됐다. anthropic 3개와 codex
 * 2개는 세 카드에 중복으로 나왔다.
 *
 * 규칙 — 대상 하나 = 행 하나. 상세는 새 카드가 아니라 그 행이 펼쳐진 자리에.
 * 합치는 일은 서버(/llm-keys/overview)가 한다. 화면에서 응답 셋을 키 이름으로
 * 조인하면 2026-09-16 오전의 귀속 사고가 그대로 재현된다.
 *
 * 설계: aads-docs/docs/PRD-SETTINGS-UNIFIED-ACCOUNT-CARD-v1.0.md
 */

type State = "ok" | "rate_limited" | "needs_login" | "inactive" | "unknown";

type UsageWindow = { window_minutes: number | null; used_percent: number; resets_at: string | null };

type Account = {
  windows: UsageWindow[];
  key_name: string; provider: string; label: string; priority: number;
  is_active: boolean; kind: "subscription"; masked_value: string; slot: string | null;
  state: State; bound: boolean; needs_login: boolean; login_in_progress: boolean;
  login_target: string | null; subscription: string | null;
  rate_limited_until: string | null; used_percent: number | null; resets_at: string | null;
  snapshot_age_hours: number | null; ok_72h: number; limit_72h: number; notes: string | null;
};

type ProviderGroup = {
  provider: string; key_count: number; usable: number;
  keys: Array<{ id: number; key_name: string; label: string; priority: number;
                masked_value: string; is_active: boolean; state: State; notes: string | null }>;
};

type Overview = {
  summary: {
    action_required: number;
    codex: { usable: number; total: number };
    anthropic: { usable: number; total: number };
    subscription_total: number; apikey_total: number; total: number;
    bindings_available: boolean; collected_at: string | null;
  };
  accounts: Account[];
  providers: ProviderGroup[];
};

type Chip = "action" | "codex" | "anthropic" | "subscription" | "apikey" | "all";

/** 주계정을 누가 정하는가.
 *  manual — 대표님이 고른 계정
 *  auto   — 한도 남은 계정 중 갱신이 이른 것부터 (곧 리셋될 한도를 먼저 태운다) */
type PrimaryState = {
  providers: Record<string, {
    mode: "auto" | "manual";
    primary: string;
    accounts: Array<{ key_name: string; label: string; has_quota: boolean;
                      headroom_pct: number | null; resets_at: string | null }>;
  }>;
};

const PROVIDER_LABEL: Record<string, string> = { anthropic: "Claude", codex: "Codex" };

/** 구독 계정 표의 열 정의. 헤더와 각 행이 같은 값을 써야 열이 어긋나지 않는다.
 *  펼침 · provider · 계정 · 순위 · 상태 · 사용량 · 액션 */
const COLS = "14px 68px minmax(160px,1fr) 34px 76px 200px 152px";
const COLS_MIN_WIDTH = 860;

const KST = "Asia/Seoul";
const kst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: KST, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

const STATE_TEXT: Record<State, string> = {
  ok: "정상", rate_limited: "한도정지", needs_login: "로그인 필요",
  inactive: "비활성", unknown: "확인 불가",
};
const STATE_COLOR: Record<State, string> = {
  ok: "#16a34a", rate_limited: "#dc2626", needs_login: "#d97706",
  inactive: "var(--text-secondary)", unknown: "var(--text-secondary)",
};

/** 창 길이를 사람이 읽는 이름으로. 300분=5시간, 10080분=주간. */
function windowLabel(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes >= 10080) return "주간";
  if (minutes >= 60) return `${Math.round(minutes / 60)}시간`;
  return `${minutes}분`;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--border)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export default function LlmAccountCard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [chip, setChip] = useState<Chip | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState("");
  const [current, setCurrent] = useState<number | null>(null);
  const [primaryInfo, setPrimaryInfo] = useState<PrimaryState | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    (api as any).getLlmOverview()
      .then((r: Overview) => { setData(r); setErr(""); })
      .catch(() => setErr("계정 정보를 불러오지 못했습니다"))
      .finally(() => setLoading(false));
    fetch("/api/v1/ops/claude-accounts")
      .then((r) => r.json())
      .then((r) => setCurrent(r?.current_account ?? null))
      .catch(() => {/* 주계정 표시만 비운다 */});
    (api as any).getAccountPrimary()
      .then((r: PrimaryState) => setPrimaryInfo(r))
      .catch(() => {/* 토글만 비운다 */});
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasBlockingAction = Boolean(data && (
    data.accounts.some((a) => a.state === "needs_login")
    || (data.summary.codex.total > 0 && data.summary.codex.usable === 0)
    || (data.summary.anthropic.total > 0 && data.summary.anthropic.usable === 0)
  ));

  // 로그인 필요나 provider 전체 장애면 조치 필터를 먼저 연다. 사용 가능한 대체
  // 계정이 있는데 한 계정만 한도정지인 경우에는 전체 장애처럼 보이지 않게
  // 구독 전체를 먼저 보여준다.
  const effectiveChip: Chip = chip ?? (hasBlockingAction ? "action" : "subscription");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  /** 주계정 수동 지정. 클로드·코덱스 모두 같은 경로를 쓴다 — 선택 경로가
   *  전부 llm_api_keys.priority 를 보므로 그것을 바꾸는 것이 전환의 본체다. */
  const makePrimary = async (provider: string, keyName: string, label: string) => {
    const res = await (api as any).setAccountPrimary({ provider, mode: "manual", key_name: keyName })
      .catch((e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : "요청 실패" }));
    flash(res?.ok ? `주계정을 ${label}(으)로 바꿨습니다 — 수동 고정` : res?.detail || "전환 실패");
    if (res?.ok) load();
  };

  const setMode = async (provider: string, mode: "auto" | "manual") => {
    if (mode === "manual") {
      const cur = primaryInfo?.providers?.[provider];
      if (!cur?.primary) return;
      await makePrimary(provider, cur.primary, cur.accounts.find((a) => a.key_name === cur.primary)?.label || cur.primary);
      return;
    }
    const res = await (api as any).setAccountPrimary({ provider, mode: "auto" })
      .catch((e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : "요청 실패" }));
    flash(res?.ok
      ? `${PROVIDER_LABEL[provider] ?? provider} 자동 — 곧 리셋될 한도부터 씁니다`
      : res?.detail || "전환 실패");
    if (res?.ok) load();
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const a = data.accounts;
    switch (effectiveChip) {
      case "action": return a.filter((x) => x.state === "needs_login" || x.state === "rate_limited");
      case "codex": return a.filter((x) => x.provider === "codex");
      case "anthropic": return a.filter((x) => x.provider === "anthropic");
      case "apikey": return [];
      default: return a;
    }
  }, [data, effectiveChip]);

  if (loading && !data) return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>불러오는 중...</p>;
  if (err) return <p className="text-xs" style={{ color: "#dc2626" }}>{err}</p>;
  if (!data) return null;

  const s = data.summary;
  const chips: Array<{ id: Chip; label: string; danger?: boolean; warn?: boolean }> = [
    ...(s.action_required > 0 ? [{ id: "action" as Chip, label: `⚠ 조치 필요 ${s.action_required}`, warn: true }] : []),
    { id: "codex", label: `코덱스 ${s.codex.usable}/${s.codex.total}`, danger: s.codex.usable === 0 && s.codex.total > 0 },
    { id: "anthropic", label: `클로드 ${s.anthropic.usable}/${s.anthropic.total}`, danger: s.anthropic.usable === 0 && s.anthropic.total > 0 },
    { id: "subscription", label: `구독 ${s.subscription_total}` },
    { id: "apikey", label: `API 키 ${s.apikey_total}` },
    { id: "all", label: `전체 ${s.total}` },
  ];

  return (
    <div className="space-y-3">
      {/* 요약 칩 = 상태 표시이자 필터. 두 줄로 나누지 않는다. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => {
          const on = effectiveChip === c.id;
          return (
            <button key={c.id} onClick={() => setChip(c.id)}
              className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: on ? "var(--accent, #2563eb)" : "transparent",
                color: on ? "#fff" : c.danger ? "#dc2626" : c.warn ? "#d97706" : "var(--text-secondary)",
                border: `1px solid ${on ? "var(--accent, #2563eb)" : "var(--border)"}`,
              }}>
              {c.label}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          {s.collected_at && <span>갱신 {kst(s.collected_at)} KST</span>}
          <button onClick={load} className="px-2 py-1 rounded" style={{ border: "1px solid var(--border)" }}>새로고침</button>
          <button onClick={() => setShowAdd((v) => !v)} className="px-2 py-1 rounded font-semibold"
            style={{ background: "var(--accent, #2563eb)", color: "#fff" }}>+ 키 추가</button>
        </span>
      </div>

      {s.codex.total > 0 && s.codex.usable > 0 && s.codex.usable < s.codex.total && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{
          background: "rgba(217,119,6,0.08)",
          border: "1px solid rgba(217,119,6,0.35)",
          color: "var(--text-primary)",
        }}>
          Codex는 사용 가능합니다. 일부 계정만 한도정지이며 자동 모드에서는 사용 가능한 주계정으로 우회합니다.
        </div>
      )}

      {/* 주계정 — provider 마다 한 줄. 자동은 "곧 리셋될 한도부터 태운다" 규칙을
          2분 조정기가 돌린다. 수동은 지금 1순위인 계정을 그대로 잠근다. */}
      {primaryInfo && (
        <div className="rounded-lg" style={{ border: "1px solid var(--border)", overflowX: "auto" }}>
          {Object.entries(primaryInfo.providers).map(([provider, p]) => {
            const acc = p.accounts.find((a) => a.key_name === p.primary);
            return (
              <div key={provider} className="px-3 py-2 text-xs" style={{
                display: "grid", gridTemplateColumns: "72px 128px minmax(160px,1fr) 180px",
                gap: 12, alignItems: "center", borderBottom: "1px solid var(--border)",
              }}>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {PROVIDER_LABEL[provider] ?? provider}
                </span>
                <span className="flex gap-1">
                  {(["auto", "manual"] as const).map((m) => (
                    <button key={m} onClick={() => void setMode(provider, m)}
                      className="px-2 py-1 rounded font-semibold"
                      style={{
                        background: p.mode === m ? "var(--accent, #2563eb)" : "transparent",
                        color: p.mode === m ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${p.mode === m ? "var(--accent, #2563eb)" : "var(--border)"}`,
                      }}>
                      {m === "auto" ? "자동" : "수동"}
                    </button>
                  ))}
                </span>
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent, #2563eb)" }}>▪ 주계정</span>{" "}
                  <span style={{ color: "var(--text-primary)" }}>{acc?.label || p.primary || "-"}</span>
                  {acc && !acc.has_quota && <span style={{ color: "#dc2626" }}> · 한도 없음</span>}
                </span>
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                  {p.mode === "auto"
                    ? "곧 리셋될 한도부터 사용"
                    : acc?.resets_at ? `${kst(acc.resets_at)} 갱신` : "고정"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!s.bindings_available && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          ◌ 계정 상태 확인 불가 — 릴레이 응답 없음. 등록 정보는 표시하고 상태·사용량 열은 비웁니다.
        </div>
      )}
      {msg && <p className="text-xs" style={{ color: "var(--text-primary)" }}>{msg}</p>}

      {showAdd && <AddKeyForm onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }}
                              onLogin={(t) => { setShowAdd(false); setLoginTarget(t); }} />}

      {/* 구독 계정 — 행 하나에 등록·상태·사용량·액션이 전부 있다.
          열은 grid 로 고정한다. flex + flex-wrap 이었을 때는 라벨 길이와
          사용량 창 개수(코덱스 1개·클로드 2개)에 따라 열이 제각각 밀려서
          우선순위·상태 숫자가 행마다 다른 x 좌표에 찍혔다. 좁은 화면에서는
          줄을 흘리지 말고 카드를 가로로 굴린다 — 표는 열이 맞아야 읽힌다. */}
      {effectiveChip !== "apikey" && (
        <div className="rounded-lg" style={{ border: "1px solid var(--border)", overflowX: "auto" }}>
          <div style={{ minWidth: COLS_MIN_WIDTH }}>
          {rows.length > 0 && (
            <div className="px-3 py-1.5 text-xs" style={{
              display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center",
              background: "var(--bg-subtle, rgba(0,0,0,0.02))",
              borderBottom: "1px solid var(--border)", color: "var(--text-secondary)",
            }}>
              <span />
              <span>provider</span>
              <span>계정</span>
              <span style={{ textAlign: "right" }}>순위</span>
              <span>상태</span>
              <span>사용량 (잔량)</span>
              <span style={{ textAlign: "right" }}>액션</span>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="text-xs px-3 py-4" style={{ color: "var(--text-secondary)" }}>
              {effectiveChip === "action" ? "조치가 필요한 계정이 없습니다." : "표시할 계정이 없습니다."}
            </p>
          ) : rows.map((a) => {
            const open = openRow === a.key_name;
            const color = STATE_COLOR[a.state];
            // 주계정 판정은 provider 를 가리지 않고 key_name 으로 한다.
            // 예전에는 슬롯이 있는 클로드만 표시·전환이 됐고, 코덱스는 어느
            // 계정이 쓰이는지 화면에서 알 수 없었다(2026-09-17 대표님 지적).
            const primaryKey = primaryInfo?.providers?.[a.provider]?.primary;
            const isPrimary = primaryKey
              ? a.key_name === primaryKey
              : Boolean(a.slot && current !== null && a.slot === `slot${current}`);
            return (
              <div key={a.key_name} style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="px-3 py-2" style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "start",
                }}>
                  <button onClick={() => setOpenRow(open ? null : a.key_name)}
                    className="text-xs text-left" style={{ color: "var(--text-secondary)", lineHeight: "20px" }}>{open ? "▾" : "▸"}</button>
                  <span className="text-xs font-mono truncate" style={{ color: "var(--text-secondary)", lineHeight: "20px" }}>{a.provider}</span>
                  <span className="text-xs font-semibold min-w-0 truncate" style={{ color: "var(--text-primary)", lineHeight: "20px" }}>
                    {a.slot ?? a.key_name.replace("CODEX_OAUTH_", "")}
                    <span className="font-normal ml-1.5" style={{ color: "var(--text-secondary)" }}>{a.label || "-"}</span>
                    {isPrimary && <span className="ml-1.5" style={{ color: "var(--accent, #2563eb)" }}>▪ 주계정</span>}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)", textAlign: "right", lineHeight: "20px" }}>p{a.priority}</span>
                  <span className="text-xs font-semibold truncate" style={{ color, lineHeight: "20px" }}>{STATE_TEXT[a.state]}</span>
                  {/* 창 구성이 provider 마다 다르다. 코덱스는 주간 하나,
                      클로드는 5시간 + 주간이다. window_minutes 로 이름을 정하고
                      'primary/secondary' 라는 순서에 기대지 않는다. */}
                  <span className="space-y-0.5" style={{ minWidth: 0 }}>
                    {/* 숫자는 **잔량**이다. 채팅창 상단과 같은 방향으로 맞춘다 —
                        한쪽은 사용량, 한쪽은 잔량이면 같은 계정의 같은 창이
                        97% 와 3% 로 보인다(2026-09-16 실측). 막대는 사용량만큼
                        차오르고 숫자는 남은 양을 적는다. */}
                    {a.windows.length > 0 ? a.windows.map((w) => (
                      <span key={w.window_minutes ?? "n"} className="block">
                        <Bar pct={w.used_percent} color={w.used_percent >= 90 ? "#dc2626" : w.used_percent >= 80 ? "#d97706" : color} />
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {windowLabel(w.window_minutes)} {(100 - w.used_percent).toFixed(0)}% 남음
                          {w.resets_at ? ` · ${kst(w.resets_at)} 리셋` : ""}
                        </span>
                      </span>
                    )) : (
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        기록 없음 — 첫 호출 후 표시
                      </span>
                    )}
                    {a.rate_limited_until && (
                      <span className="block text-xs" style={{ color: "#dc2626" }}>{kst(a.rate_limited_until)} 복귀</span>
                    )}
                  </span>
                  <span className="flex gap-1 justify-end">
                    {!a.needs_login && !isPrimary && (
                      <button onClick={() => void makePrimary(a.provider, a.key_name, a.label || a.key_name)}
                        className="text-xs px-2 py-1 rounded whitespace-nowrap"
                        style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>주계정</button>
                    )}
                    <button onClick={() => a.login_target && setLoginTarget(a.login_target)}
                      className="text-xs px-2 py-1 rounded font-semibold"
                      style={{ border: `1px solid ${a.needs_login ? "#d97706" : "var(--border)"}`,
                               color: a.needs_login ? "#d97706" : "var(--text-primary)" }}>
                      {a.login_in_progress ? "진행창" : a.needs_login ? "로그인" : "재로그인"}
                    </button>
                  </span>
                </div>

                {open && (
                  <div className="px-3 pb-3 pt-1 text-xs space-y-1" style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", color: "var(--text-secondary)" }}>
                    <div>키 이름 <span style={{ color: "var(--text-primary)" }}>{a.key_name}</span> · 값 {a.masked_value} · 우선순위 {a.priority} · {a.is_active ? "활성" : "비활성"}</div>
                    <div>자격증명 {a.bound ? "정상" : "없음"}{a.subscription ? ` · 구독 ${a.subscription}` : ""}</div>
                    <div>
                      최근 72h 성공 {a.ok_72h} · 한도실패 {a.limit_72h}
                      {a.snapshot_age_hours !== null && (
                        <span style={{ color: a.snapshot_age_hours > 24 ? "#d97706" : undefined }}>
                          {" "}· 스냅샷 {a.snapshot_age_hours < 1 ? "실시간" : `${a.snapshot_age_hours.toFixed(0)}시간 전`}
                        </span>
                      )}
                    </div>
                    {a.notes && <div className="whitespace-pre-wrap">메모 {a.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* API 키 — provider별 한 줄, 펼칠 때만 키 목록 */}
      {(effectiveChip === "apikey" || effectiveChip === "all") && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {data.providers.map((p) => {
            const open = openProvider === p.provider;
            return (
              <div key={p.provider} style={{ borderBottom: "1px solid var(--border)" }}>
                <button onClick={() => setOpenProvider(open ? null : p.provider)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left">
                  <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)", width: 12 }}>{open ? "▾" : "▸"}</span>
                  <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-primary)", width: 96 }}>{p.provider}</span>
                  <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>키 {p.key_count}</span>
                  <span className="text-xs truncate min-w-0 flex-1" style={{ color: "var(--text-secondary)" }}>
                    {p.keys.map((k) => k.label || k.key_name).join(" · ")}
                  </span>
                  {p.usable < p.key_count && <span className="text-xs shrink-0" style={{ color: "#d97706" }}>⚠ {p.key_count - p.usable}</span>}
                </button>
                {/* 키 행도 열을 고정한다. flex + ml-auto 였을 때는 key_name
                    길이에 따라 라벨·값·상태가 행마다 다른 자리에 섰다. */}
                {open && (
                  <div className="px-3 pb-2 space-y-1">
                    {p.keys.map((k) => (
                      <div key={k.id} className="text-xs py-1" style={{
                        color: "var(--text-secondary)",
                        display: "grid",
                        gridTemplateColumns: "34px 220px minmax(120px,1fr) 180px 76px",
                        gap: 12, alignItems: "center",
                      }}>
                        <span className="tabular-nums" style={{ textAlign: "right" }}>p{k.priority}</span>
                        <span className="font-mono truncate" style={{ color: "var(--text-primary)" }}>{k.key_name}</span>
                        <span className="truncate">{k.label || "-"}</span>
                        <span className="font-mono truncate">{k.masked_value}</span>
                        <span className="truncate" style={{ color: STATE_COLOR[k.state] }}>{STATE_TEXT[k.state]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loginTarget && (
        <AccountLoginModal target={loginTarget}
          onClose={() => { setLoginTarget(null); load(); }}
          onDone={load} />
      )}
    </div>
  );
}

/** 키 추가 — 카드 상단에서 열린다.
 *
 * 이전에는 '채팅창 모델 노출 순서'(10,530px) 아래, 약 24,000px 스크롤 지점에
 * 있었고 입력칸 5개가 전부 자유 입력이었다. key_name 과 우선순위는 서버가
 * 이미 아는 값인데 사람이 외워서 쳤고, 우선순위가 겹치면 409 로 거절당했다.
 *
 * 이제 provider 를 고르면 서버가 나머지를 채운다. 사람이 하는 일은
 * 드롭다운 1회 + 값 붙여넣기 1회다.
 */
function AddKeyForm({ onClose, onDone, onLogin }:
  { onClose: () => void; onDone: () => void; onLogin: (target: string) => void }) {
  const [options, setOptions] = useState<{ used: any[]; unused: any[] } | null>(null);
  const [provider, setProvider] = useState("");
  const [custom, setCustom] = useState("");
  const [defaults, setDefaults] = useState<any>(null);
  const [value, setValue] = useState("");
  const [keyName, setKeyName] = useState("");
  const [priority, setPriority] = useState<number>(1);
  const [label, setLabel] = useState("");
  const [showAuto, setShowAuto] = useState(false);
  const [dup, setDup] = useState<{ key_name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { (api as any).getProviderOptions().then(setOptions).catch(() => setErr("provider 목록 로드 실패")); }, []);

  const effectiveProvider = provider === "__custom__" ? custom.trim() : provider;

  useEffect(() => {
    if (!effectiveProvider) { setDefaults(null); return; }
    (api as any).getNewKeyDefaults(effectiveProvider)
      .then((d: any) => { setDefaults(d); setKeyName(d.suggested_key_name); setPriority(d.next_priority); })
      .catch(() => setErr("기본값 조회 실패"));
  }, [effectiveProvider]);

  // 값 붙여넣으면 지문으로 중복을 본다. 평문은 비교에만 쓰고 저장하지 않는다.
  useEffect(() => {
    if (!value.trim()) { setDup(null); return; }
    const t = setTimeout(() => {
      (api as any).checkKeyDuplicate(value.trim())
        .then((r: any) => setDup(r.duplicate ? { key_name: r.key_name } : null))
        .catch(() => setDup(null));
    }, 500);
    return () => clearTimeout(t);
  }, [value]);

  const submit = async () => {
    if (!effectiveProvider || !value.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      await (api as any).createLlmKey({
        provider: effectiveProvider, key_name: keyName.trim(), value: value.trim(),
        label: label.trim(), priority,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.message || "추가 실패");
    } finally { setBusy(false); }
  };

  const isSub = defaults?.kind === "subscription";
  const inputStyle = { background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>새 키 추가</span>
        <button onClick={onClose} className="text-xs px-2 py-0.5 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>닫기</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={provider} onChange={(e) => setProvider(e.target.value)}
          className="text-xs rounded px-2 py-1.5" style={inputStyle}>
          <option value="">Provider 선택…</option>
          {options?.used.length ? <optgroup label="사용 중">
            {options.used.map((o) => <option key={o.provider} value={o.provider}>{o.provider} (키 {o.key_count})</option>)}
          </optgroup> : null}
          {options?.unused.length ? <optgroup label="미사용">
            {options.unused.map((o) => <option key={o.provider} value={o.provider}>{o.provider}</option>)}
          </optgroup> : null}
          <option value="__custom__">직접 입력…</option>
        </select>
        {provider === "__custom__" && (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="provider 이름"
            className="text-xs rounded px-2 py-1.5" style={inputStyle} />
        )}
        {defaults && !isSub && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            사용 중 {defaults.existing_count}개 · 다음 순위 {defaults.next_priority}
          </span>
        )}
      </div>

      {isSub ? (
        <div className="rounded px-3 py-2 text-xs space-y-1" style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.35)", color: "var(--text-primary)" }}>
          <p>⚠ 구독 계정은 키를 붙여넣어 등록할 수 없습니다. access 토큰만 넣으면 약 8시간 뒤 401로 죽습니다.</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {defaults.login_targets.length === 0 && <span style={{ color: "var(--text-secondary)" }}>등록 가능한 슬롯이 없습니다.</span>}
            {defaults.login_targets.map((t: any) => (
              <button key={t.target} onClick={() => onLogin(t.target)}
                className="px-2 py-1 rounded font-semibold"
                style={{ border: "1px solid var(--border)", color: t.needs_login ? "#d97706" : "var(--text-primary)" }}>
                {t.account} {t.needs_login ? "로그인" : "재로그인"}
              </button>
            ))}
          </div>
        </div>
      ) : defaults ? (
        <>
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="키 값 붙여넣기" className="w-full text-xs rounded px-2 py-1.5" style={inputStyle} />
          {dup && (
            <p className="text-xs" style={{ color: "#d97706" }}>
              ⚠ 같은 값이 &apos;{dup.key_name}&apos;로 이미 등록돼 있습니다. 그대로 추가하면 같은 계정이 두 줄로 잡힙니다.
            </p>
          )}

          <button onClick={() => setShowAuto((v) => !v)} className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {showAuto ? "▾" : "▸"} 자동 설정 3건 — {keyName} · 우선순위 {priority} · 활성
          </button>
          {showAuto && (
            <div className="grid grid-cols-2 gap-2">
              <input value={keyName} onChange={(e) => setKeyName(e.target.value)}
                className="text-xs rounded px-2 py-1.5" style={inputStyle} placeholder="키 이름" />
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}
                className="text-xs rounded px-2 py-1.5" style={inputStyle}>
                {Array.from({ length: (defaults.used_priorities.length || 0) + 3 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} disabled={defaults.used_priorities.includes(n)}>
                    {n}{defaults.used_priorities.includes(n) ? " (사용 중)" : ""}
                  </option>
                ))}
              </select>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                className="text-xs rounded px-2 py-1.5 col-span-2" style={inputStyle} placeholder="라벨 (선택)" />
            </div>
          )}

          {err && <p className="text-xs" style={{ color: "#dc2626" }}>{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={!value.trim() || busy}
              className="px-3 py-1.5 rounded text-xs font-bold"
              style={{ background: "var(--accent, #2563eb)", color: "#fff", opacity: !value.trim() || busy ? 0.5 : 1 }}>
              {busy ? "추가 중..." : "추가"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Provider를 고르면 키 이름과 우선순위가 자동으로 채워집니다.</p>
      )}
    </div>
  );
}
