"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
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
    setFrameSrc("");
    setInputText("");
    setSecretInput(false);
    if (!id) {
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
        : `/pc-agent/stream/${encodeURIComponent(id)}`;
      const ws = new WebSocket(websocketUrl(path, token));
      socketRef.current = ws;
      frameTimer = window.setTimeout(() => ws.close(), 20000);
      updateConnection("connecting");

      ws.onopen = () => {
        if (disposed) return;
        if (lane === "pc") ws.send(JSON.stringify({ fps: 5, quality: 70, scale: 1 }));
        window.clearTimeout(frameTimer);
        frameTimer = window.setTimeout(() => ws.close(), 20000);
      };
      ws.onmessage = (event) => {
        if (disposed || socketRef.current !== ws) return;
        try {
          const message = JSON.parse(String(event.data || "{}"));
          if (message.type === "ready") {
            setViewport({ width: Number(message.width) || 1366, height: Number(message.height) || 768 });
            // A socket handshake is not proof of frame delivery.
          } else if (message.type === "frame" && message.frame) {
            retryRef.current = 0;
            window.clearTimeout(frameTimer);
            updateConnection("live");
            setFrameSrc(`data:${message.media_type || "image/jpeg"};base64,${message.frame}`);
            setViewport({ width: Number(message.width) || 1366, height: Number(message.height) || 768 });
          } else if (message.frame) {
            retryRef.current = 0;
            window.clearTimeout(frameTimer);
            updateConnection("live");
            setFrameSrc(`data:image/jpeg;base64,${message.frame}`);
          } else if (message.type === "control_ack") {
            const result = (message.result || {}) as ControlResult;
            handlersRef.current.onControlAck?.(result);
            if (result.recipe_step) void handlersRef.current.onRecipeStep?.(result.recipe_step);
          } else if (message.type === "control_error" || message.type === "error") {
            handlersRef.current.onControlError?.(String(message.error || "unknown"));
            if (message.type === "error") ws.close();
          }
        } catch {
          handlersRef.current.onControlError?.("스트림 메시지를 해석하지 못했습니다.");
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        window.clearTimeout(frameTimer);
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
      if (socketRef.current) socketRef.current.close();
      socketRef.current = null;
    };
  }, [agentId, lane, taskId, reconnectKey, updateConnection]);

  const sendControl = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!interactive || connection !== "live" || controlBusy) return false;
    if (lane === "server") {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        handlersRef.current.onControlError?.("서버 브라우저 실시간 연결이 열려 있지 않습니다.");
        return false;
      }
      ws.send(JSON.stringify({ type: "control", ...payload }));
      return true;
    }
    if (!agentId) return false;
    setControlBusy(true);
    try {
      const action = String(payload.action || "");
      const commandType = action === "click" ? "mouse_click" : action === "type" ? "keyboard_type" : "keyboard_hotkey";
      const params = action === "press" ? { keys: [String(payload.key || "enter").toLowerCase()] } : payload;
      const queued = await api.sendPCCommand(agentId, commandType, params) as { command_id?: string };
      if (!queued.command_id) throw new Error("PC Agent 명령 ID를 받지 못했습니다.");
      const result = await api.getPCResult(queued.command_id, 30) as { status?: string; data?: { error?: string } };
      if (result.status !== "success") throw new Error(result.data?.error || "PC Agent 조작이 실패했습니다.");
      handlersRef.current.onControlAck?.({ action, pc_result: result });
      // Desktop coordinates are not DOM selectors: do not register an unreplayable browser recipe.
      return true;
    } catch (reason) {
      handlersRef.current.onControlError?.(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setControlBusy(false);
    }
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
  const statusLabel = connection === "live" ? "실시간 연결" : connection === "connecting" ? "연결 중" : connection === "failed" ? "실시간 연결 실패 — 스크린샷 모드" : "대기";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div role="status" style={{ alignSelf: "flex-start", borderRadius: 999, padding: "5px 9px", background: connection === "failed" ? "#7f1d1d" : "rgba(15,23,42,.82)", color: "#e2e8f0", fontSize: 11 }}>
        {statusLabel}
      </div>
      {connection === "failed" && <button type="button" onClick={() => setReconnectKey((key) => key + 1)} style={{ minHeight: 44 }}>다시 연결</button>}
      <div style={{ display: "grid", placeItems: "center", minHeight: 180, aspectRatio: "16 / 9", overflow: "hidden", borderRadius: 10, background: "#0f172a", touchAction: "manipulation" }}>
        {displayedSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayedSrc} alt={lane === "server" ? "서버 브라우저 실시간 화면" : "PC 화면 실시간 스트림"} onLoad={(event) => { if (lane === "pc") setViewport({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} onPointerUp={canControl ? clickFrame : undefined} style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", cursor: interactive ? "crosshair" : "default", touchAction: "manipulation" }} />
        ) : <span style={{ padding: 16, color: "#94a3b8", fontSize: 12, textAlign: "center" }}>{emptyMessage}</span>}
      </div>
      {interactive && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <input value={inputText} onChange={(event) => setInputText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitText(); }} placeholder="선택한 입력칸에 넣을 값" type={secretInput ? "password" : "text"} autoComplete="off" style={{ flex: "1 1 180px", minWidth: 120, minHeight: 44, border: "1px solid #475569", borderRadius: 7, padding: "0 10px", background: "#0f172a", color: "#e2e8f0" }} />
          {lane === "server" && <label style={{ display: "flex", minHeight: 44, alignItems: "center", gap: 5, color: "#94a3b8", fontSize: 11 }}><input type="checkbox" checked={secretInput} onChange={(event) => setSecretInput(event.target.checked)} /> 비밀값</label>}
          <button type="button" onClick={() => void submitText()} disabled={!inputText || !canControl} style={{ minWidth: 58, minHeight: 44, border: 0, borderRadius: 7, padding: "0 12px", background: "#2563eb", color: "white", fontWeight: 700 }}>입력</button>
          <button type="button" disabled={!canControl} onClick={() => void sendControl({ action: "press", key: "Enter" })} style={{ minWidth: 64, minHeight: 44, border: "1px solid #475569", borderRadius: 7, padding: "0 12px", background: "#0f172a", color: "#e2e8f0" }}>Enter</button>
        </div>
      )}
    </div>
  );
}
