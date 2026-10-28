import type React from "react";

export const TOUCH = 44;

export const BUTTON: React.CSSProperties = {
  minHeight: TOUCH, minWidth: TOUCH, padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 700,
  boxSizing: "border-box", maxWidth: "100%", cursor: "pointer",
};

export const BUTTON_PRIMARY: React.CSSProperties = { ...BUTTON, border: "none", background: "var(--accent)", color: "#fff" };
export const BUTTON_PLAIN: React.CSSProperties = { ...BUTTON, border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)" };
export const BUTTON_DANGER: React.CSSProperties = { ...BUTTON, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)" };

export const INPUT: React.CSSProperties = {
  minHeight: TOUCH, padding: "8px 12px", borderRadius: 8, fontSize: 14, boxSizing: "border-box", width: "100%",
  border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)",
};

export const CARD: React.CSSProperties = {
  background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, boxSizing: "border-box", maxWidth: "100%",
};

export const BADGE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
};

export const MUTED: React.CSSProperties = { color: "var(--text-secondary)" };

export const NOT_WRITTEN = "안내 미작성";

export const NOTICE: React.CSSProperties = {
  margin: 0, padding: "8px 10px", borderRadius: 8, fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere",
  border: "1px solid var(--warning)", color: "var(--text-primary)", background: "var(--bg-primary)",
};
