"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export interface SSEHealth {
  status: string;
  stalled: number;
  running: number;
  completed_today: number;
  pending_folder: number;
  running_folder: number;
  checked_at: string;
  error?: string;
}

export interface SSEDirectiveChange {
  task_id: string;
  status: string;
  title: string;
  project: string;
  changed_at: string;
}

export interface SSEPipeline {
  bridge_running: boolean;
  active_sessions: number;
  checked_at: string;
}

export function useSSE() {
  const [health, setHealth] = useState<SSEHealth | null>(null);
  const [directives, setDirectives] = useState<SSEDirectiveChange[]>([]);
  const [pipeline, setPipeline] = useState<SSEPipeline | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startFallback = useCallback(() => {
    if (fallbackRef.current) return;
    fallbackRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE_URL}/ops/full-health`);
        if (r.ok) {
          const data = await r.json();
          setHealth({
            status: data.status || "UNKNOWN",
            stalled: data.sections?.existing_health?.stalled_running || 0,
            running: 0,
            completed_today: data.sections?.existing_health?.completed_today || 0,
            pending_folder: data.sections?.directives?.pending?.count || 0,
            running_folder: data.sections?.directives?.running?.count || 0,
            checked_at: data.checked_at || new Date().toISOString(),
          });
        }
      } catch {}
    }, 10000);
  }, []);

  const stopFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${BASE_URL}/ops/stream`);
      esRef.current = es;

      es.addEventListener("health", (e) => {
        try {
          setHealth(JSON.parse(e.data));
          setConnected(true);
          stopFallback();
        } catch {}
      });

      es.addEventListener("directive", (e) => {
        try {
          const data = JSON.parse(e.data);
          setDirectives(Array.isArray(data) ? data : [data]);
        } catch {}
      });

      es.addEventListener("pipeline", (e) => {
        try {
          setPipeline(JSON.parse(e.data));
        } catch {}
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        startFallback();
        // 재연결 시도
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      stopFallback();
    };
  }, [startFallback, stopFallback]);

  return { health, directives, pipeline, connected };
}
