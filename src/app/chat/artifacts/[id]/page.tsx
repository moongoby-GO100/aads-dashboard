"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { chatApiWithRetry } from "../../api";
import { MarkdownBlock } from "../../MarkdownRenderer";
import type { Artifact } from "../../types";

function typeLabel(type: Artifact["artifact_type"]): string {
  if (type === "html_preview") return "HTML Preview";
  if (type === "full_response") return "Chat Response";
  if (type === "code") return "Code";
  if (type === "chart") return "Chart";
  if (type === "table") return "Table";
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  if (type === "file") return "File";
  return "Report";
}

const normalizeLocalFileHref = (href: string) => href.trim().replace(/^file:\/\//i, "");
const isLocalServerFileHref = (href: string) => {
  const normalized = normalizeLocalFileHref(href);
  return normalized.startsWith("/root/aads/") || normalized.startsWith("/tmp/aads-codex-images/");
};
const localFilePreviewHref = (href: string) =>
  `/chat/artifacts/local-file-preview?path=${encodeURIComponent(normalizeLocalFileHref(href))}`;

function localFileSourcePath(artifact: Artifact | null): string | null {
  if (!artifact) return null;
  const metadataSource =
    artifact.metadata && typeof artifact.metadata.source_path === "string"
      ? artifact.metadata.source_path
      : "";
  const candidate = metadataSource || artifact.content;
  return isLocalServerFileHref(candidate) ? normalizeLocalFileHref(candidate) : null;
}

function describeArtifactLoadError(error: unknown): { title: string; detail: string; action: string } {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.replace(/\s+/g, " ").trim();

  if (/^(401|403)\s*:/.test(normalized) || normalized.includes("API error 401") || normalized.includes("API error 403")) {
    return {
      title: "로그인 또는 권한 확인이 필요합니다.",
      detail: "새창에서 인증 토큰이 없거나 만료되어 아티팩트 API가 거부했습니다. 로그인 후 같은 링크를 다시 여십시오.",
      action: "로그인 확인",
    };
  }
  if (/^404\s*:/.test(normalized) || normalized.includes("API error 404")) {
    return {
      title: "문서를 찾을 수 없습니다.",
      detail: "아티팩트가 삭제됐거나 서버 파일 경로가 현재 허용된 위치에 없습니다.",
      action: "채팅으로 돌아가기",
    };
  }
  if (
    /^(502|503|504)\s*:/.test(normalized) ||
    normalized.includes("API error 502") ||
    normalized.includes("API error 503") ||
    normalized.includes("API error 504") ||
    normalized.includes("Bad Gateway") ||
    normalized.includes("Service Unavailable")
  ) {
    return {
      title: "문서 프리뷰 서버 응답이 일시적으로 실패했습니다.",
      detail: "백엔드 프록시 또는 미리보기 API가 정상 응답을 주지 못했습니다. 잠시 후 재시도하거나 채팅 화면에서 다시 여십시오.",
      action: "다시 불러오기",
    };
  }
  return {
    title: "아티팩트를 불러오지 못했습니다.",
    detail: normalized || "알 수 없는 오류가 발생했습니다.",
    action: "다시 불러오기",
  };
}

function ArtifactStandaloneContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const artifactId = params?.id;
  const localPath = searchParams.get("path") || "";
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (!artifactId) return;
    const apiPath = artifactId === "local-file-preview" && localPath
      ? `/chat/artifacts/local-file-preview?path=${encodeURIComponent(localPath)}`
      : `/chat/artifacts/${artifactId}`;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setArtifact(null);
      setError(null);
    });
    chatApiWithRetry<Artifact>(apiPath, undefined, 2, 800)
      .then(async (item) => {
        if (item.artifact_type === "file") {
          const sourcePath = localFileSourcePath(item);
          if (sourcePath) {
            const preview = await chatApiWithRetry<Artifact>(
              `/chat/artifacts/local-file-preview?path=${encodeURIComponent(sourcePath)}`,
              undefined,
              1,
              500,
            );
            return {
              ...preview,
              id: item.id,
              session_id: item.session_id,
              workspace_id: item.workspace_id,
              title: item.title || preview.title,
              metadata: {
                ...(preview.metadata || {}),
                original_artifact_id: item.id,
                original_artifact_type: item.artifact_type,
              },
            } as Artifact;
          }
        }
        return item;
      })
      .then((item) => {
        if (alive) {
          setArtifact(item);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "아티팩트를 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, [artifactId, localPath]);

  const title = artifact?.title || "AADS Artifact";
  const isHtml = artifact?.artifact_type === "html_preview";
  const isImage = artifact?.artifact_type === "image";
  const isVideo = artifact?.artifact_type === "video";
  const isFile = artifact?.artifact_type === "file";
  const isCode = artifact?.artifact_type === "code";
  const loginNext = typeof window === "undefined"
    ? "/chat"
    : window.location.pathname + window.location.search;

  const errorInfo = error ? describeArtifactLoadError(error) : null;
  const metadata = artifact?.metadata;
  const metadataText = metadata && Object.keys(metadata).length > 0
    ? JSON.stringify(metadata, null, 2)
    : "";

  return (
    <main style={{
      minHeight: "100dvh",
      background: "#0b1020",
      color: "#e5e7eb",
      display: "flex",
      flexDirection: "column",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderBottom: "1px solid rgba(148, 163, 184, 0.24)",
        background: "rgba(11, 16, 32, 0.94)",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", color: "#93a4ba", textTransform: "uppercase", letterSpacing: 0 }}>
            {artifact ? typeLabel(artifact.artifact_type) : "Artifact"}
          </div>
          <h1 style={{
            margin: 0,
            fontSize: "16px",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {title}
          </h1>
        </div>
        {artifact && (
          <>
            {metadataText && (
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                style={{
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(148, 163, 184, 0.32)",
                  background: showSource ? "#2563eb" : "rgba(30, 41, 59, 0.9)",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Metadata
              </button>
            )}
            {isFile && (
              <a
                href={localFileSourcePath(artifact) ? localFilePreviewHref(localFileSourcePath(artifact) || "") : artifact.content}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(148, 163, 184, 0.32)",
                  background: "rgba(30, 41, 59, 0.9)",
                  color: "#e5e7eb",
                  textDecoration: "none",
                  fontSize: "12px",
                }}
              >
                {localFileSourcePath(artifact) ? "Preview File" : "Open File"}
              </a>
            )}
          </>
        )}
      </header>

      {error ? (
        <section style={{
          margin: "48px auto",
          maxWidth: "760px",
          padding: "24px",
          color: "#fecaca",
          border: "1px solid rgba(248, 113, 113, 0.32)",
          borderRadius: "8px",
          background: "rgba(127, 29, 29, 0.18)",
        }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "18px", color: "#fee2e2" }}>
            {errorInfo?.title}
          </h2>
          <p style={{ margin: "0 0 16px", color: "#fecaca", lineHeight: 1.6 }}>
            {errorInfo?.detail}
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                if (errorInfo?.action === "채팅으로 돌아가기") {
                  window.location.href = "/chat";
                  return;
                }
                window.location.reload();
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(248, 113, 113, 0.38)",
                background: "#dc2626",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {errorInfo?.action || "다시 불러오기"}
            </button>
            <a
              href={`/login?next=${encodeURIComponent(loginNext)}`}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(148, 163, 184, 0.32)",
                background: "rgba(30, 41, 59, 0.9)",
                color: "#e5e7eb",
                textDecoration: "none",
                fontSize: "13px",
              }}
            >
              로그인 확인
            </a>
          </div>
        </section>
      ) : !artifact ? (
        <section style={{ margin: "32px auto", maxWidth: "720px", padding: "0 18px", color: "#93a4ba" }}>
          아티팩트를 불러오는 중입니다.
        </section>
      ) : (
        <section style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {showSource && metadataText ? (
            <pre style={{
              width: "320px",
              margin: 0,
              padding: "16px",
              overflow: "auto",
              borderRight: "1px solid rgba(148, 163, 184, 0.18)",
              background: "#020617",
              color: "#cbd5e1",
              fontSize: "12px",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>{metadataText}</pre>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isHtml ? (
              <iframe
                srcDoc={artifact.content}
                sandbox="allow-scripts allow-forms allow-popups"
                title={title}
                style={{ width: "100%", height: "100%", minHeight: "calc(100dvh - 58px)", border: 0, background: "#fff" }}
              />
            ) : isImage ? (
              <div style={{ display: "grid", placeItems: "center", minHeight: "calc(100dvh - 58px)", padding: "18px" }}>
                <img src={artifact.content} alt={title} style={{ maxWidth: "100%", maxHeight: "calc(100dvh - 96px)", objectFit: "contain" }} />
              </div>
            ) : isVideo ? (
              <div style={{ display: "grid", placeItems: "center", minHeight: "calc(100dvh - 58px)", padding: "18px", background: "#020617" }}>
                <video
                  src={artifact.content}
                  controls
                  playsInline
                  preload="metadata"
                  style={{ width: "100%", maxWidth: "1280px", maxHeight: "calc(100dvh - 96px)", borderRadius: "10px", background: "#000" }}
                />
              </div>
            ) : isFile ? (
              <article style={{
                maxWidth: "1180px",
                margin: "0 auto",
                padding: "28px 28px 64px",
                color: "#e5e7eb",
                fontSize: "15px",
                lineHeight: 1.7,
              }}>
                <p style={{ color: "#cbd5e1", marginTop: 0 }}>파일 미리보기를 바로 만들 수 없습니다.</p>
                <a
                  href={localFileSourcePath(artifact) ? localFilePreviewHref(localFileSourcePath(artifact) || "") : artifact.content}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", fontSize: "15px", wordBreak: "break-all" }}
                >
                  {localFileSourcePath(artifact) || artifact.content}
                </a>
              </article>
            ) : isCode ? (
              <pre style={{
                margin: "18px",
                padding: "16px",
                overflow: "auto",
                minHeight: "calc(100dvh - 94px)",
                border: "1px solid rgba(148, 163, 184, 0.24)",
                borderRadius: "8px",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: "13px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>{artifact.content}</pre>
            ) : (
              <article style={{
                maxWidth: "1180px",
                margin: "0 auto",
                padding: "28px 28px 64px",
                color: "#e5e7eb",
                fontSize: "15px",
                lineHeight: 1.7,
              }}>
                <MarkdownBlock text={artifact.content} />
              </article>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

export default function ArtifactStandalonePage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0b1020", color: "#93a4ba" }}>
        아티팩트를 불러오는 중입니다.
      </main>
    }>
      <ArtifactStandaloneContent />
    </Suspense>
  );
}
