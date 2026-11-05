import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelDialogReducer, changeDialogReducer, createRequestGate, initialCancelDialog, initialChangeDialog, initialReviewState,
  needsCeoActions, parseDigest, reviewReducer, runCancelApproval, runChangeRequest, runDigestLoad, submitChangeRequest,
  type CancelDialogAction, type ChangeDialogAction, type ChangeTarget, type Digest, type ReviewAction, type ReviewItem,
  type ReviewState, type SinceHours,
} from "@/lib/autoApprovalReview";
import AutoApprovalReview, {
  afterMutation, AutoApprovalReviewView, CancelDialogView, ChangeRequestDialogView, createCancelController, createChangeRequestController, NeedsCeoCard,
} from "./AutoApprovalReview";

// ---- 도구: DOM 이 없는 환경이라 훅 없는 함수 컴포넌트를 펼쳐 요소 트리를 직접 검사·클릭한다 ----------------------------------
type Node_ = { type: string; props: Record<string, unknown> & { children?: Node_[] } } | string;
function resolve(node: ReactNode): Node_[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(resolve);
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return resolve((el.type as (props: unknown) => ReactNode)(el.props));
  if (typeof el.type === "symbol") return resolve(el.props.children);
  return [{ type: el.type as string, props: { ...el.props, children: resolve(el.props.children) } }];
}
const textOf = (node: Node_): string => typeof node === "string" ? node : (node.props.children ?? []).map(textOf).join("");
function all(nodes: Node_[], pred: (el: Exclude<Node_, string>) => boolean): Exclude<Node_, string>[] {
  const out: Exclude<Node_, string>[] = [];
  const visit = (node: Node_) => {
    if (typeof node === "string") return;
    if (pred(node)) out.push(node);
    (node.props.children ?? []).forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}
const controls = (nodes: Node_[]) => all(nodes, (el) => el.type === "button" || el.type === "a");
const buttonsNamed = (nodes: Node_[], label: string) => all(nodes, (el) => el.type === "button" && textOf(el).trim() === label);
const click = (el: Exclude<Node_, string>) => (el.props.onClick as () => void)();

// ---- 도구: 픽스처·fetch 모킹 ----------------------------------------------------------------------------------------------
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() {
  let resolveFn!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolveFn = resolve; });
  return { promise, resolve: resolveFn };
}

const rawItem = (key: string, over: Record<string, unknown> = {}) => ({
  project_key: "AADS", document_key: key, title: `제목 ${key}`, kind: "prd", doc_tier: "D2", revision_id: `rev-${key}`,
  version: "1.0", generation: 3, mode: "on", risk: "normal", score: 92, ceo_brief: `요약 ${key}`, minor_issues: [], hold_reasons: [],
  reviewer_models: ["a"], ...over,
});
const rawDigest = (over: Record<string, unknown> = {}, project = "AADS") => ({
  project_key: project, mode: "on", since_hours: 24, auto_approved: [], held: [], would_approve: [], needs_ceo: [], auto_fixing: [],
  counts: { auto_approved: 0, held: 0 }, ...over,
});
const digestOf = (over: Record<string, unknown> = {}, project = "AADS"): Digest => parseDigest(rawDigest(over, project), project);
const rawCeo = (key: string, over: Record<string, unknown> = {}) => ({
  project_key: "AADS", document_key: key, title: `상신 ${key}`, risk: "high", round: 2, max_rounds: 3, reason: "보완 한도 초과",
  ceo_brief: "대표님 요약", remaining_issues: [{ severity: "major", location: "3장", problem: "근거 부족" }], decision_needed: "승인할지 정해 주세요", ...over,
});

function store<S, A>(reducer: (state: S, action: A) => S, initial: S) {
  let state = initial;
  return { get state() { return state; }, dispatch: (action: A) => { state = reducer(state, action); } };
}
const approved = (key: string, over: Record<string, unknown> = {}) => rawItem(key, { approved_at: "2026-11-05T01:00:00+09:00", currently_approved: true, ...over });

function viewOf(digest: Digest | null, over: Partial<{ status: ReviewState["status"]; problem: ReviewState["problem"]; hours: SinceHours }> = {}) {
  const hours = over.hours ?? 24;
  const state: ReviewState = { ...initialReviewState("AADS", hours), status: over.status ?? "ready", digest, problem: over.problem ?? null };
  const handlers = { onHours: vi.fn(), onRetry: vi.fn(), onChange: vi.fn(), onCancel: vi.fn() };
  const element = <AutoApprovalReviewView state={state} hours={hours} {...handlers} />;
  return { ...handlers, tree: resolve(element), html: renderToStaticMarkup(element) };
}

// ---- 응답 검사 -----------------------------------------------------------------------------------------------------------
describe("parseDigest (형식 검사)", () => {
  it("accepts a well-formed digest and caps minor issues at 3", () => {
    const digest = digestOf({ auto_approved: [approved("a", { minor_issues: ["1", "2", "3", "4", "5"] })] });
    expect(digest.auto_approved[0].minor_issues).toEqual(["1", "2", "3"]);
    expect(digest.auto_approved[0].currently_approved).toBe(true);
    expect(digest.truncated).toBe(false);
  });

  it("rejects non-array lists and missing required fields", () => {
    expect(() => parseDigest(rawDigest({ auto_approved: "x" }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ held: null }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ held: {} }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ auto_approved: [rawItem("a", { revision_id: undefined })] }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ auto_approved: [rawItem("a", { generation: 0 })] }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ auto_approved: [rawItem("a", { generation: "3" })] }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ needs_ceo: [{ project_key: "AADS", title: "t" }] }), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ auto_approved: [rawItem("a", { minor_issues: "x" })] }), "AADS")).toThrow();
    expect(() => parseDigest("nope", "AADS")).toThrow();
    expect(() => parseDigest(null, "AADS")).toThrow();
  });

  it("rejects a response that belongs to another project", () => {
    expect(() => parseDigest(rawDigest({}, "ACCT"), "AADS")).toThrow();
    expect(() => parseDigest(rawDigest({ held: [rawItem("a", { project_key: "ACCT" })] }), "AADS")).toThrow();
  });

  it("treats needs_ceo/auto_fixing/would_approve as optional and reads truncated as boolean or per-section map", () => {
    const bare: Record<string, unknown> = rawDigest();
    delete bare.needs_ceo;
    delete bare.auto_fixing;
    delete bare.would_approve;
    const digest = parseDigest({ ...bare, truncated: { auto_approved: false, held: true } }, "AADS");
    expect(digest.needs_ceo).toEqual([]);
    expect(digest.truncated).toBe(true);
    expect(parseDigest({ ...bare, truncated: true }, "AADS").truncated).toBe(true);
    expect(parseDigest({ ...bare, truncated: { held: false } }, "AADS").truncated).toBe(false);
  });
});

// ---- 불러오기 + 프로젝트 전환 --------------------------------------------------------------------------------------------
describe("runDigestLoad (fetch 모킹)", () => {
  async function load(project: string, hours: SinceHours, s: ReturnType<typeof store<ReviewState, ReviewAction>>, gate = createRequestGate()) {
    const token = gate.begin();
    s.dispatch({ type: "load_started", project, hours });
    await runDigestLoad({ project, hours, token, dispatch: s.dispatch });
  }

  it("GETs the digest for the project and window", async () => {
    fetchMock.mockResolvedValueOnce(json(rawDigest({ auto_approved: [approved("a")] })));
    const s = store(reviewReducer, initialReviewState("AADS"));
    await load("AADS", 24, s);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/projects\/AADS\/documents\/auto-approval-digest\?since_hours=24$/);
    expect((init as RequestInit).method).toBeUndefined();
    expect(s.state.status).toBe("ready");
    expect(s.state.digest?.auto_approved).toHaveLength(1);
  });

  it("asks for 168 hours when 7일 is chosen", async () => {
    fetchMock.mockResolvedValueOnce(json(rawDigest()));
    const s = store(reviewReducer, initialReviewState("AADS"));
    await load("AADS", 168, s);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/since_hours=168$/);
    expect(s.state.hours).toBe(168);
  });

  it("puts a malformed body into the error state", async () => {
    fetchMock.mockResolvedValueOnce(json({ project_key: "AADS", auto_approved: "x", held: [] }));
    const s = store(reviewReducer, initialReviewState("AADS"));
    await load("AADS", 24, s);
    expect(s.state.status).toBe("error");
    expect(s.state.problem?.kind).toBe("format");
    expect(s.state.digest).toBeNull();
  });

  it("classifies network failure, expired session, forbidden", async () => {
    const s = store(reviewReducer, initialReviewState("AADS"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch https://aads.newtalk.kr/x"));
    await load("AADS", 24, s);
    expect(s.state.problem?.kind).toBe("network");
    expect(s.state.problem?.text).not.toContain("https://");
    fetchMock.mockResolvedValueOnce(json({ detail: "x" }, 401));
    await load("AADS", 24, s);
    expect(s.state.problem?.kind).toBe("auth");
    fetchMock.mockResolvedValueOnce(json({ detail: "x" }, 403));
    await load("AADS", 24, s);
    expect(s.state.problem?.kind).toBe("forbidden");
    fetchMock.mockResolvedValueOnce(json({ detail: "boom" }, 500));
    await load("AADS", 24, s);
    expect(s.state.problem?.kind).toBe("network");
  });

  it("ignores a late response from the previous project and aborts its request", async () => {
    const late = deferred<Response>();
    fetchMock.mockImplementationOnce(() => late.promise);
    fetchMock.mockResolvedValueOnce(json(rawDigest({ held: [rawItem("b-doc", { project_key: "ACCT" })] }, "ACCT")));
    const s = store(reviewReducer, initialReviewState("AADS"));
    const gate = createRequestGate();

    const first = gate.begin();
    s.dispatch({ type: "load_started", project: "AADS", hours: 24 });
    const pendingA = runDigestLoad({ project: "AADS", hours: 24, token: first, dispatch: s.dispatch });
    s.dispatch({ type: "open_change", target: { project_key: "AADS", document_key: "a", title: "A", revision_id: "r", generation: 1 } });
    expect(s.state.target).not.toBeNull();

    await load("ACCT", 24, s, gate);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(s.state.project).toBe("ACCT");
    expect(s.state.target).toBeNull();
    expect(s.state.digest?.held[0].document_key).toBe("b-doc");

    late.resolve(json(rawDigest({ auto_approved: [approved("a-late")] })));
    await pendingA;
    expect(s.state.project).toBe("ACCT");
    expect(s.state.digest?.held[0].document_key).toBe("b-doc");
    expect(s.state.digest?.auto_approved).toHaveLength(0);
  });

  it("also drops a late failure from the previous project", async () => {
    const late = deferred<Response>();
    fetchMock.mockImplementationOnce(() => late.promise);
    fetchMock.mockResolvedValueOnce(json(rawDigest({}, "ACCT")));
    const s = store(reviewReducer, initialReviewState("AADS"));
    const gate = createRequestGate();
    const first = gate.begin();
    const pendingA = runDigestLoad({ project: "AADS", hours: 24, token: first, dispatch: s.dispatch });
    await load("ACCT", 24, s, gate);
    late.resolve(json({ detail: "x" }, 500));
    await pendingA;
    expect(s.state.status).toBe("ready");
    expect(s.state.problem).toBeNull();
  });
});

describe("reviewReducer", () => {
  const target: ChangeTarget = { project_key: "AADS", document_key: "a", title: "A", revision_id: "r", generation: 1 };
  const item = digestOf({ auto_approved: [approved("a")] }).auto_approved[0];

  it("clears items, target and cancelItem when the project changes", () => {
    let state = reviewReducer(initialReviewState("AADS"), { type: "load_ok", project: "AADS", hours: 24, digest: digestOf({ auto_approved: [approved("a")] }) });
    state = reviewReducer(reviewReducer(state, { type: "open_change", target }), { type: "open_cancel", item });
    expect(state.target && state.cancelItem && state.digest).toBeTruthy();
    const next = reviewReducer(state, { type: "load_started", project: "ACCT", hours: 24 });
    expect(next).toMatchObject({ project: "ACCT", status: "loading", digest: null, target: null, cancelItem: null });
  });

  it("drops results whose project or window no longer matches, even without a gate", () => {
    const state = initialReviewState("ACCT");
    expect(reviewReducer(state, { type: "load_ok", project: "AADS", hours: 24, digest: digestOf() })).toBe(state);
    expect(reviewReducer(state, { type: "load_failed", project: "AADS", hours: 24, problem: { kind: "network", text: "x" } })).toBe(state);
    expect(reviewReducer(state, { type: "load_ok", project: "ACCT", hours: 168, digest: digestOf({}, "ACCT") })).toBe(state);
  });

  it("refuses to open a modal for another project", () => {
    const state = initialReviewState("ACCT");
    expect(reviewReducer(state, { type: "open_change", target })).toBe(state);
    expect(reviewReducer(state, { type: "open_cancel", item })).toBe(state);
  });

  it("keeps the list while refreshing the same window", () => {
    const loaded = reviewReducer(initialReviewState("AADS"), { type: "load_ok", project: "AADS", hours: 24, digest: digestOf({ held: [rawItem("h")] }) });
    expect(reviewReducer(loaded, { type: "load_started", project: "AADS", hours: 24 }).digest).not.toBeNull();
    expect(reviewReducer(loaded, { type: "load_started", project: "AADS", hours: 168 }).digest).toBeNull();
  });
});

// ---- 수정 요청 -----------------------------------------------------------------------------------------------------------
const TARGET: ChangeTarget = { project_key: "AADS", document_key: "doc-a", title: "문서 A", revision_id: "11111111-1111-1111-1111-111111111111", generation: 4 };
const FEEDBACK = "3장 근거를 보강해 주세요.";

function dialogHarness(target = TARGET) {
  const s = store<typeof initialChangeDialog, ChangeDialogAction>(changeDialogReducer, initialChangeDialog);
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  const onSubmitted = vi.fn();
  // 훅 컴포넌트(ChangeRequestDialog)와 같은 컨트롤러를 View 의 onChange/onClick 에 연결한다 — 입력·클릭이 실제 제출 경로를 탄다.
  let open = true;
  const controller = createChangeRequestController({ target, getState: () => s.state, dispatch: s.dispatch, isActive: () => open, onSubmitted });
  const onSubmit = vi.fn(() => controller.submit());
  const view = () => resolve(<ChangeRequestDialogView target={target} state={s.state} onText={controller.edit} onSubmit={onSubmit} onClose={onClose} onRefresh={onRefresh} />);
  const close = () => { open = false; };
  return { s, onRefresh, onClose, onSubmit, onSubmitted, controller, view, close };
}

describe("수정 요청 제출 (fetch 모킹)", () => {
  it("POSTs revision_id, expected_generation and feedback to the change-request route", async () => {
    fetchMock.mockResolvedValueOnce(json({ job_id: "job-1", archived: false, idempotent: false }));
    const result = await submitChangeRequest(TARGET, FEEDBACK);
    expect(result).toEqual({ ok: true, jobId: "job-1", archived: false, idempotent: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/projects\/AADS\/documents\/doc-a\/change-request$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ revision_id: TARGET.revision_id, expected_generation: 4, feedback: FEEDBACK });
  });

  it("does not call the server for feedback outside 10~2000 characters", async () => {
    expect((await submitChangeRequest(TARGET, "짧아요")).ok).toBe(false);
    expect((await submitChangeRequest(TARGET, "가".repeat(2001))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json({ job_id: "j", archived: false, idempotent: false }));
    expect((await submitChangeRequest(TARGET, "가".repeat(10))).ok).toBe(true);
    fetchMock.mockResolvedValueOnce(json({ job_id: "j", archived: false, idempotent: false }));
    expect((await submitChangeRequest(TARGET, "가".repeat(2000))).ok).toBe(true);
  });

  it("shows the success message with the job number after a real submit flow", async () => {
    fetchMock.mockResolvedValueOnce(json({ job_id: "runner-abc", archived: true, idempotent: false }));
    const h = dialogHarness();
    const onSubmitted = vi.fn();
    h.s.dispatch({ type: "edit", text: FEEDBACK });
    await runChangeRequest({ target: TARGET, feedback: h.s.state.text, dispatch: h.s.dispatch, isActive: () => true, onSubmitted });
    expect(h.s.state.phase).toBe("done");
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    const text = h.view().map(textOf).join("");
    expect(text).toContain("수정 작업을 맡겼습니다(작업 번호 runner-abc)");
    expect(text).toContain("기존 승인은 취소되었고");
  });

  it("409 shows the recovery button and clicking it calls refresh; the form cannot be resubmitted", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "revision_not_latest" }, 409));
    const h = dialogHarness();
    h.s.dispatch({ type: "edit", text: FEEDBACK });
    await runChangeRequest({ target: TARGET, feedback: FEEDBACK, dispatch: h.s.dispatch, isActive: () => true });
    expect(h.s.state.problem?.kind).toBe("stale");
    const tree = h.view();
    expect(tree.map(textOf).join("")).toContain("문서가 바뀌었습니다 — 새로고침");
    const refresh = buttonsNamed(tree, "새로고침");
    expect(refresh).toHaveLength(1);
    expect(buttonsNamed(tree, "수정 요청 보내기")).toHaveLength(0);
    click(refresh[0]);
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
    expect(all(tree, (el) => el.type === "textarea")[0].props.disabled).toBe(true);
    h.s.dispatch({ type: "edit", text: "다른 내용으로 바꿔 보기" });
    expect(h.s.state.text).toBe(FEEDBACK);
  });

  it("generation_conflict is treated the same as revision_not_latest", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "generation_conflict" }, 409));
    const result = await submitChangeRequest(TARGET, FEEDBACK);
    expect(result.ok === false && result.problem.kind).toBe("stale");
  });

  it("classifies a network error and keeps the text so the user can retry", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const h = dialogHarness();
    h.s.dispatch({ type: "edit", text: FEEDBACK });
    await runChangeRequest({ target: TARGET, feedback: FEEDBACK, dispatch: h.s.dispatch, isActive: () => true });
    expect(h.s.state.phase).toBe("failed");
    expect(h.s.state.problem?.kind).toBe("network");
    expect(h.s.state.text).toBe(FEEDBACK);
    const tree = h.view();
    expect(buttonsNamed(tree, "수정 요청 보내기")[0].props.disabled).toBe(false);
    expect(all(tree, (el) => el.type === "textarea")[0].props.disabled).toBe(false);
  });

  it("points an expired session to the login link", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "x" }, 401));
    const h = dialogHarness();
    h.s.dispatch({ type: "edit", text: FEEDBACK });
    await runChangeRequest({ target: TARGET, feedback: FEEDBACK, dispatch: h.s.dispatch, isActive: () => true });
    expect(h.s.state.problem?.kind).toBe("auth");
    expect(all(h.view(), (el) => el.type === "a" && String(el.props.href).startsWith("/login"))).toHaveLength(1);
  });

  it("disables close, textarea and submit while busy, and ignores edits until the response arrives", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const h = dialogHarness();
    h.s.dispatch({ type: "edit", text: FEEDBACK });
    const flow = runChangeRequest({ target: TARGET, feedback: FEEDBACK, dispatch: h.s.dispatch, isActive: () => true });
    expect(h.s.state.phase).toBe("busy");
    const tree = h.view();
    expect(all(tree, (el) => el.type === "textarea")[0].props.disabled).toBe(true);
    expect(all(tree, (el) => el.type === "button" && el.props["aria-label"] === "닫기")[0].props.disabled).toBe(true);
    expect(buttonsNamed(tree, "취소")[0].props.disabled).toBe(true);
    expect(buttonsNamed(tree, "보내는 중…")[0].props.disabled).toBe(true);
    h.s.dispatch({ type: "edit", text: "바뀌면 안 되는 내용입니다" });
    h.s.dispatch({ type: "submit_started" });
    expect(h.s.state.text).toBe(FEEDBACK);
    pending.resolve(json({ job_id: "job-9", archived: false, idempotent: false }));
    await flow;
    expect(h.s.state.phase).toBe("done");
  });

  it("applies the response only to the modal instance that sent it", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const first = dialogHarness();
    const second = dialogHarness({ ...TARGET, document_key: "doc-b", title: "문서 B" });
    const onSubmitted = vi.fn();
    let firstOpen = true;
    first.s.dispatch({ type: "edit", text: FEEDBACK });
    second.s.dispatch({ type: "edit", text: "다른 문서에 대한 요청입니다" });
    const flow = runChangeRequest({ target: TARGET, feedback: FEEDBACK, dispatch: first.s.dispatch, isActive: () => firstOpen, onSubmitted });
    firstOpen = false;
    pending.resolve(json({ job_id: "job-1", archived: false, idempotent: false }));
    await flow;
    expect(first.s.state.phase).toBe("busy");
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(second.s.state).toMatchObject({ phase: "editing", text: "다른 문서에 대한 요청입니다", result: null });
  });

  it("always calls the document pinned when the modal opened", async () => {
    fetchMock.mockResolvedValueOnce(json({ job_id: "job-1", archived: false, idempotent: false }));
    const s = store(reviewReducer, initialReviewState("AADS"));
    s.dispatch({ type: "open_change", target: TARGET });
    const pinned = s.state.target!;
    s.dispatch({ type: "load_started", project: "ACCT", hours: 24 });
    const dialog = store(changeDialogReducer, initialChangeDialog);
    await runChangeRequest({ target: pinned, feedback: FEEDBACK, dispatch: dialog.dispatch, isActive: () => true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/projects\/AADS\/documents\/doc-a\/change-request$/);
  });

  it("keeps submit disabled below 10 characters and shows the character count", () => {
    const render = (text: string) => {
      const state = changeDialogReducer(initialChangeDialog, { type: "edit", text });
      return resolve(<ChangeRequestDialogView target={TARGET} state={state} onText={() => {}} onSubmit={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    };
    expect(buttonsNamed(render("아홉글자입니다네요"), "수정 요청 보내기")[0].props.disabled).toBe(true);
    expect(buttonsNamed(render("열글자입니다만네요요"), "수정 요청 보내기")[0].props.disabled).toBe(false);
    expect(buttonsNamed(render("가".repeat(2001)), "수정 요청 보내기")[0].props.disabled).toBe(true);
    expect(buttonsNamed(render("가".repeat(2000)), "수정 요청 보내기")[0].props.disabled).toBe(false);
    expect(buttonsNamed(render("          "), "수정 요청 보내기")[0].props.disabled).toBe(true);
    const counter = all(render("가나다"), (el) => el.props["data-testid"] === "feedback-count").map(textOf).join("");
    expect(counter).toContain("3/2000자");
  });
});

// ---- 승인 취소 -----------------------------------------------------------------------------------------------------------
describe("승인 취소 (기존 archive 엔드포인트)", () => {
  const item: ReviewItem = digestOf({ auto_approved: [approved("doc-a", { revision_id: "rev-shown", generation: 7 })] }).auto_approved[0];

  it("archives with exactly the revision_id and generation shown in the list, without re-reading the document", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const s = store<typeof initialCancelDialog, CancelDialogAction>(cancelDialogReducer, initialCancelDialog);
    const onDone = vi.fn();
    await runCancelApproval({ item, dispatch: s.dispatch, isActive: () => true, onDone });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/projects\/AADS\/documents\/doc-a\/archive$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ revision_id: "rev-shown", expected_generation: 7 });
    expect(s.state.phase).toBe("done");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("on 409 shows 문서가 바뀌었습니다 — 새로고침, does not retry, and offers refresh instead of confirm", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "generation_conflict" }, 409));
    const s = store<typeof initialCancelDialog, CancelDialogAction>(cancelDialogReducer, initialCancelDialog);
    const onDone = vi.fn();
    const onRefresh = vi.fn();
    await runCancelApproval({ item, dispatch: s.dispatch, isActive: () => true, onDone });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(s.state.problem?.kind).toBe("stale");
    const tree = resolve(<CancelDialogView item={item} state={s.state} onConfirm={() => {}} onClose={() => {}} onRefresh={onRefresh} />);
    expect(tree.map(textOf).join("")).toContain("문서가 바뀌었습니다 — 새로고침");
    expect(buttonsNamed(tree, "확인")).toHaveLength(0);
    click(buttonsNamed(tree, "새로고침")[0]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("disables confirm and cancel while busy", () => {
    const state = cancelDialogReducer(initialCancelDialog, { type: "started" });
    const tree = resolve(<CancelDialogView item={item} state={state} onConfirm={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    expect(buttonsNamed(tree, "처리 중…")[0].props.disabled).toBe(true);
    expect(buttonsNamed(tree, "취소")[0].props.disabled).toBe(true);
  });

  it("reports a network failure without closing or claiming success", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const s = store<typeof initialCancelDialog, CancelDialogAction>(cancelDialogReducer, initialCancelDialog);
    const onDone = vi.fn();
    await runCancelApproval({ item, dispatch: s.dispatch, isActive: () => true, onDone });
    expect(s.state).toMatchObject({ phase: "failed" });
    expect(s.state.problem?.kind).toBe("network");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ignores a response for a modal that is no longer open", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const s = store<typeof initialCancelDialog, CancelDialogAction>(cancelDialogReducer, initialCancelDialog);
    const onDone = vi.fn();
    await runCancelApproval({ item, dispatch: s.dispatch, isActive: () => false, onDone });
    expect(s.state.phase).toBe("busy");
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ---- 화면 ----------------------------------------------------------------------------------------------------------------
describe("AutoApprovalReviewView", () => {
  it("lists items with title, small document key, brief, score, minor issues (max 3), hold reasons", () => {
    const digest = digestOf({
      auto_approved: [approved("auto-doc", { minor_issues: ["a", "b", "c", "d"], score: 88 })],
      held: [rawItem("held-doc", { hold_reasons: ["교차검토가 통과 상태가 아닙니다"], score: undefined })],
    });
    const { html } = viewOf(digest);
    expect(html).toContain("제목 auto-doc");
    expect(html).toContain("요약 auto-doc");
    expect(html).toContain("점수 88");
    expect(html).toContain("자동 승인됨");
    expect(html).toMatch(/text-\[11px\][^>]*>auto-doc</);
    expect(html).toContain("경미한 지적");
    expect(html).not.toContain(">d<");
    expect(html).toContain("보류 사유");
    expect(html).toContain("교차검토가 통과 상태가 아닙니다");
    expect(html).not.toContain("점수 undefined");
  });

  it("hides fields that the server did not send", () => {
    const { html } = viewOf(digestOf({ auto_approved: [approved("bare", { ceo_brief: undefined, score: undefined, approved_at: undefined })] }));
    expect(html).not.toContain("점수");
    expect(html).not.toContain("경미한 지적");
    expect(html).not.toContain("보류 사유");
    expect(html).not.toContain("KST");
  });

  it("orders groups: 대표님 판단 필요, 자동 승인됨, 보류, 자동 보완 중", () => {
    const { html } = viewOf(digestOf({
      auto_fixing: [{ project_key: "AADS", document_key: "fixing-doc", title: "보완 문서", round: 1, max_rounds: 3, job_id: "job-7" }],
      held: [rawItem("held-doc")],
      auto_approved: [approved("auto-doc")],
      needs_ceo: [rawCeo("ceo-doc", { pending_days: 3 })],
    }));
    const order = ["aria-label=\"대표님 판단 필요\"", "aria-label=\"자동 승인됨\"", "aria-label=\"보류 (수정 필요)\"", "aria-label=\"자동 보완 중\""].map((needle) => html.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("미결 3일");
    expect(html).toContain("작업 번호 job-7");
    expect(html).toContain("보완 문서");
  });

  it("hides the 대표님 판단 필요 group when there is none, and the pending days when absent", () => {
    const none = viewOf(digestOf({ auto_approved: [approved("auto-doc")] })).html;
    expect(none).not.toContain("대표님 판단 필요");
    const noPending = viewOf(digestOf({ needs_ceo: [rawCeo("ceo-doc")] })).html;
    expect(noPending).toContain("대표님 판단 필요");
    expect(noPending).not.toContain("미결");
  });

  it("shows reason, remaining issues (max 3) and decision request for needs_ceo", () => {
    const issues = [1, 2, 3, 4, 5].map((n) => ({ severity: "major", location: `${n}장`, problem: `문제 ${n}` }));
    const { html } = viewOf(digestOf({ needs_ceo: [rawCeo("ceo-doc", { remaining_issues: issues })] }));
    expect(html).toContain("상신 사유");
    expect(html).toContain("보완 한도 초과");
    expect(html).toContain("문제 3");
    expect(html).not.toContain("문제 4");
    expect(html).toContain("승인할지 정해 주세요");
  });

  it("shows loading, empty (24h / 7일), error with retry, and the login link on session expiry", () => {
    expect(viewOf(null, { status: "loading" }).html).toContain("불러오는 중");
    expect(viewOf(digestOf()).html).toContain("오늘 자동승인된 문서가 없습니다");
    expect(viewOf(digestOf(), { hours: 168 }).html).toContain("최근 7일 동안 자동승인된 문서가 없습니다");
    const failed = viewOf(null, { status: "error", problem: { kind: "network", text: "연결에 실패했습니다." } });
    expect(failed.html).toContain('role="alert"');
    click(buttonsNamed(failed.tree, "재시도")[0]);
    expect(failed.onRetry).toHaveBeenCalledTimes(1);
    const expired = viewOf(null, { status: "error", problem: { kind: "auth", text: "로그인이 만료되었습니다." } });
    expect(expired.html).toContain("로그인 복구");
    expect(expired.html).toContain("/login?next=");
    expect(buttonsNamed(expired.tree, "재시도")).toHaveLength(0);
  });

  it("tells the user when the list is partial", () => {
    expect(viewOf(digestOf({ truncated: { held: true } })).html).toContain("일부만 표시");
    expect(viewOf(digestOf({ truncated: { held: false } })).html).not.toContain("일부만 표시");
  });

  it("switches the window with 24시간 / 7일 buttons", () => {
    const view = viewOf(digestOf());
    click(buttonsNamed(view.tree, "7일")[0]);
    expect(view.onHours).toHaveBeenCalledWith(168);
    expect(buttonsNamed(view.tree, "24시간")[0].props["aria-pressed"]).toBe(true);
  });

  it("offers 승인 취소 only on auto-approved items that are still currently approved", () => {
    const { tree } = viewOf(digestOf({
      auto_approved: [approved("yes"), approved("cancelled", { currently_approved: false }), rawItem("unknown")],
      held: [rawItem("held-doc", { currently_approved: true })],
      would_approve: [rawItem("would-doc", { currently_approved: true })],
    }));
    const cancels = buttonsNamed(tree, "승인 취소");
    expect(cancels).toHaveLength(1);
    const cards = all(tree, (el) => el.type === "li" && buttonsNamed([el], "승인 취소").length > 0);
    expect(cards).toHaveLength(1);
    expect(textOf(cards[0])).toContain("제목 yes");
    expect(buttonsNamed(tree, "수정 요청")).toHaveLength(5);
  });

  it("explains an item whose approval was already cancelled", () => {
    expect(viewOf(digestOf({ auto_approved: [approved("gone", { currently_approved: false })] })).html).toContain("승인 취소됨");
  });

  it("passes the shown revision_id and generation when 수정 요청 / 승인 취소 are clicked", () => {
    const view = viewOf(digestOf({ auto_approved: [approved("doc-a", { revision_id: "rev-x", generation: 9 })] }));
    click(buttonsNamed(view.tree, "수정 요청")[0]);
    expect(view.onChange).toHaveBeenCalledWith({ project_key: "AADS", document_key: "doc-a", title: "제목 doc-a", revision_id: "rev-x", generation: 9 });
    click(buttonsNamed(view.tree, "승인 취소")[0]);
    expect((view.onCancel.mock.calls[0][0] as ReviewItem)).toMatchObject({ revision_id: "rev-x", generation: 9 });
  });
});

describe("needs_ceo 안내와 버튼 일치", () => {
  const withHeld = digestOf({ needs_ceo: [rawCeo("doc-a")], held: [rawItem("doc-a", { revision_id: "rev-held", generation: 5 })] });
  const noHeld = digestOf({ needs_ceo: [rawCeo("doc-a")] });

  const quoted = (guidance: string) => [...guidance.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  function cardOf(digest: Digest) {
    const { tree, onChange } = viewOf(digest);
    const card = all(tree, (el) => el.type === "li" && el.props["data-group"] === "needs_ceo")[0];
    const guidance = textOf(all([card], (el) => el.props["data-testid"] === "needs-ceo-guidance")[0]);
    return { card, guidance, onChange };
  }

  it("takes revision_id and generation from the held item with the same document_key", () => {
    const { card, onChange } = cardOf(withHeld);
    const button = buttonsNamed([card], "수정 요청")[0];
    expect(button.props.disabled).toBe(false);
    click(button);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ document_key: "doc-a", revision_id: "rev-held", generation: 5 }));
  });

  it("does not offer 승인 취소 and never mentions it", () => {
    const { card, guidance } = cardOf(withHeld);
    expect(buttonsNamed([card], "승인 취소")).toHaveLength(0);
    expect(guidance).not.toContain("승인 취소");
    expect(guidance).toContain("수정 요청");
  });

  it("disables 수정 요청 and links to the document list when no held item matches", () => {
    const { card, guidance } = cardOf(noHeld);
    expect(buttonsNamed([card], "수정 요청")[0].props.disabled).toBe(true);
    const links = all([card], (el) => el.type === "a" && textOf(el) === "정본 문서 목록에서 열기");
    expect(links).toHaveLength(1);
    expect(String(links[0].props.href)).toBe("/docs?tab=canonical&project=AADS&document_key=doc-a");
    expect(guidance).toContain("정본 문서 목록에서 열기");
  });

  it("does not borrow a held item of another document", () => {
    const digest = digestOf({ needs_ceo: [rawCeo("doc-a")], held: [rawItem("doc-b")] });
    expect(needsCeoActions(digest.needs_ceo[0], digest).target).toBeNull();
  });

  it("shows the decision-card link only when resolve_path is given, and the guidance names exactly the rendered controls", () => {
    for (const digest of [withHeld, noHeld]) {
      for (const resolvePath of [undefined, "/cards/42", "javascript:alert(1)", "//evil.example/x"]) {
        const d = { ...digest, needs_ceo: [{ ...digest.needs_ceo[0], resolve_path: resolvePath }] };
        const { card, guidance } = cardOf(d);
        const names = controls([card]).map((el) => textOf(el).trim());
        for (const name of quoted(guidance)) expect(names).toContain(name);
        const hasCard = names.includes("결정 카드 열기");
        expect(hasCard).toBe(resolvePath === "/cards/42");
        expect(guidance.includes("결정 카드 열기")).toBe(hasCard);
        if (hasCard) expect(String(controls([card]).find((el) => textOf(el) === "결정 카드 열기")!.props.href)).toBe("/cards/42");
      }
    }
  });
});

describe("레이아웃 규칙", () => {
  const digest = digestOf({
    needs_ceo: [rawCeo("ceo-doc", { resolve_path: "/cards/1" })], held: [rawItem("ceo-doc")],
    auto_approved: [approved("auto-doc")], auto_fixing: [{ project_key: "AADS", document_key: "fix-doc", title: "보완", job_id: "j" }],
  });

  it("gives every button and link a 44px touch height", () => {
    const { tree } = viewOf(digest);
    const list = controls(tree);
    expect(list.length).toBeGreaterThan(6);
    for (const el of list) expect(String(el.props.className)).toContain("min-h-11");
    const dialog = resolve(<ChangeRequestDialogView target={TARGET} state={initialChangeDialog} onText={() => {}} onSubmit={() => {}} onClose={() => {}} onRefresh={() => {}} />);
    for (const el of controls(dialog)) expect(String(el.props.className)).toContain("min-h-11");
  });

  it("wraps long text and button rows for narrow widths, and uses only theme variables for colours", () => {
    const html = viewOf(digest).html;
    expect(html).toContain("flex-wrap");
    expect(html).toContain("break-all");
    expect(html).toContain("break-words");
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1]).join(";");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|\bwhite\b|\bblack\b/i);
    // Tailwind 색 클래스(text-white, bg-black/70, border-red-700 등)도 쓰지 않는다 — 기존 CSS 변수만.
    expect(html).not.toMatch(/\b(?:text|bg|border)-(?:white|black|red|green|blue|yellow|gray|slate)(?:-\d{2,3})?(?:\/\d+)?\b/);
    expect(styles).toContain("var(--border)");
  });

  it("renders the container in its loading state with no dialogs before any data arrives", () => {
    const html = renderToStaticMarkup(<AutoApprovalReview project="AADS" />);
    expect(html).toContain("자동승인 참고검토");
    expect(html).toContain("불러오는 중");
    expect(html).not.toContain('role="dialog"');
  });
});


// ---- runner-d94ce096 반려 지적 회귀 ------------------------------------------------------------------------------------
const typeInto = (tree: Node_[], text: string) => {
  const [area] = all(tree, (el) => el.type === "textarea");
  (area.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: text } });
};

describe("입력→버튼 클릭→요청→화면 갱신 (View 에 연결된 실제 핸들러)", () => {
  it("typing then clicking the submit button POSTs the typed feedback and shows the job number", async () => {
    fetchMock.mockResolvedValueOnce(json({ job_id: "job-77", archived: true, idempotent: false }));
    const h = dialogHarness();
    expect(buttonsNamed(h.view(), "수정 요청 보내기")[0].props.disabled).toBe(true);
    typeInto(h.view(), FEEDBACK);
    const [submitButton] = buttonsNamed(h.view(), "수정 요청 보내기");
    expect(submitButton.props.disabled).toBe(false);
    await (click(submitButton) as unknown as Promise<void>);
    await h.onSubmit.mock.results[0].value;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/projects\/AADS\/documents\/doc-a\/change-request$/);
    expect(JSON.parse(init.body as string)).toEqual({ revision_id: TARGET.revision_id, expected_generation: 4, feedback: FEEDBACK });
    expect(textOf({ type: "root", props: { children: h.view() } })).toContain("수정 작업을 맡겼습니다(작업 번호 job-77)");
    expect(h.onSubmitted).toHaveBeenCalledTimes(1);
  });

  it("ignores typing while busy and does not double-submit on a second click", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolveFetch = r; }));
    const h = dialogHarness();
    typeInto(h.view(), FEEDBACK);
    const first = h.controller.submit();
    expect(h.s.state.phase).toBe("busy");
    typeInto(h.view(), "바뀐 내용으로 덮어쓰기 시도입니다");
    expect(h.s.state.text).toBe(FEEDBACK);
    await h.controller.submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(json({ job_id: "job-1", archived: false, idempotent: false }));
    await first;
    expect(h.s.state.phase).toBe("done");
  });

  it("a response arriving after the dialog was closed is not applied to it", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolveFetch = r; }));
    const h = dialogHarness();
    typeInto(h.view(), FEEDBACK);
    const flow = h.controller.submit();
    h.close();
    resolveFetch(json({ job_id: "job-late", archived: false, idempotent: false }));
    await flow;
    expect(h.s.state.phase).toBe("busy");
    expect(h.onSubmitted).not.toHaveBeenCalled();
  });

  it("cancel confirm button archives the shown revision and then refreshes review list and parent list", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const item: ReviewItem = digestOf({ auto_approved: [approved("doc-a", { revision_id: "rev-shown", generation: 7 })] }).auto_approved[0];
    const s = store<typeof initialCancelDialog, CancelDialogAction>(cancelDialogReducer, initialCancelDialog);
    const reload = vi.fn();
    const onChanged = vi.fn();
    const controller = createCancelController({ item, getState: () => s.state, dispatch: s.dispatch, isActive: () => true, onDone: afterMutation(reload, onChanged) });
    const tree = resolve(<CancelDialogView item={item} state={s.state} onConfirm={() => { void controller.confirm(); }} onClose={() => {}} onRefresh={() => {}} />);
    click(buttonsNamed(tree, "확인")[0]);
    await vi.waitFor(() => expect(s.state.phase).toBe("done"));
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ revision_id: "rev-shown", expected_generation: 7 });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("상위 화면 갱신 연결·결정 카드 번호", () => {
  it("afterMutation refreshes both the review list and the parent document list", () => {
    const reload = vi.fn();
    const onChanged = vi.fn();
    afterMutation(reload, onChanged)();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(() => afterMutation(reload)()).not.toThrow();
  });

  it("CanonicalDocuments passes a reload callback for list and detail", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./CanonicalDocuments.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/<AutoApprovalReview project=\{project\} onChanged=\{\(\) => \{ void reloadList\(\); if \(selected\) void reloadDetail\(selected\); \}\} \/>/);
  });

  it("shows the decision card id when the server provides one, and hides it otherwise", () => {
    const digest = digestOf({ needs_ceo: [rawCeo("doc-c", { card_id: "abcdef1234567890" })] });
    const tree = resolve(<NeedsCeoCard item={digest.needs_ceo[0]} digest={digest} onChange={() => {}} />);
    const shown = all(tree, (el) => el.props["data-testid"] === "needs-ceo-card-id").map(textOf).join("");
    expect(shown).toContain("결정 카드 abcdef12");
    const none = digestOf({ needs_ceo: [rawCeo("doc-d")] });
    const hidden = resolve(<NeedsCeoCard item={none.needs_ceo[0]} digest={none} onChange={() => {}} />);
    expect(all(hidden, (el) => el.props["data-testid"] === "needs-ceo-card-id")).toHaveLength(0);
  });
});
