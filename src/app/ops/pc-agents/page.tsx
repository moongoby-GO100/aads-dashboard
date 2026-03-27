"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

interface PCAgent {
  agent_id: string;
  hostname: string;
  os: string;
  connected_at: string;
  last_heartbeat: string;
  status: string;
}

const COMMAND_TYPES = [
  { value: "screenshot", label: "스크린샷" },
  { value: "system_info", label: "시스템 정보" },
  { value: "process_list", label: "프로세스 목록" },
  { value: "file_list", label: "파일 목록" },
  { value: "shell", label: "셸 명령" },
  { value: "kakao_read", label: "카카오 읽기" },
  { value: "kakao_send", label: "카카오 전송" },
];

function getParamPlaceholder(commandType: string): string {
  switch (commandType) {
    case "file_list": return '{"path": "C:\\\\Users"}';
    case "shell": return '{"command": "whoami"}';
    case "kakao_send": return '{"room": "방이름", "message": "메시지"}';
    case "kakao_read": return '{"room": "방이름", "limit": 20}';
    default: return "{}";
  }
}

export default function PCAgentsPage() {
  const [agents, setAgents] = useState<PCAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [commandType, setCommandType] = useState("screenshot");
  const [paramsText, setParamsText] = useState("{}");
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdResult, setCmdResult] = useState<unknown>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);

  // Streaming
  const [streamAgent, setStreamAgent] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  const [streamFps, setStreamFps] = useState(5);
  const [streamQuality, setStreamQuality] = useState(70);
  const [streamScale, setStreamScale] = useState(0.5);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchAgents = async () => {
    try {
      const data = await api.getPCAgents();
      setAgents(Array.isArray(data) ? data : data.agents || []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  // When command type changes, reset params placeholder
  useEffect(() => {
    setParamsText(getParamPlaceholder(commandType));
  }, [commandType]);

  const handleSendCommand = async () => {
    if (!selectedAgent) { setCmdError("PC를 선택하세요."); return; }
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(paramsText || "{}");
    } catch {
      setCmdError("params JSON 형식 오류"); return;
    }
    setCmdLoading(true);
    setCmdResult(null);
    setCmdError(null);
    try {
      const res = await api.sendPCCommand(selectedAgent, commandType, params);
      const command_id = res?.command_id || res?.id;
      if (command_id) {
        const result = await api.getPCResult(command_id, 30);
        setCmdResult(result);
      } else {
        setCmdResult(res);
      }
    } catch (e) {
      setCmdError(String(e));
    } finally {
      setCmdLoading(false);
    }
  };

  const handleStartStream = async () => {
    if (!streamAgent) return;
    try {
      await api.startPCStream(streamAgent, { fps: streamFps, quality: streamQuality, scale: streamScale });
      setStreaming(true);
      const wsUrl = BASE_URL.replace(/^https?/, "wss").replace(/\/api\/v1$/, "") + `/api/v1/pc-agent/stream/${encodeURIComponent(streamAgent)}`;
      const token = typeof window !== "undefined" ? localStorage.getItem("aads_token") : null;
      const ws = new WebSocket(token ? `${wsUrl}?token=${token}` : wsUrl);
      ws.binaryType = "blob";
      ws.onmessage = (e) => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            if (msg.frame) setStreamFrame(`data:image/jpeg;base64,${msg.frame}`);
          } catch { /* ignore */ }
        }
      };
      ws.onclose = () => setStreaming(false);
      wsRef.current = ws;
    } catch (e) {
      setCmdError(String(e));
    }
  };

  const handleStopStream = async () => {
    if (!streamAgent) return;
    wsRef.current?.close();
    wsRef.current = null;
    setStreaming(false);
    setStreamFrame(null);
    try { await api.stopPCStream(streamAgent); } catch { /* ignore */ }
  };

  const isConnected = (agent: PCAgent) => {
    const last = new Date(agent.last_heartbeat).getTime();
    return Date.now() - last < 30000;
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "var(--text-primary)" }}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">🖥️</span>
        <div>
          <h1 className="text-xl font-bold">PC Agent 관리</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>연결된 PC 원격 제어</p>
        </div>
      </div>

      {/* PC 목록 */}
      <section>
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>연결된 PC</h2>
        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
        ) : agents.length === 0 ? (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
            연결된 PC Agent 없음
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => {
              const connected = isConnected(agent);
              return (
                <div
                  key={agent.agent_id}
                  className="rounded-lg p-4 cursor-pointer transition-all"
                  style={{
                    background: "var(--bg-card)",
                    border: selectedAgent === agent.agent_id ? "1px solid var(--accent)" : "1px solid var(--border)",
                  }}
                  onClick={() => { setSelectedAgent(agent.agent_id); setStreamAgent(agent.agent_id); }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: connected ? "#22c55e" : "#ef4444" }}
                    />
                    <span className="font-medium text-sm">{agent.hostname}</span>
                  </div>
                  <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
                    <div>OS: {agent.os}</div>
                    <div>ID: <span className="font-mono">{agent.agent_id.slice(0, 12)}…</span></div>
                    <div>마지막 하트비트: {new Date(agent.last_heartbeat).toLocaleTimeString("ko-KR")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 명령 전송 */}
      <section className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>명령 전송</h2>
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>PC 선택</label>
              <select
                className="w-full rounded px-3 py-2 text-sm"
                style={{ background: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="">-- PC 선택 --</option>
                {agents.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>{a.hostname} ({a.agent_id.slice(0, 8)}…)</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>명령 유형</label>
              <select
                className="w-full rounded px-3 py-2 text-sm"
                style={{ background: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                value={commandType}
                onChange={(e) => setCommandType(e.target.value)}
              >
                {COMMAND_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>params (JSON)</label>
            <textarea
              className="w-full rounded px-3 py-2 text-sm font-mono"
              style={{ background: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              rows={3}
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
            />
          </div>

          <button
            className="px-4 py-2 rounded text-sm font-medium transition-opacity"
            style={{ background: "var(--accent)", color: "#fff", opacity: cmdLoading ? 0.6 : 1 }}
            onClick={handleSendCommand}
            disabled={cmdLoading}
          >
            {cmdLoading ? "실행 중..." : "실행"}
          </button>

          {cmdError && (
            <div className="rounded p-3 text-sm" style={{ background: "#450a0a", color: "#fca5a5" }}>
              {cmdError}
            </div>
          )}

          {cmdResult !== null && (
            <div className="rounded p-3" style={{ background: "var(--bg-main)", border: "1px solid var(--border)" }}>
              {/* 스크린샷은 이미지로 표시 */}
              {(() => {
                const r = cmdResult as Record<string, any>;
                const nested = r?.result as Record<string, unknown> | undefined;
                const img = nested?.image || r?.image;
                if (commandType === "screenshot" && img) {
                  return (
                    <img
                      src={`data:image/png;base64,${img}`}
                      alt="screenshot"
                      className="max-w-full rounded"
                    />
                  );
                }
                return (
                  <pre className="text-xs overflow-auto max-h-80 font-mono whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                    {JSON.stringify(cmdResult, null, 2)}
                  </pre>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* 화면 스트리밍 */}
      <section className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>화면 스트리밍</h2>
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>PC 선택</label>
              <select
                className="w-full rounded px-3 py-2 text-sm"
                style={{ background: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                value={streamAgent}
                onChange={(e) => setStreamAgent(e.target.value)}
                disabled={streaming}
              >
                <option value="">-- PC 선택 --</option>
                {agents.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>{a.hostname} ({a.agent_id.slice(0, 8)}…)</option>
                ))}
              </select>
            </div>

            <div className="min-w-[100px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>FPS: {streamFps}</label>
              <input type="range" min={1} max={30} value={streamFps} onChange={(e) => setStreamFps(Number(e.target.value))}
                disabled={streaming} className="w-full" />
            </div>
            <div className="min-w-[100px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>품질: {streamQuality}</label>
              <input type="range" min={10} max={95} value={streamQuality} onChange={(e) => setStreamQuality(Number(e.target.value))}
                disabled={streaming} className="w-full" />
            </div>
            <div className="min-w-[100px]">
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>스케일: {streamScale}</label>
              <input type="range" min={0.1} max={1} step={0.1} value={streamScale} onChange={(e) => setStreamScale(Number(e.target.value))}
                disabled={streaming} className="w-full" />
            </div>

            <div className="flex gap-2">
              {!streaming ? (
                <button
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: "#16a34a", color: "#fff" }}
                  onClick={handleStartStream}
                  disabled={!streamAgent}
                >
                  ▶ Start
                </button>
              ) : (
                <button
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: "#dc2626", color: "#fff" }}
                  onClick={handleStopStream}
                >
                  ■ Stop
                </button>
              )}
            </div>
          </div>

          <div
            className="rounded-lg flex items-center justify-center"
            style={{ background: "#000", minHeight: 360, border: "1px solid var(--border)" }}
          >
            {streamFrame ? (
              <img src={streamFrame} alt="screen" className="max-w-full max-h-[600px] rounded" />
            ) : (
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {streaming ? "프레임 수신 대기 중..." : "스트리밍 비활성"}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
