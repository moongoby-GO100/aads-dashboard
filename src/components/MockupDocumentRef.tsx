"use client";

import { useEffect, useState } from "react";
import { loadPinnedMockupDocument, MockupApiError } from "@/lib/mockupReviewApi";
import { asUuid, docRefLabel, type MockupDocRef } from "@/lib/mockupReviewModel";

export function MockupDocumentRef({ project, doc }: { project: string; doc: MockupDocRef }) {
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { document_key, revision_id } = doc;
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    loadPinnedMockupDocument(project, { role: "", document_key, revision_id }, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setContent(result.content!);
    }).catch((e: unknown) => {
      if (!ctl.signal.aborted) setError(e instanceof MockupApiError
        ? e.view.status === 403 ? "이 문서판본을 열람할 권한이 없습니다."
          : e.view.status === 404 ? "문서 또는 고정 판본이 없거나 삭제되었습니다." : e.view.message
        : e instanceof Error ? e.message : "문서판본을 불러오지 못했습니다.");
    });
    return () => ctl.abort();
  }, [open, retry, project, document_key, revision_id]);

  const button = { minHeight: 44, padding: "0 12px", cursor: "pointer" };
  return <div style={{ overflowWrap: "anywhere" }}>
    <span>{docRefLabel(doc)}</span>
    {doc.document_key && asUuid(doc.revision_id) ? <>
      <button type="button" style={button} aria-expanded={open} onClick={() => { setContent(null); setError(null); setOpen((v) => !v); }}>
        {open ? "문서 닫기" : "고정 판본 열람"}
      </button>
      {open && <section aria-label={`${doc.document_key} 고정 판본`}>
        <div>고정 판본: {doc.revision_id}</div>
        {error ? <div role="alert">{error} <button type="button" style={button} onClick={() => { setError(null); setContent(null); setRetry((v) => v + 1); }}>다시 시도</button></div>
          : content === null ? <p role="status">문서판본 확인 중…</p>
          : <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "50vh", overflow: "auto", font: "inherit" }}>{content}</pre>}
      </section>}
    </> : <span> · 고정 판본 열람 정보 없음</span>}
  </div>;
}
