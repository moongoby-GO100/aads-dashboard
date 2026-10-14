"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { COPY } from "@/lib/automationCopy";
import AutomationStartForm from "./AutomationStartForm";

type Availability = "checking" | "on" | "off" | "hidden";

const PROBE_ID = "00000000-0000-0000-0000-000000000000";

const BUTTON: React.CSSProperties = {
  minHeight: 48, padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, boxSizing: "border-box", maxWidth: "100%",
};

export default function AutomationHomeEntry() {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);

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
        <AutomationStartForm onCancel={() => setOpen(false)} onDisabled={() => setAvailability("off")} />
      )}
    </section>
  );
}
