import { useState, useEffect, useRef, useCallback } from 'react';
import { INITIAL_VERSION_STATE, nextVersionState, type VersionState } from '@/lib/versionCheck';

export function useVersionCheck(intervalMs: number = 30000) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const versionState = useRef<VersionState>(INITIAL_VERSION_STATE);
  const isStreaming = useRef(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ops/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      versionState.current = nextVersionState(versionState.current, data?.build_hash);
      if (versionState.current.updateAvailable) setUpdateAvailable(true);
    } catch {
      // 네트워크 오류 무시
    }
  }, []);

  const setStreaming = useCallback((streaming: boolean) => {
    isStreaming.current = streaming;
  }, []);

  const doRefresh = useCallback(() => {
    // Give stateful pages one synchronous turn to persist their viewport before
    // the new bundle replaces the document.  The chat page stores a
    // session-scoped message anchor in sessionStorage.
    window.dispatchEvent(new CustomEvent('aads:before-version-refresh'));
    window.setTimeout(() => window.location.reload(), 0);
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
