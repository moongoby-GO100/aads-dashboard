import { describe, expect, it } from 'vitest';
import { INITIAL_VERSION_STATE, nextVersionState, type VersionState } from './versionCheck';

const run = (...hashes: unknown[]): VersionState =>
  hashes.reduce<VersionState>((s, h) => nextVersionState(s, h), INITIAL_VERSION_STATE);

describe('nextVersionState', () => {
  it('같은 값 유지 → false', () => expect(run('A', 'A', 'A').updateAvailable).toBe(false));
  it('새 값 1회 → false', () => expect(run('A', 'B').updateAvailable).toBe(false));
  it('새 값 2회 연속 → true', () => expect(run('A', 'B', 'B').updateAvailable).toBe(true));
  it('A→B→A → false', () => {
    const s = run('A', 'B', 'A');
    expect(s.updateAvailable).toBe(false);
    expect(s.candidateHash).toBeNull();
  });
  it('B→C→C → true', () => expect(run('A', 'B', 'C', 'C').updateAvailable).toBe(true));
  it('B→C 후 1회만 → false', () => expect(run('A', 'B', 'C').candidateCount).toBe(1));
  it('unknown/빈 값 끼어들기 → 영향 없음', () => {
    expect(run('A', 'B', 'unknown', '', null, undefined, 'local').updateAvailable).toBe(false);
    expect(run('A', 'B', 'unknown', 'B').updateAvailable).toBe(true);
  });
  it('첫 응답이 unknown 이면 초기값 미설정', () => {
    const s = run('unknown', '', 'local');
    expect(s.initialHash).toBeNull();
    expect(run('unknown', 'A', 'B').updateAvailable).toBe(false);
    expect(run('unknown', 'A').initialHash).toBe('A');
  });
});
