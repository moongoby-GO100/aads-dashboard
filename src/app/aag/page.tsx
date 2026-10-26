"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import ImpactPanel from "@/components/aag/ImpactPanel";
import ArchitectureDiagram from "@/components/aag/ArchitectureDiagram";
import { AxisCard, ErrorPanel, FindingRow, FOCUS_RING, RecoveryList, SectionCard, TOUCH } from "@/components/aag/AagParts";
import { AagApiError, aagApi } from "@/lib/aagOperationsApi";
import {
  buildAxisViews, buildRecoveryViews, classifyApiError, EVIDENCE_DOCS, FILTER_STORAGE_KEY, filtersReady,
  filtersToSearch, filtersToStored, findingsMatchSnapshot, formatKst, normalizeFinding, PROJECT_PRESETS,
  resolveFilters, SEVERITY_FILTERS, shortSha, summarizeAxes,
  type AagErrorView, type AagFilters, type FindingView, type OperationsResponse,
} from "@/lib/aagOperations";
import { buildCanonicalDocHref } from "@/lib/canonicalDocLinks";

type OpsState = { key: string; data: OperationsResponse; source: "live" | "saved"; at: string };
type FindingsState = { key: string; items: FindingView[]; total: number | null; next: string | null };

const opsKeyOf = (f: Pick<AagFilters, "project" | "repositoryId" | "targetRef">) => `${f.project}|${f.repositoryId}|${f.targetRef}`;

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const abortOf = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const errView = (e: unknown, endpoint: "operations" | "findings"): AagErrorView =>
  e instanceof AagApiError ? e.view : classifyApiError(0, null, endpoint);

function AagScreen() {
  const search = useSearchParams();
  const pathname = usePathname();
  const [init] = useState(() => resolveFilters(search.toString(), safeStorage()?.getItem(FILTER_STORAGE_KEY)));
  const [filters, setFilters] = useState<AagFilters>(init.filters);
  const [draftRepo, setDraftRepo] = useState(init.filters.repositoryId);
  const [draftRef, setDraftRef] = useState(init.filters.targetRef);
  const [draftError, setDraftError] = useState("");

  const [ops, setOps] = useState<OpsState | null>(null);
  const [opsError, setOpsError] = useState<AagErrorView | null>(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [findings, setFindings] = useState<FindingsState | null>(null);
  const [findingsError, setFindingsError] = useState<AagErrorView | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const [pinned, setPinned] = useState<{ key: string; item: FindingView | null; missing: boolean } | null>(null);

  const opsAbort = useRef<AbortController | null>(null);
  const findingsAbort = useRef<AbortController | null>(null);

  const targetKey = opsKeyOf(filters);
  const target = useMemo<AagFilters>(
    () => ({ project: filters.project, repositoryId: filters.repositoryId, targetRef: filters.targetRef, severity: "", finding: "" }),
    [filters.project, filters.repositoryId, filters.targetRef],
  );

  useEffect(() => {
    safeStorage()?.setItem(FILTER_STORAGE_KEY, filtersToStored(filters));
    window.history.replaceState(null, "", `${pathname}?${filtersToSearch(filters)}`);
  }, [filters, pathname]);

  const loadOps = useCallback(async () => {
    opsAbort.current?.abort();
    const ctl = new AbortController();
    opsAbort.current = ctl;
    setOpsLoading(true);
    setOpsError(null);
    try {
      const data = await aagApi.getOperations(target, ctl.signal);
      if (ctl.signal.aborted) return;
      const at = new Date().toISOString();
      setOps({ key: opsKeyOf(target), data, source: "live", at });
    } catch (e) {
      if (abortOf(e) || ctl.signal.aborted) return;
      const view = errView(e, "operations");
      setOpsError(view);
      if (view.kind === "network" || view.kind === "server") {
        // Private state survives only within this mounted screen. Persisting by
        // project/ref can expose a previous login's data during a network error.
        setOps((cur) => cur && cur.key === opsKeyOf(target) ? { ...cur, source: "saved" } : null);
      } else {
        setOps(null);
        setFindings(null);
        setPinned(null);
      }
    } finally {
      if (!ctl.signal.aborted) setOpsLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void loadOps();
    return () => opsAbort.current?.abort();
  }, [loadOps]);

  const keepOnError = !opsError || opsError.kind === "network" || opsError.kind === "server";
  const current = ops && ops.key === targetKey && keepOnError ? ops : null;
  const snapshotId = current?.source === "live" ? current.data.snapshot_id : null;
  const severity = filters.severity;

  const loadFindings = useCallback(async (cursor: string | null) => {
    if (!snapshotId) return;
    findingsAbort.current?.abort();
    const ctl = new AbortController();
    findingsAbort.current = ctl;
    setFindingsLoading(true);
    setFindingsError(null);
    const key = `${targetKey}|${snapshotId}|${severity}`;
    try {
      const page = await aagApi.getFindings({ ...target, severity }, snapshotId, { cursor }, ctl.signal);
      if (ctl.signal.aborted) return;
      if (!findingsMatchSnapshot(page, snapshotId)) {
        setFindingsError(classifyApiError(400, null, "findings"));
        return;
      }
      const items = (page.findings ?? []).map((raw, i) => normalizeFinding(raw, i + (cursor ? 1000 : 0)));
      setFindings((cur) => ({
        key,
        items: cursor && cur && cur.key === key ? [...cur.items, ...items] : items,
        total: typeof page.pagination?.total === "number" ? page.pagination.total : null,
        next: page.pagination?.next_cursor ?? null,
      }));
    } catch (e) {
      if (abortOf(e) || ctl.signal.aborted) return;
      setFindingsError(errView(e, "findings"));
    } finally {
      if (!ctl.signal.aborted) setFindingsLoading(false);
    }
  }, [snapshotId, severity, target, targetKey]);

  useEffect(() => {
    if (!snapshotId) return;
    void loadFindings(null);
    return () => findingsAbort.current?.abort();
  }, [snapshotId, loadFindings]);

  const findingsKey = snapshotId ? `${targetKey}|${snapshotId}|${severity}` : "";
  const shown = findings && findings.key === findingsKey ? findings : null;
  const selectedKey = filters.finding;
  const inList = !!selectedKey && !!shown?.items.some((f) => f.key === selectedKey);

  useEffect(() => {
    if (!selectedKey || !snapshotId || inList || !shown) return;
    const ctl = new AbortController();
    aagApi.getFindings({ ...target, severity: "" }, snapshotId, { stableKey: selectedKey, pageSize: 1 }, ctl.signal)
      .then((page) => {
        if (ctl.signal.aborted) return;
        const raw = page.findings?.[0];
        setPinned({ key: selectedKey, item: raw ? normalizeFinding(raw) : null, missing: !raw });
      })
      .catch((e) => {
        if (!abortOf(e)) setPinned({ key: selectedKey, item: null, missing: true });
      });
    return () => ctl.abort();
  }, [selectedKey, snapshotId, inList, shown, target]);

  const pinnedItem = pinned && pinned.key === selectedKey ? pinned : null;

  const axisViews = useMemo(() => (current ? buildAxisViews(current.data.axes) : []), [current]);
  const summary = useMemo(() => summarizeAxes(axisViews), [axisViews]);
  const recovery = useMemo(() => (current ? buildRecoveryViews(current.data.recovery_actions, axisViews) : []), [current, axisViews]);

  const applyTarget = (next: Pick<AagFilters, "project" | "repositoryId" | "targetRef">) => {
    const candidate = { ...filters, ...next, severity: "", finding: "" };
    if (!filtersReady(candidate)) {
      setDraftError("프로젝트, 저장소, 브랜치(refs/… 형식) 값을 확인하세요.");
      return;
    }
    setDraftError("");
    setFilters(candidate);
  };

  const onProject = (project: string) => {
    const preset = PROJECT_PRESETS.find((p) => p.project === project);
    if (!preset) return;
    setDraftRepo(preset.repositoryId);
    setDraftRef(preset.targetRef);
    applyTarget({ project, repositoryId: preset.repositoryId, targetRef: preset.targetRef });
  };

  const projectOptions = PROJECT_PRESETS.some((p) => p.project === filters.project)
    ? PROJECT_PRESETS.map((p) => p.project)
    : [filters.project, ...PROJECT_PRESETS.map((p) => p.project)];

  const debt = current?.data.axes.debt;
  const countFor = (v: string): string => {
    if (!debt) return "";
    const n = ({ P0: debt.p0, P1: debt.p1, P2: debt.p2, P3: debt.p3 } as Record<string, number | null | undefined>)[v];
    return typeof n === "number" ? ` ${n}` : "";
  };

  const loginHref = `/login?next=${encodeURIComponent(`${pathname}?${filtersToSearch(filters)}`)}&reason=session_expired`;
  const savedBanner = current && current.source === "saved";
  const refreshFailed = current && current.source === "live" && opsError && !opsLoading;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Header title="아키텍처 상태" />
      <div data-testid="aag-root" className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="aag-project" className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>프로젝트</label>
            <select
              id="aag-project"
              value={filters.project}
              onChange={(e) => onProject(e.target.value)}
              className={`${TOUCH} rounded-lg px-3 text-base ${FOCUS_RING}`}
              style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadOps()}
            disabled={opsLoading}
            className={`${TOUCH} rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
            style={{ background: "#e2e8f0", color: "#0f172a", opacity: opsLoading ? 0.6 : 1 }}
          >
            {opsLoading ? "불러오는 중…" : "상태 새로고침"}
          </button>
          <p className="min-w-0 flex-1 text-sm break-words" style={{ color: "var(--text-secondary)" }} data-testid="aag-target-line">
            대상: {filters.repositoryId} · {filters.targetRef}
          </p>
        </div>

        <details className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <summary className={`${TOUCH} flex cursor-pointer items-center text-sm font-semibold ${FOCUS_RING}`} style={{ color: "var(--text-primary)" }}>
            대상 설정 (저장소·브랜치)
          </summary>
          <form
            className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); applyTarget({ project: filters.project, repositoryId: draftRepo.trim(), targetRef: draftRef.trim() }); }}
          >
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              저장소 식별자
              <input
                value={draftRepo}
                onChange={(e) => setDraftRepo(e.target.value)}
                aria-invalid={!!draftError}
                aria-describedby={draftError ? "aag-draft-error" : undefined}
                className={`${TOUCH} rounded-lg px-3 text-base ${FOCUS_RING}`}
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              브랜치 (refs/heads/…)
              <input
                value={draftRef}
                onChange={(e) => setDraftRef(e.target.value)}
                aria-invalid={!!draftError}
                aria-describedby={draftError ? "aag-draft-error" : undefined}
                className={`${TOUCH} rounded-lg px-3 text-base ${FOCUS_RING}`}
                style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </label>
            {draftError && <p id="aag-draft-error" role="alert" className="text-sm sm:col-span-2" style={{ color: "#fecaca" }}>{draftError}</p>}
            <div className="sm:col-span-2">
              <button type="submit" className={`${TOUCH} rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`} style={{ background: "#e2e8f0", color: "#0f172a" }}>
                이 대상으로 보기
              </button>
            </div>
          </form>
        </details>

        <ImpactPanel key={targetKey} target={target} loginHref={loginHref} />

        {init.rejected.length > 0 && (
          <p role="status" className="text-sm" style={{ color: "#fde68a" }}>
            주소에 있던 {init.rejected.join(", ")} 값이 올바르지 않아 기본값으로 대체했습니다.
          </p>
        )}

        {opsLoading && !current && (
          <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>상태를 불러오는 중입니다…</p>
        )}

        {opsError && (
          <ErrorPanel error={opsError} onRetry={() => void loadOps()} retrying={opsLoading} loginHref={loginHref} />
        )}

        {savedBanner && current && (
          <p role="status" data-testid="aag-saved-banner" className="rounded-lg p-3 text-sm" style={{ background: "#3b2606", border: "1px solid #f59e0b", color: "#fde68a" }}>
            현재 서버 상태가 아닙니다. 아래는 이 화면에서 {formatKst(current.at)}에 마지막으로 확인한 값입니다. &lsquo;다시 시도&rsquo;를 눌러 현재 권한과 상태를 다시 확인하세요.
          </p>
        )}
        {refreshFailed && current && (
          <p role="status" data-testid="aag-refresh-failed" className="rounded-lg p-3 text-sm" style={{ background: "#3b2606", border: "1px solid #f59e0b", color: "#fde68a" }}>
            새로고침에 실패했습니다. 아래는 마지막 성공({formatKst(current.at)}) 시점의 값입니다.
          </p>
        )}

        {current && (
          <>
            <SectionCard
              id="aag-snapshot"
              title="현재 스냅샷"
              aside={<span className="text-sm" style={{ color: "var(--text-secondary)" }}>{current.source === "live" ? "서버 응답" : "저장된 값"} · {formatKst(current.at)}</span>}
            >
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[9rem_1fr]">
                <dt style={{ color: "var(--text-secondary)" }}>프로젝트</dt>
                <dd>{current.data.project}</dd>
                <dt style={{ color: "var(--text-secondary)" }}>대상 브랜치</dt>
                <dd className="break-all">{current.data.target_ref}</dd>
                <dt style={{ color: "var(--text-secondary)" }}>기준 커밋</dt>
                <dd>{shortSha(current.data.commit_sha) || "기록 없음"}</dd>
                <dt style={{ color: "var(--text-secondary)" }}>스냅샷</dt>
                <dd>{current.data.snapshot_id ? "검증된 스냅샷 있음" : "스냅샷 없음"}</dd>
              </dl>
            </SectionCard>

            <SectionCard id="aag-axes" title="네 가지 상태" aside={<span className="text-sm" style={{ color: "var(--text-secondary)" }} data-testid="aag-axes-summary">{summary.sentence}</span>}>
              <ul className="grid grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
                {axisViews.map((v) => <AxisCard key={v.key} view={v} />)}
              </ul>
              <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                네 상태는 하나로 합치지 않습니다. 하나라도 &lsquo;미입증&rsquo;이면 &lsquo;문제 없음&rsquo;으로 읽지 마세요.
              </p>
            </SectionCard>

            <SectionCard
              id="aag-architecture"
              title="아키텍처 다이어그램"
              aside={
                <button
                  type="button"
                  aria-expanded={archOpen}
                  aria-controls="aag-architecture-panel"
                  onClick={() => setArchOpen((v) => !v)}
                  className={`${TOUCH} rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
                  style={{ background: "#e2e8f0", color: "#0f172a" }}
                >
                  {archOpen ? "접기" : "펼치기"}
                </button>
              }
            >
              <div id="aag-architecture-panel" className="min-w-0">
                {archOpen ? (
                  <ArchitectureDiagram target={target} loginHref={loginHref} />
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>펼치면 최신 스냅샷의 네임스페이스 구조도를 불러옵니다.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard id="aag-recovery" title="복구 안내">
              <RecoveryList items={recovery} />
            </SectionCard>

            <SectionCard id="aag-findings" title="결함 목록 (P0/P1 먼저)" aside={shown?.total != null ? <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{severity || "전체"} {shown.total}건</span> : undefined}>
              <div role="group" aria-label="심각도 필터" className="mb-3 flex flex-wrap gap-2">
                {SEVERITY_FILTERS.map((s) => {
                  const on = severity === s.value;
                  return (
                    <button
                      key={s.value || "all"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilters((f) => ({ ...f, severity: s.value, finding: "" }))}
                      className={`${TOUCH} rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
                      style={{ background: on ? "#e2e8f0" : "var(--bg-primary)", color: on ? "#0f172a" : "var(--text-primary)", border: "1px solid var(--border)" }}
                    >
                      {s.label}{s.value ? countFor(s.value) : ""}
                    </button>
                  );
                })}
              </div>

              {current.source === "saved" && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>저장된 값을 보고 있어 결함 목록은 불러오지 않았습니다. 서버 연결을 복구한 뒤 다시 시도하세요.</p>
              )}
              {current.source === "live" && !snapshotId && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>검증된 스냅샷이 없어 결함 목록을 읽을 수 없습니다. 결함이 없다는 뜻이 아닙니다.</p>
              )}
              {findingsError && (
                <ErrorPanel error={findingsError} onRetry={() => (findingsError.kind === "snapshot_changed" ? void loadOps() : void loadFindings(null))} retrying={findingsLoading} loginHref={loginHref} />
              )}
              {findingsLoading && !shown && <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>결함 목록을 불러오는 중입니다…</p>}
              {shown && shown.items.length === 0 && !findingsError && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }} data-testid="aag-findings-empty">
                  이 조건에서 읽은 결함이 없습니다. 검사 범위가 입증되지 않았다면 &lsquo;결함 없음&rsquo;으로 판단하지 마세요.
                </p>
              )}
              {shown && shown.items.length > 0 && (
                <ul className="space-y-2 p-0" data-testid="aag-findings-list">
                  {shown.items.map((f) => (
                    <FindingRow
                      key={f.key}
                      finding={f}
                      expanded={selectedKey === f.key}
                      onToggle={() => setFilters((cur) => ({ ...cur, finding: cur.finding === f.key ? "" : f.key }))}
                    />
                  ))}
                </ul>
              )}
              {shown?.next && (
                <button
                  type="button"
                  onClick={() => void loadFindings(shown.next)}
                  disabled={findingsLoading}
                  className={`${TOUCH} mt-3 rounded-lg px-4 text-sm font-semibold ${FOCUS_RING}`}
                  style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  {findingsLoading ? "불러오는 중…" : "더 보기"}
                </button>
              )}
              {selectedKey && !inList && shown && (
                <div className="mt-3" data-testid="aag-pinned-finding">
                  {pinnedItem?.item && (
                    <ul className="p-0"><FindingRow finding={pinnedItem.item} expanded onToggle={() => setFilters((cur) => ({ ...cur, finding: "" }))} /></ul>
                  )}
                  {pinnedItem?.missing && (
                    <p role="status" className="text-sm" style={{ color: "#fde68a" }}>
                      주소로 지정한 결함을 이 스냅샷에서 찾지 못했습니다. 이미 해결되었거나 스냅샷이 바뀌었을 수 있습니다.
                    </p>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard id="aag-evidence" title="근거와 문서">
              {(current.data.limitations ?? []).length > 0 ? (
                <ul className="mb-3 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--text-primary)" }}>
                  {(current.data.limitations ?? []).map((l) => <li key={l} className="break-words">{l}</li>)}
                </ul>
              ) : (
                <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>서버가 알려 준 한계 사항이 없습니다. 이것이 한계가 없다는 증명은 아닙니다.</p>
              )}
              <ul className="space-y-2 p-0">
                {EVIDENCE_DOCS.map((d) => (
                  <li key={d.documentKey} style={{ listStyle: "none" }}>
                    <a
                      href={buildCanonicalDocHref({ project: d.project, documentKey: d.documentKey })}
                      className={`${TOUCH} inline-flex items-center text-sm font-semibold underline ${FOCUS_RING}`}
                      style={{ color: "#bfdbfe" }}
                    >
                      {d.label}
                    </a>
                    <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>{d.note}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                기획·PRD·설계 정본의 승인본은 이 화면에서 확인하지 못했습니다.
              </p>
              <details className="mt-3">
                <summary className={`${TOUCH} flex cursor-pointer items-center text-sm font-semibold ${FOCUS_RING}`} style={{ color: "#bfdbfe" }}>
                  근거 상세 (내부 식별자)
                </summary>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt style={{ color: "var(--text-secondary)" }}>schema_version</dt>
                  <dd className="font-mono break-all">{current.data.schema_version}</dd>
                  <dt style={{ color: "var(--text-secondary)" }}>snapshot_id</dt>
                  <dd className="font-mono break-all">{current.data.snapshot_id ?? "없음"}</dd>
                  <dt style={{ color: "var(--text-secondary)" }}>commit_sha</dt>
                  <dd className="font-mono break-all">{current.data.commit_sha ?? "없음"}</dd>
                  <dt style={{ color: "var(--text-secondary)" }}>repository_id</dt>
                  <dd className="font-mono break-all">{current.data.repository_id}</dd>
                </dl>
              </details>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}

export default function AagPage() {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>불러오는 중입니다…</p>}>
      <AagScreen />
    </Suspense>
  );
}
