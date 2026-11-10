"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type CpuDetailData = {
  status: string; observed_at: string | null; sample_age_s: number | null;
  host_verified: boolean;
  cpu: { execution_pct: number | null; iowait_pct: number | null; steal_pct: number | null;
    psi: { cpu?: { some?: { avg10?: number | null } } } };
  top_processes: Array<{ pid: number; process_family: string; service_unit: string; cgroup_path: string;
    cpu_one_logical_pct: number | null; cpu_host_pct: number | null }>;
  cgroups?: Array<{ path: string; quota: { quota_cores: number | null }; weight: number | null;
    throttling_delta: { nr_throttled: number | null; throttled_usec: number | null } }>;
  observer?: { units: Array<{ unit: string; state: string }> };
  history: { partial: boolean; observer_status?: string;
    observer_coverage?: { samples?: number; first_sample_utc?: string; last_sample_utc?: string; error_counts?: Record<string, number> };
    summary?: { min: number | null; mean: number | null; max: number | null };
    series: Array<{ observed_at: string; execution_pct: number | null }>; errors: string[] };
};
const pct = (n: number | null | undefined) => n == null ? "미측정" : `${n.toFixed(1)}%`;
const time = (s: string | null | undefined) => s ? `${new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })} KST` : "미확인";
const reasons: Record<string, string> = {
  not_installed: "이 서버에 CPU 수집기가 설치되지 않았습니다.",
  access_denied: "CPU 기록 조회 권한이 없습니다.", host_mismatch: "요청한 서버와 기록의 호스트가 일치하지 않습니다.",
  timeout: "CPU 기록 조회 시간이 초과되었습니다. 다시 시도해 주세요.",
  transport_unavailable: "서버에 연결하지 못했습니다. 다시 시도해 주세요.",
  stale: "오래된 기록입니다. 현재 사용률은 표시하지 않습니다.",
};

export default function CpuDetail({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<CpuDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    if (!open) return;
    setLoading(true); setError(""); setData(null);
    api.getServerCpuDetail(serverId, minutes)
      .then(r => { if (generation.current === request) setData(r as CpuDetailData); })
      .catch(() => { if (generation.current === request) setError("CPU 상세를 불러오지 못했습니다. 로그인 권한과 서버 연결을 확인한 뒤 다시 시도해 주세요."); })
      .finally(() => { if (generation.current === request) setLoading(false); });
    return () => { ++generation.current; };
  }, [serverId, open, minutes, refresh]);
  return <section style={{ marginTop: 12, overflowWrap: "anywhere", minWidth: 0 }} aria-label={`${serverId} CPU 상세`}>
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>CPU 상세 {open ? "닫기" : "보기"}</button>
    {open && <div style={{ marginTop: 8, fontSize: 12 }}>
      <label>조회 구간 <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
        {[5, 15, 30, 60].map(n => <option key={n} value={n}>{n}분</option>)}
      </select></label>{" "}
      <button type="button" onClick={() => setRefresh(v => v + 1)}>다시 조회</button>
      {loading && <p role="status">CPU 기록을 불러오는 중입니다.</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p>{reasons[data.status] || (data.status === "fresh" ? "기록 갱신 정상" : "CPU 기록을 확인할 수 없습니다.")}</p>
        <p>관측 {time(data.observed_at)} · 경과 {data.sample_age_s == null ? "미확인" : `${Math.round(data.sample_age_s)}초`}</p>
        <p>CPU 실행 {pct(data.cpu.execution_pct)} · I/O 대기 {pct(data.cpu.iowait_pct)} · Steal {pct(data.cpu.steal_pct)}</p>
        <p>CPU 대기압력(PSI, 10초) {pct(data.cpu.psi.cpu?.some?.avg10)} · 전체 논리 CPU 기준 실행률과 별개입니다.</p>
        {data.observer?.units.map(u => <p key={u.unit}>수집기 {u.state}</p>)}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}><caption>상위 프로세스 · 100% = 논리 코어 1개</caption>
            <thead><tr><th>PID / 프로세스</th><th>코어 기준</th><th>서버 기준</th><th>서비스</th></tr></thead>
            <tbody>{data.top_processes.map(p => <tr key={p.pid}><td>{p.pid} {p.process_family}</td><td>{pct(p.cpu_one_logical_pct)}</td><td>{pct(p.cpu_host_pct)}</td><td title={p.cgroup_path}>{p.service_unit || p.cgroup_path || "미확인"}</td></tr>)}</tbody>
          </table>
        </div>
        <details><summary>자원 제한·스로틀링</summary>{data.cgroups?.map(g => <p key={g.path}>{g.path} · CPU 제한 {g.quota.quota_cores ?? "없음/미확인"}코어 · weight {g.weight ?? "미측정"} · 제한 횟수 {g.throttling_delta.nr_throttled ?? "미측정"} · 제한 시간 {g.throttling_delta.throttled_usec ?? "미측정"}μs</p>)}</details>
        <p>구간 내 부분 이력 · 관측 {data.history.observer_coverage?.samples ?? "미확인"}개 · 최소/평균/최대 {pct(data.history.summary?.min)} / {pct(data.history.summary?.mean)} / {pct(data.history.summary?.max)}</p>
        <p>{time(data.history.observer_coverage?.first_sample_utc)} ~ {time(data.history.observer_coverage?.last_sample_utc)} · {data.history.observer_status || "조회 불가"}</p>
        <p>최근 관측점만 표시하며 관측점 사이를 연결하거나 전체 구간으로 보간하지 않습니다.</p>
        {data.history.series.map(p => <p key={p.observed_at}>{time(p.observed_at)} · {pct(p.execution_pct)}</p>)}
        {!!data.history.errors.length && <p role="status">일부 기록 누락 또는 읽기 오류: {data.history.errors.join(", ")}</p>}
      </>}
    </div>}
  </section>;
}
