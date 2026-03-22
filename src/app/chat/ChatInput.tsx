"use client";
import { useState, useRef, useCallback, useImperativeHandle, forwardRef, memo, useEffect } from "react";
import SlashCommandMenu, {
  SLASH_COMMANDS,
  getFilteredCount,
  type SlashCommand,
} from "../../components/chat/SlashCommandMenu";

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

    const updateHasInput = useCallback((val: string) => {
      const has = val.trim().length > 0;
      if (has !== hadInputRef.current) {
        hadInputRef.current = has;
        onHasInput?.(has);
      }
    }, [onHasInput]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      e.target.style.height = "auto";
      const maxH = window.innerWidth < 768 ? 200 : 160;
      e.target.style.height = Math.min(e.target.scrollHeight, maxH) + "px";
      setLocalInput(val);
      updateHasInput(val);

      // 슬래시 명령어 감지 (IME 조합 중 아닐 때만)
      if (!composingRef.current) {
        if (val.startsWith("/")) {
          const filter = val.slice(1);
          // 공백이 있으면 슬래시 메뉴 닫기 (이미 확정된 상태)
          if (filter.includes(" ") || filter.includes("\n")) {
            setShowSlash(false);
          } else {
            setSlashFilter(filter);
            setSlashIndex(0);
            setShowSlash(true);
          }
        } else {
          setShowSlash(false);
        }
      }
    }, [updateHasInput]);

    const selectSlashCommand = useCallback((cmd: SlashCommand) => {
      if (cmd.cmd === "/도움말") {
        // 도움말: 로컬 메시지로 표시, 서버 전송 안 함
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
      // 커서를 끝으로 이동
      setTimeout(() => {
        if (taRef.current) {
          taRef.current.focus();
          taRef.current.selectionStart = taRef.current.selectionEnd = cmd.expand.length;
        }
      }, 0);
    }, [onLocalMessage, updateHasInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    }, [localInput, onKeyDown, showSlash, slashFilter, slashIndex, selectSlashCommand]);

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
        <textarea
          ref={taRef}
          value={localInput}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder || "메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈, / 명령어)"}
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
          onFocus={(e) => (e.target.style.borderColor = "var(--ct-accent)")}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--ct-border)";
            // 약간의 딜레이 후 메뉴 닫기 (클릭 이벤트가 먼저 처리되도록)
            setTimeout(() => setShowSlash(false), 200);
          }}
        />
      </div>
    );
  }
));

ChatInput.displayName = "ChatInput";
export default ChatInput;
