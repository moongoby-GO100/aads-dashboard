"use client";
import { useState, useRef, useCallback, useImperativeHandle, forwardRef, memo } from "react";

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
  placeholder?: string;
}

const ChatInput = memo(forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ screenSize, onKeyDown, onHasInput, placeholder }, ref) {
    const [localInput, setLocalInput] = useState("");
    const taRef = useRef<HTMLTextAreaElement>(null);
    const hadInputRef = useRef(false);

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
        if (taRef.current) { taRef.current.style.height = "auto"; }
        if (hadInputRef.current) {
          hadInputRef.current = false;
          onHasInput?.(false);
        }
      },
      focus: () => { taRef.current?.focus(); },
    }), [localInput, onHasInput]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      e.target.style.height = "auto";
      const maxH = window.innerWidth < 768 ? 200 : 160;
      e.target.style.height = Math.min(e.target.scrollHeight, maxH) + "px";
      setLocalInput(val);
      // 부모에 빈칸 여부만 알림 (boolean 변경 시만 호출 → 리렌더 최소화)
      const has = val.trim().length > 0;
      if (has !== hadInputRef.current) {
        hadInputRef.current = has;
        onHasInput?.(has);
      }
    }, [onHasInput]);

    return (
      <textarea
        ref={taRef}
        value={localInput}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder || "메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"}
        rows={1}
        style={{
          flex: 1,
          padding: "10px 14px",
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
          minHeight: screenSize === "mobile" ? "52px" : "44px",
          maxHeight: screenSize === "mobile" ? "200px" : "160px",
        }}
        onFocus={(e) => (e.target.style.borderColor = "var(--ct-accent)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--ct-border)")}
      />
    );
  }
));

ChatInput.displayName = "ChatInput";
export default ChatInput;
