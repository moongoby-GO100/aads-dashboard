"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AutomationStartForm from "@/components/automation/AutomationStartForm";
import { api } from "@/lib/api";
import { COPY, errorSentence } from "@/lib/automationCopy";
import {
  AUTOMATION_TABS, actionsFor, countByTab, detailRows, filterByTab, lastRunText, nextRunText, parseAutomationList,
  type AutomationAction, type AutomationListItem, type AutomationListView, type AutomationStatus, type AutomationTab,
} from "@/lib/automationList";

type LoadState = "loading" | "ready" | "off" | "error";
type Note = { tone: "ok" | "error"; text: string };

const STATUS_COLOR: Record<AutomationStatus, string> = {
  available: "var(--success)",
  waiting: "var(--warning)",
  broken: "var(--danger)",
  expired: "var(--text-secondary)",
};

const BUTTON: React.CSSProperties = {
  minHeight: 48, padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, boxSizing: "border-box", maxWidth: "100%", cursor: "pointer",
};

const EMPTY_VIEW: AutomationListView = { items: [], unavailableSources: [] };

export default function MyAutomationsPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorText, setErrorText] = useState("");
  const [view, setView] = useState<AutomationListView>(EMPTY_VIEW);
  const [tab, setTab] = useState<AutomationTab>("all");
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [openDetails, setOpenDetails] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const result = await api.getAutomations();
    if (seq !== loadSeq.current) return;
    if (result.ok) {
      setView(parseAutomationList(result.data));
      setLoadState("ready");
      return;
    }
    if (result.status === 404) {
      setLoadState("off");
      return;
    }
    setErrorText(result.status === 403 ? errorSentence(403, result.code) : COPY.loadFailed);
    setLoadState((prev) => (prev === "ready" ? prev : "error"));
  }, []);

  useEffect(() => {
    // 첫 조회는 마운트 뒤 비동기로 시작한다. 결과 반영은 load 안의 순번 검사가 지킨다.
    void Promise.resolve().then(load);
  }, [load]);

  const retry = useCallback(() => {
    setLoadState("loading");
    void load();
  }, [load]);

  const act = useCallback(async (item: AutomationListItem, action: AutomationAction) => {
    if (action === "fix") {
      if (item.draftId) router.push(`/chat?automation_draft=${encodeURIComponent(item.draftId)}`);
      return;
    }
    if (busyKeys.includes(item.key)) return;
    setBusyKeys((prev) => [...prev, item.key]);
    setNotes((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    const call = action === "run" ? api.runAutomation : action === "pause" ? api.pauseAutomation : api.resumeAutomation;
    const result = await call(item.key);
    let note: Note;
    if (result.ok) {
      const text = action === "run" ? COPY.doneRunStarted : action === "pause" ? COPY.donePaused : COPY.doneResumed;
      note = { tone: "ok", text };
      void load();
    } else {
      if (result.status === 404 && result.code === "automation_drafts_disabled") setLoadState("off");
      note = { tone: "error", text: errorSentence(result.status, result.code) };
      if (result.status === 404 || result.status === 409) void load();
    }
    setNotes((prev) => ({ ...prev, [item.key]: note }));
    setBusyKeys((prev) => prev.filter((key) => key !== item.key));
  }, [busyKeys, load, router]);

  const toggleDetail = useCallback((key: string) => {
    setOpenDetails((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const counts = countByTab(view.items);
  const shown = filterByTab(view.items, tab);

  const actionLabel = (action: AutomationAction): string => {
    switch (action) {
      case "run": return COPY.listRunNow;
      case "pause": return COPY.listPause;
      case "resume": return COPY.listResume;
      default: return COPY.listFix;
    }
  };

  const card = (item: AutomationListItem) => {
    const actions = actionsFor(item);
    const busy = busyKeys.includes(item.key);
    const note = notes[item.key];
    const detailOpen = openDetails.includes(item.key);
    const rows = detailOpen ? detailRows(item) : [];
    return (
      <li
        key={item.key}
        data-testid="automation-list-item"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, boxSizing: "border-box", maxWidth: "100%", listStyle: "none" }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <h2 style={{ flex: "1 1 200px", minWidth: 0, margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
            {item.name || "-"}
          </h2>
          <span
            data-testid="automation-status-badge"
            style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: STATUS_COLOR[item.status], border: `1px solid ${STATUS_COLOR[item.status]}` }}
          >
            {item.statusLabel}
          </span>
        </div>
        <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 12, rowGap: 4, fontSize: 13, lineHeight: 1.5 }}>
          <dt style={{ color: "var(--text-secondary)" }}>{COPY.listLastRun}</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{lastRunText(item.lastRun)}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>{COPY.listNextRun}</dt>
          <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{nextRunText(item.nextRun)}</dd>
        </dl>
        {item.status === "broken" && !item.draftId && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{COPY.listFixOwner}</p>
        )}
        {(actions.length > 0 || item.detail) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {actions.map((action) => {
              const primary = action === "run" || action === "fix";
              return (
                <button
                  key={action}
                  type="button"
                  data-testid={`automation-action-${action}`}
                  disabled={busy}
                  onClick={() => void act(item, action)}
                  style={{
                    ...BUTTON, flex: "1 1 120px",
                    border: primary ? "none" : "1px solid var(--border)",
                    background: primary ? "var(--accent)" : "transparent",
                    color: primary ? "#fff" : "var(--text-primary)",
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  {busy ? COPY.listWorking : actionLabel(action)}
                </button>
              );
            })}
            {item.detail && (
              <button
                type="button"
                data-testid="automation-action-detail"
                aria-expanded={detailOpen}
                onClick={() => toggleDetail(item.key)}
                style={{ ...BUTTON, flex: "1 1 120px", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-primary)" }}
              >
                {detailOpen ? COPY.listDetailClose : COPY.listDetail}
              </button>
            )}
          </div>
        )}
        {note && (
          <div
            role={note.tone === "error" ? "alert" : "status"}
            style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: note.tone === "error" ? "var(--danger)" : "var(--success)", overflowWrap: "anywhere" }}
          >
            {note.text}
          </div>
        )}
        {rows.length > 0 && (
          <dl
            data-testid="automation-detail"
            style={{ margin: "12px 0 0", padding: 12, borderRadius: 8, background: "var(--bg-primary)", border: "1px solid var(--border)", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 12, rowGap: 4, fontSize: 13, lineHeight: 1.5 }}
          >
            {rows.map((row) => (
              <React.Fragment key={row.label}>
                <dt style={{ color: "var(--text-secondary)" }}>{row.label}</dt>
                <dd style={{ margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{row.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title={COPY.listTitle} />
      <div className="flex-1 overflow-auto p-4 md:p-6" style={{ paddingBottom: 112 }}>
        <div className="mx-auto max-w-3xl" style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{COPY.listTitle}</h1>
          <p style={{ margin: "4px 0 16px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{COPY.listLead}</p>

          {loadState === "loading" && (
            <p role="status" style={{ fontSize: 14, color: "var(--text-secondary)" }}>{COPY.listLoading}</p>
          )}

          {loadState === "off" && (
            <p role="status" data-testid="automation-list-off" style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {COPY.loadDisabled}
            </p>
          )}

          {loadState === "error" && (
            <div role="alert" style={{ fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 10px" }}>{errorText}</p>
              <button type="button" onClick={retry} style={{ ...BUTTON, border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)" }}>
                {COPY.retryLoad}
              </button>
            </div>
          )}

          {loadState === "ready" && (
            <>
              <div role="tablist" aria-label={COPY.listTabsLabel} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {AUTOMATION_TABS.map((entry) => {
                  const active = tab === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={`automation-tab-${entry.id}`}
                      onClick={() => setTab(entry.id)}
                      style={{
                        ...BUTTON, flex: "1 1 80px",
                        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: active ? "var(--accent)" : "transparent",
                        color: active ? "#fff" : "var(--text-primary)",
                      }}
                    >
                      {entry.label} {counts[entry.id]}
                    </button>
                  );
                })}
              </div>

              {view.unavailableSources.length > 0 && (
                <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--warning)", lineHeight: 1.5 }}>{COPY.listSomeMissing}</p>
              )}

              {shown.length === 0 ? (
                <p role="status" style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {view.items.length === 0 ? COPY.listEmpty : COPY.listEmptyTab}
                </p>
              ) : (
                <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  {shown.map(card)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {loadState !== "off" && !creating && (
        <button
          type="button"
          data-testid="automation-floating-create"
          onClick={() => setCreating(true)}
          style={{
            ...BUTTON, position: "fixed", right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 40,
            border: "none", background: "var(--accent)", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.3)",
          }}
        >
          {COPY.listFloating}
        </button>
      )}

      {creating && (
        <section
          data-testid="automation-create-sheet"
          aria-label={COPY.startTitle}
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "85vh", overflowY: "auto",
            boxSizing: "border-box", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            background: "var(--bg-card)", borderTop: "1px solid var(--border)", boxShadow: "0 -8px 24px rgba(0,0,0,.35)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{COPY.startTitle}</h2>
          <AutomationStartForm
            onCancel={() => setCreating(false)}
            onDisabled={() => { setCreating(false); setLoadState("off"); }}
          />
        </section>
      )}
    </div>
  );
}
