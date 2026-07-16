import { useState, useEffect, useRef, useCallback } from 'react';

export function useVersionCheck(intervalMs: number = 30000) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialHash = useRef<string | null>(null);
  const isStreaming = useRef(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ops/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      if (initialHash.current === null) {
        // 최초 로드 시 현재 해시 저장
        initialHash.current = data.build_hash;
      } else if (initialHash.current !== data.build_hash) {
        // 해시 불일치 = 새 배포 감지
        setUpdateAvailable(true);
      }
    } catch {
      // 네트워크 오류 무시
    }
  }, []);

  const setStreaming = useCallback((streaming: boolean) => {
    isStreaming.current = streaming;
  }, []);

  const doRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    checkVersion(); // 최초 1회
    const timer = setInterval(() => {
      if (!isStreaming.current) checkVersion();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [checkVersion, intervalMs]);

  return { updateAvailable, doRefresh, setStreaming };
}
