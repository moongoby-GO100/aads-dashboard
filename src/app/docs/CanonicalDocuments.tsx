"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { api, type CanonicalDocument, type CanonicalDocumentDetail, type CanonicalDocumentHistory } from "@/lib/api";
import { canTransitionDocumentForHead } from "@/lib/canonicalDocumentWorkflow";
import { canonicalErrorKind, mergeCanonicalProjects, type CanonicalErrorKind } from "@/lib/canonicalProjects";
import { listBodyState, selectionPresence, SLOW_LIST_MS } from "@/lib/canonicalDocumentView";

const STATUS: Record<string, string> = { draft: "초안", review: "검토", approved: "승인", archived: "보관" };
const KIND: Record<string, string> = {
  plan: "계획", prd: "제품 요구사항", spec: "명세", design: "디자인", architecture: "아키텍처",
  contract: "계약", tasks: "작업", report: "보고서", reference: "참고 자료",
};
const ACTIONS = [
  { key: "review", label: "검토로 이동", reason: "초안 상태에서만 검토로 이동할 수 있습니다." },
  { key: "approve", label: "정본 승인", reason: "검토 상태에서만 승인할 수 있습니다." },
  { key: "archive", label: "보관", reason: "승인 상태에서만 보관할 수 있습니다." },
] as const;

function kst(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date) + " KST";
}

type Problem = { kind: CanonicalErrorKind; text: string };

function problemOf(error: unknown, project: string): Problem {
  const kind = canonicalErrorKind(error);
  if (kind === "auth") return { kind, text: "로그인이 만료되었습니다. 다시 로그인한 뒤 재시도하세요." };
  if (kind === "forbidden") return { kind, text: `${project} 프로젝트의 문서 접근 권한이 없습니다. 다른 프로젝트를 선택하거나 권한을 확인한 뒤 재시도하세요.` };
  if (kind === "conflict") return { kind, text: "문서 상태가 변경되었습니다. 새로고침 후 다시 시도하세요." };
  const raw = error instanceof Error ? error.message : "네트워크 오류";
  const message = raw.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 120);
  return { kind, text: `문서를 불러오거나 변경하지 못했습니다. 연결을 확인하고 재시도하세요. (${message})` };
}

export function ProblemBox({ problem }: { problem: Problem }) {
  return (
    <div role="alert" className="mb-3 rounded-lg border border-red-700 p-3 text-sm">
      <p>{problem.text}</p>
      {problem.kind === "auth" && <Link href="/login?next=%2Fdocs" className="mt-2 inline-block underline">로그인 복구</Link>}
    </div>
  );
}

export function CanonicalListBody({ loading, slow, error, documents, query, selected, selectedVersion, selectedRef, onSelect, onRetry, onClearSearch }: {
  loading: boolean;
  slow: boolean;
  error: Problem | null;
  documents: CanonicalDocument[];
  query: string;
  selected: string | null;
  selectedVersion: string | null;
  selectedRef?: Ref<HTMLButtonElement>;
  onSelect: (key: string) => void;
  onRetry: () => void;
  onClearSearch: () => void;
}) {
  const state = listBodyState({ loading, hasError: !!error, count: documents.length, query });
  return (
    <>
      {error && <ProblemBox problem={error} />}
      {state === "loading" && <div role="status" className="text-sm">
        <p>{slow ? "아직 불러오는 중입니다. 잠시 기다리거나 재시도하세요." : "목록을 불러오는 중…"}</p>
        {slow && <button type="button" onClick={onRetry} className="mt-2 min-h-10 rounded-lg px-3" style={{ border: "1px solid var(--border)" }}>재시도</button>}
      </div>}
      {state === "empty" && <p className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-hover)" }}>승인된 정본 없음 · 등록된 문서가 없습니다.</p>}
      {state === "no-results" && <p className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-hover)" }}>검색 결과가 없습니다. 다른 검색어를 입력하거나 검색을 해제하세요.</p>}
      {(state === "list" || state === "empty" || state === "no-results") && <div className="space-y-2">
        {query && <p className="text-xs">검색어: {query} <button type="button" onClick={onClearSearch} className="underline">검색 해제</button></p>}
        {documents.length === 100 && <p className="text-xs" role="status">최대 100건이 표시됩니다. 다른 문서를 찾으려면 이름이나 내용을 검색하세요.</p>}
        {documents.map((item) => {
          const isSelected = selected === item.document_key;
          return (
            <button key={item.document_key} ref={isSelected ? selectedRef : undefined} type="button" onClick={() => onSelect(item.document_key)}
              aria-current={isSelected ? "true" : undefined}
              className="w-full min-w-0 rounded-lg border p-3 text-left"
              style={{ borderColor: isSelected ? "var(--accent)" : "var(--border)", background: isSelected ? "var(--bg-hover)" : "transparent", borderWidth: isSelected ? 2 : 1 }}>
              <span className="block break-words font-medium">{item.title || "제목 없음"}</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--text-secondary)" }}>{KIND[item.kind] || item.kind} · 버전 {isSelected && selectedVersion ? selectedVersion : "상세에서 확인"} · {STATUS[item.status] || item.status}</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--text-secondary)" }}>최종 수정 {kst(item.updated_at)}</span>
            </button>
          );
        })}
      </div>}
    </>
  );
}

export default function CanonicalDocuments({ project, projects, onProjectChange, initialKey }: {
  project: string;
  initialKey?: string | null;
  projects: string[];
  onProjectChange: (project: string) => void;
}) {
  const [documents, setDocuments] = useState<CanonicalDocument[]>([]);
  const [selection, setSelection] = useState<{ project: string; key: string } | null>(null);
  const selected = selection?.project === project ? selection.key : null;
  const setSelected = (key: string | null) => setSelection(key ? { project, key } : null);
  useEffect(() => {
    if (initialKey) setSelection({ project, key: initialKey });
  }, [initialKey, project]);
  const [detail, setDetail] = useState<CanonicalDocumentDetail | null>(null);
  const [history, setHistory] = useState<CanonicalDocumentHistory | null>(null);
  const [approved, setApproved] = useState<CanonicalDocumentDetail | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [detailError, setDetailError] = useState<Problem | null>(null);
  const [pending, setPending] = useState<"review" | "approve" | "archive" | null>(null);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [loadStat, setLoadStat] = useState<{ ms: number; ok: boolean } | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const projectRef = useRef(project);

  const reloadList = useCallback(async () => {
    if (projectRef.current !== project) return;
    const requestId = ++listRequest.current;
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const response = await api.listCanonicalDocuments(project, query);
      if (requestId === listRequest.current) {
        setDocuments(response.documents);
        setLoadStat({ ms: Date.now() - startedAt, ok: true });
      }
    } catch (cause) {
      if (requestId === listRequest.current) {
        setLoadStat({ ms: Date.now() - startedAt, ok: false });
        setDocuments([]);
        setError(problemOf(cause, project));
      }
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }, [project, query]);

  const reloadDetail = useCallback(async (key: string) => {
    if (projectRef.current !== project) return;
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [current, revisions] = await Promise.all([
        api.getCanonicalDocument(project, key), api.getCanonicalDocumentHistory(project, key),
      ]);
      const currentApproved = current.document.approved_revision_id
        ? await api.getCanonicalDocument(project, key, true) : null;
      if (requestId === detailRequest.current) {
        setDetail(current);
        setHistory(revisions);
        setApproved(currentApproved);
      }
    } catch (cause) {
      if (requestId === detailRequest.current) setDetailError(problemOf(cause, project));
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, [project]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  useEffect(() => {
    ++detailRequest.current;
    setDetail(null);
    setHistory(null);
    setApproved(null);
    setPending(null);
    setDetailError(null);
    setDetailLoading(false);
    if (selected) void reloadDetail(selected);
  }, [selected, reloadDetail]);

  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), SLOW_LIST_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const showDetailOnMobile = mobileView === "detail" && !!selected;
  const presence = selectionPresence({ selected, keys: documents.map((item) => item.document_key), loading, hasError: !!error });

  useEffect(() => {
    if (mobileView === "list" && selected) selectedItemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [mobileView, selected]);

  const openDetail = (key: string) => {
    setSelected(key);
    setMobileView("detail");
    rootRef.current?.scrollTo?.({ top: 0 });
  };

  const act = async () => {
    const target = pending === "archive" ? approved : detail;
    if (!pending || !target?.revision || !detail || !selected || saving) return;
    setSaving(true);
    setDetailError(null);
    try {
      await api.decideCanonicalDocument(project, selected, pending, target.revision.id, detail.document.generation);
      setPending(null);
      await Promise.all([reloadList(), reloadDetail(selected)]);
    } catch (cause) {
      const problem = problemOf(cause, project);
      setPending(null);
      await Promise.all([reloadList(), reloadDetail(selected)]);
      if (projectRef.current === project) setDetailError(problem);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-5" style={{ color: "var(--text-primary)" }}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div role="group" className={`${showDetailOnMobile ? "hidden lg:flex" : "flex"} items-center gap-2 overflow-x-auto whitespace-nowrap lg:flex-wrap lg:overflow-visible`} aria-label="프로젝트 선택">
          <span className="shrink-0 text-sm font-semibold">프로젝트</span>
          {mergeCanonicalProjects(projects).map((name) => (
            <button key={name} type="button" onClick={() => { onProjectChange(name); setMobileView("list"); }} aria-pressed={project === name}
              className="min-h-10 shrink-0 rounded-lg px-3 text-sm"
              style={project === name ? { background: "var(--accent)", color: "#fff" } : { border: "1px solid var(--border)" }}>
              {name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section className={`${showDetailOnMobile ? "hidden lg:block" : ""} min-w-0 rounded-xl border p-3`} style={{ borderColor: "var(--border)" }} aria-label="문서 정본 목록">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">문서 정본 목록</h2>
              <button type="button" onClick={() => void reloadList()} className="min-h-10 rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border)" }}>재시도 · 새로고침</button>
            </div>
            <form className="mb-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(searchInput.trim()); }}>
              <input aria-label="문서 검색" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)}
                placeholder="문서명 또는 내용 검색" className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-sm" style={{ borderColor: "var(--border)" }} />
              <button type="submit" className="min-h-11 rounded-lg px-4 text-sm" style={{ border: "1px solid var(--border)" }}>검색</button>
            </form>
            {presence === "missing" && <p role="status" className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              검색 결과에 선택 문서가 없습니다. 선택한 문서(<span className="break-all">{selected}</span>)의 상세는 그대로 유지됩니다.
              <button type="button" onClick={() => openDetail(selected!)} className="ml-2 underline lg:hidden">상세 보기</button>
            </p>}
            {presence === "present" && <button type="button" onClick={() => openDetail(selected!)} className="mb-3 min-h-10 w-full rounded-lg px-3 text-left text-sm lg:hidden" style={{ border: "1px solid var(--accent)" }}>
              선택한 문서 상세 보기 ›
            </button>}
            {loadStat && !loading && <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {loadStat.ok ? `${documents.length}건` : "불러오기 실패"} · {(loadStat.ms / 1000).toFixed(1)}초 · 프로젝트 {project}
            </p>}
            <CanonicalListBody loading={loading} slow={slow} error={error} documents={documents} query={query}
              selected={selected} selectedVersion={detail?.revision ? `v${detail.revision.version}` : null} selectedRef={selectedItemRef}
              onSelect={openDetail} onRetry={() => void reloadList()} onClearSearch={() => { setSearchInput(""); setQuery(""); }} />
          </section>
          <section className={`${showDetailOnMobile ? "" : "hidden lg:block"} min-w-0 rounded-xl border p-3`} style={{ borderColor: "var(--border)" }} aria-label="문서 정본 상세">
            {selected && <button type="button" onClick={() => setMobileView("list")} className="mb-3 min-h-11 rounded-lg px-4 text-sm lg:hidden" style={{ border: "1px solid var(--border)" }}>‹ 목록으로</button>}
            {!selected && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>목록에서 문서를 선택하면 상태와 개정 이력이 표시됩니다.</p>}
            {selected && <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">현재 문서와 개정 이력</h2>
                <button type="button" onClick={() => void reloadDetail(selected)} className="min-h-10 rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border)" }}>재시도</button>
              </div>
              {detailError && <ProblemBox problem={detailError} />}
              {detailLoading && <p className="text-sm">상세를 불러오는 중…</p>}
              {!detailLoading && detail && <div className="space-y-4 text-sm">
                <div>
                  <h3 className="break-words text-base font-semibold">{detail.revision?.title || detail.document.title}</h3>
                  <p>최신 개정판 · 종류: {KIND[detail.document.kind] || detail.document.kind} · 버전: {detail.revision?.version || "—"} · 상태: {STATUS[detail.status] || detail.status}</p>
                  <p>최종 수정: {kst(detail.document.updated_at)}</p>
                  <p className="break-all text-xs" style={{ color: "var(--text-secondary)" }}>문서 키: {detail.document.document_key} · ID: {detail.document.id}</p>
                </div>
                {detail.revision?.change_summary && <p className="whitespace-pre-wrap break-words">변경 요약: {detail.revision.change_summary}</p>}
                {detail.revision && <div><h3 className="mb-1 font-semibold">최신 개정판 본문</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs" style={{ background: "var(--bg-hover)" }}>{detail.revision.content}</pre></div>}
                {approved?.revision && <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <h3 className="font-semibold">현재 승인된 정본</h3>
                  <p className="break-words">{approved.revision.title} · v{approved.revision.version} · {STATUS[approved.status] || approved.status}</p>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs" style={{ background: "var(--bg-hover)" }}>{approved.revision.content}</pre>
                </div>}
                {!approved?.revision && <p>현재 승인된 정본이 없습니다.</p>}
                <div className="space-y-2">
                  <h3 className="font-semibold">상태 변경</h3>
                  {ACTIONS.map((action) => {
                    const enabled = canTransitionDocumentForHead(
                      detail.status, !!detail.revision, approved?.status || "missing", !!approved?.revision, action.key,
                    ) && !saving;
                    return <div key={action.key} className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={!enabled} onClick={() => setPending(action.key)} className="min-h-11 rounded-lg px-4 font-medium disabled:opacity-50"
                        style={{ background: enabled ? "var(--accent)" : "var(--bg-hover)", color: enabled ? "#fff" : "var(--text-secondary)" }}>{action.label}</button>
                      {!enabled && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{saving ? "이전 변경을 처리 중입니다." : action.key === "archive" && !approved?.revision ? "현재 승인된 정본이 없습니다." : action.reason}</span>}
                    </div>;
                  })}
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">개정 이력</h3>
                  {history?.revisions.length ? <ol className="space-y-2">{history.revisions.map((revision) => <li key={revision.id} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                    <p className="break-words font-medium">{revision.title} · v{revision.version}</p>
                    <p className="text-xs">개정 {revision.revision} · {STATUS[revision.status] || revision.status} · {kst(revision.created_at)}</p>
                    {revision.change_summary && <p className="mt-1 whitespace-pre-wrap break-words text-xs">{revision.change_summary}</p>}
                  </li>)}</ol> : <p>개정 이력이 없습니다.</p>}
                </div>
              </div>}
            </>}
          </section>
        </div>
      </div>
      {pending && detail && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="상태 변경 확인">
        <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl p-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
          <h2 className="font-semibold">{pending === "approve" ? "정본 승인을 확인하세요" : pending === "archive" ? "보관을 확인하세요" : "검토 상태로 이동할까요?"}</h2>
          <p className="mt-2 break-words text-sm">{(pending === "archive" ? approved : detail)?.revision?.title} · v{(pending === "archive" ? approved : detail)?.revision?.version}</p>
          {pending === "approve" && <p className="mt-2 text-sm">승인하면 이 개정판이 프로젝트의 정본으로 지정됩니다. 이 변경은 이 화면에서 되돌릴 수 없습니다.</p>}
          {pending === "approve" && <div className="mt-3 min-h-0 overflow-y-auto rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
            <p className="mb-2 font-semibold">승인할 본문 전체</p>
            <pre className="whitespace-pre-wrap break-words text-xs">{detail.revision?.content}</pre>
          </div>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setPending(null)} className="min-h-11 rounded-lg px-4" style={{ border: "1px solid var(--border)" }}>취소</button>
            <button type="button" disabled={saving} onClick={() => void act()} className="min-h-11 rounded-lg px-4 text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{saving ? "처리 중…" : "확인"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
