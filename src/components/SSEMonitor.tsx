"use client";
import { useEffect, useRef, useState } from "react";
import { connectSSE } from "@/lib/sse";
import type { SSEEvent } from "@/types";

interface LogEntry {
  ts: string;
  type: string;
  message: string;
}

export default function SSEMonitor({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConnected(true);
    const disconnect = connectSSE(
      projectId,
      (event: SSEEvent) => {
        const ts = new Date().toLocaleTimeString("ko-KR");
        let message = "";
        switch (event.type) {
          case "agent_start":
            message = `▶ ${event.data.agent} 시작`;
            break;
          case "agent_complete":
            message = `✅ ${event.data.agent} 완료 (${event.data.duration_s ?? "?"}s)`;
            break;
          case "checkpoint":
            message = `🔖 체크포인트: ${event.data.stage} — ${event.data.auto_approved ? "자동승인" : "승인대기"}`;
            break;
          case "pipeline_complete":
            message = `🎉 파이프라인 완료! 총 비용: $${(event.data.total_cost_usd as number)?.toFixed(4) ?? "?"}`;
            break;
          case "error":
            message = `❌ 오류: ${event.data.message}`;
            break;
          default:
            message = JSON.stringify(event.data);
        }
        setLogs((prev) => [...prev.slice(-200), { ts, type: event.type, message }]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      () => setConnected(false)
    );
    return disconnect;
  }, [projectId]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 h-80 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">실시간 모니터</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
          {connected ? "● 연결됨" : "● 연결 끊김"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.length === 0 && (
          <p className="text-gray-500 italic">SSE 이벤트 대기 중...</p>
        )}
        {logs.map((log, i) => (
          <div key={i} className="text-gray-300">
            <span className="text-gray-500">[{log.ts}]</span>{" "}
            <span>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
