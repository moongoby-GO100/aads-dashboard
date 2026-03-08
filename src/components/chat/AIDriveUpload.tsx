"use client";
/**
 * AADS-172-C: AIDriveUpload
 * 드래그&드롭 + 클릭 파일 업로드 컴포넌트
 */
import { useRef, useState, useCallback } from "react";
import { driveApi } from "@/services/driveApi";

const PROJECT_FOLDERS = ["", "AADS", "SF", "KIS", "GO100", "NTV2", "NAS", "Reports", "Code"];

interface Props {
  workspaceId?: string;
  onUploaded: () => void;
}

export default function AIDriveUpload({ workspaceId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState("");

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError("");
      const total = files.length;
      for (let i = 0; i < total; i++) {
        const file = files[i];
        setProgress(`업로드 중 ${i + 1}/${total}: ${file.name}`);
        try {
          await driveApi.uploadFile(file, workspaceId, folder || undefined);
        } catch (e) {
          setError(`${file.name} 업로드 실패: ${e}`);
        }
      }
      setProgress("");
      setUploading(false);
      onUploaded();
    },
    [workspaceId, folder, onUploaded]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="p-3">
      {/* 폴더 선택 */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs" style={{ color: "var(--ct-text-muted)" }}>저장 폴더:</label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className="text-xs flex-1 px-2 py-1 rounded outline-none"
          style={{
            background: "var(--ct-input-bg)",
            color: "var(--ct-text)",
            border: "1px solid var(--ct-border)",
          }}
        >
          {PROJECT_FOLDERS.map((f) => (
            <option key={f} value={f}>{f || "(루트)"}</option>
          ))}
        </select>
      </div>

      {/* 드래그 앤 드롭 영역 */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer transition-all"
        style={{
          border: `2px dashed ${dragging ? "var(--ct-accent)" : "var(--ct-border)"}`,
          background: dragging ? "rgba(108,92,231,0.08)" : "transparent",
          padding: "24px 12px",
          minHeight: 100,
        }}
      >
        <span style={{ fontSize: 28 }}>📂</span>
        {uploading ? (
          <p className="text-xs text-center" style={{ color: "var(--ct-accent)" }}>
            {progress}
          </p>
        ) : (
          <>
            <p className="text-xs text-center font-medium" style={{ color: "var(--ct-text)" }}>
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-xs text-center" style={{ color: "var(--ct-text-muted)" }}>
              모든 파일 형식 지원
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* 업로드 진행 바 */}
      {uploading && (
        <div className="mt-2 h-1 rounded-full" style={{ background: "var(--ct-border)" }}>
          <div
            className="h-1 rounded-full animate-pulse"
            style={{ background: "var(--ct-accent)", width: "60%" }}
          />
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--ct-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
