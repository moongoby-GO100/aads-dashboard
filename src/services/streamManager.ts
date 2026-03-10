/**
 * AADS-190: StreamManager — 멀티세션 백그라운드 스트리밍
 * 세션 전환 시 SSE가 끊기지 않고 백그라운드에서 응답을 계속 수신.
 * 복귀 시 저장된 결과를 즉시 표시.
 */

export interface StreamSnapshot {
  sessionId: string;
  isStreaming: boolean;
  text: string;
  completedAt: number | null; // timestamp
  error: string | null;
}

// 세션별 스트림 상태 저장소 (인메모리, 탭 내 유지)
const _streams = new Map<string, StreamSnapshot>();
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * 스트리밍 시작 등록
 */
export function registerStream(sessionId: string): void {
  _streams.set(sessionId, {
    sessionId,
    isStreaming: true,
    text: "",
    completedAt: null,
    error: null,
  });
  _notify();
}

/**
 * 스트리밍 텍스트 업데이트 (델타 누적)
 */
export function updateStreamText(sessionId: string, text: string): void {
  const snap = _streams.get(sessionId);
  if (snap) {
    snap.text = text;
    // 빈번한 notify 방지 — 100ms debounce는 호출측에서 처리
  }
}

/**
 * 스트리밍 완료 표시
 */
export function completeStream(sessionId: string, finalText: string, error?: string): void {
  const snap = _streams.get(sessionId);
  if (snap) {
    snap.isStreaming = false;
    snap.text = finalText;
    snap.completedAt = Date.now();
    snap.error = error || null;
  } else {
    _streams.set(sessionId, {
      sessionId,
      isStreaming: false,
      text: finalText,
      completedAt: Date.now(),
      error: error || null,
    });
  }
  _notify();
}

/**
 * 세션의 스트림 상태 조회
 */
export function getStreamSnapshot(sessionId: string): StreamSnapshot | null {
  return _streams.get(sessionId) || null;
}

/**
 * 스트리밍 중인 세션 ID 목록
 */
export function getActiveStreamIds(): string[] {
  return Array.from(_streams.entries())
    .filter(([, s]) => s.isStreaming)
    .map(([id]) => id);
}

/**
 * 완료된 스트림 정리 (5분 이상 경과)
 */
export function cleanupOldStreams(maxAgeMs = 300_000): void {
  const now = Date.now();
  for (const [id, snap] of _streams) {
    if (!snap.isStreaming && snap.completedAt && now - snap.completedAt > maxAgeMs) {
      _streams.delete(id);
    }
  }
}

/**
 * 상태 변경 리스너 등록
 */
export function onStreamChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * 특정 세션 스트림 제거
 */
export function clearStream(sessionId: string): void {
  _streams.delete(sessionId);
  _notify();
}
