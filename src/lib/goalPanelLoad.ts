export type SectionOutcome<T> = { ok: true; value: T } | { ok: false; error: string };
export type SectionTask<T> = (signal: AbortSignal) => Promise<T>;

export interface SectionState<T> { data: T | null; error: string; loading: boolean }
export const LOADING_SECTION: SectionState<never> = { data: null, error: "", loading: true };
export const IDLE_SECTION: SectionState<never> = { data: null, error: "", loading: false };

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export async function settleSection<T>(
  task: SectionTask<T>, signal: AbortSignal, onOutcome: (outcome: SectionOutcome<T>) => void,
): Promise<void> {
  try {
    const value = await task(signal);
    if (!signal.aborted) onOutcome({ ok: true, value });
  } catch (cause) {
    if (!signal.aborted) onOutcome({ ok: false, error: errorMessage(cause, "불러오지 못했습니다.") });
  }
}

export interface ParallelSection<T = unknown> {
  task: SectionTask<T>;
  signal: AbortSignal;
  onOutcome: (outcome: SectionOutcome<T>) => void;
}

// 모든 섹션 요청을 같은 틱에 시작한다. 한 섹션의 실패·지연이 다른 섹션을 막지 않고,
// 각 섹션은 자기 결과가 오는 즉시 onOutcome 으로 채워진다.
export function loadSectionsParallel(sections: ParallelSection<any>[]): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(sections.map((s) => settleSection(s.task, s.signal, s.onOutcome)));
}

// 같은 슬롯의 새 요청이 시작되면 이전 요청을 취소한다. 늦게 도착한 응답은 signal.aborted 로 버려진다.
export function createLatestController() {
  let current: AbortController | null = null;
  return {
    begin(): AbortSignal {
      current?.abort();
      current = new AbortController();
      return current.signal;
    },
    abort() { current?.abort(); current = null; },
  };
}

export type LazyState<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; error: string };

// 항목별 부가 조회(승인 미리보기). request() 를 부르기 전에는 아무 요청도 나가지 않는다.
export function createLazyLoader<T>(fetchOne: (id: string, signal: AbortSignal) => Promise<T>, onChange: () => void) {
  const states = new Map<string, LazyState<T>>();
  let ctrl: AbortController | null = null;
  return {
    request(id: string) {
      const known = states.get(id);
      if (known && known.status !== "error") return;
      if (!ctrl || ctrl.signal.aborted) ctrl = new AbortController();
      const signal = ctrl.signal;
      states.set(id, { status: "loading" });
      onChange();
      void settleSection((s) => fetchOne(id, s), signal, (o) => {
        states.set(id, o.ok ? { status: "ok", data: o.value } : { status: "error", error: o.error });
        onChange();
      });
    },
    snapshot(): Record<string, LazyState<T>> { return Object.fromEntries(states); },
    abort() {
      ctrl?.abort(); ctrl = null;
      for (const [id, st] of states) if (st.status === "loading") states.delete(id);
    },
    reset() { ctrl?.abort(); ctrl = null; states.clear(); onChange(); },
  };
}
