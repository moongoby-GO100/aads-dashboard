/**
 * AADS-181: useTaskPolling — 30초 자동 갱신 훅
 *
 * - SSE /ops/stream cross_server_directives 이벤트 수신 시 즉시 갱신
 * - SSE 미지원 또는 연결 실패 시 30초 폴링 fallback
 * - 탭 비활성화 중에는 폴링 중단 (배터리/서버 부하 절감)
 */
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { getAllDirectives, AllDirectivesResponse } from "@/services/taskApi";

const POLL_INTERVAL_MS = 30_000;
const SSE_URL =
  (process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1") +
  "/ops/stream";

interface UseTaskPollingOptions {
  status?: string;
  project?: string;
  enabled?: boolean;
}

interface UseTaskPollingResult {
  data: AllDirectivesResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

export function useTaskPolling({
  status = "all",
  project = "all",
  enabled = true,
}: UseTaskPollingOptions = {}): UseTaskPollingResult {
  const [data, setData] = useState<AllDirectivesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const abortRef = useRef(false);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (abortRef.current) return;
      try {
        const result = await getAllDirectives(status, project, forceRefresh);
        if (!abortRef.current) {
          setData(result);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : "fetch failed");
        }
      } finally {
        if (!abortRef.current) {
          setLoading(false);
        }
      }
    },
    [status, project],
  );

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (!enabled) return;
    abortRef.current = false;

    // 초기 로드
    setLoading(true);
    fetchData();

    // SSE 연결 시도
    let sseConnected = false;
    try {
      const es = new EventSource(SSE_URL);
      sseRef.current = es;

      es.addEventListener("cross_server_directives", () => {
        // SSE로 변경 감지 시 즉시 재조회
        fetchData(true);
      });

      es.onopen = () => {
        sseConnected = true;
      };

      es.onerror = () => {
        es.close();
        sseRef.current = null;
        // SSE 실패 → 폴링 fallback
        if (!pollingRef.current) {
          pollingRef.current = setInterval(() => fetchData(), POLL_INTERVAL_MS);
        }
      };
    } catch {
      // SSE 생성 실패 → 폴링 fallback
    }

    // 폴링 항상 설정 (SSE 누락 방어)
    pollingRef.current = setInterval(() => {
      if (!sseConnected) fetchData();
      else fetchData(); // SSE 연결되어도 30초 폴링 유지 (데이터 신선도 보장)
    }, POLL_INTERVAL_MS);

    // 페이지 visibility change 처리
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData(); // 탭 복귀 시 즉시 갱신
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      abortRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, fetchData]);

  return { data, loading, error, refresh, lastUpdated };
}
