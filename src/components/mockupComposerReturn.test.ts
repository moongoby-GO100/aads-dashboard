import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { returnToMockupComposer } from "@/lib/mockupComposerReturn";

afterEach(() => vi.unstubAllGlobals());
describe("mobile mockup composer return", () => {
  it.each(["fixed fallback", "embedded artifact"])("closes the %s sheet before focusing the composer", () => {
    const actions: string[] = [];
    let frame!: FrameRequestCallback;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    returnToMockupComposer(() => actions.push("panel closed"), () => actions.push("overlay closed"), () => actions.push("composer focused"));
    expect(actions).toEqual(["panel closed", "overlay closed"]);
    frame(0);
    expect(actions).toEqual(["panel closed", "overlay closed", "composer focused"]);
  });
  it("connects both page entry points and the embedded panel to the return action", () => {
    const page = readFileSync("src/app/chat/page.tsx", "utf8");
    expect(page).toContain("onRequestChange={() => returnToMockupComposer(");
    expect(page).toContain("onFocusComposer={() => returnToMockupComposer(");
    const artifact = readFileSync("src/app/chat/ChatArtifactPanel.tsx", "utf8");
    expect(artifact).toContain("onRequestChange={onFocusComposer}");
  });
});
