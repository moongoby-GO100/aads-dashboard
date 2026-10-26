"use client";

import { useEffect, useRef, useState } from "react";
import { aagApi, AagApiError } from "@/lib/aagOperationsApi";
import { classifyApiError, impactKindLabel, type AagErrorView, type AagFilters, type ImpactResponse } from "@/lib/aagOperations";
import { ErrorPanel, FOCUS_RING, SectionCard, TOUCH } from "./AagParts";

// Parent keys this panel by project/repository/ref; unmount cancels the previous target.
export default function ImpactPanel({ target, loginHref }: { target: AagFilters; loginHref: string }) {
  const [path, setPath] = useState("");
  const [depth, setDepth] = useState(2);
  const [scope, setScope] = useState("");
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [error, setError] = useState<AagErrorView | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const clear = () => {
    controller.current?.abort();
    setData(null); setError(null); setLoading(false);
  };
  const load = async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setData(null); setError(null); setLoading(true);
    try {
      const result = await aagApi.getImpact(target, { path, depth, governanceScope: scope }, ctl.signal);
      if (!ctl.signal.aborted) setData(result);
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof AagApiError ? e.view : classifyApiError(0, null, "impact"));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  };
  const field = `${TOUCH} ${FOCUS_RING} min-w-0 rounded-lg border px-3 text-base`;
  const fieldStyle = { background: "var(--bg-primary)", color: "var(--text-primary)", borderColor: "var(--border)" };
  return <SectionCard id="aag-impact" title="변경 영향범위">
    <p className="mb-3 break-all text-sm">조회 대상: {target.project} · {target.repositoryId} · {target.targetRef}</p>
    <form className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void load(); }}>
      <label className="flex min-w-0 flex-col gap-1">변경할 파일 경로
        <input required value={path} onChange={e => { clear(); setPath(e.target.value); }} placeholder="src/app/aag/page.tsx" className={field} style={fieldStyle} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">연관 탐색 단계
        <select value={depth} onChange={e => { clear(); setDepth(Number(e.target.value)); }} className={field} style={fieldStyle}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}단계</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">관리 범위 (선택)
        <input value={scope} onChange={e => { clear(); setScope(e.target.value); }} className={field} style={fieldStyle} />
      </label>
      <button disabled={loading || !path.trim()} className={`${TOUCH} ${FOCUS_RING} rounded-lg bg-slate-200 px-4 text-slate-900 disabled:opacity-50`} type="submit">{loading ? "조회 중…" : "영향범위 조회"}</button>
    </form>
    <div aria-live="polite" className="mt-3 min-w-0 space-y-3 break-words [overflow-wrap:anywhere]">
      {loading && <p role="status">연관된 변경 대상을 확인하고 있습니다…</p>}
      {error && <ErrorPanel error={error} onRetry={() => void load()} retrying={loading} loginHref={loginHref} />}
      {data && <ImpactResults data={data} />}
    </div>
  </SectionCard>;
}

// Shared by the interactive panel and server-render regression tests.
export function ImpactResults({ data }: { data: ImpactResponse }) {
  return <>
        <p>{data.nodes.length ? `확인된 연관 대상 ${data.nodes.length}개` : "이 조회에서 확인된 연관 대상이 없습니다. 영향이 없다는 뜻은 아닙니다."}</p>
        <p>검사 범위가 완전하다고 입증되지 않았습니다. 미관측 의존 관계를 별도로 확인하세요.</p>
        {data.truncated && <p role="status">결과가 일부 생략되었습니다. 파일이나 탐색 단계를 좁혀 확인하세요.</p>}
        <p>서버 판단: {data.conclusion}</p>
        <ul className="list-disc space-y-1 pl-5">{data.limitations.map((l, i) => <li key={i}>조회 한계: {l}</li>)}</ul>
        <ul className="space-y-2">{data.nodes.map((n, i) => <li key={i}>{n.id} · {impactKindLabel(n.kind)} · {n.distance === 0 ? "기준 대상" : `연관 거리 ${n.distance}단계`}</li>)}</ul>
        <ul className="space-y-2">{data.edges.map((e, i) => <li key={i}>{e.from} → {e.to} · {impactKindLabel(e.kind)}</li>)}</ul>
        <details><summary className={`${TOUCH} ${FOCUS_RING} cursor-pointer`}>조회 근거</summary>
          <p>스냅샷: {data.snapshot_id}</p><p>기준 커밋: {data.resolved_commit_sha}</p><p>저장소: {data.repository_id} · 브랜치: {data.target_ref}</p>
        </details>
      </>;
}
