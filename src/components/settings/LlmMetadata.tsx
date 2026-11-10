/** Provider metadata is evidence, not inferred from model names or first-seen dates. */
export function safeSource(value?: string | null): string | null {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function metadataTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "미확인";
  return `${new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST`;
}

export type ReleaseMetadata = {
  release_date?: string | null;
  release_date_source?: string | null;
  release_date_verified_at?: string | null;
};

export function ModelReleaseDate({ model }: { model: ReleaseMetadata }) {
  const source = safeSource(model.release_date_source);
  const date = model.release_date || "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date;
  if (!source || !validDate || metadataTime(model.release_date_verified_at) === "미확인") {
    return <div className="mt-1" style={{ color: "var(--text-secondary)" }}>출시일 미확인</div>;
  }
  return <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
    출시일 <time dateTime={date}>{date}</time>{" · "}
    <a href={source} target="_blank" rel="noopener noreferrer" className="underline"
      title={`출처 확인: ${metadataTime(model.release_date_verified_at)}`}>출처</a>
  </div>;
}

export type QuotaGroup = {
  name: string; models: string[];
  windows: Array<{ period: string; remaining_percent: number | null; used_percent: number | null;
    reset_at: string | null; reset_description?: string | null; disabled?: boolean; stale: boolean }>;
};
export type HostUsage = {
  state: string;
  usage_status?: string | null;
  usage_collected_at?: string | null;
  groups?: QuotaGroup[];
  windows?: Array<{ window_minutes: number | null; used_percent: number | null; resets_at: string | null; stale?: boolean }>;
};

export function UsageProgressBar({ pct, color, label }: { pct: number | null; color: string; label?: string }) {
  const measured = typeof pct === "number" && Number.isFinite(pct);
  const value = measured ? Math.min(100, Math.max(0, pct)) : 0;
  return <span className="block h-1.5 rounded-full overflow-hidden w-full" style={{ background: "var(--border)" }}
    role={measured ? "progressbar" : undefined} aria-label={label}
    aria-valuemin={measured ? 0 : undefined} aria-valuemax={measured ? 100 : undefined}
    aria-valuenow={measured ? value : undefined}>
    <span className="block h-full rounded-full" style={{ width: `${value}%`, background: color }} />
  </span>;
}

export function HostAccountUsage({ account }: { account: HostUsage }) {
  const groups = account.groups || [];
  const available = account.state === "ok" && account.usage_status === "available";
  if (account.state === "needs_login" || account.usage_status === "login_required") return <span>Google 로그인 필요 — 서버에서 agy 로그인 후 새로고침해 주세요.</span>;
  if (groups.length) return <span className="space-y-2 block" data-agy-usage="groups">
    {!available && <span className="block">이전 수집 기록 · 사용량 갱신 대기</span>}
    {groups.map(g => <span key={g.name} className="block">
      <strong>{g.name === "Gemini" ? "Gemini" : "Claude·GPT"}</strong>
      {g.windows.map(w => {
        const fresh = available && !w.stale;
        const measured = fresh && !w.disabled && typeof w.remaining_percent === "number" && Number.isFinite(w.remaining_percent);
        const used = measured ? 100 - w.remaining_percent! : null;
        const color = used === null ? "var(--text-secondary)" : used >= 90 ? "#dc2626" : used >= 80 ? "#d97706" : "#16a34a";
        const period = w.period === "weekly" ? "주간" : "5시간";
        return <span key={w.period} className="block mt-0.5" data-agy-window={w.period}>
          <UsageProgressBar pct={used} color={color} label={`${g.name} ${period} 사용량`} />
          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
            {period}{" "}
            {!fresh ? "갱신 대기" : w.disabled ? "주간 한도 소진으로 비적용"
              : measured ? `${w.remaining_percent!.toFixed(1)}% 남음` : "미측정"}
            {fresh && !w.disabled && (w.reset_at
              ? <span> · {new Date(w.reset_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 리셋</span>
              : w.reset_description && <span> · 리셋까지 {w.reset_description}</span>)}
          </span>
        </span>;
      })}
    </span>)}
    <span className="block">수집 {metadataTime(account.usage_collected_at)}</span>
  </span>;
  const text: Record<string,string> = { unsupported: "구독 사용량 조회 미지원", collection_failed: "구독 사용량 수집 실패 — 새로고침 후 다시 확인해 주세요", not_measured: "구독 사용량 수집 중", unknown: "계정 연결 확인 중", stale: "사용량 갱신 대기" };
  if (!available) return <span>{text[account.usage_status || "not_measured"] || "사용량 확인 중"}</span>;
  const windows = (account.windows || []).filter(w => typeof w.used_percent === "number" && Number.isFinite(w.used_percent));
  if (!windows.length) return <span>구독 사용량 미측정</span>;
  return <span>{windows.map((w,i) => <span key={i}>잔량 {(100-w.used_percent!).toFixed(1)}% </span>)}</span>;
}

export type DiscoveryRun = {
  id: number; provider: string; status: string; created_at: string | null;
  error?: string | null; discovered_count?: number;
};

const DISCOVERY_REASONS: Record<string, string> = {
  oauth_runtime_only_models_api_unavailable: "OAuth 계정은 모델 목록 API를 지원하지 않습니다",
  google_routes_disabled: "Google 모델 경로가 운영 정책으로 비활성화되어 있습니다",
  missing_key: "모델 목록 조회용 API 키가 없습니다",
  no_kimi_key: "Kimi 모델 목록 조회용 키가 없습니다",
  disabled: "자동 모델 수집이 비활성화되어 있습니다",
};

export function latestDiscoveryRuns(runs: DiscoveryRun[]): DiscoveryRun[] {
  const latest = new Map<string, DiscoveryRun>();
  for (const run of [...runs].sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0) || b.id - a.id)) {
    if (!latest.has(run.provider)) latest.set(run.provider, run);
  }
  return [...latest.values()];
}

export function DiscoveryRunStatus({ run }: { run: DiscoveryRun }) {
  const label = { ok: "성공", failed: "실패", error: "실패", skipped: "건너뜀" }[run.status] || "확인 필요";
  return <div className="text-xs break-words rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
    <p className="font-semibold">{run.provider} · {label}</p>
    <p>{metadataTime(run.created_at)}{run.discovered_count != null ? ` · 발견 ${run.discovered_count}개` : ""}</p>
    {run.error && <p>{DISCOVERY_REASONS[run.error] || "수집을 완료하지 못했습니다. 제공자 연결 상태와 동기화 이력을 확인해 주세요."}</p>}
  </div>;
}
