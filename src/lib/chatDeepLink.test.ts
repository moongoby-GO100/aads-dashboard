import { describe, expect, it } from "vitest";
import { chatHashSessionId, parseChatHash, parseGoalDeepLink, stripGoalFromUrl } from "./chatDeepLink";

const SID = "11111111-2222-3333-4444-555555555555";
const GOAL = "0a173409-0917-4c17-9c17-000000000001";

describe("parseChatHash", () => {
  it("세션만 있는 기존 형식은 그대로 해석한다", () => {
    expect(parseChatHash(`#${SID}`)).toEqual({ sessionId: SID, goalId: null });
    expect(chatHashSessionId(`#${SID}`)).toBe(SID);
  });
  it("hash 안의 goal 을 떼어 세션 ID 에 섞이지 않게 한다", () => {
    expect(parseChatHash(`#${SID}?goal=${GOAL}`)).toEqual({ sessionId: SID, goalId: GOAL });
    expect(chatHashSessionId(`#${SID}?goal=${GOAL}`)).toBe(SID);
  });
  it("잘못된 UUID 는 무시하지만 세션 ID 는 유지한다", () => {
    expect(parseChatHash(`#${SID}?goal=not-a-uuid`)).toEqual({ sessionId: SID, goalId: null });
  });
  it("빈 값", () => {
    expect(parseChatHash("")).toEqual({ sessionId: "", goalId: null });
    expect(parseChatHash("#")).toEqual({ sessionId: "", goalId: null });
    expect(parseChatHash(`#?goal=${GOAL}`)).toEqual({ sessionId: "", goalId: GOAL });
  });
});

describe("parseGoalDeepLink", () => {
  it("세션만", () => {
    expect(parseGoalDeepLink("", `#${SID}`)).toBeNull();
  });
  it("세션 + query goal", () => {
    expect(parseGoalDeepLink(`?goal=${GOAL}`, `#${SID}`)).toBe(GOAL);
  });
  it("hash 내 goal", () => {
    expect(parseGoalDeepLink("", `#${SID}?goal=${GOAL}`)).toBe(GOAL);
  });
  it("잘못된 UUID", () => {
    expect(parseGoalDeepLink("?goal=abc", `#${SID}`)).toBeNull();
    expect(parseGoalDeepLink("?goal=abc", `#${SID}?goal=xyz`)).toBeNull();
    expect(parseGoalDeepLink(`?goal=${GOAL}x`, "")).toBeNull();
  });
  it("query 가 잘못되면 hash 의 유효한 값을 쓴다", () => {
    expect(parseGoalDeepLink("?goal=abc", `#${SID}?goal=${GOAL}`)).toBe(GOAL);
  });
  it("빈 값", () => {
    expect(parseGoalDeepLink("", "")).toBeNull();
    expect(parseGoalDeepLink("?goal=", "#")).toBeNull();
  });
});

describe("stripGoalFromUrl", () => {
  it("query goal 만 제거하고 다른 파라미터와 hash 를 보존한다", () => {
    expect(stripGoalFromUrl("/chat", `?a=1&goal=${GOAL}&b=2`, `#${SID}`)).toBe(`/chat?a=1&b=2#${SID}`);
    expect(stripGoalFromUrl("/chat", `?goal=${GOAL}`, `#${SID}`)).toBe(`/chat#${SID}`);
  });
  it("hash 내 goal 을 제거하고 세션 ID 는 남긴다", () => {
    expect(stripGoalFromUrl("/chat", "?a=1", `#${SID}?goal=${GOAL}`)).toBe(`/chat?a=1#${SID}`);
  });
  it("goal 이 없으면 null", () => {
    expect(stripGoalFromUrl("/chat", "?a=1", `#${SID}`)).toBeNull();
  });
});
