"use client";

import { useEffect, useState } from "react";
import { mockupApi } from "@/lib/mockupReviewApi";
import { mockupHtmlFilename, mockupHtmlLink, type MockupRevision } from "@/lib/mockupReviewModel";

export function MockupHtmlLinks({ project, reviewId, revision }: {
  project: string; reviewId: string; revision?: MockupRevision;
}) {
  const [loaded, setLoaded] = useState<MockupRevision | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (revision) return;
    const ctrl = new AbortController();
    setLoaded(null); setError(false);
    (async () => {
      try {
        const review = await mockupApi.getReview(project, reviewId, ctrl.signal);
        if (!review.latest_revision) throw new Error("no revision");
        const result = await mockupApi.getRevision(project, reviewId, review.latest_revision.revision_id, ctrl.signal);
        if (!ctrl.signal.aborted) setLoaded(result);
      } catch { if (!ctrl.signal.aborted) setError(true); }
    })();
    return () => ctrl.abort();
  }, [project, reviewId, revision, retry]);
  const current = revision || loaded;
  if (error) return <p role="alert">HTML 파일 정보를 불러오지 못했습니다. 로그인 상태를 확인해 주세요. <button onClick={() => setRetry((v) => v + 1)}>다시 시도</button></p>;
  if (!current) return <p role="status">HTML 파일 확인 중…</p>;
  const assets = current.manifest.assets.filter((a) => a.mime.split(";")[0].trim().toLowerCase() === "text/html");
  return <div style={{padding: "8px 12px", overflowWrap: "anywhere"}}>
    {assets.length === 0 ? <span>등록된 HTML 파일 없음 · 검토 화면에서 이미지를 확인해 주세요.</span> : assets.map((asset) =>
      <a key={asset.asset_id} href={mockupHtmlLink(project, reviewId, current.revision_id, asset.asset_id)} target="_blank" rel="noopener noreferrer"
        style={{display: "block", minHeight: 44, color: "#2563eb"}}>{mockupHtmlFilename(asset)} · HTML 새 탭 열기</a>)}
  </div>;
}
