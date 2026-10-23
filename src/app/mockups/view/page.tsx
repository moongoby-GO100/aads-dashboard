"use client";

import { useEffect, useState } from "react";
import { mockupApi } from "@/lib/mockupReviewApi";

export default function MockupHtmlView() {
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("HTML 목업");
  const [error, setError] = useState<string | null>(null);
  const [reviewLink, setReviewLink] = useState("/chat");
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const project = params.get("project") || "";
    const reviewId = params.get("review") || "";
    setReviewLink(`/chat?mockup_project=${encodeURIComponent(project)}&mockup_review=${encodeURIComponent(reviewId)}`);
    (async () => {
      try {
        const review = await mockupApi.getReview(project, reviewId);
        const revisionId = params.get("revision") || review.latest_revision?.revision_id;
        if (!revisionId) throw new Error("등록된 판본이 없습니다. 검토 화면에서 확인해 주세요.");
        const revision = await mockupApi.getRevision(project, reviewId, revisionId);
        const asset = revision.manifest.assets.find((a) => a.mime === "text/html");
        if (!asset) throw new Error("HTML 파일이 없는 목업입니다. 검토 화면에서 이미지를 확인해 주세요.");
        const blob = await mockupApi.getAssetBlob(project, reviewId, revisionId, asset.asset_id);
        const text = await blob.text();
        if (alive) { setTitle(review.title); setHtml(text); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "목업을 열지 못했습니다."); }
    })();
    return () => {alive = false;};
  }, []);
  return <main style={{height: "100dvh", display: "flex", flexDirection: "column"}}>
    <header style={{padding: 12, display: "flex", gap: 16, flexWrap: "wrap"}}><strong>{title}</strong><a href={reviewLink}>검토 · 승인 보기</a></header>
    {error ? <p role="alert" style={{padding: 16}}>{error} <button onClick={() => window.location.reload()}>다시 시도</button></p>
      : html === null ? <p role="status">목업을 불러오는 중…</p>
      : <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">${html}`} style={{border: 0, width: "100%", flex: 1}} />}
  </main>;
}
