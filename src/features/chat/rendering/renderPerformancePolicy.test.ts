import { describe, expect, it } from "vitest";
import {
  imageReservation,
  planLayoutCompensation,
  planPageEvictions,
  planVirtualRenderRows,
} from "./renderBudgetPolicy";
import {
  messageRenderSubscriptionKey,
  planMarkdownRender,
  reduceToolLog,
  splitStreamingMarkdown,
  terminalAnnouncement,
} from "./contentPerformancePolicy";

describe("T03 — layout anchor preservation", () => {
  it("allows one revision correction and rejects stale gestures or repeats", () => {
    expect(planLayoutCompensation({
      deltaPx: 48,
      capturedGestureEpoch: 7,
      currentGestureEpoch: 7,
      anchorExists: true,
      layoutRevision: "image-2",
      lastAppliedLayoutRevision: "image-1",
    })).toEqual({ shouldWrite: true, deltaPx: 48, reason: "layout-delta" });
    expect(planLayoutCompensation({
      deltaPx: 48,
      capturedGestureEpoch: 7,
      currentGestureEpoch: 8,
      anchorExists: true,
      layoutRevision: "image-2",
      lastAppliedLayoutRevision: "image-1",
    }).reason).toBe("gesture-changed");
    expect(planLayoutCompensation({
      deltaPx: 48,
      capturedGestureEpoch: 7,
      currentGestureEpoch: 7,
      anchorExists: true,
      layoutRevision: "image-2",
      lastAppliedLayoutRevision: "image-2",
    }).reason).toBe("already-applied");
  });
});

describe("T12 — bounded virtual timeline", () => {
  it("keeps visible, focus, reply and search rows reachable in 5,000 items", () => {
    const plan = planVirtualRenderRows({
      itemCount: 5_000,
      visibleStart: 2_490,
      visibleEnd: 2_510,
      maxRows: 48,
      overscan: 10,
      pinnedRows: [
        { index: 8, priority: 0 },
        { index: 1_200, priority: 1 },
        { index: 4_990, priority: 2 },
      ],
    });
    expect(plan.indices).toContain(2_500);
    expect(plan.indices).toContain(8);
    expect(plan.indices).toContain(1_200);
    expect(plan.indices).toContain(4_990);
    expect(plan.indices.length).toBeLessThanOrEqual(48);
    expect(plan.droppedPinnedIndices).toEqual([]);
  });
});

describe("T13 — active bubble subscription isolation", () => {
  it("changes only the active row key on token updates", () => {
    const base = { renderKey: "m1", contentVersion: 3, contentCompleteness: "render" };
    expect(messageRenderSubscriptionKey({ ...base, active: false, activeTokenRevision: 1 }))
      .toBe(messageRenderSubscriptionKey({ ...base, active: false, activeTokenRevision: 100 }));
    expect(messageRenderSubscriptionKey({ ...base, active: true, activeTokenRevision: 1 }))
      .not.toBe(messageRenderSubscriptionKey({ ...base, active: true, activeTokenRevision: 2 }));
  });
});

describe("T14 — streaming Markdown preservation", () => {
  it("keeps incomplete source and copy text byte-for-byte", () => {
    const source = "답변\n\n```ts\nconst value = `한글`";
    const plan = planMarkdownRender(source, true);
    expect(plan.stability).toBe("incomplete-stream");
    expect(plan.incompleteConstructs).toContain("fence");
    expect(plan.source).toBe(source);
    expect(plan.copyText).toBe(source);
    expect(planMarkdownRender(source, false).stability).toBe("final");
  });

  it("classifies complete streaming syntax without rewriting the source", () => {
    const source = "```ts\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    expect(planMarkdownRender(source, true)).toEqual({
      source,
      copyText: source,
      stability: "stable-stream",
      incompleteConstructs: [],
    });
  });
});

describe("T15 — tool log ordering and failure isolation", () => {
  it("joins result-before-start by tool ID and preserves it if detail fetch fails", () => {
    let entries = reduceToolLog([], {
      toolId: "tool-1",
      type: "result",
      summary: "조회 완료",
      content: "result-body",
    });
    entries = reduceToolLog(entries, { toolId: "tool-1", type: "start", name: "lookup" });
    entries = reduceToolLog(entries, { toolId: "tool-1", type: "detail-error" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      toolId: "tool-1",
      name: "lookup",
      status: "completed",
      summary: "조회 완료",
      preview: "result-body",
      detailState: "error",
    });
  });
});

describe("T31 — accessible terminal announcements", () => {
  it("does not announce token floods and deduplicates terminal state", () => {
    const announced = new Set<string>();
    expect(terminalAnnouncement({ executionId: "e1", kind: "token" }, announced)).toBeNull();
    const completion = terminalAnnouncement({ executionId: "e1", kind: "completed" }, announced);
    expect(completion?.message).toBe("응답이 완료되었습니다.");
    announced.add(completion!.key);
    expect(terminalAnnouncement({ executionId: "e1", kind: "completed" }, announced)).toBeNull();
  });
});

describe("T44 — payload and cache budgets", () => {
  it("bounds image reservation, tool preview and evicts only unpinned pages", () => {
    expect(imageReservation(4_000, 3_000)).toEqual({
      width: 1_280,
      height: 960,
      aspectRatio: "4000 / 3000",
    });
    const tool = reduceToolLog([], {
      toolId: "large",
      type: "result",
      content: "x".repeat(10_000),
    }, 128)[0];
    expect(tool.preview).toHaveLength(128);
    expect(tool.truncated).toBe(true);

    const eviction = planPageEvictions([
      { key: "focused", lastAccess: 1, pinned: true },
      { key: "old", lastAccess: 2, pinned: false },
      { key: "new", lastAccess: 3, pinned: false },
    ], 2);
    expect(eviction).toEqual({ evict: ["old"], retainedOverflow: 0 });
  });
});


describe("스트리밍 본문 분할 — 앞은 얼리고 꼬리만 그린다", () => {
  const para = (n: number) => `문단 ${n}. ${"가".repeat(700)}`;

  it("짧은 본문은 나누지 않는다", () => {
    const source = "짧은 답입니다.";
    expect(splitStreamingMarkdown(source)).toEqual({ frozen: [], tail: source });
  });

  it("나눠도 원문이 한 글자도 바뀌지 않는다", () => {
    const source = [para(1), para(2), para(3), "쓰는 중"].join("\n\n");
    const { frozen, tail } = splitStreamingMarkdown(source);
    expect(frozen.length).toBeGreaterThan(0);
    expect([...frozen, tail].join("\n")).toBe(source);
  });

  it("경계는 한 번 정해지면 움직이지 않는다", () => {
    const base = [para(1), para(2), para(3), "쓰는 중"].join("\n\n");
    const grown = `${base} 더 씁니다.\n\n${para(4)}\n\n꼬리`;
    const first = splitStreamingMarkdown(base).frozen;
    const second = splitStreamingMarkdown(grown).frozen;
    expect(second.slice(0, first.length)).toEqual(first);
  });

  it("코드펜스 안에서는 끊지 않는다", () => {
    const source = [
      para(1),
      "```python",
      `x = 1\n\ny = 2\n\n${"# ".repeat(400)}`,
      "```",
      "꼬리",
    ].join("\n\n");
    const { frozen } = splitStreamingMarkdown(source);
    for (const block of frozen) {
      expect(block.split("```").length % 2).toBe(1);
    }
  });
});
