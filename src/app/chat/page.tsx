"use client";
import { useState, useEffect, useRef } from "react";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "@/components/chat/ModelSelector";
import { CodePanel } from "@/components/CodePanel";
import { useDiffApproval } from "@/hooks/useDiffApproval";
import "@/styles/code-editor.css";

// ══════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════
interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}
interface ChatSession {
  id: string;
  workspace_id: string;
  title: string;
  current_model: string;
  created_at: string;
  last_active_at: string;
  pinned: boolean;
  message_count: number;
  cost_total?: string | number;
}
interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  created_at?: string;
}
interface Artifact {
  id: string;
  session_id: string;
  artifact_type: "report" | "code" | "chart" | "dashboard" | "text";
  title: string;
  content: string;
  created_at: string;
}
type Theme = "dark" | "light";
type ArtifactMode = "full" | "mini" | "hidden";
type ArtifactTab = "report" | "code" | "chart" | "dashboard";
type ScreenSize = "desktop" | "tablet" | "mobile";

// ══════════════════════════════════════════════════════════════════
// API helpers
// ══════════════════════════════════════════════════════════════════
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aads_token");
}
function authHdrs(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function chatApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHdrs(),
      ...((opts?.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ══════════════════════════════════════════════════════════════════
// Theme CSS variables
// ══════════════════════════════════════════════════════════════════
const DARK: Record<string, string> = {
  "--ct-bg": "#0f0f23",
  "--ct-sb": "#1a1a2e",
  "--ct-card": "#16213e",
  "--ct-input": "#1a1a2e",
  "--ct-border": "#2d2d4a",
  "--ct-accent": "#6C63FF",
  "--ct-accent-h": "#5A52E0",
  "--ct-text": "#e2e8f0",
  "--ct-text2": "#8892a4",
  "--ct-user": "#6C63FF",
  "--ct-ai": "#1e1e3a",
  "--ct-code": "#0a0a1a",
  "--ct-hover": "#232340",
};
const LIGHT: Record<string, string> = {
  "--ct-bg": "#f8f9fa",
  "--ct-sb": "#ffffff",
  "--ct-card": "#ffffff",
  "--ct-input": "#ffffff",
  "--ct-border": "#e2e8f0",
  "--ct-accent": "#4A45B0",
  "--ct-accent-h": "#3c38a0",
  "--ct-text": "#1a202c",
  "--ct-text2": "#718096",
  "--ct-user": "#4A45B0",
  "--ct-ai": "#f0f0f8",
  "--ct-code": "#f1f5f9",
  "--ct-hover": "#e8e8f0",
};

// ══════════════════════════════════════════════════════════════════
// Markdown renderer
// ══════════════════════════════════════════════════════════════════
function processInline(text: string): React.ReactNode {
  // Split by inline code first
  const codeParts = text.split(/(`[^`\n]+`)/g);
  return codeParts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          style={{
            background: "var(--ct-code)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "90%",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    // Split by links [text](url) — but not images ![alt](url)
    const linkParts = part.split(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g);
    // linkParts: [before, text, url, after, text, url, ...]
    const withLinks: React.ReactNode[] = [];
    for (let li = 0; li < linkParts.length; li += 3) {
      const seg = linkParts[li] || "";
      if (seg) withLinks.push(<span key={`${i}-l${li}`}>{seg}</span>);
      if (li + 2 < linkParts.length) {
        withLinks.push(
          <a
            key={`${i}-a${li}`}
            href={linkParts[li + 2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--ct-accent)", textDecoration: "underline" }}
          >
            {linkParts[li + 1]}
          </a>
        );
      }
    }
    // Now process bold within each text span
    return withLinks.map((node, wi) => {
      if (typeof node === "object" && node !== null && (node as any).type === "a") return node;
      const raw = typeof node === "string" ? node : ((node as any)?.props?.children ?? "");
      if (typeof raw !== "string" || !raw) return node;
      const boldParts = raw.split(/(\*\*[^*\n]+\*\*)/g);
      return boldParts.map((bp: string, j: number) =>
        bp.startsWith("**") && bp.endsWith("**") ? (
          <strong key={`${i}-${wi}-${j}`}>{bp.slice(2, -2)}</strong>
        ) : (
          <span key={`${i}-${wi}-${j}`}>{bp}</span>
        )
      );
    });
  });
}

function InlineMd({ text }: { text: string }) {
  const lines = text.split("\n");

  // Group consecutive lines starting with | into table blocks
  const blocks: { type: "lines" | "table"; rows: string[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith("|")) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableRows.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", rows: tableRows });
    } else {
      if (blocks.length === 0 || blocks[blocks.length - 1].type !== "lines") {
        blocks.push({ type: "lines", rows: [] });
      }
      blocks[blocks.length - 1].rows.push(lines[i]);
      i++;
    }
  }

  const parseTableCells = (row: string) =>
    row.split("|").slice(1, -1).map((c) => c.trim());

  const isSeparatorRow = (row: string) =>
    /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?\s*$/.test(row.trim());

  const renderLine = (line: string, li: number, total: number) => {
    // Images: ![alt](url)
    if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (m) {
        return (
          <img
            key={li}
            src={m[2]}
            alt={m[1]}
            style={{
              maxWidth: "100%",
              borderRadius: "8px",
              marginTop: "8px",
              marginBottom: "8px",
              display: "block",
            }}
          />
        );
      }
    }
    if (line.startsWith("### "))
      return (
        <div
          key={li}
          style={{ fontWeight: 700, fontSize: "14px", marginTop: "10px", marginBottom: "4px" }}
        >
          {processInline(line.slice(4))}
        </div>
      );
    if (line.startsWith("## "))
      return (
        <div
          key={li}
          style={{ fontWeight: 700, fontSize: "15px", marginTop: "12px", marginBottom: "6px" }}
        >
          {processInline(line.slice(3))}
        </div>
      );
    if (line.startsWith("# "))
      return (
        <div
          key={li}
          style={{ fontWeight: 700, fontSize: "17px", marginTop: "14px", marginBottom: "8px" }}
        >
          {processInline(line.slice(2))}
        </div>
      );
    if (line.match(/^[-*] /))
      return (
        <div key={li} style={{ paddingLeft: "16px", display: "flex", gap: "6px" }}>
          <span>•</span>
          <span>{processInline(line.slice(2))}</span>
        </div>
      );
    if (line.match(/^\d+\. /))
      return (
        <div key={li} style={{ paddingLeft: "16px" }}>
          {processInline(line)}
        </div>
      );
    return (
      <span key={li}>
        {processInline(line)}
        {li < total - 1 && <br />}
      </span>
    );
  };

  let lineIdx = 0;
  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          const rows = block.rows;
          // Determine header: first row is header if second row is separator
          const hasHeader = rows.length >= 2 && isSeparatorRow(rows[1]);
          const headerCells = hasHeader ? parseTableCells(rows[0]) : null;
          const dataRows = hasHeader ? rows.slice(2) : rows.filter((r) => !isSeparatorRow(r));
          lineIdx += rows.length;
          const cellStyle: React.CSSProperties = {
            padding: "6px 12px",
            border: "1px solid var(--ct-border)",
            textAlign: "left" as const,
          };
          return (
            <div key={`tbl-${bi}`} style={{ overflowX: "auto", margin: "8px 0" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "13px",
                }}
              >
                {headerCells && (
                  <thead>
                    <tr>
                      {headerCells.map((cell, ci) => (
                        <th
                          key={ci}
                          style={{
                            ...cellStyle,
                            fontWeight: 700,
                            background: "var(--ct-code)",
                          }}
                        >
                          {processInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {dataRows.map((row, ri) => (
                    <tr key={ri}>
                      {parseTableCells(row).map((cell, ci) => (
                        <td key={ci} style={cellStyle}>
                          {processInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        // Regular lines
        const rendered = block.rows.map((line) => {
          const result = renderLine(line, lineIdx, lines.length);
          lineIdx++;
          return result;
        });
        return <span key={`blk-${bi}`}>{rendered}</span>;
      })}
    </>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const firstNl = part.indexOf("\n");
          const lang = firstNl > 3 ? part.slice(3, firstNl).trim() : "";
          const code = firstNl >= 0 ? part.slice(firstNl + 1).replace(/```$/, "") : part.slice(3).replace(/```$/, "");
          return (
            <pre
              key={i}
              style={{
                background: "var(--ct-code)",
                padding: "12px",
                borderRadius: "8px",
                overflowX: "auto",
                fontSize: "12px",
                margin: "8px 0",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: "1px solid var(--ct-border)",
              }}
            >
              {lang && (
                <div
                  style={{
                    color: "var(--ct-text2)",
                    fontSize: "10px",
                    marginBottom: "6px",
                    fontFamily: "sans-serif",
                  }}
                >
                  {lang}
                </div>
              )}
              <code>{code}</code>
            </pre>
          );
        }
        return <InlineMd key={i} text={part} />;
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════
export default function ChatPage() {
  // ── Theme / layout ──
  const [theme, setTheme] = useState<Theme>("dark");
  const [leftOpen, setLeftOpen] = useState(true);
  const [artifactMode, setArtifactMode] = useState<ArtifactMode>("mini");
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>("report");
  const [screenSize, setScreenSize] = useState<ScreenSize>("desktop");

  // ── Data ──
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // ── Chat state ──
  const [input, setInput] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  // AADS-190: 세션 비용/턴 + Yellow 경고 + 도구턴 한도
  const [sessionCost, setSessionCost] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<number | null>(null);
  const [yellowWarning, setYellowWarning] = useState<string | null>(null);
  const [toolTurnInfo, setToolTurnInfo] = useState<string | null>(null);
  const msgQueueRef = useRef<string[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  // ── UI state ──
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: ChatSession } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [mobileOverlay, setMobileOverlay] = useState<"sidebar" | "artifact" | null>(null);

  // ── AADS-188D: diff_preview 승인 패널 ──
  const diffApproval = useDiffApproval();

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortCtrl = useRef<AbortController | null>(null);
  const sessionSwitchRef = useRef(false);

  // ── Init theme ──
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("aads-chat-theme") : null;
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
  }, []);

  // ── Responsive ──
  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      const size: ScreenSize = w >= 1280 ? "desktop" : w >= 768 ? "tablet" : "mobile";
      setScreenSize(size);
      if (size === "mobile") { setLeftOpen(false); setArtifactMode("hidden"); }
      else if (size === "tablet") { setLeftOpen(false); }
      else { setLeftOpen(true); }
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Load workspaces ──
  useEffect(() => {
    chatApi<Workspace[]>("/chat/workspaces")
      .then((ws) => {
        setWorkspaces(ws);
        if (ws.length > 0) setActiveWs(ws[0].id);
      })
      .catch(console.error);
  }, []);

  // ── Load sessions on workspace change ──
  useEffect(() => {
    if (!activeWs) return;
    // 워크스페이스 전환 시 이전 세션 해제 — 프로젝트 컨텍스트 분리
    setActiveSession(null);
    setMessages([]);
    chatApi<ChatSession[]>(`/chat/sessions?workspace_id=${activeWs}`)
      .then((loaded) => {
        setSessions(loaded);
        // 해당 워크스페이스의 첫 세션 자동 선택
        if (loaded.length > 0) {
          setActiveSession(loaded[0]);
        }
      })
      .catch(console.error);
  }, [activeWs]);

  // ── Load messages & artifacts on session change ──
  useEffect(() => {
    // 세션 전환 시 진행 중인 스트리밍 중단 (이전 응답이 새 세션에 혼입 방지)
    if (streaming) {
      sessionSwitchRef.current = true;
      abortCtrl.current?.abort();
      setStreaming(false);
      setStreamBuf("");
      setToolStatus(null);
      setYellowWarning(null);
      setToolTurnInfo(null);
      msgQueueRef.current = [];
      setQueueCount(0);
    }
    if (!activeSession) { setMessages([]); setArtifacts([]); setSessionCost(null); setSessionTurns(null); return; }
    chatApi<ChatMessage[]>(`/chat/messages?session_id=${activeSession.id}&limit=500`)
      .then(setMessages)
      .catch(console.error);
    chatApi<Artifact[]>(`/chat/artifacts?session_id=${activeSession.id}`)
      .then(setArtifacts)
      .catch(() => setArtifacts([]));
    // Sync model from session
    if (activeSession.current_model) setModel(activeSession.current_model);
    // AADS-190: 세션 전환 시 누적비용 즉시 표시
    const ct = activeSession.cost_total;
    if (ct && Number(ct) > 0) {
      setSessionCost(`$${Number(ct).toFixed(2)}`);
      setSessionTurns(activeSession.message_count || null);
    } else {
      setSessionCost(null);
      setSessionTurns(null);
    }
  }, [activeSession?.id]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuf]);

  // ── Toggle theme ──
  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof window !== "undefined") localStorage.setItem("aads-chat-theme", next);
  }

  // ── Session management ──
  async function createSession(workspaceId?: string) {
    const wsId = workspaceId || activeWs;
    if (!wsId) return null;
    try {
      const s = await chatApi<ChatSession>("/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ workspace_id: wsId, title: "새 대화", current_model: model }),
      });
      setSessions((prev) => [s, ...prev]);
      setActiveSession(s);
      setMessages([]);
      if (screenSize !== "desktop") setMobileOverlay(null);
      return s;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function deleteSession(id: string) {
    try {
      await chatApi(`/chat/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) { setActiveSession(null); setMessages([]); }
    } catch (e) { console.error(e); }
    setContextMenu(null);
  }

  async function commitRename() {
    if (!renaming) return;
    try {
      const updated = await chatApi<ChatSession>(`/chat/sessions/${renaming.id}`, {
        method: "PUT",
        body: JSON.stringify({ title: renaming.value }),
      });
      setSessions((prev) => prev.map((s) => (s.id === renaming.id ? updated : s)));
      if (activeSession?.id === renaming.id) setActiveSession(updated);
    } catch (e) { console.error(e); }
    setRenaming(null);
    setContextMenu(null);
  }

  // ── Send message (SSE streaming) ──
  async function sendMessage(queuedContent?: string) {
    const content = queuedContent || input.trim();
    if (!content) return;
    sessionSwitchRef.current = false;

    // streaming 중이면 큐에 추가
    if (streaming && !queuedContent) {
      msgQueueRef.current.push(content);
      setQueueCount(msgQueueRef.current.length);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

    // Auto-create session if none active
    let sessionId = activeSession?.id;
    if (!sessionId) {
      if (!activeWs) return;
      const s = await createSession();
      if (!s) return;
      sessionId = s.id;
    }

    setInput("");
    setStreaming(true);
    setStreamBuf("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    abortCtrl.current = new AbortController();
    // 90초 타임아웃 → heartbeat(10초)가 리셋하므로 정상 연결 시 만료 안 됨
    // Extended Thinking/Deep Research 등 초기 응답 지연 고려
    let sseTimeout = setTimeout(() => {
      abortCtrl.current?.abort();
    }, 90000);
    const resetSseTimeout = () => {
      clearTimeout(sseTimeout);
      sseTimeout = setTimeout(() => {
        abortCtrl.current?.abort();
      }, 90000);
    };

    let full = "";
    try {
      const res = await fetch(`${BASE_URL}/chat/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdrs() },
        body: JSON.stringify({ session_id: sessionId, content, model_override: model }),
        signal: abortCtrl.current.signal,
      });

      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";
      let gotFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            // Any SSE event (including heartbeat) resets the inactivity timeout
            resetSseTimeout();
            if (ev.type === "heartbeat") {
              continue; // keep-alive, no UI action needed
            } else if (ev.type === "delta" && typeof ev.content === "string") {
              full += ev.content;
              setStreamBuf(full);
            } else if (ev.type === "token" && typeof ev.text === "string") {
              // legacy fallback
              full += ev.text;
              setStreamBuf(full);
            } else if (ev.type === "done") {
              gotFinal = true;
              setStreamBuf("");
              setYellowWarning(null);
              setToolTurnInfo(null);
              // AADS-190: 세션 비용/턴 업데이트
              if (ev.session_cost) setSessionCost(ev.session_cost);
              if (ev.session_turns) setSessionTurns(ev.session_turns);
              setMessages((prev) => [
                ...prev,
                {
                  id: `ai-${Date.now()}`,
                  session_id: sessionId!,
                  role: "assistant" as const,
                  content: full,
                  model_used: ev.model || undefined,
                  input_tokens: ev.input_tokens || undefined,
                  output_tokens: ev.output_tokens || undefined,
                  cost_usd: ev.cost ? parseFloat(ev.cost) : undefined,
                  created_at: new Date().toISOString(),
                },
              ]);
            } else if (ev.type === "tool_use" && ev.tool_name) {
              setToolStatus(`🔧 ${ev.tool_name} 실행 중...`);
            } else if (ev.type === "tool_result" && ev.tool_name) {
              setToolStatus(null);
            } else if (ev.type === "thinking" && ev.content) {
              setToolStatus("💭 사고 중...");
            } else if (ev.type === "sdk_session") {
              setToolStatus("🤖 Agent SDK 연결됨");
            } else if (ev.type === "sdk_complete") {
              setToolStatus(null);
            } else if (ev.type === "diff_preview") {
              diffApproval.onDiffPreview({
                type: "diff_preview",
                file_path: ev.file_path || "",
                tool_use_id: ev.tool_use_id || "",
                original_content: ev.original_content,
                modified_content: ev.modified_content,
              });
            } else if (ev.type === "message_done" && ev.message) {
              // legacy fallback
              gotFinal = true;
              setStreamBuf("");
              setMessages((prev) => [...prev, ev.message as ChatMessage]);
            } else if (ev.type === "yellow_limit") {
              // Yellow 도구 연속 실행 경고
              setYellowWarning(ev.content || `쓰기 도구 연속 ${ev.consecutive_count || 5}회 호출`);
            } else if (ev.type === "tool_turn_limit") {
              // 도구 턴 한도 자동 연장 알림
              setToolTurnInfo(ev.content || `도구 턴 ${ev.current_turn}회 → ${ev.extended_to}회 연장`);
            } else if (ev.type === "error") {
              throw new Error(ev.error || ev.content || "Unknown streaming error");
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      if (!gotFinal && full) {
        setStreamBuf("");
        setMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, session_id: sessionId!, role: "assistant", content: full },
        ]);
      }
    } catch (e: unknown) {
      const err = e as Error;
      const isAbort = err.name === "AbortError";
      const isNetwork = err.message?.includes("fetch") || err.message?.includes("network") || err.message?.includes("Failed");
      // 세션 전환으로 인한 abort → 이전 응답을 새 세션에 추가하지 않음
      if (sessionSwitchRef.current) {
        sessionSwitchRef.current = false;
        return;
      }
      if (isAbort || isNetwork) {
        // 연결 끊김: 누적된 텍스트가 있으면 표시, 없으면 폴링 fallback (최대 3회)
        if (full) {
          setStreamBuf("");
          setMessages((prev) => [
            ...prev,
            { id: `ai-${Date.now()}`, session_id: sessionId!, role: "assistant", content: full },
          ]);
        } else {
          setStreamBuf("");
          let recovered = false;
          for (let retry = 0; retry < 3; retry++) {
            await new Promise((r) => setTimeout(r, 3000 * (retry + 1)));
            try {
              const msgs = await chatApi<ChatMessage[]>(
                `/chat/messages?session_id=${sessionId}&limit=5&offset=0`
              );
              const aiMsg = [...msgs].reverse().find((m) => m.role === "assistant");
              if (aiMsg) {
                setMessages((prev) => [...prev, aiMsg]);
                recovered = true;
                break;
              }
            } catch { /* retry */ }
          }
          if (!recovered) {
            // 최종 실패 시 전체 메시지 리로드
            try {
              const allMsgs = await chatApi<ChatMessage[]>(
                `/chat/messages?session_id=${sessionId}&limit=500`
              );
              setMessages(allMsgs);
            } catch {
              setMessages((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}`,
                  session_id: sessionId!,
                  role: "assistant",
                  content: "⚠️ 연결이 끊겼습니다. 페이지를 새로고침해주세요.",
                },
              ]);
            }
          }
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            session_id: sessionId!,
            role: "assistant",
            content: `⚠️ 오류: ${err.message}`,
          },
        ]);
      }
    } finally {
      clearTimeout(sseTimeout);
      setStreaming(false);
      setStreamBuf("");
      setToolStatus(null);

      // 큐에 대기 중인 메시지가 있으면 자동 전송
      if (msgQueueRef.current.length > 0) {
        const next = msgQueueRef.current.shift()!;
        setQueueCount(msgQueueRef.current.length);
        setTimeout(() => sendMessage(next), 300);
      } else {
        setQueueCount(0);
      }
    }
  }

  function stopStreaming() {
    abortCtrl.current?.abort();
    setStreaming(false);
    setStreamBuf("");
    setToolStatus(null);
  }

  // ── File upload ──
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !activeWs) return;
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = getToken();
      await fetch(`${BASE_URL}/chat/drive/upload?workspace_id=${activeWs}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      setInput((prev) => `${prev}\n[파일첨부: ${file.name}]`.trim());
      textareaRef.current?.focus();
    } catch (e) { console.error("Upload failed", e); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  // ── Action chips ──
  function applyChip(prefix: string) {
    setInput((prev) => (prev ? `${prefix} ${prev}` : `${prefix} `));
    textareaRef.current?.focus();
  }

  // ── Keyboard ──
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
    // Ctrl+Z: 마지막 큐 메시지 취소
    if (e.ctrlKey && e.key === "z" && queueCount > 0) {
      e.preventDefault();
      const removed = msgQueueRef.current.pop();
      setQueueCount(msgQueueRef.current.length);
      if (removed) setInput(removed);
      return;
    }
    if (e.ctrlKey && e.key === "]") {
      e.preventDefault();
      setArtifactMode((m) => (m === "full" ? "mini" : m === "mini" ? "hidden" : "full"));
    }
  }

  // ── Context menu ──
  function onSessionContextMenu(e: React.MouseEvent, session: ChatSession) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, session });
  }

  // ── Artifacts ──
  function copyArtifact(content: string) {
    navigator.clipboard?.writeText(content).catch(() => {});
  }
  async function toDirective(artifact: Artifact) {
    const text = `TITLE: ${artifact.title}\nDESCRIPTION: |\n  ${artifact.content.split("\n").join("\n  ")}`;
    await navigator.clipboard?.writeText(text).catch(() => {});
    alert("지시서 형식이 클립보드에 복사되었습니다.");
  }

  // ── Derived ──
  const vars = theme === "dark" ? DARK : LIGHT;
  const activeWsObj = workspaces.find((w) => w.id === activeWs);
  const activeWsName = activeWsObj?.name || "워크스페이스";
  const filteredSessions = sessions.filter(
    (s) => !search || s.title.toLowerCase().includes(search.toLowerCase())
  );
  const activeArtifact =
    artifacts.find((a) => {
      if (artifactTab === "report") return a.artifact_type === "report" || a.artifact_type === "text";
      if (artifactTab === "code") return a.artifact_type === "code";
      if (artifactTab === "chart") return a.artifact_type === "chart";
      if (artifactTab === "dashboard") return a.artifact_type === "dashboard";
      return false;
    }) || artifacts[0];

  // Responsive: whether to show overlays
  const showLeftSidebar =
    screenSize === "desktop" ? leftOpen : mobileOverlay === "sidebar";
  const showArtifactPanel =
    screenSize === "desktop" ? artifactMode !== "hidden" : mobileOverlay === "artifact";

  // ══════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        ...vars,
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--ct-bg)",
        color: "var(--ct-text)",
        transition: "background 0.3s, color 0.3s",
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
      }}
      onClick={() => setContextMenu(null)}
    >
      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes ct-bounce {
          0%,80%,100%{transform:scale(0.6);opacity:0.4}
          40%{transform:scale(1);opacity:1}
        }
        @keyframes ct-theme {
          from{opacity:0.7} to{opacity:1}
        }
        .ct-msg-enter { animation: ct-theme 0.2s ease; }
      `}</style>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 2000,
            background: "var(--ct-card)",
            border: "1px solid var(--ct-border)",
            borderRadius: "8px",
            padding: "4px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            minWidth: "140px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              icon: "✏️",
              label: "이름 변경",
              color: "var(--ct-text)",
              action: () => {
                setRenaming({ id: contextMenu.session.id, value: contextMenu.session.title });
                setContextMenu(null);
              },
            },
            {
              icon: "🗑️",
              label: "삭제",
              color: "#ef4444",
              action: () => deleteSession(contextMenu.session.id),
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: "13px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: item.color,
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ct-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* ── Mobile/Tablet overlay backdrop ── */}
      {mobileOverlay && screenSize !== "desktop" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 100,
          }}
          onClick={() => setMobileOverlay(null)}
        />
      )}

      {/* ════════════════════════════════════════════════════════════
          LEFT SIDEBAR
      ════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: screenSize === "desktop" ? (leftOpen ? "280px" : "60px") : "280px",
          minWidth: screenSize === "desktop" ? (leftOpen ? "280px" : "60px") : "280px",
          background: "var(--ct-sb)",
          borderRight: "1px solid var(--ct-border)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.3s, min-width 0.3s, transform 0.3s",
          overflow: "hidden",
          flexShrink: 0,
          // On non-desktop, position as overlay
          ...(screenSize !== "desktop"
            ? {
                position: "fixed",
                left: 0,
                top: 0,
                height: "100%",
                zIndex: 200,
                transform: showLeftSidebar ? "translateX(0)" : "translateX(-100%)",
                boxShadow: showLeftSidebar ? "4px 0 20px rgba(0,0,0,0.3)" : "none",
              }
            : {}),
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: "14px 12px",
            borderBottom: "1px solid var(--ct-border)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {leftOpen || screenSize !== "desktop" ? (
            <>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--ct-accent)" }}>
                  CEO Chat
                </div>
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
                  AI 채팅 허브
                </div>
              </div>
              <button
                onClick={() =>
                  screenSize === "desktop" ? setLeftOpen(false) : setMobileOverlay(null)
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  fontSize: "16px",
                  padding: "4px",
                  borderRadius: "4px",
                }}
                title="사이드바 접기"
              >
                ◀
              </button>
            </>
          ) : (
            <button
              onClick={() => setLeftOpen(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ct-accent)",
                fontSize: "22px",
                width: "100%",
                textAlign: "center",
                padding: "4px",
              }}
              title="사이드바 펼치기"
            >
              💬
            </button>
          )}
        </div>

        {leftOpen || screenSize !== "desktop" ? (
          <>
            {/* New Chat + Search */}
            <div style={{ padding: "12px" }}>
              <button
                onClick={() => createSession()}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--ct-accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ct-accent-h)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ct-accent)")}
              >
                ✏️ 새 대화 ({activeWsObj?.icon || "📁"} {activeWsName.replace(/^\[.*?\]\s*/, "")})
              </button>
              <input
                type="text"
                placeholder="세션 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "7px 10px",
                  fontSize: "12px",
                  background: "var(--ct-input)",
                  color: "var(--ct-text)",
                  border: "1px solid var(--ct-border)",
                  borderRadius: "6px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Workspace + Sessions */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
              {workspaces.map((ws) => (
                <div key={ws.id} style={{ marginBottom: "4px" }}>
                  {/* Workspace header */}
                  <button
                    onClick={() => setActiveWs(ws.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      background: "none",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      color: activeWs === ws.id ? "var(--ct-accent)" : "var(--ct-text2)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{ws.icon || "📁"}</span>
                    <span style={{ flex: 1 }}>{ws.name}</span>
                    {activeWs === ws.id && (
                      <span style={{ fontSize: "10px" }}>▾</span>
                    )}
                  </button>

                  {/* Sessions */}
                  {activeWs === ws.id &&
                    filteredSessions.map((s) => (
                      <div key={s.id} style={{ marginBottom: "1px" }}>
                        {renaming?.id === s.id ? (
                          <div style={{ padding: "3px 6px" }}>
                            <input
                              autoFocus
                              value={renaming.value}
                              onChange={(e) =>
                                setRenaming({ id: s.id, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              onBlur={commitRename}
                              style={{
                                width: "100%",
                                padding: "5px 8px",
                                fontSize: "12px",
                                background: "var(--ct-input)",
                                color: "var(--ct-text)",
                                border: "1px solid var(--ct-accent)",
                                borderRadius: "4px",
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveSession(s);
                              if (screenSize !== "desktop") setMobileOverlay(null);
                            }}
                            onContextMenu={(e) => onSessionContextMenu(e, s)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              fontSize: "12px",
                              background:
                                activeSession?.id === s.id ? "var(--ct-accent)" : "none",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              color:
                                activeSession?.id === s.id ? "#fff" : "var(--ct-text2)",
                              overflow: "hidden",
                            }}
                            onMouseEnter={(e) => {
                              if (activeSession?.id !== s.id)
                                e.currentTarget.style.background = "var(--ct-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (activeSession?.id !== s.id)
                                e.currentTarget.style.background = "none";
                            }}
                          >
                            <div
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {s.title || "새 대화"}
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                opacity: 0.65,
                                marginTop: "2px",
                              }}
                            >
                              {s.message_count ?? 0}개 메시지
                            </div>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              ))}

              {workspaces.length === 0 && (
                <div
                  style={{
                    padding: "20px 10px",
                    fontSize: "12px",
                    color: "var(--ct-text2)",
                    textAlign: "center",
                  }}
                >
                  워크스페이스 로딩 중...
                </div>
              )}
            </div>

            {/* Sidebar Footer */}
            <div
              style={{
                padding: "12px",
                borderTop: "1px solid var(--ct-border)",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "라이트 모드" : "다크 모드"}
                style={{
                  flex: 1,
                  padding: "7px",
                  background: "var(--ct-hover)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "var(--ct-text)",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
              >
                {theme === "dark" ? "☀️ 라이트" : "🌙 다크"}
              </button>
              <a
                href="/"
                style={{
                  padding: "7px 10px",
                  background: "var(--ct-hover)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
                title="대시보드로"
              >
                🏠
              </a>
              <a
                href="/settings"
                style={{
                  padding: "7px 10px",
                  background: "var(--ct-hover)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
                title="설정"
              >
                ⚙️
              </a>
            </div>
          </>
        ) : (
          /* Icon-only mode */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              padding: "12px 0",
              flex: 1,
            }}
          >
            <button
              onClick={() => createSession()}
              title="새 대화"
              style={{
                background: "var(--ct-accent)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                color: "#fff",
                width: "40px",
                height: "40px",
                fontSize: "16px",
              }}
            >
              ✏️
            </button>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { setActiveWs(ws.id); setLeftOpen(true); }}
                title={ws.name}
                style={{
                  background:
                    activeWs === ws.id ? "var(--ct-accent)" : "var(--ct-hover)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: activeWs === ws.id ? "#fff" : "var(--ct-text2)",
                  width: "40px",
                  height: "40px",
                  fontSize: "14px",
                }}
              >
                {ws.icon || "📁"}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "라이트 모드" : "다크 모드"}
              style={{
                background: "none",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                color: "var(--ct-text2)",
                width: "40px",
                height: "40px",
                fontSize: "16px",
              }}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          CENTER CHAT AREA
      ════════════════════════════════════════════════════════════ */}
      <div
        style={{ flex: 1, minWidth: "0", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Chat Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--ct-border)",
            background: "var(--ct-sb)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          {/* Mobile: hamburger for left sidebar */}
          {screenSize !== "desktop" && (
            <button
              onClick={() => setMobileOverlay("sidebar")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "18px",
                padding: "4px",
              }}
            >
              ☰
            </button>
          )}
          {/* Desktop: expand sidebar if collapsed */}
          {screenSize === "desktop" && !leftOpen && (
            <button
              onClick={() => setLeftOpen(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ct-text2)",
                fontSize: "16px",
                padding: "4px",
              }}
              title="사이드바 펼치기"
            >
              ▶
            </button>
          )}

          {/* Session title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "14px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeSession?.title || "새 대화를 시작하세요"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "1px" }}>
              {activeSession
                ? `${activeSession.id.slice(0, 8)}... · ${activeSession.message_count ?? 0}개 메시지`
                : "세션 없음"}
            </div>
          </div>

          {/* Model selector */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              fontSize: "12px",
              padding: "5px 8px",
              background: "var(--ct-card)",
              color: "var(--ct-text)",
              border: "1px solid var(--ct-border)",
              borderRadius: "6px",
              cursor: "pointer",
              maxWidth: "200px",
              outline: "none",
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.cost}/M)
              </option>
            ))}
          </select>

          {/* Artifact toggle */}
          <button
            onClick={() =>
              screenSize !== "desktop"
                ? setMobileOverlay("artifact")
                : setArtifactMode((m) => (m === "full" ? "mini" : m === "mini" ? "hidden" : "full"))
            }
            title="아티팩트 패널 토글 (Ctrl+])"
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              background: "var(--ct-hover)",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              color: "var(--ct-text2)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            📄{artifactMode === "hidden" && screenSize === "desktop" ? "▶" : "◀"}
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {messages.length === 0 && !streaming && (
            <div
              style={{
                textAlign: "center",
                paddingTop: "60px",
                color: "var(--ct-text2)",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "14px" }}>💬</div>
              <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
                CEO Chat
              </div>
              <div style={{ fontSize: "13px", marginBottom: "20px" }}>
                메시지를 입력하거나 왼쪽에서 세션을 선택하세요.
              </div>
              <div
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  gap: "6px",
                  textAlign: "left",
                  fontSize: "12px",
                  background: "var(--ct-card)",
                  border: "1px solid var(--ct-border)",
                  borderRadius: "12px",
                  padding: "14px 20px",
                }}
              >
                <span>⚡ 상태 확인 → Haiku (빠름·저비용)</span>
                <span>🔧 코드·수정 → Sonnet (균형)</span>
                <span>🧠 설계·분석 → Opus (고성능)</span>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className="ct-msg-enter"
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div style={{ maxWidth: "80%" }}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "18px",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    ...(msg.role === "user"
                      ? {
                          background: "var(--ct-user)",
                          color: "#fff",
                          borderBottomRightRadius: "4px",
                          whiteSpace: "pre-wrap",
                        }
                      : {
                          background: "var(--ct-ai)",
                          color: "var(--ct-text)",
                          border: "1px solid var(--ct-border)",
                          borderBottomLeftRadius: "4px",
                        }),
                  }}
                >
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <MarkdownBlock text={msg.content} />
                  )}
                </div>
                {msg.role === "assistant" && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--ct-text2)",
                      marginTop: "4px",
                      marginLeft: "4px",
                    }}
                  >
                    {msg.model_used && <span>[{msg.model_used}</span>}
                    {msg.input_tokens ? ` · ${msg.input_tokens.toLocaleString()}in` : ""}
                    {msg.output_tokens ? ` · ${msg.output_tokens.toLocaleString()}out` : ""}
                    {msg.cost_usd ? ` · $${Number(msg.cost_usd).toFixed(4)}` : ""}
                    {msg.model_used && <span>]</span>}
                    {msg.created_at && (
                      <span style={{ marginLeft: msg.model_used ? "6px" : "0" }}>
                        {new Date(msg.created_at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          month: "numeric", day: "numeric",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {streaming && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "18px",
                  borderBottomLeftRadius: "4px",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  maxWidth: "80%",
                  background: "var(--ct-ai)",
                  color: "var(--ct-text)",
                  border: "1px solid var(--ct-border)",
                }}
              >
                {toolStatus && !streamBuf && (
                  <div style={{ fontSize: "13px", color: "var(--ct-accent)", marginBottom: "6px", opacity: 0.85 }}>
                    {toolStatus}
                  </div>
                )}
                {streamBuf ? (
                  <MarkdownBlock text={streamBuf} />
                ) : !toolStatus ? (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center", height: "20px" }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          background: "var(--ct-accent)",
                          display: "inline-block",
                          animation: "ct-bounce 1.2s infinite",
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--ct-border)",
            background: "var(--ct-sb)",
            flexShrink: 0,
          }}
        >
          {/* AADS-190: Yellow 경고 바 */}
          {yellowWarning && streaming && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", marginBottom: "8px", borderRadius: "8px",
              background: "#f59e0b20", border: "1px solid #f59e0b60",
              fontSize: "13px", color: "#f59e0b",
            }}>
              <span>⚠️ {yellowWarning}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setYellowWarning(null)}
                  style={{
                    padding: "4px 12px", fontSize: "12px", fontWeight: 600,
                    background: "#f59e0b", color: "#fff", border: "none", borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >계속</button>
                <button
                  onClick={() => { setYellowWarning(null); abortCtrl.current?.abort(); }}
                  style={{
                    padding: "4px 12px", fontSize: "12px", fontWeight: 600,
                    background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >중단</button>
              </div>
            </div>
          )}

          {/* AADS-190: 도구 턴 연장 알림 */}
          {toolTurnInfo && streaming && (
            <div style={{
              padding: "6px 12px", marginBottom: "8px", borderRadius: "8px",
              background: "#6366f120", border: "1px solid #6366f160",
              fontSize: "12px", color: "#6366f1",
            }}>
              🔄 {toolTurnInfo}
            </div>
          )}

          {/* Action chips */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: "8px",
              flexWrap: "wrap",
            }}
          >
            {[
              { icon: "🔍", label: "검색", prefix: "[검색]" },
              { icon: "🧪", label: "딥리서치", prefix: "[딥리서치]" },
              { icon: "📎", label: "파일", action: "file" as const },
              { icon: "📹", label: "동영상", prefix: "[동영상]" },
              { icon: "🎤", label: "음성", prefix: "[음성]" },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => {
                  if ("action" in chip && chip.action === "file") {
                    fileInputRef.current?.click();
                    return;
                  }
                  if ("prefix" in chip) applyChip(chip.prefix);
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  background: "var(--ct-hover)",
                  border: "1px solid var(--ct-border)",
                  borderRadius: "16px",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ct-accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ct-border)")}
              >
                {chip.icon} {chip.label}
              </button>
            ))}
          </div>

          {/* Textarea + send button */}
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={onKeyDown}
              placeholder="메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
              rows={1}
              disabled={false}
              style={{
                flex: 1,
                padding: "10px 14px",
                fontSize: "14px",
                resize: "none",
                overflow: "hidden",
                background: "var(--ct-input)",
                color: "var(--ct-text)",
                border: "1px solid var(--ct-border)",
                borderRadius: "12px",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: "1.5",
                minHeight: "44px",
                maxHeight: "160px",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--ct-accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--ct-border)")}
            />
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              {/* AADS-190: 세션 비용/턴 표시 */}
              {sessionCost && (
                <span style={{
                  fontSize: "11px", color: "var(--ct-text2)", whiteSpace: "nowrap",
                  padding: "2px 8px", background: "var(--ct-hover)", borderRadius: "8px",
                }}>
                  {sessionCost}{sessionTurns ? ` | ${sessionTurns}턴` : ""}
                </span>
              )}
              {/* 큐 취소 버튼 (큐에 메시지가 있을 때만) */}
              {queueCount > 0 && (
                <button
                  onClick={() => { msgQueueRef.current = []; setQueueCount(0); }}
                  style={{
                    padding: "10px 12px", fontSize: "12px", fontWeight: 600,
                    background: "#f59e0b", color: "#fff", border: "none", borderRadius: "12px",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  title="대기 메시지 전체 취소"
                >
                  {queueCount}건 취소
                </button>
              )}
              {/* 전송/대기추가/중단 버튼 */}
              <button
                onClick={streaming && !input.trim() ? stopStreaming : () => sendMessage()}
                disabled={!streaming && !input.trim()}
                style={{
                  padding: "10px 20px", fontSize: "14px", fontWeight: 600,
                  background: streaming ? (input.trim() ? "var(--ct-accent)" : "#ef4444") : "var(--ct-accent)",
                  color: "#fff", border: "none", borderRadius: "12px",
                  cursor: streaming || input.trim() ? "pointer" : "not-allowed",
                  opacity: !streaming && !input.trim() ? 0.5 : 1,
                  transition: "background 0.2s", whiteSpace: "nowrap",
                }}
              >
                {streaming ? (input.trim() ? "대기 전송" : "⏹ 중단") : "전송"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AADS-188D: Code 패널 (diff_preview 시에만 표시) */}
      {diffApproval.payload && (
        <CodePanel
          visible
          payload={diffApproval.payload}
          sessionId={activeSession?.id ?? null}
          theme={theme}
          countdown={diffApproval.countdown}
          onClose={diffApproval.close}
          onResult={(action, msg) => {
            if (msg) setMessages((prev) => [...prev, {
              id: `sys-${Date.now()}`,
              session_id: activeSession?.id ?? "",
              role: "assistant",
              content: `[코드 수정 ${action === "approve" ? "승인" : "거부"}] ${msg}`,
            }]);
          }}
        />
      )}

      {/* ════════════════════════════════════════════════════════════
          RIGHT ARTIFACT PANEL
      ════════════════════════════════════════════════════════════ */}
      {(showArtifactPanel || (screenSize === "desktop" && artifactMode !== "hidden")) && (
        <div
          style={{
            width: screenSize !== "desktop" ? "380px" : artifactMode === "full" ? "420px" : "48px",
            minWidth: screenSize !== "desktop" ? "380px" : artifactMode === "full" ? "420px" : "48px",
            background: "var(--ct-sb)",
            borderLeft: "1px solid var(--ct-border)",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.3s, min-width 0.3s, transform 0.3s",
            overflow: "hidden",
            flexShrink: 0,
            // On non-desktop, position as overlay
            ...(screenSize !== "desktop"
              ? {
                  position: "fixed",
                  right: 0,
                  top: 0,
                  height: "100%",
                  zIndex: 200,
                  transform: mobileOverlay === "artifact" ? "translateX(0)" : "translateX(100%)",
                  boxShadow: mobileOverlay === "artifact" ? "-4px 0 20px rgba(0,0,0,0.3)" : "none",
                }
              : {}),
          }}
        >
          {artifactMode === "full" || screenSize !== "desktop" ? (
            <>
              {/* Artifact header */}
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--ct-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div style={{ flex: 1, fontWeight: 600, fontSize: "13px" }}>
                  아티팩트
                  {artifacts.length > 0 && (
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "11px",
                        background: "var(--ct-accent)",
                        color: "#fff",
                        borderRadius: "10px",
                        padding: "1px 6px",
                      }}
                    >
                      {artifacts.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() =>
                    screenSize === "desktop"
                      ? setArtifactMode("mini")
                      : setMobileOverlay(null)
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ct-text2)",
                    fontSize: "14px",
                    padding: "4px",
                  }}
                >
                  ▶
                </button>
              </div>

              {/* Artifact tabs */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--ct-border)",
                  padding: "0 8px",
                }}
              >
                {(
                  [
                    { key: "report" as ArtifactTab, icon: "📄", label: "보고서" },
                    { key: "code" as ArtifactTab, icon: "💻", label: "코드" },
                    { key: "chart" as ArtifactTab, icon: "📊", label: "차트" },
                    { key: "dashboard" as ArtifactTab, icon: "🖥️", label: "대시보드" },
                  ]
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setArtifactTab(tab.key)}
                    style={{
                      padding: "8px 10px",
                      fontSize: "11px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color:
                        artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-text2)",
                      borderBottom:
                        artifactTab === tab.key
                          ? "2px solid var(--ct-accent)"
                          : "2px solid transparent",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Artifact content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                {activeArtifact ? (
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "13px",
                        marginBottom: "12px",
                        color: "var(--ct-text)",
                      }}
                    >
                      {activeArtifact.title}
                    </div>
                    <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                      {activeArtifact.artifact_type === "code" ? (
                        <pre
                          style={{
                            background: "var(--ct-code)",
                            padding: "12px",
                            borderRadius: "8px",
                            overflowX: "auto",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {activeArtifact.content}
                        </pre>
                      ) : (
                        <MarkdownBlock text={activeArtifact.content} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: "center",
                      paddingTop: "40px",
                      color: "var(--ct-text2)",
                    }}
                  >
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                    <div style={{ fontSize: "12px" }}>아티팩트가 없습니다</div>
                    <div
                      style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7, lineHeight: 1.5 }}
                    >
                      AI 응답에서 아티팩트가
                      <br />
                      생성되면 여기에 표시됩니다
                    </div>
                  </div>
                )}
              </div>

              {/* Artifact actions */}
              {activeArtifact && (
                <div
                  style={{
                    padding: "12px",
                    borderTop: "1px solid var(--ct-border)",
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    { icon: "📋", label: "복사", fn: () => copyArtifact(activeArtifact.content) },
                    { icon: "✏️", label: "편집", fn: () => {} },
                    { icon: "📋", label: "지시서", fn: () => toDirective(activeArtifact) },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      onClick={btn.fn}
                      style={{
                        flex: 1,
                        padding: "7px 8px",
                        fontSize: "11px",
                        background: "var(--ct-hover)",
                        border: "1px solid var(--ct-border)",
                        borderRadius: "6px",
                        cursor: "pointer",
                        color: "var(--ct-text2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--ct-accent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "var(--ct-hover)") }
                    >
                      {btn.icon} {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Mini mode — vertical icons */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "12px 0",
                gap: "8px",
                flex: 1,
              }}
            >
              {(
                [
                  { key: "report" as ArtifactTab, icon: "📄" },
                  { key: "code" as ArtifactTab, icon: "💻" },
                  { key: "chart" as ArtifactTab, icon: "📊" },
                  { key: "dashboard" as ArtifactTab, icon: "🖥️" },
                ]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setArtifactTab(tab.key); setArtifactMode("full"); }}
                  title={tab.key}
                  style={{
                    width: "36px",
                    height: "36px",
                    fontSize: "16px",
                    background:
                      artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-hover)",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    color: artifactTab === tab.key ? "#fff" : "var(--ct-text2)",
                  }}
                >
                  {tab.icon}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
