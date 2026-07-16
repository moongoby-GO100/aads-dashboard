"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BASE_URL, authHdrs, chatApi } from "@/app/chat/api";

type XTermRuntime = {
  cols: number;
  rows: number;
  textarea?: HTMLTextAreaElement;
  reset(): void;
  clear(): void;
  focus(): void;
  write(data: string): void;
  writeln(data: string): void;
  open(el: HTMLElement): void;
  loadAddon(addon: unknown): void;
  onData(cb: (data: string) => void): { dispose(): void };
  dispose(): void;
};

type FitAddonRuntime = {
  fit(): void;
};

let xtermRuntimePromise: Promise<{
  Terminal: new (opts: Record<string, unknown>) => XTermRuntime;
  FitAddon: new () => FitAddonRuntime;
  WebLinksAddon: new () => unknown;
}> | null = null;

async function loadXtermRuntime() {
  if (!xtermRuntimePromise) {
    xtermRuntimePromise = Promise.all([
      import("xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/addon-web-links"),
    ]).then(([xterm, fit, webLinks]) => ({
      Terminal: xterm.Terminal as new (opts: Record<string, unknown>) => XTermRuntime,
      FitAddon: fit.FitAddon as new () => FitAddonRuntime,
      WebLinksAddon: webLinks.WebLinksAddon as new () => unknown,
    }));
  }
  return xtermRuntimePromise;
}

type TerminalSession = {
  session_id: string;
  title: string;
  shell: string;
  cwd: string;
  session_mode: "container" | "host";
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
  session_mode?: "container" | "host";
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

export default function TerminalPane({
  activeSessionId,
  screenSize,
  panelOpen,
  standalone = false,
  preferredSessionId = null,
  initialCwd = "/root/aads",
  initialSessionMode = "host",
}: {
  activeSessionId: string | null;
  screenSize: string;
  panelOpen: boolean;
  standalone?: boolean;
  preferredSessionId?: string | null;
  initialCwd?: string;
  initialSessionMode?: "container" | "host";
}) {
  const isMobile = screenSize === "mobile";
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalNotice, setTerminalNotice] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(preferredSessionId);
  const [terminalCwd, setTerminalCwd] = useState(initialCwd);
  const [terminalSessionMode, setTerminalSessionMode] = useState<"container" | "host">(initialSessionMode);
  const [terminalMeta, setTerminalMeta] = useState<TerminalSession | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);

  const streamAbortRef = useRef<AbortController | null>(null);
  const terminalSeqRef = useRef(-1);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTermRuntime | null>(null);
  const fitAddonRef = useRef<FitAddonRuntime | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const inputTimerRef = useRef<number | null>(null);
  const pendingInputRef = useRef("");
  const inputQueueRef = useRef(Promise.resolve());
  const selectedTerminalIdRef = useRef<string | null>(preferredSessionId);
  const lastResizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  const selectedTerminal = useMemo(
    () => terminalSessions.find((session) => session.session_id === selectedTerminalId) || terminalMeta,
    [selectedTerminalId, terminalSessions, terminalMeta],
  );

  const terminalHeight = standalone
    ? "calc(100vh - 210px)"
    : isMobile
      ? "320px"
      : "360px";

  const writeTerminalLine = useCallback((text: string) => {
    const term = terminalRef.current;
    if (!term) return;
    term.writeln(text.replace(/\r?\n/g, "\r\n"));
  }, []);

  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const resizeTerminalSession = useCallback(async (sessionId: string, cols: number, rows: number) => {
    if (!sessionId || cols <= 0 || rows <= 0) return;
    if (lastResizeRef.current.cols === cols && lastResizeRef.current.rows === rows) return;
    lastResizeRef.current = { cols, rows };
    try {
      const nextMeta = await chatApi<TerminalSession>(`/terminal/sessions/${sessionId}/resize`, {
        method: "POST",
        body: JSON.stringify({ cols, rows }),
      });
      setTerminalMeta(nextMeta);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 크기 조정 실패");
    }
  }, []);

  const fitTerminal = useCallback((forceRemoteResize = false) => {
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon || !terminalHostRef.current) return;
    fitAddon.fit();
    focusTerminal();
    const sessionId = selectedTerminalIdRef.current;
    if (!sessionId) return;
    const cols = term.cols;
    const rows = term.rows;
    if (cols <= 0 || rows <= 0) return;
    if (forceRemoteResize) {
      lastResizeRef.current = { cols: 0, rows: 0 };
    }
    void resizeTerminalSession(sessionId, cols, rows);
  }, [focusTerminal, resizeTerminalSession]);

  const flushPendingInput = useCallback(() => {
    const sessionId = selectedTerminalIdRef.current;
    const payload = pendingInputRef.current;
    if (!sessionId || !payload) return;
    pendingInputRef.current = "";
    inputQueueRef.current = inputQueueRef.current
      .then(() =>
        chatApi(`/terminal/sessions/${sessionId}/input`, {
          method: "POST",
          body: JSON.stringify({ data: payload }),
        }).then(() => undefined),
      )
      .catch((error) => {
        setTerminalError(error instanceof Error ? error.message : "terminal 입력 전송 실패");
      });
  }, []);

  const scheduleInput = useCallback((data: string) => {
    if (!selectedTerminalIdRef.current) {
      setTerminalNotice("세션을 먼저 만들거나 선택하세요.");
      return;
    }
    pendingInputRef.current += data;
    const shouldFlushNow =
      data.includes("\r") ||
      data.includes("\u0003") ||
      data.includes("\u0004") ||
      pendingInputRef.current.length >= 64;
    if (inputTimerRef.current) {
      window.clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
    if (shouldFlushNow) {
      flushPendingInput();
      return;
    }
    inputTimerRef.current = window.setTimeout(() => {
      inputTimerRef.current = null;
      flushPendingInput();
    }, 180);
  }, [flushPendingInput]);

  const ensureTerminal = useCallback(async () => {
    if (terminalRef.current || !terminalHostRef.current || typeof window === "undefined") return;
    const runtime = await loadXtermRuntime();
    if (terminalRef.current || !terminalHostRef.current) return;
    const term = new runtime.Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      fontSize: isMobile ? 12 : 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: "#09111f",
        foreground: "#dbeafe",
        cursor: "#f8fafc",
        cursorAccent: "#09111f",
        selectionBackground: "rgba(96,165,250,0.35)",
      },
    });
    const fitAddon = new runtime.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new runtime.WebLinksAddon());
    term.open(terminalHostRef.current);
    term.onData((data) => {
      scheduleInput(data);
    });
    term.textarea?.setAttribute("aria-label", "AADS terminal input");
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    fitTerminal(true);
    if (!selectedTerminalIdRef.current) {
      writeTerminalLine("$ 세션을 선택하거나 새 세션을 만드세요.");
      writeTerminalLine("$ 터미널 영역을 클릭한 뒤 바로 입력할 수 있습니다.");
    }
  }, [fitTerminal, isMobile, scheduleInput, writeTerminalLine]);

  const refreshTerminalSessions = useCallback(async (preferredId?: string | null) => {
    setTerminalLoading(true);
    try {
      const sessions = await chatApi<TerminalSession[]>("/terminal/sessions");
      setTerminalSessions(sessions);
      setTerminalError(null);
      const nextSelectedId =
        preferredId ||
        preferredSessionId ||
        (sessions.some((item) => item.session_id === selectedTerminalIdRef.current) ? selectedTerminalIdRef.current : null) ||
        sessions.find((item) => item.status === "running")?.session_id ||
        sessions[0]?.session_id ||
        null;
      const nextMeta = sessions.find((item) => item.session_id === nextSelectedId) || null;
      selectedTerminalIdRef.current = nextSelectedId;
      setSelectedTerminalId(nextSelectedId);
      setTerminalMeta(nextMeta);
      if (nextMeta?.session_mode) setTerminalSessionMode(nextMeta.session_mode);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 세션 조회 실패");
    } finally {
      setTerminalLoading(false);
    }
  }, [preferredSessionId]);

  const handleTerminalEvent = useCallback((event: TerminalStreamEvent) => {
    terminalSeqRef.current = Math.max(terminalSeqRef.current, event.seq ?? -1);
    if (event.type === "output" && event.data) {
      terminalRef.current?.write(event.data);
      return;
    }
    if (event.type === "warning") {
      const message = event.message || event.code || "warning";
      setTerminalNotice(message);
      writeTerminalLine(`[warning] ${message}`);
      return;
    }
    if (event.type === "status") {
      setTerminalMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: (event.status as "running" | "exited" | undefined) || prev.status,
          session_mode: event.session_mode || prev.session_mode,
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
      writeTerminalLine(`[exit] returncode=${event.returncode ?? "-"}`);
      setTerminalMeta((prev) => (
        prev
          ? { ...prev, status: "exited", returncode: event.returncode ?? prev.returncode }
          : prev
      ));
      void refreshTerminalSessions(selectedTerminalIdRef.current);
    }
  }, [refreshTerminalSessions, writeTerminalLine]);

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
      const cols = Math.max(terminalRef.current?.cols || 120, 40);
      const rows = Math.max(terminalRef.current?.rows || 32, 10);
      const session = await chatApi<TerminalSession>("/terminal/sessions", {
        method: "POST",
        body: JSON.stringify({
          cwd: terminalCwd || "/root",
          shell: "/bin/bash",
          session_mode: terminalSessionMode,
          title: activeSessionId ? `chat-${activeSessionId.slice(0, 8)}` : "chat-terminal",
          cols,
          rows,
        }),
      });
      selectedTerminalIdRef.current = session.session_id;
      setSelectedTerminalId(session.session_id);
      setTerminalMeta(session);
      setTerminalNotice(null);
      setTerminalError(null);
      terminalSeqRef.current = -1;
      lastResizeRef.current = { cols: 0, rows: 0 };
      terminalRef.current?.reset();
      await refreshTerminalSessions(session.session_id);
      fitTerminal(true);
      focusTerminal();
      return session;
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 세션 생성 실패");
      return null;
    } finally {
      setTerminalBusy(false);
    }
  }, [activeSessionId, fitTerminal, focusTerminal, refreshTerminalSessions, terminalCwd, terminalSessionMode]);

  const executeTerminalCommand = useCallback(async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    let sessionId = selectedTerminalIdRef.current;
    if (!sessionId) {
      const created = await createTerminalSession();
      sessionId = created?.session_id || null;
    }
    if (!sessionId) return;
    setTerminalBusy(true);
    try {
      await chatApi(`/terminal/sessions/${sessionId}/execute`, {
        method: "POST",
        body: JSON.stringify({ command: trimmed }),
      });
      setTerminalNotice(null);
      focusTerminal();
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "명령 실행 실패");
    } finally {
      setTerminalBusy(false);
    }
  }, [createTerminalSession, focusTerminal]);

  const closeTerminalSession = useCallback(async () => {
    if (!selectedTerminalIdRef.current) return;
    setTerminalBusy(true);
    try {
      await chatApi(`/terminal/sessions/${selectedTerminalIdRef.current}/close`, {
        method: "POST",
      });
      streamAbortRef.current?.abort();
      selectedTerminalIdRef.current = null;
      setSelectedTerminalId(null);
      setTerminalMeta(null);
      terminalSeqRef.current = -1;
      terminalRef.current?.reset();
      writeTerminalLine("$ 세션이 종료되었습니다.");
      await refreshTerminalSessions(null);
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : "terminal 종료 실패");
    } finally {
      setTerminalBusy(false);
    }
  }, [refreshTerminalSessions, writeTerminalLine]);

  const clearTerminalOutput = useCallback(() => {
    terminalRef.current?.clear();
    focusTerminal();
  }, [focusTerminal]);

  const openStandaloneWindow = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (selectedTerminalId) params.set("session_id", selectedTerminalId);
    if (terminalCwd) params.set("cwd", terminalCwd);
    params.set("mode", selectedTerminal?.session_mode || terminalSessionMode);
    if (activeSessionId) params.set("chat_session_id", activeSessionId);
    const suffix = params.toString();
    window.open(`/chat/terminal${suffix ? `?${suffix}` : ""}`, "_blank", "noopener,noreferrer");
  }, [activeSessionId, selectedTerminal, selectedTerminalId, terminalCwd, terminalSessionMode]);

  useEffect(() => {
    selectedTerminalIdRef.current = selectedTerminalId;
  }, [selectedTerminalId]);

  useEffect(() => {
    if (!panelOpen) return;
    void ensureTerminal();
    void refreshTerminalSessions(preferredSessionId);
  }, [ensureTerminal, panelOpen, preferredSessionId, refreshTerminalSessions]);

  useEffect(() => {
    if (!panelOpen) return;
    const host = terminalHostRef.current;
    if (!host) return;
    void ensureTerminal();
    const resizeNow = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        fitTerminal();
      }, 90);
    };
    resizeNow();
    const observer = new ResizeObserver(() => resizeNow());
    observer.observe(host);
    window.addEventListener("resize", resizeNow);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeNow);
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [ensureTerminal, fitTerminal, panelOpen]);

  useEffect(() => {
    if (!panelOpen || !selectedTerminalId) return;
    terminalRef.current?.reset();
    terminalSeqRef.current = -1;
    pendingInputRef.current = "";
    lastResizeRef.current = { cols: 0, rows: 0 };
    fitTerminal(true);
    void startTerminalStream(selectedTerminalId);
    return () => {
      streamAbortRef.current?.abort();
    };
  }, [fitTerminal, panelOpen, selectedTerminalId, startTerminalStream]);

  useEffect(() => {
    if (!panelOpen) return;
    const interval = window.setInterval(() => {
      void refreshTerminalSessions(selectedTerminalIdRef.current);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [panelOpen, refreshTerminalSessions]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      if (inputTimerRef.current) window.clearTimeout(inputTimerRef.current);
      pendingInputRef.current = "";
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)" }}>
            {standalone ? "Chat Terminal Window" : "Chat Terminal"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
            {selectedTerminal
              ? `${selectedTerminal.cwd} / ${selectedTerminal.session_mode.toUpperCase()} / ${selectedTerminal.backend_mode.toUpperCase()} / ${selectedTerminal.status}`
              : "세션 선택 또는 생성"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={() => void refreshTerminalSessions(selectedTerminalIdRef.current)}
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
          {!standalone && (
            <button
              onClick={openStandaloneWindow}
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                background: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.28)",
                color: "#60a5fa",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              새 창
            </button>
          )}
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
        <div
          style={{
            display: "inline-flex",
            borderRadius: "10px",
            border: "1px solid var(--ct-border)",
            overflow: "hidden",
            background: "var(--ct-bg2)",
          }}
        >
          {(["host", "container"] as const).map((mode) => {
            const active = terminalSessionMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setTerminalSessionMode(mode)}
                style={{
                  padding: "8px 10px",
                  border: "none",
                  borderRight: mode === "host" ? "1px solid var(--ct-border)" : "none",
                  background: active ? "rgba(59,130,246,0.16)" : "transparent",
                  color: active ? "#93c5fd" : "var(--ct-text2)",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {mode === "host" ? "Host" : "Container"}
              </button>
            );
          })}
        </div>
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
                selectedTerminalIdRef.current = session.session_id;
                setSelectedTerminalId(session.session_id);
                setTerminalMeta(session);
                setTerminalSessionMode(session.session_mode);
                setTerminalNotice(null);
                setTerminalError(null);
                focusTerminal();
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
              {session.title} · {session.session_mode} · {session.backend_mode.toUpperCase()} · {session.status}
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

      <div
        style={{
          position: "relative",
          height: terminalHeight,
          borderRadius: "12px",
          border: "1px solid var(--ct-border)",
          background: "#09111f",
          overflow: "hidden",
        }}
      >
        <div
          ref={terminalHostRef}
          onClick={focusTerminal}
          style={{
            height: "100%",
            width: "100%",
            padding: "8px 10px",
          }}
        />
        {!selectedTerminal && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              color: "rgba(219,234,254,0.72)",
              fontSize: "12px",
              background: "linear-gradient(180deg, rgba(9,17,31,0.02), rgba(9,17,31,0.3))",
              textAlign: "center",
              padding: "24px",
              lineHeight: 1.6,
            }}
          >
            터미널 영역을 클릭한 뒤 바로 입력할 수 있습니다.
            <br />
            먼저 세션을 선택하거나 새 세션을 만드세요.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
        <button
          onClick={() => scheduleInput("\u0003")}
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
          onClick={clearTerminalOutput}
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
                onClick={() => void executeTerminalCommand(command)}
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
  );
}
