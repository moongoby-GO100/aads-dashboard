"use client";
/**
 * AADS-172-C: AIDriveFileList
 * 파일 목록 (프로젝트별 폴더 구조) + 다운로드/삭제/이름변경
 */
import { useState } from "react";
import { driveApi } from "@/services/driveApi";
import type { DriveFile } from "@/services/driveApi";

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileIcon(mimeType: string, name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["mp4", "avi", "mov", "mkv"].includes(ext)) return "🎬";
  if (["mp3", "wav", "ogg"].includes(ext)) return "🎵";
  if (["pdf"].includes(ext)) return "📕";
  if (["zip", "tar", "gz", "rar"].includes(ext)) return "📦";
  if (["js", "ts", "jsx", "tsx", "py", "go", "java", "c", "cpp", "rs"].includes(ext)) return "💻";
  if (["md", "txt", "log"].includes(ext)) return "📄";
  if (["json", "yaml", "yml", "toml", "env"].includes(ext)) return "⚙️";
  if (["sql"].includes(ext)) return "🗄️";
  if (["sh", "bash"].includes(ext)) return "🔧";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  return "📄";
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  files: DriveFile[];
  selectedFolder: string;
  onRefresh: () => void;
}

export default function AIDriveFileList({ files, selectedFolder, onRefresh }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  };

  const filtered = selectedFolder
    ? files.filter((f) => f.folder === selectedFolder)
    : files;

  const handleDownload = (file: DriveFile) => {
    const url = driveApi.getDownloadUrl(file.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
  };

  const handleDelete = async (file: DriveFile) => {
    if (!confirm(`"${file.name}"을 삭제하시겠습니까?`)) return;
    setDeletingId(file.id);
    try {
      await driveApi.deleteFile(file.id);
      showMsg("삭제됨");
      onRefresh();
    } catch {
      showMsg("삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameStart = (file: DriveFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const handleRenameSubmit = async (file: DriveFile) => {
    if (!renameValue.trim() || renameValue === file.name) {
      setRenamingId(null);
      return;
    }
    try {
      await driveApi.renameFile(file.id, renameValue.trim());
      showMsg("이름 변경됨");
      onRefresh();
    } catch {
      showMsg("변경 실패");
    } finally {
      setRenamingId(null);
    }
  };

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <span style={{ fontSize: 32 }}>📂</span>
        <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
          {selectedFolder ? `${selectedFolder} 폴더가 비어있습니다` : "파일이 없습니다"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scrollbar">
      {msg && (
        <div
          className="mx-3 mt-2 px-2 py-1 rounded text-xs text-center"
          style={{ background: "rgba(0,184,148,0.15)", color: "var(--ct-success)" }}
        >
          {msg}
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>파일명</th>
            <th className="text-right px-2 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>크기</th>
            <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>액션</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((file) => (
            <tr
              key={file.id}
              className="group"
              style={{ borderBottom: "1px solid var(--ct-border)" }}
            >
              {/* 파일명 */}
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span>{fileIcon(file.mime_type, file.name)}</span>
                  {renamingId === file.id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(file)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(file);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="text-xs px-1 rounded outline-none flex-1"
                      style={{
                        background: "var(--ct-input-bg)",
                        color: "var(--ct-text)",
                        border: "1px solid var(--ct-accent)",
                        maxWidth: "140px",
                      }}
                      autoFocus
                    />
                  ) : (
                    <div>
                      <p
                        className="truncate font-medium"
                        style={{ color: "var(--ct-text)", maxWidth: "140px" }}
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {!selectedFolder && file.folder && (
                          <span
                            className="px-1 rounded"
                            style={{ background: "rgba(108,92,231,0.15)", color: "var(--ct-accent)" }}
                          >
                            {file.folder}
                          </span>
                        )}
                        {file.ai_generated && (
                          <span
                            className="px-1 rounded"
                            style={{ background: "rgba(0,184,148,0.15)", color: "var(--ct-success)" }}
                          >
                            AI
                          </span>
                        )}
                        <span style={{ color: "var(--ct-text-muted)" }}>
                          {new Date(file.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </td>

              {/* 크기 */}
              <td className="px-2 py-2 text-right" style={{ color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                {formatBytes(file.size)}
              </td>

              {/* 액션 */}
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleDownload(file)}
                    title="다운로드"
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
                  >
                    ⬇
                  </button>
                  <button
                    onClick={() => handleRenameStart(file)}
                    title="이름 변경"
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
                  >
                    ✏
                  </button>
                  <button
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id}
                    title="삭제"
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-xs"
                    style={{ background: "var(--ct-hover)", color: "var(--ct-error)" }}
                  >
                    {deletingId === file.id ? "..." : "🗑"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
