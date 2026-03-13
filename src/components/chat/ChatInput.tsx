"use client";
// @ts-nocheck
/**
 * AADS-172-B: ChatInput
 * 채팅 입력 영역
 * - 멀티라인 텍스트에어리어 (자동 높이 조절, max 200px)
 * - Enter 전송, Shift+Enter 줄바꿈
 * - 파일 첨부 버튼 (📎) + 드래그&드롭
 * - 음성 입력 버튼 (🎤) Web Speech API
 * - 전송 버튼 (▶) 비활성/활성
 * - ChatModelSelector 통합
 * - ActionChips 통합
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatModelSelector, DEFAULT_CHAT_MODEL, CHAT_MODEL_OPTIONS } from "./ModelSelector";
import ActionChips, { WELCOME_CHIPS, getDynamicChips } from "./ActionChips";

interface ChatInputProps {
  onSend: (message: string, modelId: string, files?: File[]) => void;
  isStreaming: boolean;
  lastAssistantMessage?: string;
  hasMessages?: boolean;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  editMode?: string | null;
  onCancelEdit?: () => void;
}

export default function ChatInput({
  onSend,
  isStreaming,
  lastAssistantMessage = "",
  hasMessages = false,
  selectedModel,
  onModelChange,
  editMode,
  onCancelEdit,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(selectedModel || DEFAULT_CHAT_MODEL);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // 모델 외부 동기화
  useEffect(() => {
    if (selectedModel) setModel(selectedModel);
  }, [selectedModel]);

  // 텍스트에어리어 자동 높이 조절
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const handleModelChange = (m: string) => {
    setModel(m);
    onModelChange?.(m);
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || isStreaming) return;
    onSend(trimmed, model, attachedFiles.length > 0 ? attachedFiles : undefined);
    setText("");
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, model, isStreaming, attachedFiles, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (message: string) => {
    if (!isStreaming) onSend(message, model);
  };

  // 파일 첨부
  const handleFileChange = (files: FileList | File[] | null) => {
    if (!files) return;
    setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const removeFile = (i: number) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Ctrl+V 클립보드 이미지 붙여넣기
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) handleFileChange(imageFiles);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드래그&드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

  // 음성 입력 (Web Speech API)
  const toggleVoice = () => {
    const SpeechRecognitionClass =
      typeof window !== "undefined"
        ? (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
            .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionClass) {
      alert("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognitionClass();
    rec.lang = "ko-KR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setText(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const chips = hasMessages
    ? getDynamicChips(lastAssistantMessage)
    : WELCOME_CHIPS;

  const isDeepResearch = CHAT_MODEL_OPTIONS.find((m) => m.id === model)?.isDeepResearch;
  const canSend = (text.trim().length > 0 || attachedFiles.length > 0) && !isStreaming;

  return (
    <div
      className={`p-4 transition-colors ${isDragging ? "ring-2 ring-inset" : ""}`}
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-medium rounded-lg z-10"
          style={{ background: "rgba(109,40,217,0.15)", border: "2px dashed var(--accent)", color: "var(--accent)" }}
        >
          📎 파일을 여기에 놓으세요
        </div>
      )}

      {/* 재지시 모드 배너 */}
      {editMode && (
        <div className="flex items-center justify-between mb-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: "rgba(109,40,217,0.15)", border: "1px solid rgba(109,40,217,0.3)", color: "#a78bfa" }}>
          <span>🔄 이전 메시지를 수정하여 재전송합니다</span>
          <button onClick={onCancelEdit} className="ml-2 px-2 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.1)" }}>
            취소
          </button>
        </div>
      )}

      {/* 액션 칩 */}
      <ActionChips chips={chips} onChipClick={handleChipClick} disabled={isStreaming} />

      {/* 첨부 파일 미리보기 */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachedFiles.map((f, i) => {
            const isImg = f.type.startsWith("image/");
            return (
              <div key={i} className="relative inline-flex items-center">
                {isImg ? (
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="w-16 h-16 object-cover rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", maxWidth: "140px" }}
                  >
                    <span>📄</span>
                    <span className="truncate">{f.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
                  style={{ background: "#ef4444", fontSize: "10px", border: "none", cursor: "pointer", padding: 0 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 모델 셀렉터 */}
      <div className="mb-2">
        <ChatModelSelector value={model} onChange={handleModelChange} />
        {isDeepResearch && (
          <p className="text-xs mt-1" style={{ color: "#a78bfa" }}>
            🔬 Deep Research 모드: 소스 탐색 + 분석 + 보고서 생성 (~$3, 1-2분)
          </p>
        )}
      </div>

      {/* 입력 영역 */}
      <div
        className="flex items-end gap-2"
        style={{
          background: "var(--bg-main)",
          border: `1px solid ${canSend ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "12px",
          padding: "8px",
          transition: "border-color 0.2s",
        }}
      >
        {/* 파일 첨부 버튼 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-base"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
            opacity: isStreaming ? 0.5 : 1,
          }}
          title="파일 첨부"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files)}
        />

        {/* 텍스트에어리어 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
          placeholder={isStreaming ? "AI 응답 생성 중..." : "메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"}
          className="flex-1 resize-none text-sm leading-relaxed outline-none"
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            border: "none",
            minHeight: "36px",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        />

        {/* 음성 입력 버튼 */}
        <button
          onClick={toggleVoice}
          disabled={isStreaming}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all text-base"
          style={{
            background: isListening ? "rgba(239,68,68,0.15)" : "transparent",
            color: isListening ? "#ef4444" : "var(--text-secondary)",
            opacity: isStreaming ? 0.5 : 1,
            animation: isListening ? "pulse 1s infinite" : undefined,
          }}
          title={isListening ? "음성 입력 중지" : "음성 입력"}
        >
          🎤
        </button>

        {/* 전송 버튼 */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all text-sm font-bold"
          style={{
            background: canSend ? "var(--accent)" : "var(--bg-hover)",
            color: canSend ? "#fff" : "var(--text-secondary)",
            opacity: canSend ? 1 : 0.5,
            cursor: canSend ? "pointer" : "not-allowed",
            transform: canSend ? "scale(1)" : "scale(0.95)",
            transition: "all 0.15s",
          }}
          title="전송 (Enter)"
        >
          ▶
        </button>
      </div>

      {/* 힌트 */}
      <p className="text-xs mt-1.5 text-center" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
        Enter 전송 · Shift+Enter 줄바꿈 · 📎 파일첨부
      </p>
    </div>
  );
}
