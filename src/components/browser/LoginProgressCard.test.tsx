import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginProgressView, loginLabel } from "./LoginProgressCard";
import { browserLoginApi, loginError, singleLoginRequest, type AuthScope } from "@/services/browserLoginApi";
const scope: AuthScope = { tenant_id: "tenant", business_ref: "가게", account_ref: "계정", session_id: "chat", work_key: "hidden-work", lane: "server", target: "https://example.com", recipe_name: "login", recipe_version: 1, checkpoint: 0, expires_at: "2099-01-01T00:00:00Z" };
const task = { id: "task", status: "waiting_for_user", result: { auth_scope: scope } };
afterEach(() => vi.unstubAllGlobals());
describe("로그인 진행 카드", () => {
  it.each([["queued", "접속 확인 중"], ["running", "로그인 중"], ["waiting_for_user", "추가 인증 필요"], ["completed", "완료"], ["failed", "실패"], ["expired", "만료"], ["cancelled", "중단됨"]])("%s 상태 표시", (status, label) => {
    expect(renderToStaticMarkup(<LoginProgressView task={{ ...task, status }} busy={false} />)).toContain(label);
  });
  it("인증 범위 원문을 숨기고 증거가 없으면 계속을 비활성화한다", () => {
    const html = renderToStaticMarkup(<LoginProgressView task={task} busy={false} />);
    expect(html).toContain("최신 화면 증거");
    expect(html).not.toContain("hidden-work");
    expect(html).toMatch(/disabled=""[^>]*>인증 완료 후 계속/);
  });
  it("요청 중 모든 동작을 비활성화한다", () => {
    const html = renderToStaticMarkup(<LoginProgressView task={task} busy artifactId="fresh" />);
    expect((html.match(/disabled=""/g) || []).length).toBe(4);
  });
  it("만료 시 재개 버튼을 숨긴다", () => {
    const expired = { ...task, result: { auth_scope: { ...scope, expires_at: "2020-01-01T00:00:00Z" } } };
    expect(loginLabel(expired)).toBe("만료");
    expect(renderToStaticMarkup(<LoginProgressView task={expired} busy={false} />)).not.toContain("인증 완료 후 계속");
  });
  it("PC 연결 복구를 안내한다", () => {
    expect(renderToStaticMarkup(<LoginProgressView task={{ ...task, result: { auth_scope: { ...scope, lane: "pc" } } }} busy={false} pcConnected={false} />)).toContain("PC 연결 필요");
  });
  it("재조회와 resume/cancel의 실제 경로 및 바디", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => task });
    vi.stubGlobal("fetch", fetchMock);
    expect(await browserLoginApi.get("task")).toEqual(task);
    await browserLoginApi.resume("task", scope, "latest");
    await browserLoginApi.cancel("task", scope);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/browser-tasks\/task$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/task\/auth-resume$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ scope, artifact_id: "latest" });
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/task\/auth-cancel$/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ scope });
  });
  it.each(["auth_scope_mismatch", "auth_wait_already_consumed", "auth_task_not_found", "auth_evidence_lane_mismatch", "auth_evidence_predates_wait", "auth_resume_verification_required", "auth_session_user_mismatch", "auth_evidence_binding_changed", "auth_evidence_browser_scope_mismatch", "auth_transition_endpoint_required", "auth_expired"])("409 %s 한글 안내", async (detail) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail }) }));
    await expect(browserLoginApi.resume("task", scope, "latest")).rejects.toThrow(loginError(detail));
    expect(loginError(detail)).not.toContain(detail);
  });
  it("연속 클릭은 한 번만 실행한다", async () => {
    const gate = singleLoginRequest();
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = gate(action); await gate(action);
    expect(action).toHaveBeenCalledTimes(1); finish(); await first;
    await gate(async () => {});
  });
});
