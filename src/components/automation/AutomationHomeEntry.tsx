"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AUTOMATION_EXAMPLES, COPY, errorSentence } from "@/lib/automationCopy";

type Availability = "checking" | "on" | "off" | "hidden";

const PROBE_ID = "00000000-0000-0000-0000-000000000000";

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 96, padding: "10px 12px", borderRadius: 8, boxSizing: "border-box",
  fontSize: 16, lineHeight: 1.5, resize: "vertical",
  border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)",
};

const BUTTON: React.CSSProperties = {
  minHeight: 48, padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, boxSizing: "border-box", maxWidth: "100%",
};

export default function AutomationHomeEntry() {
  const router = useRouter();
  const [availability, setAvailability] = useState<Availability>("checking");
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [probe, count] = await Promise.all([
        api.getAutomationDraft(PROBE_ID),
        api.getAutomationPendingCount(),
      ]);
      if (!alive) return;
      if (count.ok && Number.isFinite(count.data.pending)) setPending(Math.max(0, Math.trunc(count.data.pending)));
      if (probe.ok) setAvailability("on");
      else if (probe.status === 404 && probe.code === "automation_drafts_disabled") setAvailability("off");
      else if (probe.status === 401 || probe.status === 403) setAvailability("hidden");
      else setAvailability("on");
    })();
    return () => { alive = false; };
  }, []);

  const submit = useCallback(async () => {
    const intent = text.trim();
    if (intent.length < 2 || busy) return;
    setBusy(true);
    setError("");
    const result = await api.createAutomationDraft(intent);
    if (!result.ok) {
      setBusy(false);
      if (result.status === 404 && result.code === "automation_drafts_disabled") setAvailability("off");
      setError(errorSentence(result.status, result.code));
      return;
    }
    router.push(`/chat?automation_draft=${encodeURIComponent(result.data.draft.id)}`);
  }, [text, busy, router]);

  if (availability === "checking" && pending === 0) return null;
  if (availability === "hidden" && pending === 0) return null;

  return (
    <section
      data-testid="automation-home-entry"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, boxSizing: "border-box", maxWidth: "100%" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{COPY.homeButton}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{COPY.homeLead}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {pending > 0 && (
            <span
              role="status"
              data-testid="automation-pending-badge"
              style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "rgba(245,158,11,.16)", color: "var(--warning)", border: "1px solid rgba(245,158,11,.4)" }}
            >
              {COPY.homeBadge(pending)}
            </span>
          )}
          {availability === "off" ? (
            <span role="status" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{COPY.loadDisabled}</span>
          ) : availability === "on" ? (
            <button
              type="button"
              data-testid="automation-home-button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              style={{ ...BUTTON, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
            >
              {COPY.homeButton}
            </button>
          ) : null}
        </div>
      </div>

      {availability === "on" && open && (
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
              onClick={() => { setOpen(false); setError(""); }}
              style={{ ...BUTTON, flex: "1 1 100px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}
            >
              {COPY.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
