// AADS-dashboard-rebuild: refactored
"use client";
import React, { useState, useEffect, useLayoutEffect, useRef, startTransition, useCallback, useMemo, memo } from "react";
import ChatInput, { ChatInputHandle } from "./ChatInput";
import ChatSidebar from "./ChatSidebar";
import ChatArtifactPanel from "./ChatArtifactPanel";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "@/components/chat/ModelSelector";
import { CodePanel } from "@/components/CodePanel";
import { useDiffApproval } from "@/hooks/useDiffApproval";
import "@/styles/code-editor.css";
import MemoryContextBar from "@/components/chat/MemoryContextBar";
import ArtifactTaskMonitor from "@/components/chat/ArtifactTaskMonitor";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateBanner from "@/components/UpdateBanner";
import { Workspace, ChatSession, ChatMessage, Artifact, Theme, ArtifactMode, ArtifactTab, ScreenSize, DARK, LIGHT } from "./types";
import { BASE_URL, getToken, authHdrs, chatApi, uploadChatFile } from "./api";
import { processInline, InlineMd, CopyableCodeBlock, MarkdownBlock } from "./MarkdownRenderer";

// ── MessageItem: React.memo로 개별 메시지 리렌더링 최적화 ──
interface MessageItemProps {
  msg: ChatMessage;
  idx: number;
  streaming: boolean;
  editingMsgId: string | null;
  editText: string;
  setEditingMsgId: (id: string | null) => void;
  setEditText: (text: string) => void;
  handleDeleteMessage: (id: string, role: string) => void;
  handleCopyToInput: (content: string) => void;
  handleEditResend: (msgId: string, newContent: string) => void;
}

const MessageItem = memo(function MessageItem({
  msg, idx, streaming, editingMsgId, editText,
  setEditingMsgId, setEditText, handleDeleteMessage, handleCopyToInput, handleEditResend,
}: MessageItemProps) {
  return (
    <div
      className="ct-msg-enter group"
      style={{
        display: "flex",
        justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
      }}
    >
      {/* 방식A/B 버튼: 사용자 메시지 왼쪽에 호버 시 표시 */}
      {msg.role === "user" && msg.intent === "system_trigger" && (
        <div style={{ marginBottom: "4px", marginRight: "4px", textAlign: "right" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
            background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid #3b82f633",
          }}>⚙️ 시스템 트리거</span>
        </div>
      )}
      {msg.role === "user" && !streaming && !msg.id.startsWith("tmp-") && msg.intent !== "system_trigger" && (
        <div className="flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setEditingMsgId(msg.id);
              setEditText(msg.content);
            }}
            title="수정 후 재전송"
            style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "var(--ct-ai)", border: "1px solid var(--ct-border)",
              color: "var(--ct-text2)", fontSize: "13px",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >✏️</button>
          <button
            onClick={() => handleCopyToInput(msg.content)}
            title="입력창에 복사 (재지시)"
            style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "var(--ct-ai)", border: "1px solid var(--ct-border)",
              color: "var(--ct-text2)", fontSize: "13px",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >🔄</button>
          <button
            onClick={() => handleDeleteMessage(msg.id, "user")}
            title="메시지 삭제 (AI 응답 포함)"
            style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444", fontSize: "13px",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >🗑️</button>
        </div>
      )}

      <div style={{ maxWidth: "80%" }}>
        {/* 출처 배지: Pipeline C / Agent / System */}
        {msg.role === "assistant" && (() => {
          const badgeMap: Record<string, { icon: string; label: string; color: string; bg: string }> = {
            pipeline_c: { icon: "🤖", label: "Claude Bot", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
            agent_result: { icon: "⚡", label: "Agent", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
            system_recovery: { icon: "🔧", label: "System", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
          };
          const badge = msg.intent ? badgeMap[msg.intent] : null;
          return badge ? (
            <div style={{ marginBottom: "4px", marginLeft: "4px" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33`,
              }}>{badge.icon} {badge.label}</span>
            </div>
          ) : null;
        })()}
        {/* 인라인 편집 모드 (방식A) */}
        {msg.role === "user" && editingMsgId === msg.id ? (
          <div style={{
            borderRadius: "18px", overflow: "hidden",
            border: "2px solid var(--ct-accent)", borderBottomRightRadius: "4px",
          }}>
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditResend(msg.id, editText.trim()); }
                if (e.key === "Escape") { setEditingMsgId(null); setEditText(""); }
              }}
              style={{
                width: "100%", padding: "12px 16px", fontSize: "14px",
                background: "rgba(109,40,217,0.15)", color: "#fff",
                border: "none", outline: "none", resize: "none",
                minHeight: "60px", maxHeight: "200px", lineHeight: "1.6",
              }}
              rows={Math.min(editText.split("\n").length + 1, 8)}
            />
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: "8px",
              padding: "8px 12px", background: "rgba(0,0,0,0.3)",
            }}>
              <button
                onClick={() => { setEditingMsgId(null); setEditText(""); }}
                style={{
                  fontSize: "12px", padding: "4px 12px", borderRadius: "8px",
                  background: "var(--ct-ai)", color: "var(--ct-text2)", border: "none", cursor: "pointer",
                }}
              >취소</button>
              <button
                onClick={() => handleEditResend(msg.id, editText.trim())}
                style={{
                  fontSize: "12px", padding: "4px 12px", borderRadius: "8px",
                  background: "var(--ct-accent)", color: "#fff", border: "none", cursor: "pointer",
                  fontWeight: 600,
                }}
              >수정 후 재전송</button>
            </div>
          </div>
        ) : (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "18px",
            fontSize: "14px",
            lineHeight: "1.6",
            ...(msg.role === "user"
              ? msg.intent === "system_trigger"
                ? {
                    background: "linear-gradient(135deg, var(--ct-ai), rgba(59,130,246,0.1))",
                    color: "var(--ct-text)",
                    border: "1px solid #3b82f644",
                    borderBottomRightRadius: "4px",
                    whiteSpace: "pre-wrap" as const,
                    fontStyle: "italic" as const,
                  }
                : {
                    background: "var(--ct-user)",
                    color: "#fff",
                    borderBottomRightRadius: "4px",
                    whiteSpace: "pre-wrap",
                  }
              : {
                  background: msg.intent === "streaming_placeholder"
                    ? "linear-gradient(135deg, var(--ct-ai), rgba(59,130,246,0.15))"
                    : msg.intent && ["pipeline_c","agent_result","system_recovery"].includes(msg.intent)
                    ? `linear-gradient(135deg, var(--ct-ai), ${msg.intent === "pipeline_c" ? "rgba(245,158,11,0.1)" : msg.intent === "agent_result" ? "rgba(139,92,246,0.1)" : "rgba(239,68,68,0.1)"})`
                    : "var(--ct-ai)",
                  color: "var(--ct-text)",
                  border: msg.intent === "streaming_placeholder"
                    ? "1px solid #3b82f666"
                    : msg.intent && ["pipeline_c","agent_result","system_recovery"].includes(msg.intent)
                    ? `1px solid ${msg.intent === "pipeline_c" ? "#f59e0b44" : msg.intent === "agent_result" ? "#8b5cf644" : "#ef444444"}`
                    : "1px solid var(--ct-border)",
                  ...(msg.intent === "streaming_placeholder" ? { animation: "pulse 2s ease-in-out infinite" } : {}),
                  borderBottomLeftRadius: "4px",
                }),
          }}
        >
          {/* 첨부 이미지 표시: 로컬 프리뷰 → 서버 file_url → 레거시 base64 */}
          {msg.role === "user" && (() => {
            const previews = msg.attachmentPreviews || [];
            const serverAtts = (msg.attachments || []).filter(
              (a) => (a.type === "image" || a.mime_type?.startsWith("image/") || a.media_type?.startsWith("image/")) && (a.file_url || a.base64)
            );
            if (previews.length === 0 && serverAtts.length === 0) return null;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {previews.map((url, pi) => (
                  <img key={`p-${pi}`} src={url} alt="첨부 이미지" style={{
                    maxWidth: "200px", maxHeight: "200px", objectFit: "cover",
                    borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)",
                  }} />
                ))}
                {serverAtts.map((att, si) => {
                  const src = att.file_url
                    ? `${process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1"}${att.file_url}`
                    : att.base64
                      ? `data:${att.mime_type || att.media_type || att.mime || "image/png"};base64,${att.base64}`
                      : "";
                  if (!src) return null;
                  return (
                    <img key={`s-${si}`} src={src} alt={att.name || "첨부 이미지"} style={{
                      maxWidth: "200px", maxHeight: "200px", objectFit: "cover",
                      borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)",
                    }} />
                  );
                })}
              </div>
            );
          })()}
          {msg.role === "user" ? (
            msg.intent === "system_trigger" ? <MarkdownBlock text={msg.content} /> : processInline(msg.content)
          ) : (
            <MarkdownBlock text={msg.content} />
          )}
        </div>
        )}
        {/* 사용자 메시지 타임스탬프 + (수정됨) 표시 */}
        {msg.role === "user" && msg.created_at && (
          <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "4px", textAlign: "right", marginRight: "4px" }}>
            {msg.edited_at && <span style={{ color: "var(--ct-accent)" }}>(수정됨) </span>}
            {new Date(msg.created_at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        {msg.role === "assistant" && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--ct-text2)",
              marginTop: "4px",
              marginLeft: "4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>
              {msg.model_used && <span>[{msg.model_used}</span>}
              {(msg.input_tokens || msg.tokens_in) ? ` · ${(msg.input_tokens || msg.tokens_in || 0).toLocaleString()}in` : ""}
              {(msg.output_tokens || msg.tokens_out) ? ` · ${(msg.output_tokens || msg.tokens_out || 0).toLocaleString()}out` : ""}
              {(() => { const c = msg.cost_usd || msg.cost; return c && Number(c) > 0 ? ` · $${Number(c).toFixed(4)}` : ""; })()}
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
            </span>
            <button
              onClick={() => handleDeleteMessage(msg.id, "assistant")}
              title="이 응답 삭제"
              style={{
                width: "20px", height: "20px", borderRadius: "50%",
                background: "transparent", border: "1px solid transparent",
                color: "var(--ct-text2)", fontSize: "11px",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", opacity: 0.4, transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "#ef4444"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.4"; (e.target as HTMLElement).style.color = "var(--ct-text2)"; }}
            >🗑️</button>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.msg.id === next.msg.id &&
  prev.msg.content === next.msg.content &&
  prev.msg.role === next.msg.role &&
  prev.streaming === next.streaming &&
  prev.editingMsgId === next.editingMsgId &&
  (prev.editingMsgId === prev.msg.id ? prev.editText === next.editText : true)
);

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
  const [hasInput, setHasInput] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toolLogs, setToolLogs] = useState<{icon:string; text:string; sub?:string}[]>([]);
  // AADS-190: 세션 비용/턴 + Yellow 경고 + 도구턴 한도
  const [sessionCost, setSessionCost] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<number | null>(null);
  const [yellowWarning, setYellowWarning] = useState<string | null>(null);
  const [toolTurnInfo, setToolTurnInfo] = useState<string | null>(null);
  const msgQueueRef = useRef<string[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  // API 키 상태 표시
  const [apiKeyInfo, setApiKeyInfo] = useState<{litellm?: string; type?: string; label?: string; cliLabel?: string} | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState("");
  const [imageGenLoading, setImageGenLoading] = useState(false);
  // 메시지 수정/재지시
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMode, setEditMode] = useState<string | null>(null);  // 재지시 배너용

  // 배포 버전 체크 (30초 간격)
  const { updateAvailable, doRefresh, setStreaming: setVersionStreaming } = useVersionCheck(30000);

  // ── UI state ──
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: ChatSession } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [mobileOverlay, setMobileOverlay] = useState<"sidebar" | "artifact" | null>(null);
  const swipeRef = useRef<{ startX: number; startY: number; t: number } | null>(null);
  const [selectedArtifactIdx, setSelectedArtifactIdx] = useState(0);

  // ── 프로젝트 추가 모달 ──
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectCode, setNewProjectCode] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectIcon, setNewProjectIcon] = useState("📁");

  // ── Proactive Briefing ──
  const [briefing, setBriefing] = useState<{ message: string; collapsed: boolean } | null>(null);
  const briefingShownRef = useRef<Set<string>>(new Set());

  // ── AADS-188D: diff_preview 승인 패널 ──
  const diffApproval = useDiffApproval();

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachments = useRef<Array<Record<string, any>>>([]);
  const [pendingPreviewFiles, setPendingPreviewFiles] = useState<File[]>([]);
  // C-2: Object URL 캐싱 + 메모리 누수 방지
  const pendingPreviewUrls = useMemo(
    () => pendingPreviewFiles.map((f) => f.type.startsWith("image/") ? URL.createObjectURL(f) : null),
    [pendingPreviewFiles]
  );
  useEffect(() => {
    return () => { pendingPreviewUrls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [pendingPreviewUrls]);
  const abortCtrl = useRef<AbortController | null>(null);
  const sessionSwitchRef = useRef(false);
  const activeSessionRef = useRef<string | null>(null);
  // BUG-2 FIX: 초기 로드와 워크스페이스 전환 구분
  const initialWsLoadRef = useRef(true);
  // BUG-REFRESH FIX: 초기 마운트 시 hash 삭제 방지
  const isFirstMountRef = useRef(true);
  // 스트리밍 중인 세션 ID 추적 — 세션 전환 시 다른 세션 내용 깜빡임 방지
  const streamingSessionRef = useRef<string | null>(null);
  // 세션 이동 시 생성 중이던 세션 ID 추적 (돌아오면 빠른 폴링)
  const pendingResponseSessions = useRef<Set<string>>(new Set());
  const [waitingBgResponse, setWaitingBgResponse] = useState(false);
  const [completionToast, setCompletionToast] = useState<string | null>(null);
  const lastToastTimeRef = useRef<number>(0);

  // ── Performance: ref로 폴링 useEffect 의존성 폭탄 방지 ──
  const streamingRef = useRef(streaming);
  const waitingBgRef = useRef(waitingBgResponse);
  const waitingBgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  useEffect(() => { waitingBgRef.current = waitingBgResponse; }, [waitingBgResponse]);

  // ── 토스트 디바운스 (5초 내 중복 차단) ──
  const showCompletionToast = useCallback((msg: string) => {
    const now = Date.now();
    if (now - lastToastTimeRef.current < 5000) return;
    lastToastTimeRef.current = now;
    setCompletionToast(msg);
    setTimeout(() => setCompletionToast(null), 3000);
  }, []);

  // ── Init theme ──
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("aads-chat-theme") : null;
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
  }, []);

  // ── API 키 상태 조회 (5분 간격) ──
  useEffect(() => {
    const fetchKeyStatus = async () => {
      try {
        const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
        const token = localStorage.getItem("aads_token");
        const headers: any = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        // Agent SDK 키 순서 API 우선
        const keyRes = await fetch(`${BASE}/settings/auth-keys`, { headers });
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          const primary = keyData?.keys?.[0];
          if (primary) {
            setApiKeyInfo({ type: "oauth", label: primary.label, cliLabel: primary.label, litellm: primary.prefix });
            return;
          }
        }
        // 폴백: 기존 health API
        const res = await fetch(`${BASE}/health/api-keys`);
        if (res.ok) {
          const data = await res.json();
          const lt = data?.anthropic?.litellm;
          const cli = data?.anthropic?.cli;
          if (lt) setApiKeyInfo({ litellm: lt.prefix, type: lt.type, label: lt.label, cliLabel: cli?.label });
        }
      } catch {}
    };
    fetchKeyStatus();
    const iv = setInterval(fetchKeyStatus, 300_000);
    return () => clearInterval(iv);
  }, []);

  // ── 버전 체크: 스트리밍 상태 동기화 ──
  useEffect(() => {
    setVersionStreaming(streaming);
  }, [streaming, setVersionStreaming]);

  // ── Ctrl+V 클립보드 파일 붙여넣기 (이미지 포함 모든 파일) ──
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        handleFiles(pastedFiles);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs]);

  // ── Responsive ──
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function check() {
      const w = window.innerWidth;
      const size: ScreenSize = w >= 1280 ? "desktop" : w >= 768 ? "tablet" : "mobile";
      setScreenSize(size);
      if (size === "mobile") { setLeftOpen(false); setArtifactMode("hidden"); }
      else if (size === "tablet") { setLeftOpen(false); }
      else { setLeftOpen(true); }
    }
    function debouncedCheck() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 300);
    }
    check();
    window.addEventListener("resize", debouncedCheck);
    return () => { window.removeEventListener("resize", debouncedCheck); if (debounceTimer) clearTimeout(debounceTimer); };
  }, []);

  // ── Load workspaces (restore last active from localStorage) ──
  useEffect(() => {
    chatApi<Workspace[]>("/chat/workspaces")
      .then(async (ws) => {
        setWorkspaces(ws);
        if (ws.length === 0) return;

        // 1. URL hash에서 세션 ID 추출
        const hashSid = typeof window !== "undefined" && window.location.hash
          ? window.location.hash.replace(/^#/, "")
          : null;

        // 2. hash 세션이 있으면 해당 세션의 워크스페이스를 먼저 확인
        if (hashSid) {
          try {
            const session = await chatApi<ChatSession>(`/chat/sessions/${hashSid}`);
            if (session && session.workspace_id) {
              const wsMatch = ws.find((w) => w.id === session.workspace_id);
              if (wsMatch) {
                setActiveWs(wsMatch.id);
                return;
              }
            }
          } catch {
            // 세션이 삭제된 경우 무시하고 fallback
          }
        }

        // 3. hash 세션 없으면 기존 localStorage 복원
        const savedWs = localStorage.getItem("aads-chat-activeWs");
        const match = savedWs && ws.find((w) => w.id === savedWs);
        setActiveWs(match ? match.id : ws[0].id);
      })
      .catch(console.error);
  }, []);

  // ── Load sessions on workspace change (restore last session from localStorage) ──
  useEffect(() => {
    if (!activeWs) return;
    localStorage.setItem("aads-chat-activeWs", activeWs);
    // BUG-2 FIX: 초기 로드 시에는 세션/메시지 초기화 생략 (새로고침 시 세션 유지)
    const isInitial = initialWsLoadRef.current;
    if (isInitial) {
      initialWsLoadRef.current = false;
    } else {
      // 실제 워크스페이스 전환 시에만 이전 세션 해제 — 프로젝트 컨텍스트 분리
      isInitialLoadRef.current = true;
      setActiveSession(null);
      setMessages([]);
    }
    chatApi<ChatSession[]>(`/chat/sessions?workspace_id=${activeWs}`)
      .then(async (loaded) => {
        setSessions(loaded);
        if (loaded.length === 0) {
          setActiveSession(null);
          setMessages([]);
          return;
        }
        // localStorage에 저장된 세션 복원 시도
        const hashSid = typeof window !== "undefined" && window.location.hash ? window.location.hash.replace(/^#/, "") : null;
        const lsSid = localStorage.getItem(`aads-chat-activeSession-${activeWs}`);
        const savedSid = hashSid || lsSid;
        let match = savedSid ? loaded.find((s) => s.id === savedSid) : null;
        // BUG-REFRESH FIX: 목록에 없으면 직접 API로 조회 시도
        if (savedSid && !match) {
          try {
            const directSession = await chatApi<ChatSession>(`/chat/sessions/${savedSid}`);
            if (directSession && directSession.workspace_id === activeWs) {
              loaded.unshift(directSession);
              setSessions([directSession, ...loaded.filter(s => s.id !== directSession.id)]);
              setActiveSession(directSession);
              return;
            }
          } catch {
            // 세션이 삭제된 경우 무시하고 fallback
          }
        }
        // BUG-2 FIX: updated_at 기준 정렬 후 최신 세션 선택
        const sorted = [...loaded].sort((a, b) =>
          new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
        );
        const chosen = match || sorted[0];
        setActiveSession(chosen);
      })
      .catch(console.error);
  }, [activeWs]);

  // ── Load messages & artifacts on session change ──
  useEffect(() => {
    // BUG-REFRESH FIX: 초기 마운트 시 activeSession이 null이면 hash 클리어 없이 리턴
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (!activeSession) return;
    }
    // 먼저 이전 세션ID 저장 (ref 업데이트 전에 읽어야 함)
    const prevSid = activeSessionRef.current;
    activeSessionRef.current = activeSession?.id || null;
    // 세션 ID를 localStorage에 저장 (페이지 새로고침 시 복원용)
    if (activeSession?.id && activeWs) {
      localStorage.setItem(`aads-chat-activeSession-${activeWs}`, activeSession.id);
      if (typeof window !== "undefined") {
        const currentHash = window.location.hash.replace(/^#/, "");
        if (currentHash !== activeSession.id) {
          window.history.replaceState(null, "", `#${activeSession.id}`);
        }
      }
    }
    // 세션 전환 시 진행 중인 스트리밍 중단 (이전 응답이 새 세션에 혼입 방지)
    if (streaming) {
      // 생성 중이던 세션 기록 — 돌아올 때 빠른 폴링으로 응답 감지
      if (prevSid) pendingResponseSessions.current.add(prevSid);
      sessionSwitchRef.current = true;
      streamingSessionRef.current = null;
      abortCtrl.current?.abort();
      setStreaming(false);
      setStreamBuf("");
      setToolStatus(null);
      setYellowWarning(null);
      setToolTurnInfo(null);
      msgQueueRef.current = [];
      setQueueCount(0);
    }
    // 세션 전환 시 edit state 초기화
    setEditingMsgId(null);
    setEditText("");
    // FIX: 세션 전환 시 즉시 초기화 (이전 세션 메시지/버블 flash 방지)
    setMessages([]);
    if (waitingBgTimeoutRef.current) { clearTimeout(waitingBgTimeoutRef.current); waitingBgTimeoutRef.current = null; }
    setWaitingBgResponse(false);
    setStreamBuf("");
    setSelectedArtifactIdx(0);
    if (!activeSession) {
      setArtifacts([]); setSessionCost(null); setSessionTurns(null); setBriefing(null);
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }
    // 백그라운드 생성 중이던 세션이면 빠른 폴링 시작
    const isPending = pendingResponseSessions.current.has(activeSession.id);
    // FIX: streaming-status API 확인 전까지 false 유지 (엉뚱한 세션에 버블 표시 방지)
    // isPending이어도 API로 재확인 후 설정
    // 세션 진입 시: streaming-status를 먼저 확인 → 결과에 따라 messages fetch
    // (병렬 실행하면 race condition으로 빈 화면 발생하므로 순차 실행)
    const fetchSid = activeSession.id;
    // BUG-1 FIX: cancelled 클로저로 race condition 방지 (activeSessionRef 대신)
    let cancelled = false;
    const loadMessages = (filterPlaceholder: boolean) =>
      chatApi<ChatMessage[]>(`/chat/messages?session_id=${fetchSid}&limit=1000&sort=desc`)
        .then((msgs) => msgs.reverse())
        .then((msgs) => {
          if (cancelled) return msgs;
          const processed = filterPlaceholder
            ? msgs.filter((m) => m.intent !== "streaming_placeholder")
            : msgs.map((m) =>
                m.intent === "streaming_placeholder"
                  ? { ...m, content: m.content || "⏳ AI가 응답을 생성 중입니다..." }
                  : m
              );
          if (processed.length > 0 || msgs.length === 0) {
            setMessages(processed);
          }
          return processed;
        })
        .catch((err) => {
          console.error("loadMessages failed:", err);
          return [] as ChatMessage[];
        });

    chatApi<{ is_streaming: boolean; just_completed?: boolean; tool_count?: number; last_tool?: string }>(
      `/chat/sessions/${fetchSid}/streaming-status`
    ).then(async (status) => {
      if (cancelled) return;
      if (status.is_streaming) {
        setWaitingBgResponse(true);
        pendingResponseSessions.current.add(fetchSid);
        if (waitingBgTimeoutRef.current) clearTimeout(waitingBgTimeoutRef.current);
        waitingBgTimeoutRef.current = setTimeout(() => {
          setWaitingBgResponse(false);
          pendingResponseSessions.current.delete(fetchSid);
        }, 180000); // P1-FIX: 60s→180s (장시간 도구 실행 대응)
        // 스트리밍 중 → placeholder 포함하여 메시지 로드
        await loadMessages(false);
      } else if (status.just_completed) {
        // 방금 완료 → placeholder 제외하고 메시지 로드
        pendingResponseSessions.current.delete(fetchSid);
        const msgs = await loadMessages(true);
        // 완료 직후인데 최종 응답이 아직 DB에 없을 수 있음 → 빠른 폴링 + 1.5초 후 재시도
        if (msgs && msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
          setWaitingBgResponse(true); // 빠른 폴링(1초) 활성화하여 최종 응답 캐치
          setTimeout(() => {
            if (cancelled) return;
            loadMessages(true).then((retryMsgs) => {
              if (retryMsgs && retryMsgs.length > 0 && retryMsgs[retryMsgs.length - 1].role === "assistant") {
                setWaitingBgResponse(false);
              }
              // 여전히 없으면 폴링이 계속 잡아줌 (60초 타임아웃)
            });
          }, 1500);
          if (waitingBgTimeoutRef.current) clearTimeout(waitingBgTimeoutRef.current);
          waitingBgTimeoutRef.current = setTimeout(() => setWaitingBgResponse(false), 60000);
        } else {
          setWaitingBgResponse(false);
        }
      } else {
        // 스트리밍 아님 → 일반 로드
        const msgs = await loadMessages(true);
        // pending 세션이었는데 assistant 응답이 없으면 → 재시도 (placeholder 삭제~응답 저장 gap)
        if (isPending && msgs && msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
          setWaitingBgResponse(true);
          setTimeout(() => {
            if (cancelled) return;
            loadMessages(true).then((retryMsgs) => {
              if (retryMsgs && retryMsgs.length > 0 && retryMsgs[retryMsgs.length - 1].role === "assistant") {
                setWaitingBgResponse(false);
                pendingResponseSessions.current.delete(fetchSid);
              }
            });
          }, 2000);
        } else if (isPending) {
          pendingResponseSessions.current.delete(fetchSid);
        }
      }
    }).catch(() => {
      // streaming-status API 실패 시 폴백: 일반 메시지 로드
      loadMessages(isPending ? false : true);
    });
    chatApi<Artifact[]>(`/chat/artifacts?workspace_id=${activeWs}`)
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
    // 프로액티브 브리핑: 세션 진입 시 1회만 표시
    const sid = activeSession.id;
    const shownKey = `briefing_${sid}`;
    if (!briefingShownRef.current.has(sid) && !sessionStorage.getItem(shownKey)) {
      chatApi<{ has_briefing: boolean; briefing_message: string }>(`/briefing?session_id=${sid}`)
        .then((res) => {
          if (res.has_briefing && res.briefing_message) {
            setBriefing({ message: res.briefing_message, collapsed: false });
            briefingShownRef.current.add(sid);
            sessionStorage.setItem(shownKey, "1");
          } else {
            setBriefing(null);
          }
        })
        .catch(() => setBriefing(null));
    } else {
      setBriefing(null);
    }
    // BUG-1 FIX: cleanup — 세션 전환 시 이전 fetch 응답 폐기
    return () => { cancelled = true; };
  }, [activeSession?.id]);

  // ── 안전장치: 메시지가 빈 배열로 렌더링될 때 500ms 후 자동 재시도 ──
  useEffect(() => {
    if (!activeSession?.id || messages.length > 0 || streaming) return;
    const sid = activeSession.id;
    const timer = setTimeout(() => {
      if (activeSessionRef.current !== sid) return;
      chatApi<ChatMessage[]>(`/chat/messages?session_id=${sid}&limit=1000&sort=desc`)
        .then((msgs) => msgs.reverse())
        .then((msgs) => {
          if (activeSessionRef.current !== sid) return;
          if (msgs.length > 0) {
            setMessages(msgs.filter((m) => m.intent !== "streaming_placeholder"));
          }
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [activeSession?.id, messages.length, streaming]);

  // 스크롤 이벤트로 near-bottom 감지
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      isNearBottomRef.current = container.scrollTop + container.clientHeight >= container.scrollHeight - 150;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Auto-scroll (초기 로드: instant, 이후: near-bottom일 때만) ──
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (isInitialLoadRef.current) {
      if (messages.length === 0) return; // FIX-2: 빈 DOM에서 stabilizer 낭비 방지
      container.scrollTop = container.scrollHeight;
      // PERF: ResizeObserver로 DOM 변화 감지 (setInterval 50ms → 이벤트 기반)
      const observer = new ResizeObserver(() => {
        container.scrollTop = container.scrollHeight;
      });
      observer.observe(container);
      // 3초 후 자동 해제 (초기 로드 완료)
      const timeout = setTimeout(() => {
        observer.disconnect();
        isInitialLoadRef.current = false;
        isNearBottomRef.current = true;
      }, 3000);
      return () => { observer.disconnect(); clearTimeout(timeout); };
    } else if (isNearBottomRef.current) {
      // near-bottom일 때만 smooth 스크롤
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]); // streamBuf 의존성 제거!

  // 스트리밍 중 스크롤 (200ms throttle, near-bottom일 때만)
  useEffect(() => {
    if (!streaming || !streamBuf || !isNearBottomRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 200);
    return () => clearTimeout(timer);
  }, [streaming, streamBuf]);

  // FIX-4: 브리핑 렌더 후 재스크롤 (브리핑이 DOM에 추가되면 scrollHeight 변경됨)
  useEffect(() => {
    if (!briefing || isInitialLoadRef.current) return;
    const container = messagesContainerRef.current;
    if (container && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [briefing]);

  // ── 백그라운드 메시지 폴링 (Pipeline C / Agent 완료 메시지 실시간 수신) ──
  // P1-FIX: waitingBgResponse=true→1초, 아니면 5초 폴링
  // + just_completed 감지 시 자동 reload + 토스트 표시
  // PERF: streaming/waitingBgResponse를 ref로 참조하여 의존성 폭탄 방지
  useEffect(() => {
    if (!activeSession?.id) return;
    const sid = activeSession.id;
    // BUG-SESSION-MIX FIX: cancelled 클로저로 세션 전환 시 in-flight 폴링 응답 폐기
    let cancelled = false;
    // PERF: 고정 1초 interval, waitingBg 아닐 때는 5틱마다 실행 (=5초)
    let tickCount = 0;
    const iv = setInterval(async () => {
      if (cancelled) return;
      // FIX-3: 초기 스크롤 완료 전까지 폴링 skip (간섭 방지)
      if (isInitialLoadRef.current) return;
      const _streaming = streamingRef.current;
      const _waitingBg = waitingBgRef.current;
      tickCount++;
      if (!_waitingBg && tickCount % 5 !== 0) return;
      // ── just_completed 감지: streaming-status 폴링 (스트리밍 중에도 항상 체크) ──
      try {
        const ss = await chatApi<{ is_streaming: boolean; just_completed?: boolean }>(
          `/chat/sessions/${sid}/streaming-status`
        );
        if (cancelled) return;
        if (ss.just_completed) {
          pendingResponseSessions.current.delete(sid);
          setWaitingBgResponse(false);
          setStreaming(false);
          const freshMsgs = await chatApi<ChatMessage[]>(`/chat/messages?session_id=${sid}&limit=1000&sort=desc`).then(msgs => msgs.reverse());
          if (cancelled) return;
          if (freshMsgs) {
            const filtered = freshMsgs.filter((m: ChatMessage) => m.intent !== "streaming_placeholder");
            if (filtered.length > 0) {
              setMessages(filtered);
            }
          }
          // 자동 트리거(시스템 메시지) 응답이면 토스트 생략
          const _lastUser979 = freshMsgs?.slice().reverse().find((m: ChatMessage) => m.role === "user");
          if (!_lastUser979?.content?.startsWith("[시스템]") && _lastUser979?.intent !== "auto_reaction") {
            showCompletionToast("응답이 완료되었습니다");
          }
          return;
        }
        // 서버에서 스트리밍 아님 + 프론트 streaming=true → SSE 끊김 감지
        if (!ss.is_streaming && !ss.just_completed && _streaming) {
          setStreaming(false);
          setWaitingBgResponse(false);
          const freshMsgs = await chatApi<ChatMessage[]>(`/chat/messages?session_id=${sid}&limit=1000&sort=desc`).then(msgs => msgs.reverse());
          if (cancelled) return;
          if (freshMsgs) {
            const filtered = freshMsgs.filter((m: ChatMessage) => m.intent !== "streaming_placeholder");
            if (filtered.length > 0) {
              setMessages(filtered);
            }
          }
          return;
        }
        // 스트리밍 중인데 waitingBgResponse가 꺼져 있으면 활성화 (세션 복귀 시)
        if (ss.is_streaming && !_waitingBg && !_streaming) {
          setWaitingBgResponse(true);
          pendingResponseSessions.current.add(sid);
          if (waitingBgTimeoutRef.current) clearTimeout(waitingBgTimeoutRef.current);
          waitingBgTimeoutRef.current = setTimeout(() => {
            setWaitingBgResponse(false);
            pendingResponseSessions.current.delete(sid);
          }, 180000);
        }
      } catch { /* streaming-status 실패 시 아래 메시지 폴링으로 폴백 */ }
      // 메시지 폴링은 스트리밍 중이면 생략 (SSE로 수신 중)
      if (_streaming && !_waitingBg) return;
      try {
        const rawLatest = await chatApi<ChatMessage[]>(`/chat/messages?session_id=${sid}&limit=5&sort=desc`);
        if (cancelled) return;
        if (!rawLatest || rawLatest.length === 0) return;
        const latest = _waitingBg
          ? rawLatest.map((m) => m.intent === "streaming_placeholder" ? { ...m, content: m.content || "⏳ AI가 응답을 생성 중입니다..." } : m)
          : rawLatest.filter((m) => m.intent !== "streaming_placeholder");
        if (latest.length === 0) return;
        if (_waitingBg) {
          const hasPlaceholder = rawLatest.some((m) => m.intent === "streaming_placeholder");
          const hasNewFinalAi = rawLatest.some((m) => m.role === "assistant" && m.intent !== "streaming_placeholder");
          // PERF: AI 메시지 도착 즉시 waitingBgResponse 해제 (placeholder 잔존 여부 무관)
          if (hasNewFinalAi) {
            pendingResponseSessions.current.delete(sid);
            setWaitingBgResponse(false);
            try {
              const allMsgs = await chatApi<ChatMessage[]>(`/chat/messages?session_id=${sid}&limit=1000&sort=desc`).then(msgs => msgs.reverse());
              if (cancelled) return;
              if (allMsgs) {
                const filtered = allMsgs.filter((m: ChatMessage) => m.intent !== "streaming_placeholder");
                if (filtered.length > 0) {
                  setMessages(filtered);
                }
              }
            } catch { /* 재조회 실패 무시 */ }
            // 자동 트리거(시스템 메시지) 응답이면 토스트 생략
            const _lastUser1029 = rawLatest?.slice().reverse().find((m: ChatMessage) => m.role === "user");
            if (!_lastUser1029?.content?.startsWith("[시스템]") && _lastUser1029?.intent !== "auto_reaction") {
              showCompletionToast("응답이 완료되었습니다");
            }
            return;
          }
          if (hasPlaceholder) {
            const phMsg = rawLatest.find((m) => m.intent === "streaming_placeholder");
            if (phMsg) {
              setMessages(prev => {
                const idx = prev.findIndex((m) => m.intent === "streaming_placeholder");
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...phMsg, content: phMsg.content || "⏳ 생성 중..." };
                  return updated;
                }
                return [...prev, { ...phMsg, content: phMsg.content || "⏳ 생성 중..." }];
              });
              return;
            }
          }
        }
        setMessages((prev) => {
          const hasStoppedMsg = prev.some((m) => m.id.startsWith("stopped-"));
          if (hasStoppedMsg && !_waitingBg) return prev;
          const existingIds = new Set(prev.map((m) => m.id));
          const existingHashes = new Set(
            prev.map((m) => `${m.role}:${(m.content || "").slice(0, 200)}`)
          );
          const newMsgs = latest.filter(
            (m) => !existingIds.has(m.id) && !existingHashes.has(`${m.role}:${(m.content || "").slice(0, 200)}`)
          );
          if (newMsgs.length === 0) {
            let replaced = false;
            const updated = prev.map((m) => {
              if (m.id.startsWith("ai-") || m.id.startsWith("tmp-") || m.id.startsWith("stopped-")) {
                const match = latest.find(
                  (l) => l.role === m.role && (l.content || "").slice(0, 200) === (m.content || "").slice(0, 200)
                );
                if (match) { replaced = true; return match; }
              }
              return m;
            });
            return replaced ? updated : prev;
          }
          return [...prev, ...newMsgs].sort(
            (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );
        });
      } catch { /* 폴링 실패 무시 */ }
    }, 1000); // 고정 1초 간격, 내부에서 waitingBg 여부에 따라 실행 여부 결정
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeSession?.id]); // PERF: 의존성을 세션 ID만으로 축소

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
      isInitialLoadRef.current = true;
      setActiveSession(s);
      setMessages([]);
      if (screenSize !== "desktop") setMobileOverlay(null);
      return s;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function addProject() {
    const code = newProjectCode.trim().toUpperCase();
    const name = newProjectName.trim();
    if (!code || !name) return;
    try {
      const ws = await chatApi<Workspace>("/chat/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: `[${code}] ${name}`,
          icon: newProjectIcon || "📁",
          color: "#6366F1",
        }),
      });
      setWorkspaces((prev) => [...prev, ws]);
      setActiveWs(ws.id);
      setShowAddProject(false);
      setNewProjectCode("");
      setNewProjectName("");
      setNewProjectIcon("📁");
    } catch (e) { console.error("Failed to add project:", e); }
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

  // ── Image generation ──
  const handleImageGen = async () => {
    if (!imageGenPrompt.trim() || !activeSession) return;
    setImageGenLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdrs() },
        body: JSON.stringify({ prompt: imageGenPrompt }),
      });
      const data = await res.json();
      if (data.url) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-img-${Date.now()}`,
            session_id: activeSession.id,
            role: "user",
            content: `🎨 이미지 생성: ${imageGenPrompt}`,
            created_at: new Date().toISOString(),
          },
          {
            id: `ai-img-${Date.now()}`,
            session_id: activeSession.id,
            role: "assistant",
            content: `![generated](${data.url})\n\n> 🖼️ **${data.provider}** 생성 완료`,
            created_at: new Date().toISOString(),
          },
        ]);
        setShowImageGen(false);
        setImageGenPrompt("");
      } else {
        alert(data.detail || "이미지 생성 실패");
      }
    } catch (e) {
      console.error("이미지 생성 실패:", e);
      alert("이미지 생성 중 오류가 발생했습니다");
    } finally {
      setImageGenLoading(false);
    }
  };

  // ── Send message (SSE streaming) ──
  async function sendMessage(queuedContent?: string, _unused?: undefined, retryCount?: number) {
    const content = queuedContent || (chatInputRef.current?.getValue() || input).trim();
    const hasFiles = pendingAttachments.current.length > 0;
    if (!content && !hasFiles) return;
    sessionSwitchRef.current = false;

    // 이미지 생성 명령 감지: "이미지: [설명]" 또는 "/img [설명]"
    const imgMatch = content.match(/^(?:이미지[:：]\s*|\/img\s+)(.+)/i);
    if (imgMatch && !queuedContent) {
      const imgPrompt = imgMatch[1].trim();
      setInput(""); chatInputRef.current?.clear();
      setImageGenLoading(true);
      // 유저 메시지로 표시
      const userImgMsg: ChatMessage = {
        id: `tmp-img-${Date.now()}`,
        session_id: activeSession?.id || "",
        role: "user",
        content: content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userImgMsg]);
      try {
        const imgData = await chatApi<{ url?: string; data?: string; error?: string }>("/image/generate", {
          method: "POST",
          body: JSON.stringify({ prompt: imgPrompt }),
        });
        const imgSrc = imgData.url || (imgData.data ? `data:image/png;base64,${imgData.data}` : null);
        const aiImgMsg: ChatMessage = {
          id: `img-${Date.now()}`,
          session_id: activeSession?.id || "",
          role: "assistant",
          content: imgSrc
            ? `![생성된 이미지](${imgSrc})

> 프롬프트: ${imgPrompt}`
            : "이미지 생성에 실패했습니다.",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiImgMsg]);
      } catch (e) {
        console.error("이미지 생성 오류:", e);
      } finally {
        setImageGenLoading(false);
      }
      return;
    }

    // streaming 중이면 백엔드 인터럽트 큐에 push (CEO 인터럽트)
    if (streaming && !queuedContent) {
      const interruptContent = content || "(파일 첨부)";
      // 첨부파일 캡처 후 즉시 클리어
      const interruptAttachments = pendingAttachments.current.length > 0
        ? [...pendingAttachments.current] : [];
      pendingAttachments.current = [];
      setPendingPreviewFiles([]);
      msgQueueRef.current.push(interruptContent);
      setQueueCount(msgQueueRef.current.length);
      setInput(""); chatInputRef.current?.clear();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      // 대화창에 추가 지시를 user 메시지로 즉시 표시 (첨부파일 포함)
      const attachLabel = interruptAttachments.length > 0
        ? ` 📎 ${interruptAttachments.length}개 파일` : "";
      setMessages(prev => [...prev, {
        id: `interrupt-${Date.now()}`,
        session_id: activeSession?.id || "",
        role: "user" as const,
        content: `💬 **[추가 지시]** ${interruptContent}${attachLabel}`,
        created_at: new Date().toISOString(),
      }]);
      // 백엔드 인터럽트 큐에 push (첨부파일 포함)
      if (activeSession?.id) {
        chatApi(`/chat/sessions/${activeSession.id}/interrupt`, {
          method: "POST",
          body: JSON.stringify({ content: interruptContent, attachments: interruptAttachments }),
        }).then(() => {
          // interrupt API 성공 → 큐에서 제거 (done 후 재전송 방지)
          const idx = msgQueueRef.current.indexOf(interruptContent);
          if (idx !== -1) msgQueueRef.current.splice(idx, 1);
          setQueueCount(msgQueueRef.current.length);
          // 대기 완료 시 경고도 즉시 해제
          if (msgQueueRef.current.length === 0) setYellowWarning(null);
        }).catch((e: unknown) => {
          console.warn("interrupt push failed, keeping in queue for retry:", e);
        });
      }
      // 추가 지시 접수 안내
      setYellowWarning(`추가 지시 접수됨 (대기 ${msgQueueRef.current.length}건)${attachLabel}`);
      setTimeout(() => setYellowWarning(null), 5000);
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

    setInput(""); chatInputRef.current?.clear();
    setEditMode(null);
    setStreaming(true);
    setStreamBuf("");
    setToolLogs([]);
    streamingSessionRef.current = sessionId;
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    // C-3: stale closure 방지 — state 초기화 전에 로컬 변수로 캡처
    const filesToSend = [...pendingPreviewFiles];
    setPendingPreviewFiles([]);

    // 첨부 이미지 미리보기 URL 캡처 (메시지 버블 표시용)
    const _previewUrls = filesToSend
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f));

    // 이 요청의 세션 ID 캡처 — 세션 전환 감지용
    const requestSessionId = sessionId;
    const isStale = () => activeSessionRef.current !== requestSessionId;

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
      attachmentPreviews: _previewUrls.length > 0 ? _previewUrls : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    abortCtrl.current = new AbortController();
    // 90초 비활성 타임아웃 → heartbeat(5초) + 실제 데이터 모두 리셋
    // 절대 타임아웃(300초)이 무한 연장 방지 안전망
    let sseTimeout = setTimeout(() => {
      abortCtrl.current?.abort();
    }, 90000);
    const resetSseTimeout = () => {
      clearTimeout(sseTimeout);
      sseTimeout = setTimeout(() => {
        abortCtrl.current?.abort();
      }, 90000);
    };

    // 절대 타임아웃 5분 — heartbeat와 무관하게 streaming 강제 종료
    const maxStreamTimeout = setTimeout(() => {
      abortCtrl.current?.abort();
    }, 300000);

    let full = "";
    try {
      const rawFiles = filesToSend;
      const attachments = pendingAttachments.current.length > 0
        ? [...pendingAttachments.current] : [];
      pendingAttachments.current = [];

      let fetchBody: BodyInit;
      let fetchHeaders: Record<string, string> = { ...authHdrs() };

      if (rawFiles.length > 0) {
        // FormData: raw File 객체로 전송 (서버에서 base64 변환)
        const formData = new FormData();
        formData.append("session_id", sessionId!);
        formData.append("content", content);
        if (model) formData.append("model_override", model);
        rawFiles.forEach((f) => formData.append("files", f));
        fetchBody = formData;
        // Content-Type 헤더는 브라우저가 multipart/form-data + boundary 자동 설정
      } else {
        fetchHeaders["Content-Type"] = "application/json";
        fetchBody = JSON.stringify({ session_id: sessionId, content, model_override: model, attachments });
      }

      const res = await fetch(`${BASE_URL}/chat/messages/send`, {
        method: "POST",
        headers: fetchHeaders,
        body: fetchBody,
        signal: abortCtrl.current.signal,
      });

      if (!res.ok) {
        const statusCode = res.status;
        // 502/503: 서버 재시작 — 자동 재시도 (최대 2회, 5초 간격)
        if ((statusCode === 502 || statusCode === 503) && !retryCount) {
          // 프론트엔드에 추가한 사용자 메시지 제거 (DB 미저장이므로)
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          setStreaming(false);
          setStreamBuf("");
          setToolStatus("🔄 서버 재시작 감지 — 5초 후 자동 재전송...");
          await new Promise((r) => setTimeout(r, 5000));
          setToolStatus(null);
          return sendMessage(content, undefined, (retryCount || 0) + 1);
        }
        const _errMap: Record<number, string> = {
          502: "서버가 재시작 중입니다.",
          503: "서버가 일시적으로 과부하 상태입니다.",
          504: "응답 시간이 초과되었습니다.",
          429: "요청이 너무 많습니다.",
        };
        // 실패 시 사용자 메시지를 입력창에 복원
        setInput(content); chatInputRef.current?.setValue(content);
        // 프론트엔드에 추가한 사용자 메시지 제거 (DB 미저장이므로)
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        throw new Error((_errMap[statusCode] || `서버 오류 (${statusCode})`) + " 메시지가 입력창에 복원되었습니다.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";
      let gotFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // 세션이 전환되었으면 남은 스트림 무시
        if (isStale()) { reader.cancel(); break; }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (isStale()) break;
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          let sseError: Error | null = null;
          try {
            const ev = JSON.parse(raw);
            // P0-FIX: heartbeat도 timeout 리셋 — 도구 30s+ 실행 시 연결 유지 필수
            // 절대 타임아웃(300s)이 무한 연장 방지 안전망 역할
            if (ev.type === "heartbeat") {
              resetSseTimeout();
              // 도구 실행 중 진행상황 표시 (서버가 tool_count/last_tool 포함 시)
              if (ev.tool_count && ev.last_tool) {
                setToolStatus(`🔧 ${ev.last_tool} 실행 중... (도구 ${ev.tool_count}회)`);
              }
              continue;
            }
            // real data events도 timeout 리셋
            resetSseTimeout();
            if (ev.type === "stream_reset") {
              // F8: 출력 검증 실패 → 재시도 시 이전 텍스트 초기화
              full = "";
              setStreamBuf("");
              setToolStatus("🔄 응답 재검증 중...");
              continue;
            } else if (ev.type === "delta" && typeof ev.content === "string") {
              full += ev.content;
              if (!isStale()) setStreamBuf(full);
              if (toolStatus && !isStale()) setToolStatus(null);
            } else if (ev.type === "token" && typeof ev.text === "string") {
              // legacy fallback
              full += ev.text;
              if (!isStale()) setStreamBuf(full);
            } else if (ev.type === "done") {
              gotFinal = true;
              setStreamBuf("");
              setStreaming(false);
              setToolStatus(null);
              setToolLogs([]);
              setYellowWarning(null);
              setToolTurnInfo(null);
              // AADS-190: 세션 비용/턴 업데이트
              if (ev.session_cost) setSessionCost(ev.session_cost);
              if (ev.session_turns) setSessionTurns(ev.session_turns);
              // full이 비어있으면 빈 버블 방지 — 도구만 실행된 경우
              if (full.trim()) {
                setMessages((prev) => [
                  // 기존 streaming_placeholder 제거 후 최종 응답 추가
                  ...prev.filter((m) => m.intent !== "streaming_placeholder"),
                  {
                    id: `ai-${Date.now()}`,
                    session_id: requestSessionId!,
                    role: "assistant" as const,
                    content: full,
                    model_used: ev.model || undefined,
                    intent: ev.intent || undefined,
                    input_tokens: ev.input_tokens || undefined,
                    output_tokens: ev.output_tokens || undefined,
                    cost_usd: ev.cost ? parseFloat(ev.cost) : undefined,
                    created_at: new Date().toISOString(),
                  },
                ]);
              }
              break; // done 이벤트 수신 → for 루프 탈출
            } else if (ev.type === "tool_use" && ev.tool_name) {
              const toolIcons: Record<string, string> = {
                read_remote_file: "📄", read_github_file: "📄", list_remote_dir: "📁",
                write_remote_file: "✏️", patch_remote_file: "✏️",
                run_remote_command: "⚡", query_database: "🗄️", query_project_database: "🗄️",
                web_search: "🔍", web_search_brave: "🔍", jina_read: "🌐",
                crawl4ai_fetch: "🌐", deep_crawl: "🌐", deep_research: "🔬",
                health_check: "💊", get_all_service_status: "📊",
                pipeline_c_start: "🚀", delegate_to_agent: "🤖",
                save_note: "📝", recall_notes: "🧠",
              };
              const icon = toolIcons[ev.tool_name] || "🔧";
              const inp = ev.tool_input || {};
              const paramText = inp.path || inp.query || inp.url || inp.command
                || inp.file_path || inp.task || inp.project
                || (Object.values(inp).filter((v: unknown) => typeof v === "string")[0] as string)
                || "";
              const sub = paramText ? String(paramText).slice(0, 80) : undefined;
              if (!isStale()) {
                setToolLogs(prev => [...prev, { icon, text: `${ev.tool_name} 실행 중`, sub }]);
                setToolStatus(`${icon} ${ev.tool_name} 실행 중...`);
              }
            } else if (ev.type === "tool_result" && ev.tool_name) {
              const resultPreview = ev.content ? String(ev.content).slice(0, 60).replace(/\n/g, " ") : "";
              if (!isStale()) {
                setToolLogs(prev => {
                  const updated = [...prev];
                  const lastIdx = [...updated].reverse().findIndex(l => l.text.includes(ev.tool_name));
                  if (lastIdx >= 0) {
                    const realIdx = updated.length - 1 - lastIdx;
                    updated[realIdx] = { ...updated[realIdx], icon: "✅", text: `${ev.tool_name} 완료`, sub: resultPreview || undefined };
                  }
                  return updated;
                });
                setToolStatus(`✅ ${ev.tool_name} 완료 — 응답 생성 중...`);
              }
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
              setStreaming(false);
              setToolStatus(null);
              setMessages((prev) => [...prev.filter((m) => m.intent !== "streaming_placeholder"), ev.message as ChatMessage]);
              break; // done → for 루프 탈출
            } else if (ev.type === "yellow_limit") {
              // Yellow 도구 연속 실행 경고
              setYellowWarning(ev.content || `쓰기 도구 연속 ${ev.consecutive_count || 5}회 호출`);
            } else if (ev.type === "tool_turn_limit") {
              // 도구 턴 한도 자동 연장 알림
              setToolTurnInfo(ev.content || `도구 턴 ${ev.current_turn}회 → ${ev.extended_to}회 연장`);
            } else if (ev.type === "interrupt_applied") {
              // CEO 인터럽트가 LLM에 반영됨 → 큐에서 해당 지시 제거 (완료 후 중복 전송 방지)
              if (msgQueueRef.current.length > 0) {
                msgQueueRef.current.shift();
              }
              // 무조건 큐 카운트 동기화 (배지 확실 해제)
              setQueueCount(msgQueueRef.current.length);
              // 토스트로만 알림 (assistant 메시지 추가 안 함 → 중복 방지)
              setYellowWarning(`✅ 추가 지시 반영됨 (대기 ${msgQueueRef.current.length}건)`);
              setTimeout(() => setYellowWarning(null), 3000);
            } else if (ev.type === "error") {
              // error를 inner catch 밖으로 전파 (inner catch가 삼키지 않도록)
              sseError = new Error(ev.error || ev.content || "Unknown streaming error");
            }
          } catch {
            // ignore malformed SSE lines (JSON parse 실패 등)
          }
          // SSE error 이벤트는 outer catch로 전파
          if (sseError) throw sseError;
        }
        if (gotFinal) break; // done 이벤트 수신 → while 루프 탈출
      }

      if (isStale()) { /* 세션 전환됨 — UI 업데이트 안 함 */ }
      else if (!gotFinal && full) {
        setStreamBuf("");
        setMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, session_id: requestSessionId!, role: "assistant", content: full },
        ]);
      } else if (!gotFinal && !full) {
        // 도구만 실행되고 텍스트 없이 스트림 종료 — DB에서 응답 복구 시도
        setStreamBuf("");
        setToolStatus("⏳ 응답 확인 중...");
        for (let retry = 0; retry < 3; retry++) {
          await new Promise((r) => setTimeout(r, 3000 * (retry + 1)));
          try {
            const msgs = await chatApi<ChatMessage[]>(
              `/chat/messages?session_id=${requestSessionId}&limit=5&offset=0`
            );
            const aiMsg = [...msgs].reverse().find((m) => m.role === "assistant");
            if (aiMsg) {
              setMessages((prev) => [...prev, aiMsg]);
              break;
            }
          } catch { /* retry */ }
        }
        setToolStatus(null);
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
        // P1-FIX: SSE 끊김 → waitingBgResponse 활성화로 빠른 폴링(1s) 전환
        // 서버에서 백그라운드 생성이 계속될 수 있으므로 just_completed 감지 필요
        if (sessionId) {
          pendingResponseSessions.current.add(sessionId);
          setWaitingBgResponse(true);
          setTimeout(() => {
            pendingResponseSessions.current.delete(sessionId!);
            setWaitingBgResponse(false);
          }, 120000); // 2분 후 자동 해제
        }
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
                `/chat/messages?session_id=${sessionId}&limit=1000&sort=desc`
              ).then(msgs => msgs.reverse());
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
      clearTimeout(maxStreamTimeout);
      // 스트리밍 상태는 항상 해제 — 세션 전환 여부와 무관하게 무한 버블 방지
      streamingSessionRef.current = null;
      setStreaming(false);
      setStreamBuf("");
      setToolStatus(null);
      if (!isStale()) {
        // streaming_placeholder 잔여물 정리
        setMessages((prev) => prev.filter((m) => m.intent !== "streaming_placeholder"));

        // P1-FIX: SSE 종료 직후 즉시 just_completed 체크 (interval 대기 없이)
        // 백그라운드 완료 메시지를 놓치지 않도록 500ms/2s/5s 3회 원샷 체크
        if (sessionId) {
          const _sid = sessionId;
          const _checkCompletion = async (delay: number) => {
            await new Promise((r) => setTimeout(r, delay));
            if (activeSessionRef.current !== _sid) return;
            try {
              const ss = await chatApi<{ is_streaming: boolean; just_completed?: boolean }>(
                `/chat/sessions/${_sid}/streaming-status`
              );
              if (ss.just_completed) {
                pendingResponseSessions.current.delete(_sid);
                setWaitingBgResponse(false);
                const freshMsgs = await chatApi<ChatMessage[]>(`/chat/messages?session_id=${_sid}&limit=1000&sort=desc`).then(msgs => msgs.reverse());
                if (freshMsgs) {
                  setMessages(freshMsgs.filter((m: ChatMessage) => m.intent !== "streaming_placeholder"));
                }
                // 자동 트리거(시스템 메시지) 응답이면 토스트 생략
                const _lastUser1696 = freshMsgs?.slice().reverse().find((m: ChatMessage) => m.role === "user");
                if (!_lastUser1696?.content?.startsWith("[시스템]") && _lastUser1696?.intent !== "auto_reaction") {
                  showCompletionToast("응답이 완료되었습니다");
                }
              }
            } catch { /* 원샷 체크 실패 — 기존 interval 폴링이 대신 감지 */ }
          };
          _checkCompletion(1000);
        }

        // 스트리밍 완료 시 큐 잔여분 전체 클리어 (interrupt로 이미 전달됨)
        if (msgQueueRef.current.length > 0) {
          console.log("[queue-clear] streaming done, clearing", msgQueueRef.current.length, "remaining queued messages (already sent via interrupt)");
          msgQueueRef.current = [];
        }
        setQueueCount(0);
      }
    }
  }

  function stopStreaming() {
    abortCtrl.current?.abort();
    const buf = streamBuf;
    setStreaming(false);
    setStreamBuf("");
    setToolStatus(null);
    setYellowWarning(null);
    setToolTurnInfo(null);
    if (buf && activeSession) {
      const stoppedMsg: ChatMessage = {
        id: `stopped-${Date.now()}`,
        session_id: activeSession.id,
        role: "assistant",
        content: buf + "\n\n_(응답 중지됨)_",
      };
      setMessages((prev) => [...prev, stoppedMsg]);
    }
    // 백엔드 프로세스도 강제 중단
    if (activeSession) {
      fetch(`${BASE_URL}/chat/sessions/${activeSession.id}/stop`, {
        method: "POST",
        headers: { ...authHdrs() },
      }).catch(() => {});
      // 중지 후 DB에서 최신 상태를 한 번 fetch하여 동기화 (폴링 중복 방지)
      setTimeout(() => {
        if (!activeSession) return;
        chatApi<ChatMessage[]>(`/chat/messages?session_id=${activeSession.id}&limit=1000&sort=desc`)
          .then((msgs) => msgs.reverse())
          .then((msgs) => {
            if (activeSessionRef.current !== activeSession.id) return;
            const filtered = msgs.filter((m) => m.intent !== "streaming_placeholder");
            // stopped 메시지가 있으면 유지하면서 DB 메시지와 병합
            setMessages((prev) => {
              const stoppedMsgs = prev.filter((m) => m.id.startsWith("stopped-"));
              const dbIds = new Set(filtered.map((m) => m.id));
              // DB에 없는 stopped 메시지만 끝에 추가
              const merged = [...filtered, ...stoppedMsgs.filter((m) => !dbIds.has(m.id))];
              return merged.sort(
                (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
              );
            });
          })
          .catch(() => {});
      }, 1500);
    }
  }

  // ── 방식A: 수정 후 재전송 ──
  const handleEditResend = useCallback(async (msgId: string, newContent: string) => {
    if (!activeSession) return;
    try {
      // 1) 기존 메시지 + AI 응답 삭제
      const res = await fetch(`${BASE_URL}/chat/messages/${msgId}`, {
        method: "DELETE",
        headers: { ...authHdrs() },
      });
      if (res.ok) {
        const data = await res.json();
        const deletedCount = data.deleted_count || 0;
        // 프론트에서도 해당 메시지 + 바로 다음 AI 메시지 제거
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx < 0) return prev;
          // 해당 메시지 + 바로 다음 assistant 메시지 제거
          const next = prev[idx + 1];
          const idsToRemove = new Set([msgId]);
          if (next && next.role === "assistant") idsToRemove.add(next.id);
          return prev.filter((m) => !idsToRemove.has(m.id));
        });
      }
      // 2) 수정된 내용으로 재전송
      await sendMessage(newContent);
    } catch (e) {
      console.error("Edit resend failed:", e);
    }
    setEditingMsgId(null);
    setEditText("");
  }, [activeSession, sendMessage]);

  // ── 메시지 삭제 (user: 메시지+AI응답 삭제, assistant: 해당 응답만 삭제) ──
  const handleDeleteMessage = useCallback(async (msgId: string, role: string) => {
    if (!confirm(role === "user" ? "이 메시지와 AI 응답을 삭제할까요?" : "이 응답을 삭제할까요?")) return;
    try {
      const res = await fetch(`${BASE_URL}/chat/messages/${msgId}`, {
        method: "DELETE",
        headers: { ...authHdrs() },
      });
      if (res.ok) {
        setMessages((prev) => {
          if (role === "user") {
            const idx = prev.findIndex((m) => m.id === msgId);
            if (idx < 0) return prev;
            const idsToRemove = new Set([msgId]);
            const next = prev[idx + 1];
            if (next && next.role === "assistant") idsToRemove.add(next.id);
            return prev.filter((m) => !idsToRemove.has(m.id));
          } else {
            return prev.filter((m) => m.id !== msgId);
          }
        });
      }
    } catch (e) {
      console.error("Delete message failed:", e);
    }
  }, []);

  // ── 방식B: 입력창에 복사 (재지시) ──
  const handleCopyToInput = useCallback((content: string) => {
    setInput(content); chatInputRef.current?.setValue(content);
    setEditMode("resend");
    // 포커스
    setTimeout(() => {
      const ta = document.querySelector("textarea");
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 100);
  }, []);

  // ── File attachment (클라이언트 측 inline 변환 — 서버 업로드 불필요) ──
  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    // 로컬 미리보기용 File 객체 즉시 저장
    setPendingPreviewFiles((prev) => [...prev, ...fileArray]);

    const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
    const TEXT_EXTS = new Set([
      "txt", "md", "csv", "json", "py", "js", "ts", "tsx", "jsx",
      "html", "css", "yaml", "yml", "toml", "sh", "sql", "log",
      "xml", "ini", "conf", "cfg", "rs", "go", "java", "c", "cpp",
      "h", "rb", "php", "swift", "kt",
    ]);
    const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv", "flv", "m4v"]);
    const VIDEO_MAX_BYTES = 20 * 1024 * 1024; // 20MB
    const _sid = activeSession?.id;

    for (const file of fileArray) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isImage = IMAGE_EXTS.has(ext) || file.type.startsWith("image/");
      const isText = TEXT_EXTS.has(ext) || file.type.startsWith("text/");
      const isVideo = VIDEO_EXTS.has(ext) || file.type.startsWith("video/");

      // 이미지: 서버 업로드 → file_id 기반 (fallback: base64)
      if (isImage && _sid) {
        try {
          const result = await uploadChatFile(file, _sid);
          pendingAttachments.current.push({
            type: "image", file_id: result.file_id,
            media_type: result.mime_type, name: result.original_name,
            file_url: result.file_url, thumbnail_url: result.thumbnail_url,
          });
        } catch {
          // fallback: base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const mediaType = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
          pendingAttachments.current.push({ type: "image", base64, media_type: mediaType, name: file.name });
        }
      } else if (isImage) {
        // 세션 없으면 기존 base64 방식
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const mediaType = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
        pendingAttachments.current.push({ type: "image", base64, media_type: mediaType, name: file.name });
      } else if (isText) {
        // 텍스트 파일: 서버 업로드 시도 → fallback: 로컬 읽기
        if (_sid) {
          try {
            const result = await uploadChatFile(file, _sid);
            pendingAttachments.current.push({
              type: "text", file_id: result.file_id, name: result.original_name,
              file_url: result.file_url, file_size: result.file_size,
            });
          } catch {
            // fallback: 로컬 읽기
            const content = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => resolve("");
              reader.readAsText(file.slice(0, 500_000));
            });
            pendingAttachments.current.push({ type: "text", name: file.name, content });
          }
        } else {
          const content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve("");
            reader.readAsText(file.slice(0, 500_000));
          });
          pendingAttachments.current.push({ type: "text", name: file.name, content });
        }
      } else if (ext === "pdf" || file.type === "application/pdf") {
        // PDF: 서버 업로드 시도 → fallback base64
        if (_sid) {
          try {
            const result = await uploadChatFile(file, _sid);
            pendingAttachments.current.push({
              type: "pdf", file_id: result.file_id, name: result.original_name,
              media_type: "application/pdf", file_url: result.file_url,
            });
          } catch {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
              reader.onerror = () => resolve("");
              reader.readAsDataURL(file);
            });
            pendingAttachments.current.push({ type: "pdf", base64, name: file.name, media_type: "application/pdf" });
          }
        } else {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          });
          pendingAttachments.current.push({ type: "pdf", base64, name: file.name, media_type: "application/pdf" });
        }
      } else if (isVideo) {
        // 동영상: 20MB 이하 → 서버 업로드 시도 → fallback base64
        if (file.size > VIDEO_MAX_BYTES) {
          pendingAttachments.current.push({ type: "file", name: file.name, error: `동영상 파일이 너무 큽니다 (최대 20MB). 현재: ${(file.size / 1024 / 1024).toFixed(1)}MB` });
        } else if (_sid) {
          try {
            const result = await uploadChatFile(file, _sid);
            pendingAttachments.current.push({
              type: "video", file_id: result.file_id, name: result.original_name,
              media_type: result.mime_type, file_url: result.file_url,
            });
          } catch {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
              reader.onerror = () => resolve("");
              reader.readAsDataURL(file);
            });
            const mediaType = file.type || `video/${ext}`;
            pendingAttachments.current.push({ type: "video", base64, name: file.name, media_type: mediaType });
          }
        } else {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          });
          const mediaType = file.type || `video/${ext}`;
          pendingAttachments.current.push({ type: "video", base64, name: file.name, media_type: mediaType });
        }
      } else {
        // 기타 파일: 서버 업로드 시도
        if (_sid) {
          try {
            const result = await uploadChatFile(file, _sid);
            pendingAttachments.current.push({
              type: "file", file_id: result.file_id, name: result.original_name,
              file_url: result.file_url, file_size: result.file_size,
            });
          } catch {
            pendingAttachments.current.push({ type: "file", name: file.name });
          }
        } else {
          pendingAttachments.current.push({ type: "file", name: file.name });
        }
      }
    }
    textareaRef.current?.focus();
  }

  // Ctrl+V 클립보드 붙여넣기 — 위(activeWs 의존) 핸들러가 모든 파일 타입 처리

  // 개별 첨부 파일 제거
  function removePendingFile(idx: number) {
    setPendingPreviewFiles((prev) => prev.filter((_, i) => i !== idx));
    pendingAttachments.current = pendingAttachments.current.filter((_, i) => i !== idx);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  // ── Action chips ──
  function applyChip(prefix: string) {
    setInput((prev) => (prev ? `${prefix} ${prev}` : `${prefix} `)); setHasInput(true);
    textareaRef.current?.focus();
  }

  // ── Keyboard ──
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 IME 조합 중이면 키 이벤트 무시 (깨짐 방지)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!uploading) sendMessage(); return; }
    // Ctrl+Z: 마지막 큐 메시지 취소
    if (e.ctrlKey && e.key === "z" && queueCount > 0) {
      e.preventDefault();
      const removed = msgQueueRef.current.pop();
      setQueueCount(msgQueueRef.current.length);
      if (removed) { setInput(removed); chatInputRef.current?.setValue(removed); }
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
  const filteredArtifacts = artifacts.filter((a) => {
    if (artifactTab === "report") return a.artifact_type === "report" || a.artifact_type === "text" || a.artifact_type === "file" || a.artifact_type === "table";
    if (artifactTab === "code") return a.artifact_type === "code";
    if (artifactTab === "chart") return a.artifact_type === "chart" || a.artifact_type === "image";
    if (artifactTab === "dashboard") return a.artifact_type === "dashboard";
    return false;
  });
  const activeArtifact = filteredArtifacts[selectedArtifactIdx] || filteredArtifacts[0] || null;
  const artifactCounts: Record<string, number> = {
    report: artifacts.filter((a) => a.artifact_type === "report" || a.artifact_type === "text" || a.artifact_type === "file" || a.artifact_type === "table").length,
    code: artifacts.filter((a) => a.artifact_type === "code").length,
    chart: artifacts.filter((a) => a.artifact_type === "chart" || a.artifact_type === "image").length,
    dashboard: artifacts.filter((a) => a.artifact_type === "dashboard").length,
  };

  // C1: swipe gesture handlers
  function onSwipeStart(e: React.TouchEvent) {
    if (screenSize === "desktop") return;
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY, t: Date.now() };
  }
  function onSwipeEnd(e: React.TouchEvent) {
    if (screenSize === "desktop" || !swipeRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeRef.current.startX;
    const dy = t.clientY - swipeRef.current.startY;
    const dt = Date.now() - swipeRef.current.t;
    swipeRef.current = null;
    if (dt > 500 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 80 && !mobileOverlay) setMobileOverlay("sidebar");
    else if (dx < -80 && !mobileOverlay) setMobileOverlay("artifact");
    else if (dx < -80 && mobileOverlay === "sidebar") setMobileOverlay(null);
    else if (dx > 80 && mobileOverlay === "artifact") setMobileOverlay(null);
  }

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
        height: "100dvh",
        overflow: "hidden",
        background: "var(--ct-bg)",
        color: "var(--ct-text)",
        transition: "background 0.3s, color 0.3s",
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
      }}
      onClick={() => setContextMenu(null)}
      onTouchStart={onSwipeStart}
      onTouchEnd={onSwipeEnd}
    >
      {updateAvailable && <UpdateBanner onRefresh={doRefresh} />}
      {/* ── 완료 토스트 ── */}
      {completionToast && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#22c55e", color: "#fff", padding: "10px 24px",
          borderRadius: 8, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          animation: "fadeIn 0.3s ease",
        }}>
          {completionToast}
        </div>
      )}
      {/* ── Image generation modal ── */}
      {showImageGen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowImageGen(false); }}
        >
          <div
            style={{
              background: "var(--ct-card, #1e2130)",
              borderRadius: "16px",
              padding: "24px",
              width: "400px",
              maxWidth: "90vw",
              border: "1px solid var(--ct-border, #2d3148)",
            }}
          >
            <h3 style={{ color: "#a78bfa", marginBottom: "16px", fontSize: "1rem" }}>
              🎨 AI 이미지 생성
            </h3>
            <textarea
              value={imageGenPrompt}
              onChange={(e) => setImageGenPrompt(e.target.value)}
              placeholder="이미지 프롬프트 입력 (예: 서울 야경, 미래도시, 귀여운 강아지...)"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleImageGen(); } }}
              style={{
                width: "100%",
                height: "100px",
                background: "var(--ct-bg, #0f1117)",
                border: "1px solid var(--ct-border, #2d3148)",
                borderRadius: "8px",
                color: "var(--ct-text, #e2e8f0)",
                padding: "10px",
                fontSize: "0.85rem",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowImageGen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--ct-border, #2d3148)",
                  background: "transparent",
                  color: "var(--ct-text2, #94a3b8)",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleImageGen}
                disabled={imageGenLoading}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  color: "#fff",
                  cursor: imageGenLoading ? "wait" : "pointer",
                  fontWeight: 600,
                  opacity: imageGenLoading ? 0.7 : 1,
                }}
              >
                {imageGenLoading ? "생성 중..." : "생성"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── 프로젝트 추가 모달 ── */}
      {showAddProject && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowAddProject(false)}
        >
          <div
            style={{
              background: "var(--ct-card)", borderRadius: "16px",
              padding: "24px", width: "360px", maxWidth: "90vw",
              border: "1px solid var(--ct-border)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--ct-text)" }}>
              새 프로젝트 추가
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--ct-text2)", display: "block", marginBottom: "4px" }}>
                  프로젝트 코드 (영문)
                </label>
                <input
                  autoFocus
                  value={newProjectCode}
                  onChange={(e) => setNewProjectCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="예: MYAPP"
                  maxLength={10}
                  style={{
                    width: "100%", padding: "8px 12px", fontSize: "14px",
                    background: "var(--ct-input)", color: "var(--ct-text)",
                    border: "1px solid var(--ct-border)", borderRadius: "8px",
                    outline: "none", boxSizing: "border-box", fontWeight: 700,
                    letterSpacing: "1px",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--ct-accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--ct-border)")}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "var(--ct-text2)", display: "block", marginBottom: "4px" }}>
                  프로젝트 이름
                </label>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="예: 내 프로젝트"
                  maxLength={50}
                  style={{
                    width: "100%", padding: "8px 12px", fontSize: "14px",
                    background: "var(--ct-input)", color: "var(--ct-text)",
                    border: "1px solid var(--ct-border)", borderRadius: "8px",
                    outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--ct-accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--ct-border)")}
                  onKeyDown={(e) => { if (e.key === "Enter") addProject(); }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "var(--ct-text2)", display: "block", marginBottom: "4px" }}>
                  아이콘 (이모지)
                </label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {["📁", "💻", "🚀", "📊", "🎯", "🔧", "📱", "🌐", "🤖", "💰"].map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewProjectIcon(icon)}
                      style={{
                        padding: "6px 10px", fontSize: "16px",
                        background: newProjectIcon === icon ? "var(--ct-accent)" : "var(--ct-hover)",
                        border: newProjectIcon === icon ? "2px solid var(--ct-accent)" : "1px solid var(--ct-border)",
                        borderRadius: "8px", cursor: "pointer",
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {newProjectCode && (
                <div style={{ fontSize: "12px", color: "var(--ct-text2)", padding: "4px 0" }}>
                  미리보기: <strong style={{ color: "var(--ct-text)" }}>[{newProjectCode}] {newProjectName || "..."}</strong>
                  <br />
                  세션명 예시: <strong style={{ color: "var(--ct-accent)" }}>{newProjectCode}-001</strong>, {newProjectCode}-002, ...
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  onClick={() => setShowAddProject(false)}
                  style={{
                    flex: 1, padding: "8px", fontSize: "13px",
                    background: "var(--ct-hover)", color: "var(--ct-text)",
                    border: "1px solid var(--ct-border)", borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  onClick={addProject}
                  disabled={!newProjectCode || !newProjectName.trim()}
                  style={{
                    flex: 1, padding: "8px", fontSize: "13px", fontWeight: 600,
                    background: newProjectCode && newProjectName.trim() ? "var(--ct-accent)" : "var(--ct-hover)",
                    color: "#fff", border: "none", borderRadius: "8px",
                    cursor: newProjectCode && newProjectName.trim() ? "pointer" : "not-allowed",
                    opacity: newProjectCode && newProjectName.trim() ? 1 : 0.5,
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        style={{ display: "none" }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
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

      {/* LEFT SIDEBAR */}
      <ChatSidebar
        screenSize={screenSize} leftOpen={leftOpen} setLeftOpen={setLeftOpen}
        mobileOverlay={mobileOverlay} setMobileOverlay={setMobileOverlay}
        activeWsObj={activeWsObj} activeWsName={activeWsName}
        workspaces={workspaces} activeWs={activeWs} setActiveWs={setActiveWs}
        filteredSessions={filteredSessions}
        renaming={renaming} setRenaming={setRenaming} commitRename={commitRename}
        activeSession={activeSession} setActiveSession={setActiveSession}
        isInitialLoadRef={isInitialLoadRef}
        onSessionContextMenu={onSessionContextMenu}
        search={search} setSearch={setSearch}
        createSession={createSession} setShowAddProject={setShowAddProject}
        theme={theme} toggleTheme={toggleTheme}
      />


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
          ref={messagesContainerRef}
          className="ct-messages-scroll"
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

          {/* 프로액티브 브리핑 카드 */}
          {briefing && (
            <div
              className="ct-msg-enter"
              style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: "8px",
              }}
            >
              <div style={{ maxWidth: "85%", width: "100%" }}>
                <div
                  style={{
                    padding: briefing.collapsed ? "10px 16px" : "14px 18px",
                    borderRadius: "18px",
                    borderBottomLeftRadius: "4px",
                    fontSize: "13px",
                    lineHeight: "1.7",
                    background: theme === "dark"
                      ? "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.08))"
                      : "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.05))",
                    color: "var(--ct-text)",
                    border: `1px solid ${theme === "dark" ? "rgba(99,102,241,0.3)" : "rgba(59,130,246,0.2)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setBriefing((prev) =>
                        prev ? { ...prev, collapsed: !prev.collapsed } : null
                      )
                    }
                  >
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>
                      📋 프로액티브 브리핑
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--ct-text2)",
                        marginLeft: "8px",
                        userSelect: "none",
                      }}
                    >
                      {briefing.collapsed ? "▶ 펼치기" : "▼ 접기"}
                    </span>
                  </div>
                  {!briefing.collapsed && (
                    <div style={{ marginTop: "8px" }}>
                      <MarkdownBlock text={briefing.message} />
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--ct-text2)",
                    marginTop: "4px",
                    marginLeft: "4px",
                  }}
                >
                  시스템 자동 브리핑 · {new Date().toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageItem
              key={msg.id || idx}
              msg={msg}
              idx={idx}
              streaming={streaming}
              editingMsgId={editingMsgId}
              editText={editText}
              setEditingMsgId={setEditingMsgId}
              setEditText={setEditText}
              handleDeleteMessage={handleDeleteMessage}
              handleCopyToInput={handleCopyToInput}
              handleEditResend={handleEditResend}
            />
          ))}

          {/* 백그라운드 응답 생성 중 indicator (세션 이동 후 복귀 시) */}
          {waitingBgResponse && !streaming && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "18px",
                  borderBottomLeftRadius: "4px",
                  fontSize: "14px",
                  maxWidth: "80%",
                  background: "var(--ct-ai)",
                  color: "var(--ct-text)",
                  border: "1px solid var(--ct-border)",
                  display: "flex", alignItems: "center", gap: "8px",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: "7px", height: "7px", borderRadius: "50%",
                      background: "var(--ct-accent)", display: "inline-block",
                      animation: "ct-bounce 1.2s infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
                <span style={{ fontSize: "13px", color: "var(--ct-muted)" }}>
                  백그라운드에서 응답 생성 중...
                </span>
              </div>
            </div>
          )}

          {/* Streaming indicator */}
          {streaming && streamingSessionRef.current === activeSession?.id && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
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
                {(toolLogs.length > 0 || toolStatus) && (
                  <div style={{
                    fontSize: "12px", borderRadius: "8px",
                    background: "rgba(108,99,255,0.06)",
                    border: "1px solid rgba(108,99,255,0.2)",
                    padding: "8px 10px",
                    marginBottom: streamBuf ? "8px" : "0",
                    maxHeight: "180px", overflowY: "auto",
                  }}>
                    {toolLogs.map((log, i) => (
                      <div key={i} style={{ marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", color: log.icon === "✅" ? "#4ade80" : "var(--ct-accent)" }}>
                          <span>{log.icon}</span>
                          <span style={{ fontWeight: 500 }}>{log.text}</span>
                        </div>
                        {log.sub && (
                          <div style={{ color: "#888", fontSize: "11px", marginLeft: "18px", fontFamily: "monospace", wordBreak: "break-all" }}>
                            {log.sub}
                          </div>
                        )}
                      </div>
                    ))}
                    {toolStatus && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--ct-accent)", marginTop: toolLogs.length > 0 ? "4px" : "0" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--ct-accent)", animation: "ct-bounce 1.2s infinite", display: "inline-block" }} />
                        <span>{toolStatus}</span>
                      </div>
                    )}
                  </div>
                )}
                {streamBuf ? (
                  <MarkdownBlock text={streamBuf} />
                ) : !toolStatus && toolLogs.length === 0 ? (
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
              {/* ⏹ 중지 버튼 */}
              <button
                onClick={stopStreaming}
                style={{
                  marginTop: "4px", marginLeft: "4px",
                  padding: "2px 8px",
                  fontSize: "11px", fontWeight: 500,
                  background: "transparent", color: "var(--ct-muted)",
                  border: "1px solid var(--ct-border)", borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#ef4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ct-muted)"; e.currentTarget.style.borderColor = "var(--ct-border)"; }}
              >■ 중지</button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: screenSize === "mobile" ? "8px 8px" : "12px 14px",
            paddingBottom: screenSize === "mobile" ? "calc(56px + env(safe-area-inset-bottom, 0px))" : "12px",
            borderTop: "1px solid var(--ct-border)",
            background: "var(--ct-sb)",
            flexShrink: 0,
          }}
        >
          {/* 메모리 & 맥락 뷰어 */}
          <MemoryContextBar sessionId={activeSession?.id ?? null} />

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

          {/* 업로드 진행 표시 */}
          {uploading && (
            <div style={{
              display: "flex", alignItems: "center", gap: "6px",
              marginBottom: "6px", padding: "4px 10px",
              fontSize: "12px", color: "var(--ct-accent)",
              background: "var(--ct-hover)", borderRadius: "8px",
            }}>
              ⏳ 파일 업로드 중...
            </div>
          )}

          {/* 첨부된 파일 목록 (이미지 썸네일 + 텍스트 파일 배지) */}
          {pendingPreviewFiles.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px",
            }}>
              {pendingPreviewFiles.map((file, i) => {
                const isImg = file.type.startsWith("image/");
                return (
                  <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    {isImg && pendingPreviewUrls[i] ? (
                      <img
                        src={pendingPreviewUrls[i]}
                        alt={file.name}
                        style={{
                          width: "64px", height: "64px", objectFit: "cover",
                          borderRadius: "8px", border: "1px solid var(--ct-border)",
                        }}
                      />
                    ) : (
                      <span style={{
                        fontSize: "11px", padding: "4px 10px",
                        background: "var(--ct-hover)", borderRadius: "8px",
                        color: "var(--ct-text2)", border: "1px solid var(--ct-border)",
                        maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        📄 {file.name}
                      </span>
                    )}
                    <button
                      onClick={() => removePendingFile(i)}
                      style={{
                        position: "absolute", top: "-4px", right: "-4px",
                        width: "16px", height: "16px", borderRadius: "50%",
                        background: "#ef4444", color: "#fff", border: "none",
                        cursor: "pointer", fontSize: "10px", lineHeight: "16px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 0,
                      }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action chips — mobile: toggled grid / desktop: always visible row */}
          {(screenSize !== "mobile" || showMobileActions) && (
            <div
              className={screenSize === "mobile" ? "ct-action-grid" : undefined}
              style={screenSize !== "mobile" ? {
                display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap",
              } : undefined}
            >
              {[
                { icon: "🔍", label: "검색", prefix: "[검색]" },
                { icon: "🧪", label: "딥리서치", prefix: "[딥리서치]" },
                { icon: "📎", label: "파일", action: "file" as const },
                { icon: "🎨", label: "이미지생성", action: "imagegen" as const },
                { icon: "📹", label: "동영상", prefix: "[동영상]" },
                { icon: "🎤", label: "음성", prefix: "[음성]" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => {
                    if ("action" in chip && chip.action === "file") {
                      fileInputRef.current?.click();
                      if (screenSize === "mobile") setShowMobileActions(false);
                      return;
                    }
                    if ("action" in chip && chip.action === "imagegen") {
                      setShowImageGen(true);
                      if (screenSize === "mobile") setShowMobileActions(false);
                      return;
                    }
                    if ("prefix" in chip) {
                      applyChip(chip.prefix);
                      if (screenSize === "mobile") setShowMobileActions(false);
                    }
                  }}
                  style={{
                    padding: screenSize === "mobile" ? "10px 14px" : "4px 10px",
                    fontSize: screenSize === "mobile" ? "14px" : "12px",
                    background: "var(--ct-hover)",
                    border: "1px solid var(--ct-border)",
                    borderRadius: screenSize === "mobile" ? "12px" : "16px",
                    cursor: "pointer",
                    color: "var(--ct-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    ...(screenSize === "mobile" ? { justifyContent: "center" } : {}),
                  }}
                >
                  {chip.icon} {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* 재지시 모드 배너 (방식B) */}
          {editMode && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "8px", padding: "6px 12px", borderRadius: "8px",
              background: "rgba(109,40,217,0.15)", border: "1px solid rgba(109,40,217,0.3)",
              fontSize: "12px", color: "var(--ct-accent)",
            }}>
              <span>🔄 이전 메시지를 수정하여 재전송합니다</span>
              <button onClick={() => { setEditMode(null); setInput(""); chatInputRef.current?.clear(); }}
                style={{ marginLeft: "8px", padding: "2px 8px", borderRadius: "6px",
                  background: "rgba(255,255,255,0.1)", border: "none", color: "var(--ct-text2)",
                  cursor: "pointer", fontSize: "11px" }}>
                취소
              </button>
            </div>
          )}
          {/* Textarea + send button — mobile: [+] [textarea [send]] */}
          <div style={{ display: "flex", gap: screenSize === "mobile" ? "6px" : "8px", alignItems: "flex-end" }}>
            {/* Mobile "+" toggle button */}
            {screenSize === "mobile" && (
              <button
                onClick={() => setShowMobileActions(!showMobileActions)}
                style={{
                  width: "44px", height: "44px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: showMobileActions ? "var(--ct-accent)" : "var(--ct-hover)",
                  color: showMobileActions ? "#fff" : "var(--ct-text)",
                  border: "1px solid var(--ct-border)",
                  borderRadius: "50%", cursor: "pointer",
                  fontSize: "20px", fontWeight: 300,
                  transition: "all 0.2s",
                }}
              >
                {showMobileActions ? "✕" : "+"}
              </button>
            )}
            {/* Mobile: newline button */}
            {screenSize === "mobile" && (
              <button
                onClick={() => {
                  const ta = chatInputRef.current;
                  if (ta) {
                    const cur = ta.getValue();
                    ta.setValue(cur + "\n");
                    ta.focus();
                  }
                }}
                style={{
                  width: "36px", height: "44px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none",
                  color: "var(--ct-text2)", cursor: "pointer",
                  fontSize: "18px", padding: 0,
                }}
                title="줄바꿈"
              >
                ↵
              </button>
            )}
            {/* Textarea wrapper with integrated send */}
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "flex-end" }}>
              <ChatInput
                ref={chatInputRef}
                screenSize={screenSize}
                onKeyDown={onKeyDown}
                onHasInput={setHasInput}
                placeholder={screenSize === "mobile" ? "메시지 입력... (↵으로 줄바꿈)" : undefined}
              />
              {/* Mobile: send button inside textarea area */}
              {screenSize === "mobile" && (
                <button
                  onClick={streaming && !hasInput && pendingPreviewFiles.length === 0 ? stopStreaming : () => { if (!uploading) sendMessage(); }}
                  disabled={uploading || (!streaming && !hasInput && pendingPreviewFiles.length === 0)}
                  style={{
                    position: "absolute", right: "6px", bottom: "6px",
                    width: "36px", height: "36px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: uploading ? "#9ca3af" : streaming ? (hasInput || pendingPreviewFiles.length > 0 ? "var(--ct-accent)" : "#ef4444") : "var(--ct-accent)",
                    color: "#fff", border: "none", borderRadius: "50%",
                    cursor: uploading ? "wait" : (streaming || hasInput || pendingPreviewFiles.length > 0 ? "pointer" : "not-allowed"),
                    opacity: uploading || (!streaming && !hasInput && pendingPreviewFiles.length === 0) ? 0.4 : 1,
                    transition: "all 0.2s",
                    fontSize: "16px",
                  }}
                >
                  {uploading ? "⏳" : streaming ? (hasInput ? "📋" : "⏹") : "➤"}
                </button>
              )}
            </div>
            {/* Desktop: separate button group */}
            {screenSize !== "mobile" && (
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              {/* API 키 상태 표시 */}
              {/* 인증 키 토글 (클릭하여 Naver/Gmail 전환) */}
              <button
                onClick={async () => {
                  try {
                    const BASE = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
                    const token = localStorage.getItem("aads_token");
                    const headers: any = { "Content-Type": "application/json" };
                    if (token) headers["Authorization"] = `Bearer ${token}`;
                    // 현재 순서 조회
                    const cur = await fetch(`${BASE}/settings/auth-keys`, { headers }).then(r => r.json());
                    const currentPrimary = cur?.keys?.[0]?.label || "Naver";
                    const next = currentPrimary === "Naver" ? "gmail" : "naver";
                    // 순서 변경
                    const res = await fetch(`${BASE}/settings/auth-keys`, {
                      method: "POST", headers, body: JSON.stringify({ primary: next }),
                    }).then(r => r.json());
                    const newLabel = res?.keys?.[0]?.label || next;
                    setApiKeyInfo((prev: any) => ({ ...prev, label: newLabel, cliLabel: newLabel }));
                  } catch (e) { console.error("key switch:", e); }
                }}
                title={`현재: ${apiKeyInfo?.label || "?"} 우선 (클릭하여 전환)`}
                style={{
                  fontSize: "10px", whiteSpace: "nowrap",
                  padding: "2px 8px", borderRadius: "8px",
                  background: (apiKeyInfo?.label || "").includes("Naver") ? "#22c55e18" : "#3b82f618",
                  color: (apiKeyInfo?.label || "").includes("Naver") ? "#22c55e" : "#3b82f6",
                  border: `1px solid ${(apiKeyInfo?.label || "").includes("Naver") ? "#22c55e40" : "#3b82f640"}`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {(apiKeyInfo?.label || "").includes("Naver") ? "🟢" : "🔵"} {apiKeyInfo?.label || "?"}{apiKeyInfo?.cliLabel && apiKeyInfo.cliLabel !== apiKeyInfo.label ? ` / CLI:${apiKeyInfo.cliLabel}` : ""}
              </button>
              {/* AADS-190: 세션 비용/턴 표시 */}
              {sessionCost && (
                <span style={{
                  fontSize: "11px", color: "var(--ct-text2)", whiteSpace: "nowrap",
                  padding: "2px 8px", background: "var(--ct-hover)", borderRadius: "8px",
                }}>
                  {sessionCost}{sessionTurns ? ` | ${sessionTurns}턴` : ""}
                </span>
              )}
              {/* 큐 상태 표시 + 취소 버튼 (큐에 메시지가 있을 때) */}
              {queueCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "4px 10px", fontSize: "12px",
                  background: "#f59e0b20", border: "1px solid #f59e0b60",
                  borderRadius: "10px", color: "#f59e0b", whiteSpace: "nowrap",
                }}>
                  <span title={msgQueueRef.current.join(" | ")}>
                    📋 대기 {queueCount}건: {(msgQueueRef.current[0] || "").slice(0, 20)}{(msgQueueRef.current[0] || "").length > 20 ? "..." : ""}
                  </span>
                  <button
                    onClick={() => { msgQueueRef.current = []; setQueueCount(0); setYellowWarning(null); }}
                    style={{
                      padding: "2px 8px", fontSize: "11px", fontWeight: 600,
                      background: "#f59e0b", color: "#fff", border: "none", borderRadius: "6px",
                      cursor: "pointer",
                    }}
                    title="대기 메시지 전체 취소 (Ctrl+Z)"
                  >✕ 취소</button>
                </div>
              )}
              {/* 전송/대기추가/중단 버튼 */}
              <button
                onClick={streaming && !hasInput && pendingPreviewFiles.length === 0 ? stopStreaming : () => { if (!uploading) sendMessage(); }}
                disabled={uploading || (!streaming && !hasInput && pendingPreviewFiles.length === 0)}
                style={{
                  padding: "10px 20px", fontSize: "14px", fontWeight: 600,
                  background: uploading ? "#9ca3af" : streaming ? (hasInput || pendingPreviewFiles.length > 0 ? "var(--ct-accent)" : "#ef4444") : "var(--ct-accent)",
                  color: "#fff", border: "none", borderRadius: "12px",
                  cursor: uploading ? "wait" : (streaming || hasInput || pendingPreviewFiles.length > 0 ? "pointer" : "not-allowed"),
                  opacity: uploading || (!streaming && !hasInput && pendingPreviewFiles.length === 0) ? 0.5 : 1,
                  transition: "background 0.2s", whiteSpace: "nowrap",
                }}
              >
                {uploading ? "업로드중..." : streaming ? (hasInput ? "대기 전송" : "⏹ 중단") : "전송"}
              </button>
            </div>
            )}
          </div>
          {/* Mobile: queue count badge */}
          {screenSize === "mobile" && queueCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              padding: "4px 10px", marginTop: "6px", fontSize: "12px",
              background: "#f59e0b20", border: "1px solid #f59e0b60",
              borderRadius: "10px", color: "#f59e0b",
            }}>
              <span>📋 대기 {queueCount}건</span>
              <button
                onClick={() => { msgQueueRef.current = []; setQueueCount(0); }}
                style={{
                  padding: "2px 8px", fontSize: "11px", fontWeight: 600,
                  background: "#f59e0b", color: "#fff", border: "none", borderRadius: "6px",
                  cursor: "pointer",
                }}
              >취소</button>
            </div>
          )}
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

      {/* RIGHT ARTIFACT PANEL */}
      <ChatArtifactPanel
        screenSize={screenSize} showArtifactPanel={showArtifactPanel}
        artifactMode={artifactMode} setArtifactMode={setArtifactMode}
        mobileOverlay={mobileOverlay} setMobileOverlay={setMobileOverlay}
        artifacts={artifacts} artifactTab={artifactTab} setArtifactTab={setArtifactTab}
        artifactCounts={artifactCounts}
        filteredArtifacts={filteredArtifacts} activeArtifact={activeArtifact}
        selectedArtifactIdx={selectedArtifactIdx} setSelectedArtifactIdx={setSelectedArtifactIdx}
        activeSession={activeSession} copyArtifact={copyArtifact} toDirective={toDirective}
      />

    </div>
  );
}
