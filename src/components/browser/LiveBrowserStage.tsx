"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapFramePoint } from "@/lib/liveBrowserCoordinates";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const RECONNECT_DELAYS = [1000, 2000, 5000];

export type LiveBrowserLane = "server" | "pc";
export type LiveBrowserConnection = "idle" | "connecting" | "live" | "failed";

type ControlResult = Record<string, unknown> & { recipe_step?: Record<string, unknown> };

type Props = {
  lane: LiveBrowserLane;
  taskId?: string;
  agentId?: string;
  chatSessionId?: string;
  pcUrl?: string;
  interactive?: boolean;
  fallbackSrc?: string;
  emptyMessage?: string;
  onControlAck?: (result: ControlResult) => void;
  onControlError?: (message: string) => void;
  onRecipeStep?: (step: Record<string, unknown>) => void | Promise<void>;
  onConnectionChange?: (status: LiveBrowserConnection) => void;
};

export function websocketUrl(path: string, token: string): string {
  const base = API_BASE_URL.replace(/^http/, "ws").replace(/\/$/, "");
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${path}${token ? `${separator}access_token=${encodeURIComponent(token)}` : ""}`;
}

export default function LiveBrowserStage({
  lane,
  taskId,
  agentId,
  chatSessionId,
  pcUrl = "",
  interactive = false,
  fallbackSrc = "",
  emptyMessage = "실시간 화면을 기다리고 있습니다.",
  onControlAck,
  onControlError,
  onRecipeStep,
  onConnectionChange,
}: Props) {
  const [connection, setConnection] = useState<LiveBrowserConnection>("idle");
  const [frameSrc, setFrameSrc] = useState("");
  const [viewport, setViewport] = useState({ width: 1366, height: 768 });
  const [inputText, setInputText] = useState("");
  const [secretInput, setSecretInput] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [controlBusy, setControlBusy] = useState(false);
  const pcTab = lane === "pc" && Boolean(chatSessionId);
  const frameIdRef = useRef("");
  const pendingRef = useRef<{ id: string; resolve: (ok: boolean) => void; timer: number } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const handlersRef = useRef({ onControlAck, onControlError, onRecipeStep, onConnectionChange });
  handlersRef.current = { onControlAck, onControlError, onRecipeStep, onConnectionChange };

  const updateConnection = useCallback((next: LiveBrowserConnection) => {
    setConnection(next);
    handlersRef.current.onConnectionChange?.(next);
  }, []);

  useEffect(() => {
    const id = lane === "server" ? taskId : agentId;
    retryRef.current = 0;
    frameIdRef.current = "";
    let navigationSent = false;
    setControlBusy(false);
    setFrameSrc("");
    setInputText("");
    setSecretInput(false);
    if (!id || (lane === "pc" && !chatSessionId)) {
      setFrameSrc("");
      updateConnection("idle");
      return;
    }
    let disposed = false;
    let reconnectTimer: number | undefined;
    let frameTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      const token = localStorage.getItem("aads_token") || "";
      const path = lane === "server"
        ? `/browser-tasks/${encodeURIComponent(id)}/live-stream`
        : `/browser-bridge/chat/${encodeURIComponent(chatSessionId!)}/pc-live`;
      const ws = new WebSocket(websocketUrl(path, token));
      socketRef.current = ws;
      frameTimer = window.setTimeout(() => ws.close(), pcTab ? 90000 : 20000);
      updateConnection("connecting");

      ws.onopen = () => {
        if (disposed) return;
        if (pcTab) {
          ws.send(JSON.stringify({ agent_id: agentId, url: navigationSent ? "" : pcUrl }));

        }
        window.clearTimeout(frameTimer);
        frameTimer = window.setTimeout(() => ws.close(), pcTab ? 90000 : 20000);
      };
      ws.onmessage = (event) => {
        if (disposed || socketRef.current !== ws) return;
        try {
          const message = JSON.parse(String(event.data || "{}"));
          if (message.type === "ready") {
            navigationSent = true;
            setViewport({ width: Number(message.width) || 1366, height: Number(message.height) || 768 });
            // A socket handshake is not proof of frame delivery.
          } else if (message.type === "frame" && message.frame) {
            retryRef.current = 0;
            window.clearTimeout(frameTimer);
            updateConnection("live");
            frameIdRef.current = String(message.frame_id || "");
            if (pcTab) frameTimer = window.setTimeout(() => ws.close(), 5000);
            setFrameSrc(`data:${message.media_type || "image/jpeg"};base64,${message.frame}`);
            setViewport({ width: Number(message.width) || 1366, height: Number(message.height) || 768 });
          } else if (message.frame) {
            retryRef.current = 0;
            window.clearTimeout(frameTimer);
            updateConnection("live");
            setFrameSrc(`data:image/jpeg;base64,${message.frame}`);
          } else if (message.type === "control_ack") {
            const pending = pendingRef.current;
            if (pending && pending.id === message.request_id) { window.clearTimeout(pending.timer); pending.resolve(true); pendingRef.current = null; }
            const result = (message.result || {}) as ControlResult;
            handlersRef.current.onControlAck?.(result);
            if (result.recipe_step) void handlersRef.current.onRecipeStep?.(result.recipe_step);
          } else if (message.type === "control_error" || message.type === "error") {
            const pending = pendingRef.current;
            if (pending && (pending.id === message.request_id || message.type === "error")) { window.clearTimeout(pending.timer); pending.resolve(false); pendingRef.current = null; }
            const errors: Record<string, string> = { chat_browser_already_in_use: "이 채팅 브라우저는 다른 창에서 사용 중입니다. 기존 연결을 닫고 다시 연결하세요.", pc_tab_unavailable_or_update_required: "PC 연결 또는 PC Agent 업데이트를 확인하세요.", pc_update_required: "PC Agent 업데이트 후 다시 연결하세요.", pc_offline: "PC 연결이 끊겼습니다. PC Agent 연결 후 다시 시도하세요.", pc_tenant_mismatch: "이 계정에서 사용할 수 없는 PC입니다.", tab_binding_expired: "연결이 만료되었습니다. 다시 연결하세요.", stale_frame_retry: "화면이 바뀌었습니다. 최신 화면에서 다시 조작하세요.", focus_input_first: "먼저 입력칸을 클릭하세요.", explicit_tab_required: "전용 탭을 확인할 수 없습니다. PC 브라우저 탭 상태를 확인하세요." };
            handlersRef.current.onControlError?.(errors[String(message.error)] || String(message.error || "unknown"));
            if (message.type === "error") ws.close();
          }
        } catch {
          handlersRef.current.onControlError?.("스트림 메시지를 해석하지 못했습니다.");
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        window.clearTimeout(frameTimer);
        const pending = pendingRef.current;
        if (pending) { window.clearTimeout(pending.timer); pending.resolve(false); pendingRef.current = null; }
        frameIdRef.current = "";
        if (disposed) return;
        setFrameSrc("");
        const delay = RECONNECT_DELAYS[retryRef.current];
        if (delay !== undefined) {
          retryRef.current += 1;
          updateConnection("connecting");
          reconnectTimer = window.setTimeout(connect, delay);
        } else {
          updateConnection("failed");
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearTimeout(frameTimer);
      const pending = pendingRef.current;
      if (pending) { window.clearTimeout(pending.timer); pending.resolve(false); pendingRef.current = null; }
      if (socketRef.current) socketRef.current.close();
      socketRef.current = null;
    };
  }, [agentId, lane, taskId, chatSessionId, pcUrl, pcTab, reconnectKey, updateConnection]);

  const sendControl = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!interactive || connection !== "live" || controlBusy) return false;
    if (lane === "server" || pcTab) {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        handlersRef.current.onControlError?.("서버 브라우저 실시간 연결이 열려 있지 않습니다.");
        return false;
      }
      if (!pcTab) { ws.send(JSON.stringify({ type: "control", ...payload })); return true; }
      if (!frameIdRef.current || pendingRef.current) return false;
      setControlBusy(true);
      try {
        return await new Promise<boolean>((resolve) => {
          const id = crypto.randomUUID();
          const timer = window.setTimeout(() => {
            pendingRef.current = null;
            handlersRef.current.onControlError?.("조작 응답이 지연되었습니다. 연결 후 화면을 확인하세요.");
            ws.close(); resolve(false);
          }, 18000);
          pendingRef.current = { id, resolve, timer };
          ws.send(JSON.stringify({ type: "control", ...payload, request_id: id, frame_id: frameIdRef.current }));
        });
      } finally { setControlBusy(false); }
    }
    return false;
  };

  const clickFrame = (event: React.PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = mapFramePoint(event.clientX, event.clientY, rect, viewport);
    if (point) void sendControl({ action: "click", ...point });
  };

  const submitText = async () => {
    if (!inputText) return;
    if (await sendControl({ action: "type", text: inputText, secret: secretInput, replace: true })) setInputText("");
  };

  const canControl = interactive && connection === "live" && !controlBusy;
  const displayedSrc = connection === "live" ? frameSrc : fallbackSrc;
  const statusLabel = connection === "live" ? "실시간 연결" : connection === "connecting" ? "연결 중" : connection === "failed" ? (pcTab ? "PC 브라우저 연결 실패" : "실시간 연결 실패 — 스크린샷 모드") : "대기";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div role="status" style={{ alignSelf: "flex-start", borderRadius: 999, padding: "5px 9px", background: connection === "failed" ? "#7f1d1d" : "rgba(15,23,42,.82)", color: "#e2e8f0", fontSize: 11 }}>
        {statusLabel}
      </div>
      {connection === "failed" && <button type="button" onClick={() => setReconnectKey((key) => key + 1)} style={{ minHeight: 44 }}>다시 연결</button>}
      <div style={{ display: "grid", placeItems: "center", minHeight: 180, aspectRatio: "16 / 9", overflow: "hidden", borderRadius: 10, background: "#0f172a", touchAction: "manipulation" }}>
        {displayedSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayedSrc} alt={lane === "server" ? "서버 브라우저 실시간 화면" : "이 채팅 전용 PC 브라우저 실시간 화면"} onPointerUp={canControl ? clickFrame : undefined} style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", cursor: interactive ? "crosshair" : "default", touchAction: "manipulation" }} />
        ) : <span style={{ padding: 16, color: "#94a3b8", fontSize: 12, textAlign: "center" }}>{emptyMessage}</span>}
      </div>
      {pcTab && <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>이 채팅 전용 브라우저 · 다른 채팅과 화면·입력이 분리됩니다.</p>}
      {interactive && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <input value={inputText} onChange={(event) => setInputText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitText(); }} placeholder="선택한 입력칸에 넣을 값" type={secretInput ? "password" : "text"} autoComplete="off" style={{ flex: "1 1 180px", minWidth: 120, minHeight: 44, border: "1px solid #475569", borderRadius: 7, padding: "0 10px", background: "#0f172a", color: "#e2e8f0" }} />
          {(lane === "server" || pcTab) && <label style={{ display: "flex", minHeight: 44, alignItems: "center", gap: 5, color: "#94a3b8", fontSize: 11 }}><input type="checkbox" checked={secretInput} onChange={(event) => setSecretInput(event.target.checked)} /> 비밀값</label>}
          <button type="button" onClick={() => void submitText()} disabled={!inputText || !canControl} style={{ minWidth: 58, minHeight: 44, border: 0, borderRadius: 7, padding: "0 12px", background: "#2563eb", color: "white", fontWeight: 700 }}>입력</button>
          {pcTab && <><button type="button" disabled={!canControl} onClick={() => void sendControl({ action: "scroll", x: viewport.width / 2, y: viewport.height / 2, deltaY: -500 })} style={{ minHeight: 44 }}>위로</button><button type="button" disabled={!canControl} onClick={() => void sendControl({ action: "scroll", x: viewport.width / 2, y: viewport.height / 2, deltaY: 500 })} style={{ minHeight: 44 }}>아래로</button></>}
          <button type="button" disabled={!canControl} onClick={() => void sendControl({ action: "press", key: "Enter" })} style={{ minWidth: 64, minHeight: 44, border: "1px solid #475569", borderRadius: 7, padding: "0 12px", background: "#0f172a", color: "#e2e8f0" }}>Enter</button>
        </div>
      )}
    </div>
  );
}
