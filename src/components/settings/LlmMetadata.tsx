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

export type HostUsage = {
  state: string;
  usage_status?: "available" | "unsupported" | "collection_failed" | "not_measured";
  usage_collected_at?: string | null;
  windows?: Array<{ window_minutes: number | null; used_percent: number | null; resets_at: string | null; stale?: boolean }>;
};

export function HostAccountUsage({ account }: { account: HostUsage }) {
  const text = { unsupported: "구독 사용량 조회 미지원", collection_failed: "구독 사용량 수집 실패 — 새로고침 후 다시 확인해 주세요", not_measured: "구독 사용량 미측정" };
  if (account.state === "needs_login") return <span>Google 로그인 필요 — 서버에서 agy 로그인 후 새로고침해 주세요.</span>;
  if (account.state === "unknown") return <span>계정 연결 확인 불가 — 사용량을 확인할 수 없습니다.</span>;
  if (account.usage_status !== "available") return <span>{text[account.usage_status || "not_measured"]}</span>;
  const windows = (account.windows || []).filter(w => typeof w.used_percent === "number"
    && Number.isFinite(w.used_percent) && w.used_percent >= 0 && w.used_percent <= 100);
  if (!windows.length || metadataTime(account.usage_collected_at) === "미확인") return <span>구독 사용량 미측정 — 유효한 수집 기록 없음</span>;
  return <span className="space-y-1 block">
    {windows.map((w, i) => <span key={i} className="block">
      {w.window_minutes ? (w.window_minutes >= 60 ? `${w.window_minutes / 60}시간 ` : `${w.window_minutes}분 `) : ""}
      {w.stale ? "이전 기록 · " : ""}사용 {w.used_percent!.toFixed(1)}% · 잔량 {(100 - w.used_percent!).toFixed(1)}%
      {w.resets_at && <span className="block">리셋 {metadataTime(w.resets_at)}</span>}
    </span>)}
    <span className="block">수집 {metadataTime(account.usage_collected_at)}</span>
  </span>;
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
