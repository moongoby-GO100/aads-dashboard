import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LlmKeyInfoEditor, {
  KEY_NAME_REASON, SUBSCRIPTION_PROVIDER_REASON, buildKeyInfoPatch, describeSaveError, parsePriority, saveKeyInfo, toDraft,
} from "../../src/components/settings/LlmKeyInfoEditor";

const sub = { id: 7, key_name: "ANTHROPIC_AUTH_TOKEN_2", provider: "anthropic", label: "moongoby@naver.com", priority: 2, notes: null, kind: "subscription" as const };
const original = toDraft(sub);

describe("등록정보 편집 폼", () => {
  it("구독 계정은 key_name·provider 를 입력칸 없이 이유와 함께 읽기 전용으로 보인다", () => {
    const html = renderToStaticMarkup(<LlmKeyInfoEditor info={sub} resolveId={async () => 7} onSaved={() => {}} onCancel={() => {}} />);
    expect(html).toContain("ANTHROPIC_AUTH_TOKEN_2");
    expect(html).toContain(KEY_NAME_REASON);
    expect(html).toContain(SUBSCRIPTION_PROVIDER_REASON);
    expect(html.match(/<input/g)).toHaveLength(2);
    expect(html).toContain("moongoby@naver.com");
    expect(html).not.toMatch(/type="password"/);
  });

  it("바뀐 필드만 담고 이름·메모 앞뒤 공백은 제거한다", () => {
    expect(buildKeyInfoPatch(original, original)).toEqual({});
    expect(buildKeyInfoPatch(original, { ...original, priority: "3" })).toEqual({ priority: 3 });
    expect(buildKeyInfoPatch(original, { ...original, label: "  a@b.c  ", notes: " 메모 " })).toEqual({ label: "a@b.c", notes: "메모" });
    expect(buildKeyInfoPatch(original, { ...original, label: "" })).toEqual({ label: "" });
  });

  it("순위는 1 이상 정수만 허용한다", () => {
    for (const v of ["", "0", "-1", "1.5", "abc", " "]) expect(parsePriority(v)).toBeNull();
    expect(parsePriority(" 4 ")).toBe(4);
  });

  it("저장은 바뀐 필드만 PUT 으로 보낸다", async () => {
    const update = vi.fn().mockResolvedValue({});
    const r = await saveKeyInfo({ original, draft: { ...original, notes: "x" }, resolveId: async () => 7, update });
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(7, { notes: "x" });
  });

  it("바뀐 게 없거나 순위가 잘못되면 전송하지 않는다", async () => {
    const update = vi.fn();
    expect(await saveKeyInfo({ original, draft: original, resolveId: async () => 7, update })).toMatchObject({ ok: false });
    expect(await saveKeyInfo({ original, draft: { ...original, priority: "0" }, resolveId: async () => 7, update })).toMatchObject({ ok: false, error: expect.stringContaining("1 이상") });
    expect(update).not.toHaveBeenCalled();
  });

  it("409 는 서버 detail 을 안내문에 담아 실패로 돌려준다(폼 유지)", async () => {
    const update = vi.fn().mockRejectedValue(new Error('API error 409: {"detail":"Priority 1 is already used by ANTHROPIC_AUTH_TOKEN"}'));
    const r = await saveKeyInfo({ original, draft: { ...original, priority: "1" }, resolveId: async () => 7, update });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Priority 1 is already used by ANTHROPIC_AUTH_TOKEN");
    expect(!r.ok && r.error).toContain("저장하지 못했습니다");
  });

  it("id 조회 실패·403 도 실패로 돌려준다", async () => {
    const update = vi.fn();
    const r = await saveKeyInfo({ original, draft: { ...original, notes: "x" }, resolveId: async () => { throw new Error("계정 id 를 찾을 수 없습니다"); }, update });
    expect(!r.ok && r.error).toContain("계정 id 를 찾을 수 없습니다");
    expect(update).not.toHaveBeenCalled();
    expect(describeSaveError(new Error("API error 403: {}"))).toContain("CEO");
  });
});
