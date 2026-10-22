import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// board 상태(GoalPanel 의 두 번째 useState)만 바꿔 끼워 막힘 마일스톤 화면을 그린다. 그 밖의 훅은 실제 React 를 그대로 쓴다.
const panelProbe = vi.hoisted(() => ({ calls: 0, overrides: {} as Record<number, unknown> }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useState = ((init: unknown) => {
    const i = panelProbe.calls++;
    const real = (actual.useState as (x: unknown) => [unknown, unknown])(init);
    return i in panelProbe.overrides ? [panelProbe.overrides[i], real[1]] : real;
  }) as typeof actual.useState;
  return { ...actual, useState, default: { ...actual, useState } };
});
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
    expect(html).toContain("진행 중");
    expect(html).not.toContain("상태 active");
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

describe("GoalPanel progress state", () => {
  const G = "11111111-aaaa-bbbb-cccc-000000000001";
  const M1 = "22222222-aaaa-bbbb-cccc-000000000001";
  const M2 = "22222222-aaaa-bbbb-cccc-000000000002";
  const M3 = "22222222-aaaa-bbbb-cccc-000000000003";
  const ms = (id: string, seq: number, over: Record<string, unknown> = {}) => ({
    id, sequence_order: seq, variant: "", title: `마일스톤 ${seq}`, status: "in_progress", completion_criteria: null,
    evidence: null, dispatch_note: null, owner_role_key: "", review_ask_count: 0, open_notes: 0, ...over,
  });
  const board = (over: Record<string, unknown> = {}) => ({
    goal: { id: G, title: "진행 상태 목표", status: "active", progress: 0.3 }, halted: false,
    owners: [{ session_id: "s-dev", role_key: "dev", title: "개발 창", state: "idle", milestone: null, dispatch_count: 0 }],
    milestones: [ms(M1, 1), ms(M2, 2), ms(M3, 3)], ...over,
  });
  const draw = (b: unknown) => {
    panelProbe.calls = 0;
    panelProbe.overrides = b ? { 1: b } : {};
    return renderToStaticMarkup(<GoalPanel goalId={G} onClose={() => {}} />);
  };
  afterEach(() => { panelProbe.overrides = {}; panelProbe.calls = 0; });

  it("shows the stuck reason, blocked time (KST) and both buttons per stuck milestone", () => {
    const html = draw(board({
      progress_state: "blocked", progress_reason: "마일스톤 2 가 막혀 있습니다",
      milestones: [
        ms(M1, 1, { progress_state: "working" }),
        ms(M2, 2, { progress_state: "blocked", progress_reason: "3회 보냈으나 답이 확인되지 않음" }),
        ms(M3, 3, { progress_state: "no_owner", progress_reason: "담당 세션이 없습니다" }),
      ],
      blocked_milestones: [{ milestone_id: M2, title: "마일스톤 2", state: "blocked", reason: "3회 보냈으나 답이 확인되지 않음", blocked_at: "2026-10-22T08:24:00Z" }],
    }));
    expect(html.match(/data-milestone-stuck/g)).toHaveLength(2);
    expect(html).toContain("3회 보냈으나 답이 확인되지 않음");
    expect(html).toContain("막힌 시각 10/22 17:24 (KST)");
    expect(html).toContain("담당 세션이 없습니다");
    expect(html.match(/다시 보내기/g)).toHaveLength(2);
    expect(html.match(/담당 지정/g)).toHaveLength(2);
    expect(html.match(/min-height:44px/g)!.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("진행: 막힘");
  });

  it("never prints a raw progress_state or a milestone UUID", () => {
    const html = draw(board({
      progress_state: "answered_no_progress",
      milestones: [ms(M2, 2, { progress_state: "answered_no_progress", progress_reason: `담당이 답했으나 ${M2} 는 진행이 없습니다` })],
    }));
    expect(html).toContain("진행: 답했으나 진행 없음");
    expect(html).not.toContain("answered_no_progress");
    expect(html).not.toContain("progress_state");
    expect(html).not.toContain(M2);
    expect(html).not.toContain(M2.slice(0, 8));
  });

  it("renders the 7 progress states with their own copy", () => {
    const copy: Array<[string, string]> = [
      ["working", "진행: 진행중"], ["no_owner", "진행: 담당 없음"], ["awaiting_reply", "진행: 답 대기"],
      ["answered_no_progress", "진행: 답했으나 진행 없음"], ["blocked", "진행: 막힘"], ["paused", "진행: 멈춤"], ["idle", "진행: 대기"],
    ];
    for (const [state, text] of copy) expect(draw(board({ progress_state: state, milestones: [] }))).toContain(text);
    expect(draw(board({ progress_state: "no_owner", progress_substitute: true, milestones: [] }))).toContain("진행: 담당 없음·주도 세션 대행");
  });

  it("an old response (no progress fields) still shows the dispatch_note as the stuck reason", () => {
    const html = draw(board({ milestones: [ms(M1, 1, { dispatch_note: "승인 대기 중" }), ms(M2, 2), ms(M3, 3, { status: "pending", dispatch_note: "무시됨" })] }));
    expect(html.match(/data-milestone-stuck/g)).toHaveLength(1);
    expect(html).toContain("승인 대기 중");
    expect(html).toContain("진행: 대기");
    expect(html).not.toContain("progress_state");
  });

  it("does not show stuck actions for working or waiting milestones", () => {
    const html = draw(board({
      progress_state: "working",
      milestones: [ms(M1, 1, { progress_state: "working" }), ms(M2, 2, { progress_state: "awaiting_reply" })],
    }));
    expect(html).not.toContain("data-milestone-stuck");
    expect(html).not.toContain("다시 보내기");
  });
});
