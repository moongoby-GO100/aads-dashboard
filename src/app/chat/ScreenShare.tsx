"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export interface ScreenShareProps {
  onCapture: (file: File) => void;
  onHiddenCapture?: (file: File) => void;
  hiddenMode?: boolean;
}

export default function ScreenShare({ onCapture, onHiddenCapture, hiddenMode }: ScreenShareProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [captureMode, setCaptureMode] = useState<"single" | "continuous">("single");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    const MAX_W = 1920, MAX_H = 1080;
    let w = video.videoWidth || 1920;
    let h = video.videoHeight || 1080;
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
    if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const file = new File([blob], `screen_capture_${ts}.png`, { type: "image/png" });
    onCapture(file);
  }, [onCapture]);

  const captureFrameHidden = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    const MAX_W = 1920, MAX_H = 1080;
    let w = video.videoWidth || 1920;
    let h = video.videoHeight || 1080;
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
    if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const file = new File([blob], `screen_capture_${ts}.png`, { type: "image/png" });
    if (hiddenMode && onHiddenCapture) {
      onHiddenCapture(file);
    } else {
      onCapture(file);
    }
  }, [onCapture, onHiddenCapture, hiddenMode]);

  const stopShare = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
    setIsSharing(false);
  }, []);

  const startShare = useCallback(async (mode: "single" | "continuous" = captureMode) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      setIsSharing(true);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.autoplay = true;
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(video);
      videoRef.current = video;
      await video.play().catch(() => {});
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopShare());
      if (mode === "continuous") {
        intervalRef.current = setInterval(() => captureFrameHidden(), 5000);
      } else {
        setTimeout(() => captureFrame(), 500);
      }
    } catch {
      // 사용자가 화면 선택 취소
    }
  }, [captureMode, captureFrame, captureFrameHidden, stopShare]);

  // continuous 모드 토글: 인터벌 교체
  const toggleContinuous = useCallback(() => {
    const newMode: "single" | "continuous" = captureMode === "single" ? "continuous" : "single";
    setCaptureMode(newMode);
    if (newMode === "continuous") {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => captureFrameHidden(), 5000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [captureMode, captureFrameHidden]);

  // 언마운트 시 정리
  useEffect(() => () => stopShare(), [stopShare]);

  return (
    <>
      {/* 🖥️ 화면 공유 버튼 */}
      <button
        type="button"
        onClick={() => isSharing ? stopShare() : startShare(captureMode)}
        title={isSharing ? "화면 공유 중지" : "화면 공유 시작"}
        style={{
          width: "32px", height: "32px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isSharing ? "rgba(239,68,68,0.12)" : "none",
          border: isSharing ? "1px solid rgba(239,68,68,0.4)" : "none",
          borderRadius: "8px",
          color: isSharing ? "#ef4444" : "var(--ct-text2)",
          cursor: "pointer", fontSize: "16px", padding: 0,
          flexShrink: 0,
          transition: "all 0.2s",
        }}
      >
        🖥️
      </button>

      {/* 화면 공유 중 인디케이터 (ChatInput 위쪽에 표시) */}
      {isSharing && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0, right: 0,
            display: "flex", alignItems: "center", gap: "8px",
            padding: "6px 12px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "8px", fontSize: "13px", color: "#ef4444",
            zIndex: 10,
          }}
        >
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: "#ef4444", flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
            🖥️ 화면 공유 중
            {hiddenMode && (
              <span style={{
                fontSize: "10px", fontWeight: 600, padding: "1px 6px",
                background: "rgba(139,92,246,0.2)", color: "#a78bfa",
                border: "1px solid rgba(139,92,246,0.4)", borderRadius: "4px",
              }}>👁️ 히든</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => captureFrame()}
            style={{
              padding: "2px 10px", fontSize: "11px", fontWeight: 600,
              background: "rgba(59,130,246,0.15)", color: "#3b82f6",
              border: "1px solid rgba(59,130,246,0.35)", borderRadius: "6px",
              cursor: "pointer",
            }}
            title="지금 화면 캡처"
          >📸 캡처</button>
          <button
            type="button"
            onClick={toggleContinuous}
            style={{
              padding: "2px 10px", fontSize: "11px", fontWeight: 600,
              background: captureMode === "continuous" ? "rgba(34,197,94,0.15)" : "var(--ct-hover, rgba(255,255,255,0.06))",
              color: captureMode === "continuous" ? "#22c55e" : "var(--ct-text2, #888)",
              border: `1px solid ${captureMode === "continuous" ? "rgba(34,197,94,0.35)" : "var(--ct-border, #333)"}`,
              borderRadius: "6px", cursor: "pointer",
            }}
            title={captureMode === "continuous" ? "연속 캡처 비활성화" : "5초 연속 캡처 활성화"}
          >{captureMode === "continuous" ? "🔴 연속중" : "🔁 연속"}</button>
          <button
            type="button"
            onClick={stopShare}
            style={{
              padding: "2px 10px", fontSize: "11px", fontWeight: 600,
              background: "rgba(239,68,68,0.12)", color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px",
              cursor: "pointer",
            }}
            title="화면 공유 중지"
          >✕ 중지</button>
        </div>
      )}
    </>
  );
}
