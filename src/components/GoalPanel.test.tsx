import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemBody, NO_PREVIEWS, type PreviewLoader } from "./GoalWorkHierarchy";
import { GoalPanel } from "./GoalPanel";
import type { GoalWorkItem } from "@/lib/api";

const item = (over: Partial<GoalWorkItem> = {}) => ({
  id: "w1", type: "task", title: "승인 대기 업무", status: "in_review", version: 2, progress: 10,
  pending_approval_count: 1, ...over,
}) as unknown as GoalWorkItem;

describe("GoalPanel first paint", () => {
  it("renders the title, status and skeleton from the click-time summary before any response", () => {
    const html = renderToStaticMarkup(
      <GoalPanel goalId="g1" summary={{ title: "채팅 목표 패널 속도", status: "active", project: "AADS" }} onClose={() => {}} />,
    );
    expect(html).toContain("채팅 목표 패널 속도");
    expect(html).toContain("상태 active");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("마일스톤 불러오는 중");
    expect(html).toContain("업무 계층");
  });

  it("falls back to a neutral title without a summary", () => {
    const html = renderToStaticMarkup(<GoalPanel goalId="g1" onClose={() => {}} />);
    expect(html).toContain("🎯 목표");
  });
});

describe("approval preview is lazy", () => {
  it("does not request a preview just by rendering the item", () => {
    const request = vi.fn();
    const previews: PreviewLoader = { states: {}, request };
    const html = renderToStaticMarkup(<ItemBody item={item()} previews={previews} actorSessionId="sess" onChanged={async () => {}} />);
    expect(html).toContain("승인 검토 내용 보기 · 대기 1건");
    expect(request).not.toHaveBeenCalled();
  });

  it("offers no preview section without an actor session or a pending approval", () => {
    const noActor = renderToStaticMarkup(<ItemBody item={item()} previews={NO_PREVIEWS} actorSessionId="" onChanged={async () => {}} />);
    const noPending = renderToStaticMarkup(<ItemBody item={item({ pending_approval_count: 0 })} previews={NO_PREVIEWS} actorSessionId="sess" onChanged={async () => {}} />);
    expect(noActor).not.toContain("승인 검토 내용 보기");
    expect(noPending).not.toContain("승인 검토 내용 보기");
  });

  it("shows a per-item error with a retry button", () => {
    const html = renderToStaticMarkup(
      <ItemBody item={item()} previews={{ states: { w1: { status: "error", error: "API error 500" } }, request: () => {} }}
        actorSessionId="sess" onChanged={async () => {}} />,
    );
    expect(html).toContain("승인 검토 내용을 불러오지 못했습니다");
    expect(html).toContain("재시도");
  });
});
