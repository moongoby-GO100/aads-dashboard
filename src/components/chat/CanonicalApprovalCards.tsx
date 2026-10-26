"use client";

import { useEffect, useRef, useState } from "react";
import { api, type CanonicalDocumentDetail } from "@/lib/api";
import DocBadge, { statusTone } from "@/components/docs/DocBadge";
import { CANONICAL_NAV_PROJECTS } from "@/lib/canonicalProjects";

const DOCUMENT_KEYS = new Set([
  "ohvis-ui-ux-design-profile-contract",
  "ohvis-ui-ux-asset-audit-requirements",
  "ohvis-ui-ux-g6-token-tenant-isolation-draft",
]);
type Reference = { project: string; document_key: string };
export function allowedCanonicalReference(ref: Reference): boolean {
  return CANONICAL_NAV_PROJECTS.includes(ref.project) && DOCUMENT_KEYS.has(ref.document_key);
}
// Only named lookup tool results supply references; never execute persisted URLs or bodies.
export function canonicalReferencesFromTools(value: unknown): Reference[] {
  let events: unknown = value;
  if (typeof events === "string") {
    try { events = JSON.parse(events); } catch { return []; }
  }
  if (!Array.isArray(events)) return [];
  const refs: Reference[] = [];
  for (const event of events.slice(-200)) {
    if (!event || event.type !== "tool_result" || event.tool_name !== "canonical_document_lookup" || event.is_error) continue;
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
    && detail.revision.id === detail.document.latest_revision_id
    && detail.document.approved_revision_id !== detail.revision.id
    && !["removed", "archived", "missing"].includes(detail.status)
    && Number.isSafeInteger(detail.document.generation) && detail.document.generation > 0;
}
function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^(?:API error )?401\b/.test(message)) return "로그인이 만료되었습니다. 다시 로그인한 뒤 새로고침하세요.";
  if (/^(?:API error )?403\b/.test(message)) return "이 프로젝트의 문서 승인 권한이 없습니다.";
  if (/^(?:API error )?404\b/.test(message)) return "문서가 없거나 제거되었습니다.";
  if (/^(?:API error )?409\b/.test(message)) return "판본이 변경되었습니다. 새로고침 후 내용을 다시 확인하세요.";
  return "처리 결과를 확인하지 못했습니다. 새로고침으로 승인 상태를 확인한 뒤 재시도하세요.";
}

function CanonicalApprovalCard({ project, document_key: key }: Reference) {
  const [detail, setDetail] = useState<CanonicalDocumentDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [viewed, setViewed] = useState(false);
  const lock = useRef(true);
  const mounted = useRef(false);
  const fetchCurrent = () => api.getCanonicalDocument(project, key);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    void api.getCanonicalDocument(project, key).then(value => {
      if (live) setDetail(value);
    }).catch(error => { if (live) setNotice(failure(error)); }).finally(() => {
      if (live) { lock.current = false; setBusy(false); }
    });
    return () => { live = false; mounted.current = false; };
  }, [project, key]);

  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setDetail(null); setViewed(false); setNotice("");
    try { const value = await fetchCurrent(); if (mounted.current) setDetail(value); }
    catch (error) { if (mounted.current) setNotice(failure(error)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function approve() {
    if (lock.current || !detail || !viewed || !approvable(detail)) return;
    lock.current = true; setBusy(true); setNotice("");
    const shown = detail;
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
      await api.decideCanonicalDocument(project, key, "approve", current.revision!.id, current.document.generation);
      const verified = await fetchCurrent();
      if (!mounted.current) return;
      setDetail(verified); setViewed(false);
      setNotice(verified.document.approved_revision_id === current.revision!.id
        ? "정본 승인 상태를 확인했습니다." : "승인 이후 판본이 변경되었습니다. 최신 상태를 확인하세요.");
    } catch (error) {
      if (mounted.current) { setDetail(null); setViewed(false); setNotice(failure(error)); }
      // A lost POST response can still mean the server committed the approval.
      try {
        const recovered = await fetchCurrent();
        if (mounted.current) setDetail(recovered);
      } catch { /* Keep approval disabled until a successful explicit refresh. */ }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
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
      <button type="button" disabled={busy || !detail || !viewed || !approvable(detail)} onClick={() => void approve()} className="min-h-11 rounded-lg px-4 disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>{busy ? "처리 중…" : "정본 승인"}</button>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-11 rounded-lg border px-3">새로고침</button>
    </div>
    {detail && !approvable(detail) && <p className="mt-2 text-xs">{detail.document.approved_revision_id === detail.revision?.id ? "현재 판본은 이미 승인되었습니다." : "승인 가능 여부 또는 승인 권한을 확인할 수 없습니다."}</p>}
  </article>;
}

export default function CanonicalApprovalCards({ documents }: { documents: Reference[] }) {
  const unique = new Map(documents.filter(allowedCanonicalReference).map(ref => [`${ref.project}/${ref.document_key}`, ref]));
  return <section aria-label="채팅 정본 문서">{[...unique].map(([id, ref]) => <CanonicalApprovalCard key={id} {...ref} />)}</section>;
}
