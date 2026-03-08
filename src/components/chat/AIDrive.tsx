"use client";
/**
 * AADS-172-C: AIDrive
 * AI Drive 탭 메인 컴포넌트
 * - 파일 목록 (폴더 트리)
 * - 업로드 (드래그&드롭)
 * - 저장 통계
 */
import { useEffect, useState } from "react";
import { driveApi } from "@/services/driveApi";
import type { DriveFile, DriveStats, DriveFolder } from "@/services/driveApi";
import AIDriveFileList from "./AIDriveFileList";
import AIDriveUpload from "./AIDriveUpload";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface Props {
  workspaceId?: string;
}

export default function AIDrive({ workspaceId }: Props) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [stats, setStats] = useState<DriveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [filesRes, foldersRes, statsRes] = await Promise.allSettled([
        driveApi.getFiles(workspaceId),
        driveApi.getFolders(workspaceId),
        driveApi.getStats(workspaceId),
      ]);

      if (filesRes.status === "fulfilled") setFiles(filesRes.value);
      else setFiles([]);

      if (foldersRes.status === "fulfilled") setFolders(foldersRes.value);
      else {
        // 파일 목록에서 폴더 유추
        if (filesRes.status === "fulfilled") {
          const folderMap = new Map<string, number>();
          filesRes.value.forEach((f) => {
            if (f.folder) folderMap.set(f.folder, (folderMap.get(f.folder) || 0) + 1);
          });
          setFolders(
            Array.from(folderMap.entries()).map(([name, file_count]) => ({ name, file_count }))
          );
        }
      }

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  const usagePercent = stats
    ? Math.min((stats.used_bytes / stats.quota_bytes) * 100, 100)
    : 0;

  const visibleFiles = selectedFolder
    ? files.filter((f) => f.folder === selectedFolder)
    : files;

  return (
    <div className="flex flex-col h-full">
      {/* 상단 바 */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ct-border)" }}
      >
        <p className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>
          📁 AI Drive
          <span className="ml-1.5 font-normal" style={{ color: "var(--ct-text-muted)" }}>
            {files.length}개
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={load}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
          >
            새로고침
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: showUpload ? "var(--ct-accent)" : "var(--ct-hover)",
              color: showUpload ? "#fff" : "var(--ct-text-muted)",
            }}
          >
            + 업로드
          </button>
        </div>
      </div>

      {/* 저장 용량 */}
      {stats && (
        <div
          className="px-3 py-2 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--ct-border)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
              {formatBytes(stats.used_bytes)} / {formatBytes(stats.quota_bytes)}
            </span>
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
              {usagePercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--ct-border)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${usagePercent}%`,
                background:
                  usagePercent > 90
                    ? "var(--ct-error)"
                    : usagePercent > 70
                    ? "var(--ct-warning)"
                    : "var(--ct-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* 업로드 패널 */}
      {showUpload && (
        <div
          className="flex-shrink-0"
          style={{ borderBottom: "1px solid var(--ct-border)" }}
        >
          <AIDriveUpload
            workspaceId={workspaceId}
            onUploaded={() => {
              setShowUpload(false);
              load();
            }}
          />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* 폴더 트리 (왼쪽) */}
        <div
          className="flex-shrink-0 overflow-y-auto py-2 chat-scrollbar"
          style={{
            width: 96,
            borderRight: "1px solid var(--ct-border)",
            background: "rgba(0,0,0,0.1)",
          }}
        >
          <button
            onClick={() => setSelectedFolder("")}
            className="w-full text-left px-2 py-1.5 text-xs rounded-none transition-colors"
            style={{
              background: selectedFolder === "" ? "rgba(108,92,231,0.2)" : "transparent",
              color: selectedFolder === "" ? "var(--ct-accent)" : "var(--ct-text-muted)",
              fontWeight: selectedFolder === "" ? 600 : 400,
            }}
          >
            📂 전체 ({files.length})
          </button>
          {folders.map((f) => (
            <button
              key={f.name}
              onClick={() => setSelectedFolder(f.name)}
              className="w-full text-left px-2 py-1.5 text-xs rounded-none transition-colors"
              style={{
                background: selectedFolder === f.name ? "rgba(108,92,231,0.2)" : "transparent",
                color: selectedFolder === f.name ? "var(--ct-accent)" : "var(--ct-text-muted)",
                fontWeight: selectedFolder === f.name ? 600 : 400,
              }}
            >
              📁 {f.name}
              <span className="ml-1 opacity-60">({f.file_count})</span>
            </button>
          ))}
        </div>

        {/* 파일 목록 (오른쪽) */}
        <div className="flex-1 min-w-0 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <p className="text-xs animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
                로딩 중...
              </p>
            </div>
          ) : error ? (
            <div className="p-3">
              <p className="text-xs" style={{ color: "var(--ct-error)" }}>{error}</p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                API 서버에서 드라이브 데이터를 불러올 수 없습니다.
              </p>
            </div>
          ) : (
            <AIDriveFileList
              files={files}
              selectedFolder={selectedFolder}
              onRefresh={load}
            />
          )}
        </div>
      </div>
    </div>
  );
}
