"use client";
import { useState, useRef, useCallback, useImperativeHandle, forwardRef, memo, useEffect } from "react";
import SlashCommandMenu, {
  SLASH_COMMANDS,
  getFilteredCount,
  type SlashCommand,
} from "../../components/chat/SlashCommandMenu";

// ─── 멘션 대상 프로젝트 목록 ──────────────────────────────────────
const MENTION_TARGETS = [
  { id: "KIS", label: "KIS", desc: "AI 자동매매 시스템" },
  { id: "GO100", label: "GO100 (백억이)", desc: "투자 교육 플랫폼" },
  { id: "AADS", label: "AADS", desc: "자율 AI 개발 시스템" },
  { id: "SF", label: "SF", desc: "SmartFarm 시스템" },
  { id: "NTV2", label: "NTV2", desc: "뉴톡 v2 서비스" },
  { id: "NAS", label: "NAS", desc: "NAS 스토리지" },
];

export interface ChatInputHandle {
  getValue: () => string;
  setValue: (v: string) => void;
  clear: () => void;
  focus: () => void;
}

interface ChatInputProps {
  screenSize: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onHasInput?: (has: boolean) => void;
  onLocalMessage?: (text: string) => void;
  placeholder?: string;
}

const ChatInput = memo(forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ screenSize, onKeyDown, onHasInput, onLocalMessage, placeholder }, ref) {
    const [localInput, setLocalInput] = useState("");
    const taRef = useRef<HTMLTextAreaElement>(null);
    const hadInputRef = useRef(false);

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
    const filteredMentions = MENTION_TARGETS.filter((t) =>
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
    const selectMention = useCallback((target: typeof MENTION_TARGETS[number]) => {
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
              프로젝트 멘션
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
            flex: 1,
            padding: screenSize === "mobile" ? "10px 48px 10px 14px" : "10px 14px",
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
      </div>
    );
  }
));

ChatInput.displayName = "ChatInput";
export default ChatInput;
