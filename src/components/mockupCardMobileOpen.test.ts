import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 실제 /chat 390px 화면에서 카드의 "우측 패널에서 보기 →" 가 시트를 열지 않던 결함의 회귀 방지.
// 동작 회귀는 tests/browser/mockup-chat/test_real_chat.py 의 4a(모바일)가 실제 화면에서 확인한다.
describe("mockup card opens the artifact panel on mobile", () => {
  it("handleViewArtifactStable opens the mobile artifact overlay like the document-link handler", () => {
    const page = readFileSync("src/app/chat/page.tsx", "utf8");
    const start = page.indexOf("const handleViewArtifactStable = useCallback(");
    expect(start).toBeGreaterThan(0);
    const end = page.indexOf("const handleOpenLightboxStable", start);
    const body = page.slice(start, end);
    expect(body).toContain('if (screenSize !== "desktop") setMobileOverlay("artifact");');
    expect(body).toMatch(/\[artifacts, screenSize\]\)/);
  });
});

// 세션을 빠르게 바꿀 때 늦게 도착한 이전 세션의 아티팩트 응답이 새 세션 목록을 덮어쓰던 결함의 회귀 방지.
// 동작 회귀는 tests/browser/mockup-chat/test_real_chat.py 의 4e 가 실제 화면에서 확인한다.
describe("session switch ignores late artifact snapshots", () => {
  it("the per-session artifact fetch drops its result once the effect was cleaned up", () => {
    const page = readFileSync("src/app/chat/page.tsx", "utf8");
    const start = page.indexOf("fetchSessionArtifactSnapshot(fetchSid)");
    expect(start).toBeGreaterThan(0);
    const body = page.slice(start, page.indexOf("// Sync model from session", start));
    expect(body.match(/if \(cancelled\) return;/g)?.length).toBe(2);
  });
});
