"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BASE_URL, authHdrs, chatApi } from "@/app/chat/api";

type WorkspaceChangeItem = {
  session_id: string;
  project: string;
  repo: string;
  file_path: string;
  source_tool?: string;
  change_summary?: string;
  status: "dirty" | "committed" | "pushed" | "deployed" | string;
  last_error?: string;
  commit_sha?: string | null;
  commit_message?: string | null;
  updated_at?: string | null;
  last_modified_at?: string | null;
  finalized_at?: string | null;
  pushed_at?: string | null;
  deployed_at?: string | null;
};

type WorkspaceChangeListResponse = {
  items: WorkspaceChangeItem[];
  count: number;
};

type WorkspaceFinalizeGroup = {
  project: string;
  repo: string;
  files: string[];
  ok: boolean;
  status: string;
  commit_sha?: string | null;
  commit_message?: string;
  detail?: string;
};

type WorkspaceFinalizeResponse = {
  ok: boolean;
  session_id: string;
  reason: string;
  groups: WorkspaceFinalizeGroup[];
  pending_groups: number;
};

type TerminalSession = {
  session_id: string;
  title: string;
  shell: string;
  cwd: string;
  status: "running" | "exited";
  backend_mode: "pty" | "pipe";
  pid?: number | null;
  returncode?: number | null;
  cols: number;
  rows: number;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  last_seq: number;
  output_bytes: number;
  recent_commands: string[];
};

type TerminalStreamEvent = {
  session_id: string;
  seq: number;
  type: string;
  timestamp: string;
  data?: string;
  message?: string;
  code?: string;
  status?: string;
  returncode?: number;
  cwd?: string;
  shell?: string;
  backend_mode?: "pty" | "pipe";
  pid?: number;
  cols?: number;
  rows?: number;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function summarizeFinalize(result: WorkspaceFinalizeResponse): string {
  if (!result.groups.length) return "반영할 변경 없음";
  return result.groups
    .map((group) => {
      const sha = group.commit_sha ? ` ${group.commit_sha.slice(0, 8)}` : "";
      return `${group.repo}:${group.status}${sha}`;
    })
    .join(" | ");
}

function statusTone(status: string): { color: string; bg: string; border: string } {
  switch (status) {
    case "dirty":
      return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" };
    case "committed":
      return { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.28)" };
    case "pushed":
      return { color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
    case "deployed":
      return { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.28)" };
    default:
      return { color: "var(--ct-text2)", bg: "var(--ct-hover)", border: "var(--ct-border)" };
  }
}

function appendTrimmed(prev: string, chunk: string, maxChars = 120000): string {
  const next = `${prev}${chunk}`;
  if (next.length <= maxChars) return next;
  return next.slice(next.length - maxChars);
}

function parseSseChunk(buffer: string): { remaining: string; events: TerminalStreamEvent[] } {
  const events: TerminalStreamEvent[] = [];
  let working = buffer.replace(/\r\n/g, "\n");
  while (true) {
    const boundary = working.indexOf("\n\n");
    if (boundary < 0) break;
    const rawBlock = working.slice(0, boundary);
    working = working.slice(boundary + 2);
    const trimmed = rawBlock.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;

    const lines = rawBlock.split("\n");
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    try {
      const parsed = JSON.parse(dataLines.join("\n")) as TerminalStreamEvent;
      events.push(parsed);
    } catch {
      continue;
    }
  }
  return { remaining: working, events };
}

export default function ChatOpsDock({
  activeSessionId,
  screenSize,
}: {
  activeSessionId: string | null;
  screenSize: string;
}) {
  const isMobile = screenSize === "mobile";
  const [showWorkspacePanel, setShowWorkspacePanel] = useState(false);
  const [showTerminalPanel, setShowTerminalPanel] = useState(false);

  const [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChangeItem[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeSummary, setFinalizeSummary] = useState<string | null>(null);

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalNotice, setTerminalNotice] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalCwd, setTerminalCwd] = useState("/root/aads");
  const [terminalMeta, setTerminalMeta] = useState<TerminalSession | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalBusy, setTerminalBusy] = useState(false);

  const streamAbortRef = useRef<AbortController | null>(null);
  const terminalOutputRef = useRef("");
  const terminalSeqRef = useRef(-1);
  const terminalOutputElRef = useRef<HTMLPreElement | null>(null);

  const workspaceSummary = useMemo(() => {
    return workspaceChanges.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
  }, [workspaceChanges]);

  const selectedTerminal = useMemo(
    () => terminalSessions.find((session) => session.session_id === selectedTerminalId) || terminalMeta,
    [selectedTerminalId, terminalSessions, terminalMeta],
  );

  const workspacePanelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: "12px",
        right: "12px",
        bottom: "96px",
        maxHeight: "65vh",
      }
    : {
        position: "absolute",
        left: 0,
        bottom: "calc(100% + 8px)",
        width: "min(460px, 88vw)",
        maxHeight: "68vh",
      };

  const terminalPanelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: "12px",
        right: "12px",
        bottom: "96px",
        maxHeight: "72vh",
      }
    : {
        position: "absolute",
        left: 0,
        bottom: "calc(100% + 8px)",
        width: "min(540px, 92vw)",
        maxHeight: "72vh",
      };

  const loadWorkspaceChanges = useCallback(async (silent = false) => {
    if (!activeSessionId) {
      setWorkspaceChanges([]);
      setWorkspaceError(null);
      return;
    }
    if (!silent) setWorkspaceLoading(true);
    try {
      const query = `/ops/workspace-changes?session_id=${encodeURIComponent(activeSessionId)}&project=AADS`;
      const result = await chatApi<WorkspaceChangeListResponse>(query);
      setWorkspaceChanges(result.items || []);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "workspace 상태 조회 실패");
    } finally {
      if (!silent) setWorkspaceLoading(false);
    }
  }, [activeSessionId]);

  const finalizeWorkspaceChanges = useCallback(async () => {
    if (!activeSessionId) return;
    setFinalizeLoading(true);
    setFinalizeSummary(null);
    try {
      const result = await chatApi<WorkspaceFinalizeResponse>("/ops/workspace-changes/finalize", {
        method: "POST",
        body: JSON.stringify({
          session_id: activeSessionId,
          project: "AADS",
          reason: "chat_ui_manual_finalize",
        }),
      });
      setFinalizeSummary(summarizeFinalize(result));
      await loadWorkspaceChanges(true);
    } catch (error) {
      setFinalizeSummary(error instanceof Error ? error.message : "finalize 실패");
    } finally {
      setFinalizeLoading(false);
    }
  }, [activeSessionId, loadWorkspaceChanges]);

  const refreshTerminalSessions = useCallback(async (preferredSessionId?: string | null) => {
    setTerminalLoading(true);
    try {
      const sessions = await chatApi<TerminalSession[]>("/terminal/sessions");
      setTerminalSessions(sessions);
      setTerminalError(null);
      const nextSelectedId =
        preferredSessionId ||
        (sessions.some((item) => item.session_id === selectedTerminalId) ? selectedTerminalId : null) ||
        sessions.find((item) => item.status === "running")?.session_id ||
        sessions[0]?.session_id ||
        null;
      setSelectedTerminalId(nextSelectedId);
      setTerminalMeta(sessions.find((item) => item.session_id === nextSelectedId) || null);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 세션 조회 실패");
    } finally {
      setTerminalLoading(false);
    }
  }, [selectedTerminalId]);

  const appendTerminalOutput = useCallback((chunk: string) => {
    terminalOutputRef.current = appendTrimmed(terminalOutputRef.current, chunk);
    setTerminalOutput(terminalOutputRef.current);
  }, []);

  const handleTerminalEvent = useCallback((event: TerminalStreamEvent) => {
    terminalSeqRef.current = Math.max(terminalSeqRef.current, event.seq ?? -1);
    if (event.type === "output" && event.data) {
      appendTerminalOutput(event.data);
      return;
    }
    if (event.type === "warning") {
      const message = event.message || event.code || "warning";
      setTerminalNotice(message);
      appendTerminalOutput(`\n[warning] ${message}\n`);
      return;
    }
    if (event.type === "status") {
      setTerminalMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: (event.status as "running" | "exited" | undefined) || prev.status,
          backend_mode: event.backend_mode || prev.backend_mode,
          cwd: event.cwd || prev.cwd,
          shell: event.shell || prev.shell,
          pid: event.pid ?? prev.pid,
          cols: event.cols ?? prev.cols,
          rows: event.rows ?? prev.rows,
        };
      });
      return;
    }
    if (event.type === "exit") {
      appendTerminalOutput(`\n[exit] returncode=${event.returncode ?? "-"}\n`);
      setTerminalMeta((prev) => (prev ? { ...prev, status: "exited", returncode: event.returncode ?? prev.returncode } : prev));
      void refreshTerminalSessions(selectedTerminalId);
    }
  }, [appendTerminalOutput, refreshTerminalSessions, selectedTerminalId]);

  const startTerminalStream = useCallback(async (sessionId: string) => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setTerminalError(null);
    setTerminalNotice(null);

    try {
      const suffix = terminalSeqRef.current >= 0 ? `?since_seq=${terminalSeqRef.current}` : "";
      const response = await fetch(`${BASE_URL}/terminal/sessions/${sessionId}/stream${suffix}`, {
        headers: {
          ...authHdrs(),
        },
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
      if (!response.ok || !response.body) throw new Error(`terminal stream 실패: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remaining;
        for (const event of parsed.events) {
          if (event.session_id === sessionId) handleTerminalEvent(event);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setTerminalError(error instanceof Error ? error.message : "terminal stream 연결 실패");
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
    }
  }, [handleTerminalEvent]);

  const createTerminalSession = useCallback(async (): Promise<TerminalSession | null> => {
    setTerminalBusy(true);
    try {
      const session = await chatApi<TerminalSession>("/terminal/sessions", {
        method: "POST",
        body: JSON.stringify({
          cwd: terminalCwd || "/root",
          shell: "/bin/bash",
          title: activeSessionId ? `chat-${activeSessionId.slice(0, 8)}` : "chat-terminal",
          cols: 120,
          rows: 32,
        }),
      });
      setSelectedTerminalId(session.session_id);
      setTerminalMeta(session);
      setTerminalNotice(null);
      setTerminalOutput("");
      terminalOutputRef.current = "";
      terminalSeqRef.current = -1;
      await refreshTerminalSessions(session.session_id);
      return session;
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 세션 생성 실패");
      return null;
    } finally {
      setTerminalBusy(false);
    }
  }, [activeSessionId, refreshTerminalSessions, terminalCwd]);

  const executeTerminalCommand = useCallback(async () => {
    if (!terminalCommand.trim()) return;
    let sessionId = selectedTerminalId;
    if (!sessionId) {
      const created = await createTerminalSession();
      sessionId = created?.session_id || null;
    }
    if (!sessionId) return;
    setTerminalBusy(true);
    try {
      await chatApi(`/terminal/sessions/${sessionId}/execute`, {
        method: "POST",
        body: JSON.stringify({ command: terminalCommand.trim() }),
      });
      setTerminalCommand("");
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "명령 실행 실패");
    } finally {
      setTerminalBusy(false);
    }
  }, [createTerminalSession, selectedTerminalId, terminalCommand]);

  const sendTerminalSignal = useCallback(async (data: string) => {
    if (!selectedTerminalId) return;
    setTerminalBusy(true);
    try {
      await chatApi(`/terminal/sessions/${selectedTerminalId}/input`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 입력 전송 실패");
    } finally {
      setTerminalBusy(false);
    }
  }, [selectedTerminalId]);

  const closeTerminalSession = useCallback(async () => {
    if (!selectedTerminalId) return;
    setTerminalBusy(true);
    try {
      await chatApi(`/terminal/sessions/${selectedTerminalId}/close`, {
        method: "POST",
      });
      streamAbortRef.current?.abort();
      await refreshTerminalSessions(null);
      setSelectedTerminalId(null);
      setTerminalMeta(null);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 종료 실패");
    } finally {
      setTerminalBusy(false);
    }
  }, [refreshTerminalSessions, selectedTerminalId]);

  useEffect(() => {
    if (!showWorkspacePanel) return;
    void loadWorkspaceChanges();
    const interval = window.setInterval(() => {
      void loadWorkspaceChanges(true);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceChanges, showWorkspacePanel]);

  useEffect(() => {
    if (!showTerminalPanel) return;
    void refreshTerminalSessions();
    const interval = window.setInterval(() => {
      void refreshTerminalSessions(selectedTerminalId);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [refreshTerminalSessions, selectedTerminalId, showTerminalPanel]);

  useEffect(() => {
    if (!showTerminalPanel || !selectedTerminalId) return;
    setTerminalOutput("");
    terminalOutputRef.current = "";
    terminalSeqRef.current = -1;
    void startTerminalStream(selectedTerminalId);
    return () => {
      streamAbortRef.current?.abort();
    };
  }, [selectedTerminalId, showTerminalPanel, startTerminalStream]);

  useEffect(() => {
    if (!terminalOutputElRef.current) return;
    terminalOutputElRef.current.scrollTop = terminalOutputElRef.current.scrollHeight;
  }, [terminalOutput]);

  useEffect(() => {
    if (!activeSessionId) {
      setWorkspaceChanges([]);
      setFinalizeSummary(null);
    }
  }, [activeSessionId]);

  const pendingCount = (workspaceSummary.dirty || 0) + (workspaceSummary.committed || 0);

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => {
            setShowWorkspacePanel((prev) => !prev);
            setShowTerminalPanel(false);
          }}
          style={{
            fontSize: "11px",
            whiteSpace: "nowrap",
            padding: "4px 10px",
            borderRadius: "10px",
            background: pendingCount > 0 ? "rgba(245,158,11,0.14)" : "var(--ct-hover)",
            color: pendingCount > 0 ? "#f59e0b" : "var(--ct-text2)",
            border: `1px solid ${pendingCount > 0 ? "rgba(245,158,11,0.35)" : "var(--ct-border)"}`,
            cursor: "pointer",
          }}
        >
          작업 상태{pendingCount > 0 ? ` ${pendingCount}` : ""}
        </button>
        {showWorkspacePanel && (
          <div
            style={{
              ...workspacePanelStyle,
              zIndex: 40,
              overflow: "hidden",
              background: "var(--ct-panel)",
              border: "1px solid var(--ct-border)",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.32)",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)" }}>Workspace Change 상태</div>
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
                  session {activeSessionId ? activeSessionId.slice(0, 8) : "-"} / pending {pendingCount}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => void loadWorkspaceChanges()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "var(--ct-hover)",
                    border: "1px solid var(--ct-border)",
                    color: "var(--ct-text2)",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  새로고침
                </button>
                <button
                  onClick={() => void finalizeWorkspaceChanges()}
                  disabled={!activeSessionId || finalizeLoading || workspaceLoading || workspaceChanges.length === 0}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: finalizeLoading ? "#6b7280" : "var(--ct-accent)",
                    border: "none",
                    color: "#fff",
                    cursor: !activeSessionId || finalizeLoading || workspaceChanges.length === 0 ? "not-allowed" : "pointer",
                    opacity: !activeSessionId || finalizeLoading || workspaceChanges.length === 0 ? 0.5 : 1,
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {finalizeLoading ? "반영중..." : "Finalize"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
              {["dirty", "committed", "pushed", "deployed"].map((status) => {
                const tone = statusTone(status);
                return (
                  <span
                    key={status}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      color: tone.color,
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                    }}
                  >
                    {status} {workspaceSummary[status] || 0}
                  </span>
                );
              })}
            </div>

            {finalizeSummary && (
              <div style={{
                marginBottom: "10px",
                padding: "8px 10px",
                borderRadius: "10px",
                fontSize: "11px",
                lineHeight: 1.5,
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.18)",
                color: "var(--ct-text2)",
              }}>
                {finalizeSummary}
              </div>
            )}

            <div style={{ maxHeight: "48vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {!activeSessionId && (
                <div style={{ padding: "10px", borderRadius: "10px", background: "var(--ct-bg2)", color: "var(--ct-text2)", fontSize: "12px" }}>
                  활성 채팅 세션이 없습니다. 파일 수정이 기록된 세션에서 확인 가능합니다.
                </div>
              )}
              {workspaceLoading && <div style={{ color: "var(--ct-text2)", fontSize: "12px" }}>불러오는 중...</div>}
              {workspaceError && <div style={{ color: "#ef4444", fontSize: "12px" }}>{workspaceError}</div>}
              {!workspaceLoading && activeSessionId && workspaceChanges.length === 0 && !workspaceError && (
                <div style={{ padding: "10px", borderRadius: "10px", background: "var(--ct-bg2)", color: "var(--ct-text2)", fontSize: "12px" }}>
                  기록된 변경이 없습니다.
                </div>
              )}
              {workspaceChanges.map((item) => {
                const tone = statusTone(item.status);
                return (
                  <div
                    key={`${item.repo}:${item.file_path}`}
                    style={{
                      background: "var(--ct-bg2)",
                      border: "1px solid var(--ct-border)",
                      borderRadius: "12px",
                      padding: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)", wordBreak: "break-all" }}>
                          {item.file_path}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "4px" }}>
                          {item.repo} {item.source_tool ? `· ${item.source_tool}` : ""} · {formatDate(item.updated_at || item.last_modified_at)}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                      }}>
                        {item.status}
                      </span>
                    </div>
                    {item.change_summary && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ct-text2)", lineHeight: 1.5 }}>
                        {item.change_summary}
                      </div>
                    )}
                    {(item.commit_sha || item.deployed_at || item.last_error) && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ct-text2)", lineHeight: 1.5 }}>
                        {item.commit_sha ? `SHA ${item.commit_sha.slice(0, 8)}` : ""}
                        {item.deployed_at ? `${item.commit_sha ? " · " : ""}배포 ${formatDate(item.deployed_at)}` : ""}
                        {item.last_error ? (
                          <div style={{ marginTop: "4px", color: "#ef4444", wordBreak: "break-word" }}>{item.last_error}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button
          onClick={() => {
            setShowTerminalPanel((prev) => !prev);
            setShowWorkspacePanel(false);
          }}
          style={{
            fontSize: "11px",
            whiteSpace: "nowrap",
            padding: "4px 10px",
            borderRadius: "10px",
            background: selectedTerminal?.backend_mode === "pty" ? "rgba(34,197,94,0.14)" : "var(--ct-hover)",
            color: selectedTerminal?.backend_mode === "pty" ? "#22c55e" : "var(--ct-text2)",
            border: `1px solid ${selectedTerminal?.backend_mode === "pty" ? "rgba(34,197,94,0.35)" : "var(--ct-border)"}`,
            cursor: "pointer",
          }}
        >
          Terminal{selectedTerminal ? ` ${selectedTerminal.backend_mode.toUpperCase()}` : ""}
        </button>
        {showTerminalPanel && (
          <div
            style={{
              ...terminalPanelStyle,
              zIndex: 40,
              overflow: "hidden",
              background: "var(--ct-panel)",
              border: "1px solid var(--ct-border)",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.32)",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)" }}>Chat Terminal</div>
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
                  {selectedTerminal
                    ? `${selectedTerminal.cwd} / ${selectedTerminal.backend_mode.toUpperCase()} / ${selectedTerminal.status}`
                    : "세션 선택 또는 생성"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => void refreshTerminalSessions(selectedTerminalId)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "var(--ct-hover)",
                    border: "1px solid var(--ct-border)",
                    color: "var(--ct-text2)",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  새로고침
                </button>
                <button
                  onClick={() => void createTerminalSession()}
                  disabled={terminalBusy}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "var(--ct-accent)",
                    border: "none",
                    color: "#fff",
                    cursor: terminalBusy ? "not-allowed" : "pointer",
                    opacity: terminalBusy ? 0.6 : 1,
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  새 세션
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
              <input
                value={terminalCwd}
                onChange={(event) => setTerminalCwd(event.target.value)}
                placeholder="/root/aads"
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "8px 10px",
                  borderRadius: "10px",
                  border: "1px solid var(--ct-border)",
                  background: "var(--ct-bg2)",
                  color: "var(--ct-text)",
                  fontSize: "12px",
                }}
              />
              {selectedTerminal && (
                <button
                  onClick={() => void closeTerminalSession()}
                  disabled={terminalBusy}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(239,68,68,0.28)",
                    background: "rgba(239,68,68,0.12)",
                    color: "#ef4444",
                    cursor: terminalBusy ? "not-allowed" : "pointer",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  종료
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
              {terminalSessions.map((session) => {
                const active = session.session_id === selectedTerminalId;
                return (
                  <button
                    key={session.session_id}
                    onClick={() => {
                      setSelectedTerminalId(session.session_id);
                      setTerminalMeta(session);
                      setTerminalNotice(null);
                      setTerminalError(null);
                    }}
                    style={{
                      padding: "5px 8px",
                      borderRadius: "999px",
                      border: `1px solid ${active ? "rgba(99,102,241,0.35)" : "var(--ct-border)"}`,
                      background: active ? "rgba(99,102,241,0.14)" : "var(--ct-hover)",
                      color: active ? "var(--ct-text)" : "var(--ct-text2)",
                      cursor: "pointer",
                      fontSize: "11px",
                      maxWidth: "100%",
                    }}
                    title={`${session.cwd} / ${session.shell}`}
                  >
                    {session.title} · {session.backend_mode.toUpperCase()} · {session.status}
                  </button>
                );
              })}
              {!terminalLoading && terminalSessions.length === 0 && (
                <span style={{ fontSize: "11px", color: "var(--ct-text2)" }}>세션 없음</span>
              )}
            </div>

            {terminalNotice && (
              <div style={{
                marginBottom: "8px",
                padding: "8px 10px",
                borderRadius: "10px",
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.22)",
                color: "#f59e0b",
                fontSize: "11px",
              }}>
                {terminalNotice}
              </div>
            )}
            {terminalError && (
              <div style={{
                marginBottom: "8px",
                padding: "8px 10px",
                borderRadius: "10px",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.22)",
                color: "#ef4444",
                fontSize: "11px",
                wordBreak: "break-word",
              }}>
                {terminalError}
              </div>
            )}

            <pre
              ref={terminalOutputElRef}
              style={{
                margin: 0,
                height: isMobile ? "240px" : "280px",
                overflowY: "auto",
                borderRadius: "12px",
                border: "1px solid var(--ct-border)",
                background: "#09111f",
                color: "#dbeafe",
                padding: "12px",
                fontSize: "12px",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              }}
            >
              {terminalOutput || "$ terminal output will appear here\n"}
            </pre>

            <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
              <input
                value={terminalCommand}
                onChange={(event) => setTerminalCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void executeTerminalCommand();
                  }
                }}
                placeholder="명령 입력 후 Enter"
                style={{
                  flex: 1,
                  minWidth: "220px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--ct-border)",
                  background: "var(--ct-bg2)",
                  color: "var(--ct-text)",
                  fontSize: "12px",
                }}
              />
              <button
                onClick={() => void executeTerminalCommand()}
                disabled={terminalBusy || !terminalCommand.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--ct-accent)",
                  color: "#fff",
                  cursor: terminalBusy || !terminalCommand.trim() ? "not-allowed" : "pointer",
                  opacity: terminalBusy || !terminalCommand.trim() ? 0.5 : 1,
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                실행
              </button>
            </div>

            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => void sendTerminalSignal("\u0003")}
                disabled={!selectedTerminalId || terminalBusy}
                style={{
                  padding: "6px 10px",
                  borderRadius: "9px",
                  border: "1px solid rgba(239,68,68,0.22)",
                  background: "rgba(239,68,68,0.12)",
                  color: "#ef4444",
                  cursor: !selectedTerminalId || terminalBusy ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  opacity: !selectedTerminalId || terminalBusy ? 0.5 : 1,
                }}
              >
                Ctrl+C
              </button>
              <button
                onClick={() => {
                  terminalOutputRef.current = "";
                  setTerminalOutput("");
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: "9px",
                  border: "1px solid var(--ct-border)",
                  background: "var(--ct-hover)",
                  color: "var(--ct-text2)",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                출력 지우기
              </button>
              {selectedTerminal && (
                <span style={{ alignSelf: "center", fontSize: "11px", color: "var(--ct-text2)" }}>
                  PID {selectedTerminal.pid || "-"} · last {formatDate(selectedTerminal.updated_at)}
                </span>
              )}
            </div>

            {selectedTerminal?.recent_commands?.length ? (
              <div style={{ marginTop: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--ct-text)", marginBottom: "6px" }}>최근 명령</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {selectedTerminal.recent_commands.slice(-6).reverse().map((command, index) => (
                    <button
                      key={`${command}-${index}`}
                      onClick={() => setTerminalCommand(command)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "999px",
                        border: "1px solid var(--ct-border)",
                        background: "var(--ct-hover)",
                        color: "var(--ct-text2)",
                        cursor: "pointer",
                        fontSize: "11px",
                        maxWidth: "100%",
                      }}
                      title={command}
                    >
                      {command}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
