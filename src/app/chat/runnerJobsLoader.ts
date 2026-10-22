export type RunnerJobsErrorKind = "auth" | "forbidden" | "server" | "http" | "network" | "invalid";

export interface RunnerJobsError {
  kind: RunnerJobsErrorKind;
  status?: number;
  message: string;
}

export type RunnerJobsResult<T> = { ok: true; jobs: T[] } | { ok: false; error: RunnerJobsError };

export interface RunnerJobsState<T> {
  sessionId: string | null;
  jobs: T[];
  error: RunnerJobsError | null;
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export function describeRunnerJobsHttpError(status: number): RunnerJobsError {
  if (status === 401) {
    return { kind: "auth", status, message: "로그인이 만료되었거나 인증되지 않았습니다. 다시 로그인한 뒤 시도해 주세요. (HTTP 401)" };
  }
  if (status === 403) {
    return { kind: "forbidden", status, message: "이 세션의 Runner 작업을 볼 권한이 없습니다. (HTTP 403)" };
  }
  if (status >= 500) {
    return { kind: "server", status, message: `서버 오류로 Runner 작업을 불러오지 못했습니다. (HTTP ${status})` };
  }
  return { kind: "http", status, message: `Runner 작업을 불러오지 못했습니다. (HTTP ${status})` };
}

export async function loadRunnerJobs<T>(fetchFn: FetchLike, url: string, headers: Record<string, string>): Promise<RunnerJobsResult<T>> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers });
  } catch {
    return { ok: false, error: { kind: "network", message: "네트워크 오류로 Runner 작업을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." } };
  }
  if (!res.ok) return { ok: false, error: describeRunnerJobsHttpError(res.status) };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: { kind: "invalid", message: "서버 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요." } };
  }
  if (!Array.isArray(data)) {
    return { ok: false, error: { kind: "invalid", message: "서버 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요." } };
  }
  return { ok: true, jobs: data as T[] };
}

export function emptyRunnerJobsState<T>(): RunnerJobsState<T> {
  return { sessionId: null, jobs: [], error: null };
}

// 성공이면 교체, 실패면 같은 세션의 기존 목록은 유지하고 오류만 붙인다. 다른 세션 데이터는 절대 가져오지 않는다.
export function applyRunnerJobsResult<T>(prev: RunnerJobsState<T>, sessionId: string, result: RunnerJobsResult<T>): RunnerJobsState<T> {
  if (result.ok) return { sessionId, jobs: result.jobs, error: null };
  const sameSession = prev.sessionId === sessionId;
  return { sessionId, jobs: sameSession ? prev.jobs : [], error: result.error };
}

export function selectRunnerJobsState<T>(state: RunnerJobsState<T>, sessionId: string | undefined): RunnerJobsState<T> {
  return state.sessionId === (sessionId ?? null) ? state : { sessionId: sessionId ?? null, jobs: [], error: null };
}

export interface RunnerJobsPollingOptions<T> {
  url: string;
  getHeaders: () => Record<string, string>;
  fetchFn: FetchLike;
  intervalMs?: number;
  onLoading: (loading: boolean) => void;
  onResult: (result: RunnerJobsResult<T>) => void;
}

export function startRunnerJobsPolling<T>(opts: RunnerJobsPollingOptions<T>): { stop: () => void; refresh: () => void } {
  let stopped = false;
  let seq = 0;
  const run = async () => {
    const mine = ++seq;
    opts.onLoading(true);
    const result = await loadRunnerJobs<T>(opts.fetchFn, opts.url, opts.getHeaders());
    if (stopped || mine !== seq) return;
    opts.onResult(result);
    opts.onLoading(false);
  };
  void run();
  const timer = setInterval(() => { void run(); }, opts.intervalMs ?? 15000);
  return {
    stop: () => { stopped = true; clearInterval(timer); },
    refresh: () => { if (!stopped) void run(); },
  };
}
