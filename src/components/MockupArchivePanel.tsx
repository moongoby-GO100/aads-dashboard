/**
 * 목업 보관함 — 알림이 없어도 지난 목업(승인된 것 포함)을 다시 열 수 있는 목록 패널.
 * 행을 누르면 새 패널을 만들지 않고, 호출자가 넘긴 onOpen 으로 기존 MockupReviewPanel 을 연다.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockupHtmlLinks } from "@/components/MockupHtmlLinks";
import { formatKst } from "@/lib/aiResponseErrors";
import { mockupApi, MockupApiError } from "@/lib/mockupReviewApi";
import {
  ARCHIVE_PAGE_LIMIT, ARCHIVE_STATUS_FILTERS, archiveEmptyMessage, archiveNextOffsets, archiveRevisionNumber, badgeProjects,
  mergeArchiveReviews, reviewToDeepLink, statusColor, statusLabel,
  type ArchiveProjectPage, type ArchiveReview, type MockupDeepLink,
} from "@/lib/mockupReviewModel";

const TOUCH = 44;

type PageResult = ArchiveProjectPage & { error: string | null };
type LoadState =
  | { kind: "error"; message: string }
  | { kind: "ready"; pages: PageResult[] };

export function MockupArchivePanel({ project, sessionId, onOpen, onClose }: {
  project: string;
  sessionId: string | null;
  onOpen: (link: MockupDeepLink) => void;
  onClose: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProject, setUploadProject] = useState(project === "CEO" ? "AADS" : project);
  const uploadAttempt = useRef<{signature: string; key: string} | null>(null);
  const upload = async (file?: File) => {
    if (!file || uploading) return;
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith(".html") || file.size > 2 * 1024 * 1024) {
      setUploadError("2MB 이하의 HTML 파일을 선택해 주세요."); return;
    }
    setUploading(true);
    try {
      const html = await file.text();
      const signature = `${uploadProject}:${sessionId}:${file.name}:${html}`;
      if (uploadAttempt.current?.signature !== signature) uploadAttempt.current = {signature, key: crypto.randomUUID()};
      await mockupApi.uploadHtml(uploadProject, {title: file.name.replace(/\.html$/i, ""), filename: file.name,
        html, session_id: sessionId ?? undefined, idempotency_key: uploadAttempt.current.key});
      setStatus(""); setReloadTick((n) => n + 1);
      uploadAttempt.current = null;
    } catch (e) { setUploadError(e instanceof Error ? e.message : "등록하지 못했습니다. 다시 시도해 주세요."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const projects = useMemo(() => badgeProjects(project), [project]);
  const [status, setStatus] = useState("");
  const [sessionOnly, setSessionOnly] = useState(!!sessionId);
  const [filterSessionId, setFilterSessionId] = useState(sessionId);
  const [loaded, setLoaded] = useState<{ key: string; state: LoadState } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [moreKey, setMoreKey] = useState<string | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);

  // Reset before committing a session change so its first request uses the default filter.
  if (filterSessionId !== sessionId) {
    setFilterSessionId(sessionId);
    setSessionOnly(!!sessionId);
  }

  const effectiveSessionOnly = sessionOnly && !!sessionId;
  const sessionFilter = effectiveSessionOnly ? sessionId ?? undefined : undefined;
  const requestKey = `${projects.join(",")}|${status}|${sessionFilter ?? ""}|${reloadTick}`;
  const state: LoadState | null = loaded && loaded.key === requestKey ? loaded.state : null;
  const loadingMore = moreKey === requestKey;

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const results: PageResult[] = await Promise.all(projects.map(async (p) => {
        try {
          const res = await mockupApi.listReviews(p, { status: status || undefined, sessionId: sessionFilter, limit: ARCHIVE_PAGE_LIMIT }, ctrl.signal);
          return { project: p, items: res.items ?? [], total: res.total ?? 0, error: null };
        } catch (e) {
          const message = e instanceof MockupApiError ? e.view.message : "목록을 불러오지 못했습니다.";
          return { project: p, items: null, total: 0, error: message };
        }
      }));
      if (ctrl.signal.aborted) return;
      const failed = results.filter((r) => r.items === null);
      setMoreFailed(false);
      setLoaded({
        key: requestKey,
        state: failed.length === results.length
          ? { kind: "error", message: failed[0]?.error ?? "목록을 불러오지 못했습니다." }
          : { kind: "ready", pages: results },
      });
    })();
    return () => ctrl.abort();
  }, [projects, status, sessionFilter, requestKey]);

  const readyPages = state?.kind === "ready" ? state.pages : null;
  const items = useMemo(() => (readyPages ? mergeArchiveReviews(readyPages) : []), [readyPages]);
  const failedCount = readyPages ? readyPages.filter((pg) => pg.items === null).length : 0;
  const hasMore = readyPages ? archiveNextOffsets(readyPages).length > 0 : false;

  const loadMore = useCallback(async () => {
    if (!readyPages || moreKey !== null) return;
    const key = requestKey;
    const targets = archiveNextOffsets(readyPages);
    if (targets.length === 0) return;
    setMoreKey(key);
    setMoreFailed(false);
    let anyFailed = false;
    const fetched = await Promise.all(targets.map(async (t) => {
      try {
        const res = await mockupApi.listReviews(t.project, { status: status || undefined, sessionId: sessionFilter, limit: ARCHIVE_PAGE_LIMIT, offset: t.offset });
        return { project: t.project, items: res.items ?? [], total: res.total ?? 0 };
      } catch {
        anyFailed = true;
        return null;
      }
    }));
    setMoreKey((cur) => (cur === key ? null : cur));
    setLoaded((prev) => {
      if (!prev || prev.key !== key || prev.state.kind !== "ready") return prev;
      const pages = prev.state.pages.map((pg) => {
        const more = fetched.find((f) => f && f.project === pg.project);
        return more && pg.items ? { ...pg, items: [...pg.items, ...more.items], total: more.total } : pg;
      });
      return { key, state: { kind: "ready", pages } };
    });
    if (anyFailed) setMoreFailed(true);
  }, [readyPages, moreKey, requestKey, status, sessionFilter]);

  const open = useCallback((r: ArchiveReview) => {
    const link = reviewToDeepLink(r);
    if (link) onOpen(link);
  }, [onOpen]);

  const chip = (active: boolean): React.CSSProperties => ({
    minHeight: 36, padding: "0 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? "#2563eb" : "var(--ct-border, var(--border))"}`,
    background: active ? "rgba(37,99,235,.12)" : "transparent",
    color: active ? "#2563eb" : "var(--ct-text2, var(--text-secondary))",
  });

  return (
    <aside aria-label="목업 보관함" style={{
      position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 44, width: "min(480px, 100vw)", display: "flex", flexDirection: "column",
      background: "var(--ct-card, var(--bg-card))", borderLeft: "1px solid var(--ct-border, var(--border))",
      boxShadow: "-8px 0 24px rgba(0,0,0,.18)", color: "var(--ct-text, var(--text-primary))",
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--ct-border, var(--border))" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800 }}>🖼 목업 보관함</div>
        <button type="button" onClick={onClose} aria-label="목업 보관함 닫기"
          style={{ minWidth: TOUCH, minHeight: TOUCH, border: 0, background: "transparent", color: "inherit", fontSize: 18, cursor: "pointer" }}>✕</button>
      </header>

      <div style={{padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 8}}>
        <button type="button" style={chip(!status && !effectiveSessionOnly)} onClick={() => {setStatus(""); setSessionOnly(false); setReloadTick((n) => n + 1);}}>전체 리스트보기</button>
        {projects.length > 1 && <select aria-label="등록 프로젝트" value={uploadProject} onChange={(e) => setUploadProject(e.target.value)}>{projects.map((p) => <option key={p}>{p}</option>)}</select>}
        <input ref={fileInput} type="file" accept=".html,text/html" aria-label="HTML 목업 파일" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        <button type="button" style={chip(false)} disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "등록 중…" : "HTML 목업 등록"}</button>
        <small>HTML 기본 · 등록 후 새 탭에서 열기 · 승인은 별도</small>
        {uploadError && <p role="alert">{uploadError}</p>}
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--ct-border, var(--border))" }}>
        <div role="group" aria-label="상태 필터" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ARCHIVE_STATUS_FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" aria-pressed={status === f.value} onClick={() => setStatus(f.value)} style={chip(status === f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, fontSize: 13, opacity: sessionId ? 1 : 0.5 }}>
          <input type="checkbox" checked={effectiveSessionOnly} disabled={!sessionId} onChange={(e) => setSessionOnly(e.target.checked)}
            style={{ width: 18, height: 18 }} />
          이 세션에서 만든 목업만
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 8 }}>
        {state === null && <p role="status" style={{ padding: 16, fontSize: 13, color: "var(--ct-text2, var(--text-secondary))" }}>불러오는 중…</p>}
        {state?.kind === "error" && (
          <div role="alert" style={{ padding: 16, fontSize: 13 }}>
            <p style={{ margin: "0 0 10px", wordBreak: "break-word" }}>{state.message}</p>
            <button type="button" onClick={() => setReloadTick((n) => n + 1)}
              style={{ minHeight: TOUCH, padding: "0 16px", borderRadius: 8, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", fontWeight: 700, cursor: "pointer" }}>
              다시 시도
            </button>
          </div>
        )}
        {state?.kind === "ready" && (
          <>
            {failedCount > 0 && (
              <p role="status" style={{ margin: "0 4px 8px", fontSize: 12, color: "#d97706" }}>
                일부 프로젝트({failedCount}곳)의 목록을 불러오지 못했습니다.{" "}
                <button type="button" onClick={() => setReloadTick((n) => n + 1)}
                  style={{ border: 0, background: "transparent", color: "#2563eb", fontWeight: 700, cursor: "pointer", textDecoration: "underline", minHeight: 32 }}>다시 시도</button>
              </p>
            )}
            {items.length === 0 ? (
              <p style={{ padding: 16, fontSize: 13, color: "var(--ct-text2, var(--text-secondary))" }}>{archiveEmptyMessage(effectiveSessionOnly, status)}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((r) => {
                  const rev = archiveRevisionNumber(r);
                  return (
                    <li key={`${r.sourceProject}:${r.review_id}`}>
                      <button type="button" onClick={() => open(r)}
                        style={{ display: "block", textDecoration: "none", width: "100%", boxSizing: "border-box", minHeight: TOUCH, textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                                 border: "1px solid var(--ct-border, var(--border))", background: "transparent", color: "inherit" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, wordBreak: "break-word", overflowWrap: "anywhere" }}>{r.title || "(제목 없음)"}</div>
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: 11.5 }}>
                          <span style={{ padding: "1px 8px", borderRadius: 999, fontWeight: 800, color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}` }}>
                            {statusLabel(r.status)}
                          </span>
                          <span style={{ padding: "1px 6px", borderRadius: 6, background: "rgba(37,99,235,.12)", color: "#2563eb" }}>{r.sourceProject}</span>
                          <span style={{ color: "var(--ct-text2, var(--text-secondary))" }}>{rev !== null ? `v${rev}` : "판 -"}</span>
                          <span style={{ color: "var(--ct-text2, var(--text-secondary))" }}>{formatKst(r.updated_at)} KST</span>
                        </div>
                      </button>
                      <MockupHtmlLinks project={r.sourceProject} reviewId={r.review_id} />
                      <button type="button" onClick={() => open(r)} style={chip(false)}>검토 · 승인 보기</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {hasMore && (
              <div style={{ margin: "10px 4px 4px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                {moreFailed && <p role="alert" style={{ margin: 0, fontSize: 12, color: "#d97706" }}>일부 목록을 더 불러오지 못했습니다. 다시 시도해 주세요.</p>}
                <button type="button" onClick={loadMore} disabled={loadingMore}
                  style={{ minHeight: TOUCH, padding: "0 16px", borderRadius: 8, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", fontWeight: 700, cursor: loadingMore ? "default" : "pointer", opacity: loadingMore ? 0.6 : 1 }}>
                  {loadingMore ? "불러오는 중…" : "더 보기"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
