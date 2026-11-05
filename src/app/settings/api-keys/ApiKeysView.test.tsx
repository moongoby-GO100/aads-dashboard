import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ApiKeysView,
  CLI_ADMIN_ONLY_TEXT,
  EMPTY_LIST_TEXT,
  GEMINI_WARNING,
  describeTestReason,
  providerLabel,
  saveAndVerify,
  type ApiKeysViewProps,
  type KeyApi,
} from "./ApiKeysView";

function props(over: Partial<ApiKeysViewProps> = {}): ApiKeysViewProps {
  return {
    method: null, onSelectMethod: vi.fn(), provider: "anthropic", onProviderChange: vi.fn(),
    keyValue: "", onKeyChange: vi.fn(), displayName: "", onDisplayNameChange: vi.fn(),
    saving: false, onSave: vi.fn(), formStatus: null, isAdmin: false, keys: [], loading: false,
    listStatus: null, loadError: null, testingId: "", onRefresh: vi.fn(), onTest: vi.fn(), onDelete: vi.fn(),
    ...over,
  };
}
const render = (over: Partial<ApiKeysViewProps> = {}) => renderToStaticMarkup(<ApiKeysView {...props(over)} />);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
const FAKE_KEY = "TESTKEY-not-real-0000";
const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);

describe("1단계 연결 방식 분기", () => {
  it("선택 전에는 두 버튼만 보이고 입력폼·CLI 패널은 없다", () => {
    const html = render();
    expect(html).toContain("API 키로 연결");
    expect(html).toContain("CLI 구독으로 연결");
    expect(html).toContain("min-height:44px");
    expect(has(html, "api-key-form")).toBe(false);
    expect(has(html, "cli-panel")).toBe(false);
  });

  it("API 키 경로: 회사 이름·형식 힌트·발급 링크·접힌 표시명·저장 후 검증 버튼", () => {
    const html = render({ method: "api", provider: "openai" });
    expect(has(html, "api-key-form")).toBe(true);
    expect(has(html, "cli-panel")).toBe(false);
    for (const label of ["Anthropic Claude", "OpenAI", "Google Gemini", "Alibaba Qwen (dashscope)"]) expect(html).toContain(label);
    expect(html).toContain("sk- 로 시작하는 긴 문자열");
    expect(html).toContain("https://platform.openai.com/api-keys");
    expect(html).toMatch(/<details>[\s\S]*표시명 \(선택\)/);
    expect(html).not.toMatch(/<details open/);
    expect(html).toContain("저장하고 검증");
    expect(html).toContain('type="password"');
  });

  it("CLI 경로: API 폼은 숨겨진다", () => {
    const html = render({ method: "cli" });
    expect(has(html, "cli-panel")).toBe(true);
    expect(has(html, "api-key-form")).toBe(false);
  });
});

describe("Google Gemini 경고", () => {
  it("Gemini 선택 시 경고와 CLI 전환 버튼이 보인다", () => {
    const html = render({ method: "api", provider: "gemini" });
    expect(html).toContain(esc(GEMINI_WARNING));
    expect(has(html, "gemini-switch-cli")).toBe(true);
  });

  it("다른 회사에서는 경고가 없다", () => {
    expect(has(render({ method: "api", provider: "openai" }), "gemini-warning")).toBe(false);
  });
});

describe("CLI 구독 경로 권한", () => {
  const ids = ["claude_code", "codex", "gemini_cli"];

  it("일반 사용자는 세 버튼이 모두 disabled 이고 관리자 안내가 나온다", () => {
    const html = render({ method: "cli", isAdmin: false });
    for (const id of ids) {
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*data-testid="cli-option-${id}"`));
    }
    expect(html).toContain("Claude Code");
    expect(html).toContain("Codex");
    expect(html).toContain("Gemini CLI / Antigravity(agy)");
    expect(html).toContain(esc(CLI_ADMIN_ONLY_TEXT));
    expect(has(html, "cli-admin-link")).toBe(false);
  });

  it("관리자는 LLM 관리 화면(/settings)으로 가는 링크가 된다", () => {
    const html = render({ method: "cli", isAdmin: true });
    for (const id of ids) expect(html).toMatch(new RegExp(`<a[^>]*href="/settings"[^>]*data-testid="cli-option-${id}"`));
    expect(has(html, "cli-admin-link")).toBe(true);
    expect(html).not.toContain("disabled");
  });

  it("권한 확인 전에는 비활성이고 확인 중 문구가 나온다", () => {
    const html = render({ method: "cli", isAdmin: null });
    expect(html).toContain("권한을 확인하는 중");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="cli-option-codex"/);
  });
});

describe("목록", () => {
  it("빈 목록 문구", () => {
    const html = render();
    expect(html).toContain(EMPTY_LIST_TEXT);
    expect(html).not.toContain("오비스 자원으로 지원 중");
  });

  it("회사 열에 회사 이름이 보이고 마스킹된 키만 나온다(입력했던 키 문자열 없음)", () => {
    const html = render({
      keys: [{ id: "k1", provider: "dashscope", masked_key: "sk-****abcd", display_name: null, is_active: true }],
    });
    expect(html).toContain("Alibaba Qwen (dashscope)");
    expect(html).toContain("sk-****abcd");
    expect(html).not.toContain(FAKE_KEY);
  });

  it("조회 오류와 작업 결과는 서로 다른 영역에 함께 남는다", () => {
    const html = render({
      loadError: { kind: "error", text: "목록 조회 실패" },
      listStatus: { kind: "ok", text: "삭제했습니다." },
    });
    expect(html).toMatch(/data-testid="list-load-error"/);
    expect(html).toContain("목록 조회 실패");
    expect(html).toMatch(/role="status"[^>]*data-testid="list-status"[^>]*data-status="ok"/);
    expect(html).toContain("삭제했습니다.");
  });

  it("조회 오류가 없으면 조회 오류 영역이 없다", () => {
    expect(has(render({ listStatus: { kind: "ok", text: "삭제했습니다." } }), "list-load-error")).toBe(false);
  });
});

describe("상태 값 기반 메시지", () => {
  it("ok 는 status, error 는 alert 로 렌더되고 문자열 내용과 무관하다", () => {
    const okHtml = render({ method: "api", formStatus: { kind: "ok", text: "실패 없이 끝남" } });
    expect(okHtml).toMatch(/role="status"[^>]*data-status="ok"/);
    const errHtml = render({ method: "api", formStatus: { kind: "error", text: "성공처럼 보이는 문장" } });
    expect(errHtml).toMatch(/role="alert"[^>]*data-status="error"/);
  });

  it("저장 결과 메시지와 목록 렌더에 입력한 키 문자열이 들어가지 않는다", () => {
    const html = render({
      method: "api",
      formStatus: { kind: "ok", text: "저장했습니다. Anthropic Claude 키 검증 성공" },
      listStatus: { kind: "error", text: "삭제하지 못했습니다: 알 수 없는 오류" },
      keyValue: "",
      keys: [{ id: "k1", provider: "anthropic", masked_key: "sk-a****0000", display_name: "팀 키", is_active: true }],
    });
    expect(html).not.toContain(FAKE_KEY);
  });

  it("키 입력창은 password 타입이다", () => {
    expect(render({ method: "api" })).toMatch(/<input[^>]*data-testid="api-key-input"[^>]*type="password"|<input[^>]*type="password"[^>]*data-testid="api-key-input"/);
  });
});

function fakeApi(over: Partial<KeyApi> = {}) {
  const createUserApiKey = vi.fn(async (data: { provider: string; key: string; display_name?: string }) => {
    void data;
    return { id: "new-id" };
  });
  const testUserApiKey = vi.fn(async (id: string) => {
    void id;
    return { ok: true, reason: "" };
  });
  const api: KeyApi = { createUserApiKey, testUserApiKey, ...over };
  return { api, createUserApiKey: api.createUserApiKey as typeof createUserApiKey, testUserApiKey: api.testUserApiKey as typeof testUserApiKey };
}
const input = { provider: "anthropic", displayName: "  팀 키  ", key: `  ${FAKE_KEY}  ` };

describe("저장 → 자동 검증 흐름 (saveAndVerify)", () => {
  it("저장 성공 → 검증 호출 → ok, 키 입력값은 비워진다", async () => {
    const { api, createUserApiKey, testUserApiKey } = fakeApi();
    const result = await saveAndVerify(api, input);
    expect(createUserApiKey).toHaveBeenCalledTimes(1);
    expect(createUserApiKey).toHaveBeenCalledWith({ provider: "anthropic", display_name: "팀 키", key: FAKE_KEY });
    expect(testUserApiKey).toHaveBeenCalledWith("new-id");
    expect(createUserApiKey.mock.invocationCallOrder[0]).toBeLessThan(testUserApiKey.mock.invocationCallOrder[0]);
    expect(result.saved).toBe(true);
    expect(result.status.kind).toBe("ok");
    expect(result.keyValue).toBe("");
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });

  it("저장 실패 → 검증 호출 안 함 → error, 저장 안 됨, 입력값은 유지된다", async () => {
    const { api, testUserApiKey } = fakeApi({ createUserApiKey: vi.fn(async () => { throw new Error("서버 오류"); }) });
    const result = await saveAndVerify(api, input);
    expect(testUserApiKey).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
    expect(result.status.kind).toBe("error");
    expect(result.status.text).toContain("저장하지 못했습니다");
    expect(result.keyValue).toBe(input.key);
    expect(result.status.text).not.toContain(FAKE_KEY);
  });

  it("저장 성공·검증 실패 → error 이지만 저장은 완료로 표기, 입력값은 비워진다", async () => {
    const { api, createUserApiKey } = fakeApi({ testUserApiKey: vi.fn(async () => ({ ok: false, reason: "invalid_api_key" })) });
    const result = await saveAndVerify(api, input);
    expect(createUserApiKey).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(true);
    expect(result.status.kind).toBe("error");
    expect(result.status.text).toContain("저장은 완료");
    expect(result.status.text).toContain("올바르지");
    expect(result.keyValue).toBe("");
    expect(result.status.text).not.toContain(FAKE_KEY);
  });

  it("저장 성공·검증 요청 예외 → error, 저장 완료, 입력값 비워짐", async () => {
    const { api } = fakeApi({ testUserApiKey: vi.fn(async () => { throw new Error("timeout"); }) });
    const result = await saveAndVerify(api, input);
    expect(result.saved).toBe(true);
    expect(result.status.kind).toBe("error");
    expect(result.status.text).toContain("timeout");
    expect(result.keyValue).toBe("");
  });

  it("빈 키는 저장 요청 없이 error", async () => {
    const { api, createUserApiKey, testUserApiKey } = fakeApi();
    const result = await saveAndVerify(api, { ...input, key: "   " });
    expect(createUserApiKey).not.toHaveBeenCalled();
    expect(testUserApiKey).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
    expect(result.status.kind).toBe("error");
  });
});

describe("보조 함수", () => {
  it("providerLabel / describeTestReason", () => {
    expect(providerLabel("gemini")).toBe("Google Gemini");
    expect(providerLabel("unknown-co")).toBe("unknown-co");
    expect(describeTestReason("invalid_api_key")).toContain("올바르지");
    expect(describeTestReason("provider_test_not_supported:dashscope")).toContain("자동 검증");
    expect(describeTestReason("http_429")).toContain("429");
  });
});
