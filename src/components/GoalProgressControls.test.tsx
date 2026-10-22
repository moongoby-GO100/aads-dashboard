import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalProgressControls, GoalProgressView } from "./GoalProgressControls";

const view = (props: Parameters<typeof GoalProgressView>[0]) => renderToStaticMarkup(<GoalProgressView {...props} />);

describe("GoalProgressView", () => {
  it("shows the Korean status, percent and milestone count", () => {
    const html = view({ status: "active", progress: 0.42, paused: false, milestonesDone: 2, milestonesTotal: 5 });
    expect(html).toContain("진행 중");
    expect(html).toContain("42%");
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain("마일스톤 2/5 완료");
  });

  it("shows 0~1 and 0~100 progress alike", () => {
    expect(view({ status: "active", progress: 0.42, paused: false })).toContain(">42%<");
    expect(view({ status: "active", progress: 42, paused: false })).toContain(">42%<");
  });

  it("switches ⏸ 멈춤 to ▶ 시작 with a paused badge, reason and time", () => {
    const running = view({ status: "active", progress: 0.1, paused: false });
    expect(running).toContain("⏸ 멈춤");
    expect(running).not.toContain("▶ 시작");
    expect(running).not.toContain('data-testid="goal-paused-badge"');

    const paused = view({ status: "active", progress: 0.1, paused: true, pausedReason: "점검 중", pausedAt: "2026-10-22T02:40:00Z" });
    expect(paused).toContain("▶ 시작");
    expect(paused).not.toContain("⏸ 멈춤");
    expect(paused).toContain('data-testid="goal-paused-badge"');
    expect(paused).toContain("진행 중");
    expect(paused).toContain("멈춤 사유 — 점검 중");
    expect(paused).toContain("10. 22. 11:40");
  });

  it("hides the button for completed, cancelled and archived goals", () => {
    for (const status of ["completed", "cancelled", "archived"]) {
      expect(view({ status, progress: 1, paused: false })).not.toContain('data-testid="goal-pause-toggle"');
    }
    expect(view({ status: "blocked", progress: 0.3, paused: false })).toContain('data-testid="goal-pause-toggle"');
  });

  it("hides the button until the paused state is known (panel skeleton)", () => {
    const html = view({ status: "active" });
    expect(html).toContain("진행 중");
    expect(html).not.toContain('data-testid="goal-pause-toggle"');
    expect(html).not.toContain("progressbar");
  });

  it("disables the button while busy", () => {
    const html = view({ status: "active", progress: 0.1, paused: false, busy: true });
    expect(html).toMatch(/data-testid="goal-pause-toggle"[^>]*disabled/);
    expect(html).toContain("처리 중…");
  });

  it("disables the button with a tooltip and notice after a 403", () => {
    const html = view({ status: "active", progress: 0.1, paused: false, forbidden: true, notice: { kind: "forbidden", message: "대표님 권한이 필요합니다" } });
    expect(html).toMatch(/data-testid="goal-pause-toggle"[^>]*disabled/);
    expect(html).toContain('title="대표님 권한이 필요합니다"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("다시 시도");
  });

  it("offers a retry for other errors", () => {
    const html = view({ status: "active", paused: false, notice: { kind: "error", message: "API error 500" }, onRetry: () => {} });
    expect(html).toContain("API error 500");
    expect(html).toContain("다시 시도");
  });
});

describe("GoalProgressControls", () => {
  it("renders the idle state with a ⏸ 멈춤 button", () => {
    const html = renderToStaticMarkup(<GoalProgressControls goalId="g1" status="active" progress={0.5} paused={false} onChanged={() => {}} />);
    expect(html).toContain("⏸ 멈춤");
    expect(html).toContain("50%");
    expect(html).not.toContain('role="alert"');
  });
});
