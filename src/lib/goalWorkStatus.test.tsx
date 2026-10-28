import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GoalWorkItem } from "@/lib/api";
import { ItemBody, NO_PREVIEWS } from "@/components/GoalWorkHierarchy";
import { milestoneProgressLabel } from "@/components/GoalMilestoneWork";
import {
  WORK_STATUS_LABEL, itemActivityText, itemProgressText, itemTaskCounts, milestoneWorkLabel, ownerDisplay, workStatusLabel,
} from "./goalWorkStatus";

const work = (over: Partial<GoalWorkItem>) => ({
  id: "w", goal_id: "g", milestone_id: "m1", type: "task", title: "t", status: "draft", priority: "p2",
  progress: 0, version: 1, pending_approval_count: 0, children: [], ...over,
}) as GoalWorkItem;

const story = work({
  id: "s", type: "story", status: "in_progress",
  children: [
    work({ id: "t1", status: "completed" }), work({ id: "t2", status: "in_progress" }),
    work({ id: "t3", status: "blocked" }), work({ id: "t4", status: "ready" }),
  ],
});
const epic = work({ id: "e", type: "epic", status: "in_progress", children: [story, work({ id: "t5", status: "completed" })] });

describe("status labels", () => {
  it("maps all eight work statuses to Korean", () => {
    expect(WORK_STATUS_LABEL).toEqual({
      draft: "초안", ready: "준비", in_progress: "진행 중", in_review: "검토 중",
      changes_requested: "수정 요청", blocked: "막힘", completed: "완료", cancelled: "취소",
    });
  });
  it("keeps an unknown status as-is and handles empty", () => {
    expect(workStatusLabel("weird")).toBe("weird");
    expect(workStatusLabel(null)).toBe("상태 미확인");
  });
});

describe("task aggregation", () => {
  it("falls back to counting task descendants on the client", () => {
    const counts = itemTaskCounts(epic);
    expect(counts).toEqual({ total: 5, completed: 2, in_progress: 1, blocked: 1 });
    expect(itemProgressText(counts)).toBe("작업 2/5 (40%)");
    expect(itemActivityText(counts)).toBe("진행 1 · 막힘 1");
  });
  it("prefers the server task_counts", () => {
    const counts = itemTaskCounts({ ...epic, task_counts: { total: 10, completed: 5, in_progress: 2, blocked: 3 } });
    expect(counts).toEqual({ total: 10, completed: 5, in_progress: 2, blocked: 3 });
    expect(itemProgressText(counts)).toBe("작업 5/10 (50%)");
  });
  it("says there is no task when the epic has none", () => {
    expect(itemProgressText(itemTaskCounts(work({ type: "epic" })))).toBe("작업 없음");
  });
  it("builds the milestone line from the server work_summary first", () => {
    const summary = {
      epic: { total: 2, completed: 1, in_progress: 1, blocked: 0 },
      story: { total: 5, completed: 3, in_progress: 1, blocked: 1 },
      task: { total: 14, completed: 8, in_progress: 3, blocked: 1 },
    };
    expect(milestoneWorkLabel(summary, [epic])).toBe("Epic 1/2 · Story 3/5 · Task 8/14 완료 · 막힘 1");
  });
  it("counts blocked tasks once when their story and epic are also blocked", () => {
    const blockedTaskEpic = work({ type: "epic", status: "blocked", children: [
      work({ type: "story", status: "blocked", children: [
        work({ id: "blocked-task", status: "blocked" }),
        work({ id: "active-task", status: "in_progress" }),
      ] }),
    ] });
    expect(milestoneWorkLabel(null, [blockedTaskEpic])).toContain("막힘 1");
  });
  it("falls back to blocked stories when the milestone has no tasks", () => {
    const storyOnlyRoots = [
      work({ id: "story-1", type: "story", status: "blocked" }),
      work({ id: "story-2", type: "story", status: "in_progress" }),
    ];
    expect(milestoneWorkLabel(null, storyOnlyRoots)).toContain("막힘 1");
  });
  it("falls back to the client count and omits 막힘 when zero", () => {
    expect(milestoneWorkLabel(null, [epic])).toBe("Epic 0/1 · Story 0/1 · Task 2/5 완료 · 막힘 1");
    expect(milestoneWorkLabel(undefined, [work({ type: "epic", status: "completed" })])).toBe("Epic 1/1 · Story 0/0 · Task 0/0 완료");
  });
  it("keeps 업무 없음 when there is no work", () => {
    expect(milestoneWorkLabel(null, [])).toBe("업무 없음");
    expect(milestoneProgressLabel([])).toBe("업무 없음");
    const empty = { epic: { total: 0, completed: 0, in_progress: 0, blocked: 0 }, story: { total: 0, completed: 0, in_progress: 0, blocked: 0 }, task: { total: 0, completed: 0, in_progress: 0, blocked: 0 } };
    expect(milestoneWorkLabel(empty, [])).toBe("업무 없음");
  });
});

describe("owner wording", () => {
  it("covers the four sources", () => {
    expect(ownerDisplay({ source: "assigned", session_id: "s1" }, "DEV · 개발 세션")).toEqual({ text: "담당 DEV · 개발 세션", warn: false });
    expect(ownerDisplay({ source: "milestone_owner", session_id: "s2", session_title: "마일스톤 담당" })).toEqual({ text: "담당 대행 · 마일스톤 담당", warn: false });
    expect(ownerDisplay({ source: "goal_lead", session_id: "s3", session_title: "주도 세션" })).toEqual({ text: "주도 정리 중 · 주도 세션", warn: false });
    expect(ownerDisplay({ source: "none" })).toEqual({ text: "미지정 — 주도 없음", warn: true });
  });
  it("keeps the old wording when the server sends no effective_owner", () => {
    expect(ownerDisplay(undefined)).toEqual({ text: "담당 미지정", warn: false });
    expect(ownerDisplay(null, "QA · 검수")).toEqual({ text: "담당 QA · 검수", warn: false });
  });
});

describe("ItemBody rendering", () => {
  const render = (item: GoalWorkItem, assigneeLabel?: string) => renderToStaticMarkup(
    <ItemBody item={item} previews={NO_PREVIEWS} actorSessionId="" onChanged={async () => {}}
      tree={{ expanded: false, childCount: item.children.length, onToggle: () => {}, assigneeLabel }} />,
  );
  it("shows the Korean badge, progress and orange unowned warning", () => {
    const html = render({ ...epic, effective_owner: { source: "none" } });
    expect(html).toContain("진행 중");
    expect(html).not.toContain(">in_progress<");
    expect(html).toContain("작업 2/5 (40%)");
    expect(html).toContain("진행 1 · 막힘 1");
    expect(html).toContain("미지정 — 주도 없음");
  });
  it("shows only the Korean status badge for a task", () => {
    const html = render(work({ status: "in_review", effective_owner: { source: "goal_lead", session_title: "주도" } }));
    expect(html).toContain("검토 중");
    expect(html).toContain("주도 정리 중 · 주도");
    expect(html).not.toContain("작업 ");
  });
});
