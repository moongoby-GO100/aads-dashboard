import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRunnerJobsResult, emptyRunnerJobsState, loadRunnerJobs, selectRunnerJobsState, startRunnerJobsPolling,
  type RunnerJobsResult, type RunnerJobsState,
} from "./runnerJobsLoader";

type J = { job_id: string };
const H = { Authorization: "Bearer t" };
const resp = (status: number, body: unknown = [], badJson = false) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => { if (badJson) throw new SyntaxError("bad"); return body; } }) as unknown as Response;
const load = (f: () => Promise<Response>) => loadRunnerJobs<J>(f, "/u", H);

describe("loadRunnerJobs", () => {
  it("200 배열은 성공, 빈 배열도 오류가 아닌 성공", async () => {
    expect(await load(async () => resp(200, [{ job_id: "a" }]))).toEqual({ ok: true, jobs: [{ job_id: "a" }] });
    expect(await load(async () => resp(200, []))).toEqual({ ok: true, jobs: [] });
  });
  it.each([[500, "server"], [503, "server"], [401, "auth"], [403, "forbidden"], [404, "http"]])("HTTP %i 는 %s 오류", async (status, kind) => {
    const r = await load(async () => resp(status));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.kind).toBe(kind); expect(r.error.status).toBe(status); expect(r.error.message).toContain(`HTTP ${status}`); }
  });
  it("네트워크 오류", async () => {
    const r = await load(async () => { throw new TypeError("Failed to fetch"); });
    expect(r.ok === false && r.error.kind).toBe("network");
  });
  it("잘못된 JSON, 배열이 아닌 JSON 은 실패", async () => {
    const bad = await load(async () => resp(200, null, true));
    expect(bad.ok === false && bad.error.kind).toBe("invalid");
    for (const body of [{ detail: "x" }, null, "str", 5]) {
      const r = await load(async () => resp(200, body));
      expect(r.ok === false && r.error.kind).toBe("invalid");
    }
  });
});

describe("상태 전이", () => {
  const ok = (...ids: string[]): RunnerJobsResult<J> => ({ ok: true, jobs: ids.map((job_id) => ({ job_id })) });
  const fail: RunnerJobsResult<J> = { ok: false, error: { kind: "server", status: 500, message: "m" } };
  it("refresh 실패 시 같은 세션 기존 데이터 유지 + 오류 표시, 재시도 성공 시 오류 해제", () => {
    let s: RunnerJobsState<J> = applyRunnerJobsResult(emptyRunnerJobsState<J>(), "s1", ok("a"));
    s = applyRunnerJobsResult(s, "s1", fail);
    expect(s.jobs).toEqual([{ job_id: "a" }]);
    expect(s.error?.status).toBe(500);
    s = applyRunnerJobsResult(s, "s1", ok("a", "b"));
    expect(s.error).toBeNull();
    expect(s.jobs).toHaveLength(2);
  });
  it("다른 세션의 실패는 이전 세션 데이터를 가져오지 않는다", () => {
    const s1 = applyRunnerJobsResult(emptyRunnerJobsState<J>(), "s1", ok("a"));
    const s2 = applyRunnerJobsResult(s1, "s2", fail);
    expect(s2.jobs).toEqual([]);
    expect(s2.error).not.toBeNull();
  });
  it("selectRunnerJobsState 는 세션 전환 직후 이전 세션 데이터·오류를 숨긴다", () => {
    const s1 = applyRunnerJobsResult(applyRunnerJobsResult(emptyRunnerJobsState<J>(), "s1", ok("a")), "s1", fail);
    const view = selectRunnerJobsState(s1, "s2");
    expect(view.jobs).toEqual([]);
    expect(view.error).toBeNull();
    expect(selectRunnerJobsState(s1, "s1")).toBe(s1);
  });
});

describe("startRunnerJobsPolling", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("재시도(refresh)로 500 이후 200 복구", async () => {
    const responses = [resp(500), resp(200, [{ job_id: "a" }])];
    const results: RunnerJobsResult<J>[] = [];
    const p = startRunnerJobsPolling<J>({ url: "/u", getHeaders: () => H, fetchFn: async () => responses.shift()!, onLoading: () => {}, onResult: (r) => results.push(r) });
    await vi.advanceTimersByTimeAsync(0);
    p.refresh();
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    expect(results.map((r) => r.ok)).toEqual([false, true]);
  });

  it("세션 전환(stop) 뒤 도착한 지연 응답은 반영되지 않는다", async () => {
    let release!: (r: Response) => void;
    const onResult = vi.fn();
    const onLoading = vi.fn();
    const p = startRunnerJobsPolling<J>({ url: "/s1", getHeaders: () => H, fetchFn: () => new Promise<Response>((res) => { release = res; }), onLoading, onResult });
    p.stop();
    release(resp(200, [{ job_id: "old-session" }]));
    await vi.advanceTimersByTimeAsync(20000);
    expect(onResult).not.toHaveBeenCalled();
    expect(onLoading).not.toHaveBeenCalledWith(false);
  });

  it("같은 세션에서 겹친 요청은 가장 최근 요청 결과만 반영", async () => {
    const resolvers: Array<(r: Response) => void> = [];
    const onResult = vi.fn();
    const p = startRunnerJobsPolling<J>({ url: "/u", getHeaders: () => H, fetchFn: () => new Promise<Response>((res) => { resolvers.push(res); }), onLoading: () => {}, onResult });
    p.refresh();
    resolvers[1](resp(200, [{ job_id: "new" }]));
    await vi.advanceTimersByTimeAsync(0);
    resolvers[0](resp(500));
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ ok: true, jobs: [{ job_id: "new" }] });
  });

  it("15초 주기로 재조회", async () => {
    const fetchFn = vi.fn(async () => resp(200, []));
    const p = startRunnerJobsPolling<J>({ url: "/u", getHeaders: () => H, fetchFn, onLoading: () => {}, onResult: () => {} });
    await vi.advanceTimersByTimeAsync(30000);
    p.stop();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
