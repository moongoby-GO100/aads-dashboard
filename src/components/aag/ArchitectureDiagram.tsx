"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MermaidDiagram from "@/components/MermaidDiagram";
import { ErrorPanel } from "@/components/aag/AagParts";
import { AagApiError, aagApi } from "@/lib/aagOperationsApi";
import {
  classifyApiError, formatKst, shortSha,
  type AagErrorView, type AagFilters, type MermaidResponse,
} from "@/lib/aagOperations";

type Loaded = { key: string; data: MermaidResponse };

const targetKeyOf = (f: Pick<AagFilters, "project" | "repositoryId" | "targetRef">) => `${f.project}|${f.repositoryId}|${f.targetRef}`;

/** 펼쳐졌을 때만 마운트된다. 마운트(또는 대상 변경) 시점에 한 번 서버에서 mermaid 를 읽는다. */
export default function ArchitectureDiagram({ target, loginHref }: { target: AagFilters; loginHref: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<AagErrorView | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const key = targetKeyOf(target);
  const { project, repositoryId, targetRef } = target;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    setError(null);
    try {
      const data = await aagApi.getMermaid({ project, repositoryId, targetRef, severity: "", finding: "" }, ctl.signal);
      if (ctl.signal.aborted) return;
      setLoaded({ key: `${project}|${repositoryId}|${targetRef}`, data });
    } catch (e) {
      if (ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      setLoaded(null);
      setError(e instanceof AagApiError ? e.view : classifyApiError(0, null, "mermaid"));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [project, repositoryId, targetRef]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const data = loaded && loaded.key === key ? loaded.data : null;

  return (
    <div data-testid="aag-architecture-body" className="min-w-0">
      {loading && !data && (
        <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>다이어그램을 불러오는 중입니다…</p>
      )}
      {error && <ErrorPanel error={error} onRetry={() => void load()} retrying={loading} loginHref={loginHref} />}
      {data && !error && data.mermaid.trim() === "" && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }} data-testid="aag-architecture-empty">
          그릴 구성 요소가 없습니다. 스냅샷에 노드가 없다는 뜻이며, 문제가 없다는 증명은 아닙니다.
        </p>
      )}
      {data && !error && data.mermaid.trim() !== "" && (
        <>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm break-words" style={{ color: "var(--text-secondary)" }} data-testid="aag-architecture-meta">
            <span>
              스냅샷 {formatKst(data.generated_at)} · 커밋 {shortSha(data.resolved_commit_sha) || "기록 없음"} · 네임스페이스{" "}
              {data.shown_namespaces ?? "?"}/{data.total_namespaces ?? "?"}개 표시
            </span>
            {data.truncated && (
              <span
                data-testid="aag-architecture-truncated"
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ background: "#3b2606", border: "1px solid #f59e0b", color: "#fde68a" }}
              >
                일부만 표시
              </span>
            )}
          </p>
          <div className="max-w-full overflow-x-auto rounded-lg p-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }} tabIndex={0} aria-label="아키텍처 다이어그램 (가로 스크롤 가능)">
            <MermaidDiagram chart={data.mermaid} />
          </div>
        </>
      )}
    </div>
  );
}
