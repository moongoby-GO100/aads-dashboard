"use client";

/** 켜기/끄기 스위치. 켜짐 초록 · 꺼짐 회색.
 *  눌림 영역은 모바일 기준 32px 이상(트랙은 작아도 버튼 자체가 크다). */
export default function EnableSwitch({ checked, busy = false, disabled = false, label, onToggle }: {
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const inactive = busy || disabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} ${checked ? "끄기" : "켜기"}`}
      title={checked ? "켜짐 — 누르면 끕니다" : "꺼짐 — 누르면 켭니다"}
      disabled={inactive}
      onClick={onToggle}
      className="inline-flex items-center justify-center shrink-0"
      style={{ minWidth: 44, minHeight: 32, opacity: inactive ? 0.55 : 1, cursor: inactive ? "default" : "pointer" }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative", display: "inline-block", width: 36, height: 20, borderRadius: 10,
          background: checked ? "#16a34a" : "#9ca3af", transition: "background 0.15s",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16,
            borderRadius: "50%", background: "#fff", transition: "left 0.15s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        />
      </span>
    </button>
  );
}
