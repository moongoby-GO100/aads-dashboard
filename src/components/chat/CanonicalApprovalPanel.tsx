"use client";

import { useEffect, useRef, useState } from "react";
import { api, type CanonicalDocumentDetail } from "@/lib/api";
import DocBadge, { statusTone } from "@/components/docs/DocBadge";
import { CANONICAL_NAV_PROJECTS } from "@/lib/canonicalProjects";
import { canTransitionDocument } from "@/lib/canonicalDocumentWorkflow";

// Cache failures too: opening a panel never fans out into per-document requests.
export function loadCanonicalReviewQueueOnce(cache: Map<string, Promise<string[] | null>>, project: string): Promise<string[] | null> {
  const existing = cache.get(project);
  if (existing) return existing;
  const pending = api.getCanonicalReviewQueue(project)
    .then(result => result.documents.map(doc => doc.document_key))
    .catch(error => { console.warn("정본 검토 대기 목록 조회 실패", error); return null; });
  cache.set(project, pending);
  return pending;
}
export function canonicalListStatus(approved: boolean | undefined, waiting: boolean): string {
  return waiting ? "승인 대기" : approved ? "승인됨" : "초안";
}

const DOCUMENT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_VISIBLE_CARDS = 3;
const MAX_CANDIDATE_CARDS = 12;
const CLOSE_DELAY_MS = 2500;
export type Reference = { project: string; document_key: string };
export function allowedCanonicalReference(ref: Reference): boolean {
  return typeof ref.project === "string" && typeof ref.document_key === "string"
    && CANONICAL_NAV_PROJECTS.includes(ref.project) && DOCUMENT_KEY.test(ref.document_key);
}
const referenceId = (ref: Reference) => `${ref.project}/${ref.document_key}`;
export function selectCanonicalCardRefs(documents: Reference[]): Reference[] {
  const unique = new Map<string, Reference>();
  for (const ref of documents) {
    if (!allowedCanonicalReference(ref)) continue;
    const id = referenceId(ref);
    if (!unique.has(id)) unique.set(id, { project: ref.project, document_key: ref.document_key });
  }
  return [...unique.values()].slice(0, MAX_CANDIDATE_CARDS);
}
export function shownCanonicalCardIds(order: string[], visible: ReadonlySet<string>, max = MAX_VISIBLE_CARDS): string[] {
  return order.filter(id => visible.has(id)).slice(0, max);
}
// A card is worth showing only while the latest revision is waiting for review approval.
export function reviewable(detail: CanonicalDocumentDetail): boolean {
  return !!detail.revision && canTransitionDocument(detail.status, "approve", true)
    && detail.revision.id === detail.document.latest_revision_id
    && detail.document.approved_revision_id !== detail.revision.id;
}
// Only named canonical document tool results supply references; never execute persisted URLs or bodies.
export function canonicalReferencesFromTools(value: unknown): Reference[] {
  let events: unknown = value;
  if (typeof events === "string") {
    try { events = JSON.parse(events); } catch { return []; }
  }
  if (!Array.isArray(events)) return [];
  const refs: Reference[] = [];
  for (const event of events.slice(-200)) {
    if (!event || event.type !== "tool_result"
        || !["canonical_document_lookup", "canonical_document_review"].includes(event.tool_name)
        || event.is_error) continue;
    let cards: unknown = event.canonical_document_cards;
    if (!Array.isArray(cards) && typeof event.content === "string" && event.content.length <= 32000) {
      try {
        const result = JSON.parse(event.content);
        cards = result.approval_card ? [result.approval_card]
          : result.documents?.map((item: { approval_card?: unknown }) => item?.approval_card);
      } catch { continue; }
    }
    if (!Array.isArray(cards)) continue;
    for (const card of cards.slice(0, 20)) {
      if (card?.type === "canonical_document_approval" && card.schema_version === 1
          && typeof card.project === "string" && typeof card.document_key === "string"
          && allowedCanonicalReference(card)) refs.push({ project: card.project, document_key: card.document_key });
    }
  }
  return refs;
}

export function approvable(detail: CanonicalDocumentDetail): boolean {
  return detail.approval_card?.type === "canonical_document_approval"
    && detail.approval_card.schema_version === 1 && detail.approval_card.can_approve === true
    && allowedCanonicalReference(detail.approval_card)
    && detail.approval_card.document_key === detail.document.document_key
    && detail.approval_card.revision_id === detail.revision?.id
    && detail.approval_card.generation === detail.document.generation && !!detail.revision
    && reviewable(detail)
    && Number.isSafeInteger(detail.document.generation) && detail.document.generation > 0;
}
function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^(?:API error )?401\b/.test(message)) return "로그인이 만료되었습니다. 다시 로그인한 뒤 새로고침하세요.";
  if (/^(?:API error )?403\b/.test(message)) return "이 프로젝트의 문서 승인 권한이 없습니다.";
  if (/^(?:API error )?404\b/.test(message)) return "문서가 없거나 제거되었습니다.";
  if (/^(?:API error )?409\b/.test(message)) {
    if (/revision_not_in_review/.test(message)) return "검토 상태의 문서만 승인할 수 있습니다. 문서 상태가 바뀌었으니 새로고침으로 확인하세요.";
    if (/generation_conflict/.test(message)) return "다른 변경이 먼저 반영되었습니다. 새로고침 후 최신 내용을 다시 확인하세요.";
    return "판본이 변경되었습니다. 새로고침 후 내용을 다시 확인하세요.";
  }
  return "처리 결과를 확인하지 못했습니다. 새로고침으로 승인 상태를 확인한 뒤 재시도하세요.";
}

type CardProps = Reference & { viewer?: boolean; onApproved?: () => void; suppressed?: boolean; onVisibleChange?: (id: string, visible: boolean) => void };

export function CanonicalApprovalPanel({ project, document_key: key, suppressed = false, onVisibleChange, viewer = false, onApproved }: CardProps) {
  const [detail, setDetail] = useState<CanonicalDocumentDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [viewed, setViewed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const lock = useRef(true);
  const mounted = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchCurrent = () => api.getCanonicalDocument(project, key);
  const show = viewer || (!closed && (pinned || (!!detail && reviewable(detail))));
  const id = `${project}/${key}`;
  useEffect(() => {
    mounted.current = true;
    let live = true;
    void api.getCanonicalDocument(project, key).then(value => {
      if (live) setDetail(value);
    }).catch(error => { if (live && viewer) setNotice(failure(error)); }).finally(() => {
      if (live) { lock.current = false; setBusy(false); }
    });
    return () => {
      live = false; mounted.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [project, key, viewer]);
  useEffect(() => { onVisibleChange?.(id, show); }, [id, show, onVisibleChange]);

  function complete() {
    onApproved?.();
    if (viewer) { setNotice("승인되었습니다."); setDone(true); return; }
    setNotice("승인되었습니다. 잠시 후 이 카드는 닫힙니다."); setDone(true);
    closeTimer.current = setTimeout(() => { if (mounted.current) setClosed(true); }, CLOSE_DELAY_MS);
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setPinned(true); setDetail(null); setViewed(false); setNotice("");
    try { const value = await fetchCurrent(); if (mounted.current) { setDetail(value); setPinned(false); } }
    catch (error) { if (mounted.current) setNotice(failure(error)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function approve() {
    if (lock.current || !detail || !viewed || !approvable(detail)) return;
    lock.current = true; setBusy(true); setPinned(true); setNotice("");
    const shown = detail;
    let sentRevision: string | null = null;
    try {
      const current = await fetchCurrent();
      if (!mounted.current) return;
      if (current.document.generation !== shown.document.generation || current.revision?.id !== shown.revision?.id) {
        setDetail(current); setViewed(false);
        setNotice("판본이 변경되었습니다. 최신 내용을 다시 열어 확인한 후 승인하세요."); return;
      }
      if (!approvable(current)) {
        setDetail(current); setViewed(false); setNotice("승인 상태 또는 권한이 변경되었습니다. 최신 상태를 확인하세요."); return;
      }
      sentRevision = current.revision!.id;
      await api.decideCanonicalDocument(project, key, "approve", sentRevision, current.document.generation);
      const verified = await fetchCurrent();
      if (!mounted.current) return;
      setDetail(verified); setViewed(false);
      if (verified.document.approved_revision_id === sentRevision) complete();
      else setNotice("승인 이후 판본이 변경되었습니다. 최신 상태를 확인하세요.");
    } catch (error) {
      if (mounted.current) { setDetail(null); setViewed(false); setNotice(failure(error)); }
      // A lost POST response can still mean the server committed the approval.
      try {
        const recovered = await fetchCurrent();
        if (mounted.current) {
          setDetail(recovered);
          if (sentRevision && recovered.document.approved_revision_id === sentRevision) complete();
        }
      } catch { /* Keep approval disabled until a successful explicit refresh. */ }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  if (!show || suppressed) return null;
  return <article aria-label="정본 문서 승인" className="my-3 min-w-0 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
    <div className="flex flex-wrap gap-2"><DocBadge tone="project">{project}</DocBadge>{detail && <DocBadge tone={statusTone(detail.status)}>{detail.status}</DocBadge>}</div>
    <h3 className="mt-2 break-words font-semibold">{detail?.revision?.title || detail?.document.title || key}</h3>
    <p className="break-words">판본: {detail?.approval_card?.revision ?? "—"} · v{detail?.revision?.version || "조회 중"}</p>
    {notice && <p role="status" className="my-2 break-words">{notice} {notice.includes("로그인") && <a href="/login?next=%2Fchat" className="underline">로그인</a>}</p>}
    {detail?.revision && <details key={`${detail.revision.id}:${detail.document.generation}`} onToggle={event => setViewed(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-3">내용 보기 · 승인할 본문 확인</summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{detail.revision.content}</pre>
    </details>}
    <div className="mt-2 flex flex-wrap gap-2">
      {(!viewer || (!!detail && reviewable(detail))) && <button type="button" disabled={busy || done || !detail || !viewed || !approvable(detail)} onClick={() => void approve()} className="min-h-11 rounded-lg px-4 disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>{busy ? "처리 중…" : "정본 승인"}</button>}
      <button type="button" disabled={busy || done} onClick={() => void refresh()} className="min-h-11 rounded-lg border px-3">새로고침</button>
    </div>
    {viewer && detail && canTransitionDocument(detail.status, "review", !!detail.revision) && <p className="mt-2 break-words text-xs">검토 요청 전 — 작성 세션에서 검토 요청 필요</p>}
    {!done && detail && !approvable(detail) && <p className="mt-2 text-xs">{detail.document.approved_revision_id === detail.revision?.id ? "현재 판본은 이미 승인되었습니다." : "승인 가능 여부 또는 승인 권한을 확인할 수 없습니다."}</p>}
  </article>;
}

