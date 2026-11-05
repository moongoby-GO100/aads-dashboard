export interface VersionState {
  initialHash: string | null;
  candidateHash: string | null;
  candidateCount: number;
  updateAvailable: boolean;
}

export const INITIAL_VERSION_STATE: VersionState = {
  initialHash: null,
  candidateHash: null,
  candidateCount: 0,
  updateAvailable: false,
};

const CONFIRM_COUNT = 2;

export function isValidHash(h: unknown): h is string {
  if (typeof h !== 'string') return false;
  const v = h.trim();
  return v !== '' && v !== 'unknown' && v !== 'local';
}

/** 새 버전은 같은 새 값이 연속 2회 관측될 때만 확정한다. 무효 값은 상태를 바꾸지 않는다. */
export function nextVersionState(state: VersionState, incomingHash: unknown): VersionState {
  if (!isValidHash(incomingHash)) return state;
  if (state.updateAvailable) return state;
  if (state.initialHash === null) {
    return { ...state, initialHash: incomingHash, candidateHash: null, candidateCount: 0 };
  }
  if (incomingHash === state.initialHash) {
    return { ...state, candidateHash: null, candidateCount: 0 };
  }
  const count = incomingHash === state.candidateHash ? state.candidateCount + 1 : 1;
  return {
    ...state,
    candidateHash: incomingHash,
    candidateCount: count,
    updateAvailable: count >= CONFIRM_COUNT,
  };
}
