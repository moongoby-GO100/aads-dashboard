"use client";
import { useState, useRef, useCallback, useImperativeHandle, forwardRef, memo, useEffect } from "react";
import ScreenShare, { type ScreenShareHandle } from "./ScreenShare";
import { BASE_URL, authHdrs } from "./api";
import SlashCommandMenu, {
  SLASH_COMMANDS,
  getFilteredCount,
  type SlashCommand,
} from "../../components/chat/SlashCommandMenu";

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// ─── 멘션 대상 프로젝트 목록 ──────────────────────────────────────
const MENTION_TARGETS = [
  { id: "KIS", label: "KIS", desc: "AI 자동매매 시스템" },
  { id: "GO100", label: "GO100 (백억이)", desc: "투자 교육 플랫폼" },
  { id: "AADS", label: "AADS", desc: "자율 AI 개발 시스템" },
  { id: "SF", label: "SF", desc: "SmartFarm 시스템" },
  { id: "NTV2", label: "NTV2", desc: "뉴톡 v2 서비스" },
  { id: "NAS", label: "NAS", desc: "NAS 스토리지" },
];

const CUSTOMER_MENTION_TARGETS = [
  { id: "PROJECT", label: "내 프로젝트", desc: "현재 조직의 프로젝트" },
  { id: "TEAM", label: "내 팀", desc: "현재 조직의 팀원/권한" },
  { id: "TASK", label: "내 작업", desc: "현재 조직의 작업/다음 단계" },
];

export interface ChatInputHandle {
  getValue: () => string;
  setValue: (v: string) => void;
  clear: () => void;
  focus: () => void;
  captureNow: () => void;
}

interface ChatInputProps {
  screenSize: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onHasInput?: (has: boolean) => void;
  onLocalMessage?: (text: string) => void;
  onVoiceSubmit?: (text: string) => void;
  placeholder?: string;
  onScreenShare?: (file: File) => void;
  onHiddenScreenCapture?: (file: File) => void;
  screenHiddenMode?: boolean;
  allowInternalMentions?: boolean;
}

const pickSupportedAudioMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ].find((type) => MediaRecorder.isTypeSupported(type));
};

const voiceFilenameForType = (mimeType: string | undefined): string => {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("mp4")) return "aads-voice.mp4";
  if (type.includes("aac")) return "aads-voice.aac";
  if (type.includes("mpeg")) return "aads-voice.mp3";
  return "aads-voice.webm";
};

const getBrowserSpeechRecognition = (): SpeechRecognitionCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
};

const SERVER_STT_COOLDOWN_KEY = "aads-voice-server-stt-cooldown-until";
const SERVER_STT_COOLDOWN_MS = 15 * 60 * 1000;

const getServerSttCooldownRemainingMs = (): number => {
  if (typeof window === "undefined") return 0;
  const until = Number(window.localStorage.getItem(SERVER_STT_COOLDOWN_KEY) || "0");
  if (!Number.isFinite(until) || until <= Date.now()) return 0;
  return until - Date.now();
};

const markServerSttCooldown = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SERVER_STT_COOLDOWN_KEY, String(Date.now() + SERVER_STT_COOLDOWN_MS));
};

const readableVoiceError = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message : String(raw || "");
  if (message.includes("voice_provider_quota_exceeded")) {
    return "서버 음성 변환 한도가 초과되었습니다. 브라우저 음성 인식이 지원되는 Chrome/Edge에서 다시 시도해주세요.";
  }
  if (message.includes("voice_provider_not_configured")) {
    return "서버 음성 변환 공급자가 설정되지 않았습니다.";
  }
  if (message.includes("unsupported_audio_type")) {
    return "이 브라우저의 녹음 형식을 서버가 처리하지 못했습니다.";
  }
  return message || "음성 변환 실패";
};

const ChatInput = memo(forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ screenSize, onKeyDown, onHasInput, onLocalMessage, onVoiceSubmit, placeholder, onScreenShare, onHiddenScreenCapture, screenHiddenMode, allowInternalMentions = false }, ref) {
    const [localInput, setLocalInput] = useState("");
    const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
    const taRef = useRef<HTMLTextAreaElement>(null);
    const hadInputRef = useRef(false);
    const screenShareRef = useRef<ScreenShareHandle>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const voiceChunksRef = useRef<Blob[]>([]);
    const speechRecognitionFallbackStartedRef = useRef(false);

    // 슬래시 명령어 상태
    const [showSlash, setShowSlash] = useState(false);
    const [slashFilter, setSlashFilter] = useState("");
    const [slashIndex, setSlashIndex] = useState(0);
    const composingRef = useRef(false);

    // 멘션(@) 상태
    const [showMention, setShowMention] = useState(false);
    const [mentionFilter, setMentionFilter] = useState("");
    const [mentionIndex, setMentionIndex] = useState(0);
    const mentionStartRef = useRef(-1); // @ 기호 위치

    useImperativeHandle(ref, () => ({
      captureNow: () => { screenShareRef.current?.captureNow(); },
      getValue: () => taRef.current?.value ?? localInput,
      setValue: (v: string) => {
        setLocalInput(v);
        if (taRef.current) {
          taRef.current.value = v;
          taRef.current.style.height = "auto";
          setTimeout(() => {
            if (taRef.current) {
              const maxH = window.innerWidth < 768 ? 200 : 160;
              taRef.current.style.height = Math.min(taRef.current.scrollHeight, maxH) + "px";
            }
          }, 0);
        }
        const has = v.trim().length > 0;
        if (has !== hadInputRef.current) {
          hadInputRef.current = has;
          onHasInput?.(has);
        }
      },
      clear: () => {
        setLocalInput("");
        setShowSlash(false);
        setShowMention(false);
        if (taRef.current) { taRef.current.style.height = "auto"; }
        if (hadInputRef.current) {
          hadInputRef.current = false;
          onHasInput?.(false);
        }
      },
      focus: () => { taRef.current?.focus(); },
    }), [localInput, onHasInput]);

    // 슬래시 메뉴 필터링 업데이트
    useEffect(() => {
      if (!showSlash) return;
      const count = getFilteredCount(slashFilter);
      if (count === 0) {
        setShowSlash(false);
      } else if (slashIndex >= count) {
        setSlashIndex(0);
      }
    }, [slashFilter, showSlash, slashIndex]);

    // 멘션 메뉴 필터링
    const mentionTargets = allowInternalMentions ? MENTION_TARGETS : CUSTOMER_MENTION_TARGETS;
    const filteredMentions = mentionTargets.filter((t) =>
      t.id.toLowerCase().startsWith(mentionFilter.toLowerCase()) ||
      t.label.toLowerCase().startsWith(mentionFilter.toLowerCase())
    );

    useEffect(() => {
      if (!showMention) return;
      if (filteredMentions.length === 0) {
        setShowMention(false);
      } else if (mentionIndex >= filteredMentions.length) {
        setMentionIndex(0);
      }
    }, [mentionFilter, showMention, mentionIndex, filteredMentions.length]);

    const updateHasInput = useCallback((val: string) => {
      const has = val.trim().length > 0;
      if (has !== hadInputRef.current) {
        hadInputRef.current = has;
        onHasInput?.(has);
      }
    }, [onHasInput]);

    // 멘션 선택 → @프로젝트ID 형태로 삽입
    const selectMention = useCallback((target: typeof mentionTargets[number]) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = mentionStartRef.current;
      const cursorPos = ta.selectionStart;
      const before = localInput.slice(0, start); // @ 이전
      const after = localInput.slice(cursorPos); // 커서 이후
      const inserted = `@${target.id} `;
      const newVal = before + inserted + after;
      setLocalInput(newVal);
      updateHasInput(newVal);
      setShowMention(false);
      mentionStartRef.current = -1;
      // 커서 위치 조정
      const newCursorPos = before.length + inserted.length;
      setTimeout(() => {
        if (taRef.current) {
          taRef.current.focus();
          taRef.current.selectionStart = taRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
    }, [localInput, updateHasInput]);

    const appendVoiceText = useCallback((text: string) => {
      const value = String(text || "").trim();
      if (!value) return;
      const current = taRef.current?.value ?? localInput;
      const next = current.trim() ? `${current.trim()}\n${value}` : value;
      setLocalInput(next);
      if (taRef.current) {
        taRef.current.value = next;
        taRef.current.style.height = "auto";
        const maxH = window.innerWidth < 768 ? 200 : 160;
        taRef.current.style.height = Math.min(taRef.current.scrollHeight, maxH) + "px";
        taRef.current.focus();
      }
      updateHasInput(next);
    }, [localInput, updateHasInput]);

    const transcribeVoice = useCallback(async (blob: Blob) => {
      if (!blob.size) return;
      setVoiceState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, voiceFilenameForType(blob.type));
        const res = await fetch(`${BASE_URL}/voice/transcribe`, {
          method: "POST",
          headers: authHdrs(),
          body: form,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `voice transcribe failed: ${res.status}`);
        }
        const data = await res.json();
        const text = String(data?.text || "").trim();
        appendVoiceText(text);
        if (text) {
          window.setTimeout(() => onVoiceSubmit?.(text), 0);
        }
      } catch (err) {
        if (String(err instanceof Error ? err.message : err).includes("voice_provider_quota_exceeded")) {
          markServerSttCooldown();
        }
        onLocalMessage?.(`음성 입력을 사용할 수 없습니다.\n\n${readableVoiceError(err)}`);
      } finally {
        setVoiceState("idle");
      }
    }, [appendVoiceText, onLocalMessage, onVoiceSubmit]);

    const startMediaRecorderFallback = useCallback(async (reason?: string) => {
      try {
        const cooldownRemaining = getServerSttCooldownRemainingMs();
        if (cooldownRemaining > 0) {
          const minutes = Math.max(1, Math.ceil(cooldownRemaining / 60000));
          throw new Error(`서버 음성 변환 한도 초과로 약 ${minutes}분 뒤 다시 시도해야 합니다. Chrome/Edge 브라우저 음성 인식을 우선 사용해주세요.`);
        }
        if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          throw new Error("이 브라우저에서 녹음을 지원하지 않습니다.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        const mimeType = pickSupportedAudioMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        voiceChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) voiceChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          mediaRecorderRef.current = null;
          void transcribeVoice(blob);
        };
        mediaRecorderRef.current = recorder;
        setVoiceState("recording");
        recorder.start();
        if (reason) {
          onLocalMessage?.(`브라우저 음성 인식이 불안정해 녹음 변환으로 전환했습니다.\n\n${reason}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "마이크 권한을 확인할 수 없습니다.";
        onLocalMessage?.(`음성 입력을 시작하지 못했습니다.\n\n${message}`);
        speechRecognitionRef.current = null;
        setVoiceState("idle");
      }
    }, [onLocalMessage, transcribeVoice]);

    const toggleVoiceRecording = useCallback(async () => {
      if (voiceState === "recording") {
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
          return;
        }
        mediaRecorderRef.current?.stop();
        return;
      }
      if (voiceState !== "idle") return;
      try {
        const Recognition = getBrowserSpeechRecognition();
        if (Recognition) {
          let finalText = "";
          let recognitionHadError = false;
          const recognition = new Recognition();
          recognition.lang = "ko-KR";
          recognition.interimResults = false;
          recognition.continuous = false;
          recognition.maxAlternatives = 1;
          recognition.onresult = (event) => {
            const texts: string[] = [];
            for (let i = 0; i < event.results.length; i += 1) {
              const transcript = event.results[i]?.[0]?.transcript || "";
              if (transcript.trim()) texts.push(transcript.trim());
            }
            finalText = texts.join(" ").trim();
          };
          recognition.onerror = (event) => {
            const reason = event.message || event.error || "browser_speech_recognition_failed";
            recognitionHadError = true;
            speechRecognitionRef.current = null;
            setVoiceState("idle");
            if (!speechRecognitionFallbackStartedRef.current && reason !== "not-allowed" && reason !== "permission-denied") {
              speechRecognitionFallbackStartedRef.current = true;
              void startMediaRecorderFallback(reason);
              return;
            }
            onLocalMessage?.(`음성 입력을 사용할 수 없습니다.\n\n${reason}`);
          };
          recognition.onend = () => {
            speechRecognitionRef.current = null;
            setVoiceState("idle");
            if (recognitionHadError) return;
            if (!finalText) return;
            appendVoiceText(finalText);
            window.setTimeout(() => onVoiceSubmit?.(finalText), 0);
          };
          speechRecognitionRef.current = recognition;
          speechRecognitionFallbackStartedRef.current = false;
          setVoiceState("recording");
          recognition.start();
          return;
        }
        await startMediaRecorderFallback();
      } catch (err) {
        const message = err instanceof Error ? err.message : "마이크 권한을 확인할 수 없습니다.";
        onLocalMessage?.(`음성 입력을 시작하지 못했습니다.\n\n${message}`);
        speechRecognitionRef.current = null;
        setVoiceState("idle");
      }
    }, [appendVoiceText, onLocalMessage, onVoiceSubmit, startMediaRecorderFallback, voiceState]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      e.target.style.height = "auto";
      const maxH = window.innerWidth < 768 ? 200 : 160;
      e.target.style.height = Math.min(e.target.scrollHeight, maxH) + "px";
      setLocalInput(val);
      updateHasInput(val);

      if (!composingRef.current) {
        // 슬래시 명령어 감지
        if (val.startsWith("/")) {
          const filter = val.slice(1);
          if (filter.includes(" ") || filter.includes("\n")) {
            setShowSlash(false);
          } else {
            setSlashFilter(filter);
            setSlashIndex(0);
            setShowSlash(true);
          }
          setShowMention(false);
          return;
        } else {
          setShowSlash(false);
        }

        // 멘션(@) 감지: 커서 위치에서 역방향으로 @ 찾기
        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursorPos);
        const atIdx = textBeforeCursor.lastIndexOf("@");
        if (atIdx >= 0) {
          // @ 앞이 공백/줄시작이거나 문장 시작일 때만 멘션 활성화
          const charBefore = atIdx > 0 ? textBeforeCursor[atIdx - 1] : " ";
          if (charBefore === " " || charBefore === "\n" || atIdx === 0) {
            const fragment = textBeforeCursor.slice(atIdx + 1);
            // 공백이 포함되면 멘션 확정 완료 상태 → 메뉴 닫기
            if (!fragment.includes(" ") && !fragment.includes("\n")) {
              mentionStartRef.current = atIdx;
              setMentionFilter(fragment);
              setMentionIndex(0);
              setShowMention(true);
              return;
            }
          }
        }
        setShowMention(false);
      }
    }, [updateHasInput]);

    const selectSlashCommand = useCallback((cmd: SlashCommand) => {
      if (cmd.expand === "__DISCUSSION__") {
        onLocalMessage?.("__DISCUSSION__");
        setLocalInput("");
        updateHasInput("");
        setShowSlash(false);
        return;
      }
      if (cmd.cmd === "/도움말") {
        const helpText = SLASH_COMMANDS
          .map((c) => `${c.cmd} — ${c.desc}`)
          .join("\n");
        onLocalMessage?.(`사용 가능한 슬래시 명령어:\n\n${helpText}`);
        setLocalInput("");
        updateHasInput("");
        setShowSlash(false);
        return;
      }
      setLocalInput(cmd.expand);
      updateHasInput(cmd.expand);
      setShowSlash(false);
      setTimeout(() => {
        if (taRef.current) {
          taRef.current.focus();
          taRef.current.selectionStart = taRef.current.selectionEnd = cmd.expand.length;
        }
      }, 0);
    }, [onLocalMessage, updateHasInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 멘션 메뉴가 열려있을 때 키보드 네비게이션
      if (showMention && !composingRef.current) {
        const count = filteredMentions.length;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setMentionIndex((prev) => (prev + 1) % count);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setMentionIndex((prev) => (prev - 1 + count) % count);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          if (filteredMentions[mentionIndex]) {
            selectMention(filteredMentions[mentionIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setShowMention(false);
          return;
        }
      }

      // 슬래시 메뉴가 열려있을 때 키보드 네비게이션
      if (showSlash && !composingRef.current) {
        const count = getFilteredCount(slashFilter);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setSlashIndex((prev) => (prev + 1) % count);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setSlashIndex((prev) => (prev - 1 + count) % count);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const filtered = SLASH_COMMANDS.filter((c) =>
            c.cmd.startsWith("/" + slashFilter)
          );
          if (filtered[slashIndex]) {
            selectSlashCommand(filtered[slashIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setShowSlash(false);
          return;
        }
      }

      // 기본 동작: 빈 Enter 차단
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        const val = taRef.current?.value ?? localInput;
        if (!val.trim()) {
          e.preventDefault();
          return;
        }
      }
      onKeyDown(e);
    }, [localInput, onKeyDown, showSlash, slashFilter, slashIndex, selectSlashCommand, showMention, mentionIndex, filteredMentions, selectMention]);

    // IME 조합 이벤트 처리
    const handleCompositionStart = useCallback(() => {
      composingRef.current = true;
    }, []);
    const handleCompositionEnd = useCallback(() => {
      composingRef.current = false;
    }, []);

    return (
      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: "4px" }}>
        {/* 화면 공유 버튼 + 인디케이터 (onScreenShare 있을 때만) */}
        {onScreenShare && (
          <ScreenShare
            ref={screenShareRef}
            onCapture={onScreenShare}
            onHiddenCapture={onHiddenScreenCapture}
            hiddenMode={screenHiddenMode ?? true}
          />
        )}

        {/* 텍스트 입력 영역 (슬래시/멘션 메뉴 absolute 기준점) */}
        <div style={{ position: "relative", flex: 1 }}>
          {/* 슬래시 명령어 메뉴 */}
          {showSlash && (
            <SlashCommandMenu
              filter={slashFilter}
              selectedIndex={slashIndex}
              onSelect={selectSlashCommand}
              position={{ bottom: screenSize === "mobile" ? 50 : 50, left: 0 }}
            />
          )}

          {/* 멘션(@) 드롭다운 메뉴 */}
          {showMention && filteredMentions.length > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: screenSize === "mobile" ? 50 : 50,
                left: 0,
                minWidth: 220,
                background: "var(--ct-card, #1e1e2e)",
                border: "1px solid var(--ct-border, #333)",
                borderRadius: 10,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                zIndex: 50,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--ct-text-secondary, #888)", borderBottom: "1px solid var(--ct-border, #333)" }}>
                {allowInternalMentions ? "프로젝트 멘션" : "워크스페이스 멘션"}
              </div>
              {filteredMentions.map((target, idx) => (
                <button
                  key={target.id}
                  onMouseDown={(e) => { e.preventDefault(); selectMention(target); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 13,
                    background: idx === mentionIndex ? "var(--ct-accent, #7c3aed)" : "transparent",
                    color: idx === mentionIndex ? "#fff" : "var(--ct-text, #e2e8f0)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background: idx === mentionIndex ? "rgba(255,255,255,0.2)" : "rgba(99,102,241,0.15)",
                    color: idx === mentionIndex ? "#fff" : "#818cf8",
                  }}>
                    @{target.id}
                  </span>
                  <span style={{ color: idx === mentionIndex ? "rgba(255,255,255,0.7)" : "var(--ct-text-secondary, #888)", fontSize: 12 }}>
                    {target.desc}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ position: "relative" }}>
            <textarea
              ref={taRef}
              value={localInput}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder={placeholder || "메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈, / 명령어, @ 멘션)"}
              rows={1}
              style={{
                width: "100%",
                padding: allowInternalMentions
                  ? (screenSize === "mobile" ? "10px 86px 10px 14px" : "10px 46px 10px 14px")
                  : (screenSize === "mobile" ? "10px 48px 10px 14px" : "10px 14px"),
                fontSize: screenSize === "mobile" ? "16px" : "14px",
                resize: "none",
                overflow: "hidden",
                background: "var(--ct-input)",
                color: "var(--ct-text)",
                border: "1px solid var(--ct-border)",
                borderRadius: "12px",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: "1.5",
                minHeight: screenSize === "mobile" ? "44px" : "44px",
                maxHeight: screenSize === "mobile" ? "140px" : "160px",
              }}
              inputMode="text"
              enterKeyHint="send"
              onFocus={(e) => {
                e.target.style.borderColor = "var(--ct-accent)";
                setTimeout(() => {
                  (taRef.current ?? document.activeElement as HTMLElement)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
                }, 300);
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--ct-border)";
                setTimeout(() => { setShowSlash(false); setShowMention(false); }, 200);
              }}
            />
            {allowInternalMentions && (
              <button
                type="button"
                onClick={toggleVoiceRecording}
                disabled={voiceState === "transcribing"}
                title={voiceState === "recording" ? "녹음 중지 후 텍스트 변환" : voiceState === "transcribing" ? "음성 텍스트 변환 중" : "음성으로 입력"}
                style={{
                  position: "absolute",
                  right: screenSize === "mobile" ? "46px" : "8px",
                  bottom: "6px",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "1px solid var(--ct-border)",
                  background: voiceState === "recording" ? "#ef4444" : "var(--ct-hover)",
                  color: voiceState === "recording" ? "#fff" : "var(--ct-text2)",
                  cursor: voiceState === "transcribing" ? "wait" : "pointer",
                  fontSize: "14px",
                  opacity: voiceState === "transcribing" ? 0.7 : 1,
                }}
              >
                {voiceState === "transcribing" ? "..." : "🎙"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
));

ChatInput.displayName = "ChatInput";
export default ChatInput;
