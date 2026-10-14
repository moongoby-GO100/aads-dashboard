"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AUTOMATION_EXAMPLES, COPY, errorSentence } from "@/lib/automationCopy";

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 96, padding: "10px 12px", borderRadius: 8, boxSizing: "border-box",
  fontSize: 16, lineHeight: 1.5, resize: "vertical",
  border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)",
};

const BUTTON: React.CSSProperties = {
  minHeight: 48, padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, boxSizing: "border-box", maxWidth: "100%",
};

// 홈 화면과 '내 자동화' 화면이 같이 쓰는 시작 흐름: 한 문장을 받아 초안을 만들고 채팅 카드로 넘긴다.
export default function AutomationStartForm({ onCancel, onDisabled }: { onCancel: () => void; onDisabled: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(async () => {
    const intent = text.trim();
    if (intent.length < 2 || busy) return;
    setBusy(true);
    setError("");
    const result = await api.createAutomationDraft(intent);
    if (!result.ok) {
      setBusy(false);
      if (result.status === 404 && result.code === "automation_drafts_disabled") onDisabled();
      setError(errorSentence(result.status, result.code));
      return;
    }
    router.push(`/chat?automation_draft=${encodeURIComponent(result.data.draft.id)}`);
  }, [text, busy, router, onDisabled]);

  return (
    <form
      style={{ marginTop: 12 }}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{COPY.startLead}</p>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{COPY.startSub}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={COPY.startPlaceholder}
        aria-label={COPY.startPlaceholder}
        maxLength={500}
        disabled={busy}
        style={FIELD}
      />
      <div style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 4px" }}>{COPY.startExampleTag}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {AUTOMATION_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => setText(example)}
            style={{ ...BUTTON, fontWeight: 500, textAlign: "left", whiteSpace: "normal", wordBreak: "break-word", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-primary)", cursor: "pointer" }}
          >
            {example}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>{error}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          type="submit"
          disabled={busy || text.trim().length < 2}
          style={{ ...BUTTON, flex: "1 1 140px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", opacity: busy || text.trim().length < 2 ? 0.55 : 1 }}
        >
          {busy ? `${COPY.startSubmit}…` : COPY.startSubmit}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setError(""); onCancel(); }}
          style={{ ...BUTTON, flex: "1 1 100px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}
        >
          {COPY.cancel}
        </button>
      </div>
    </form>
  );
}
