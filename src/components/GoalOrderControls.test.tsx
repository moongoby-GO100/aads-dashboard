import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalOrderControls, GoalOrderError } from "./GoalOrderControls";

describe("GoalOrderControls", () => {
  const html = (p: Partial<Parameters<typeof GoalOrderControls>[0]> = {}) =>
    renderToStaticMarkup(<GoalOrderControls goalId="g1" canUp canDown busy={false} onMove={vi.fn()} {...p} />);

  it("renders ▲ ▼ buttons at least 44px", () => {
    const out = html();
    expect(out).toContain("▲");
    expect(out).toContain("▼");
    expect(out.match(/width:44px;height:44px;min-width:44px;min-height:44px/g)).toHaveLength(2);
  });

  it("disables a direction that cannot move and both while busy", () => {
    const edge = html({ canUp: false });
    expect(edge).toMatch(/data-testid="goal-order-up"[^>]*disabled|disabled[^>]*data-testid="goal-order-up"/);
    expect(edge).not.toMatch(/data-testid="goal-order-down"[^>]*disabled/);
    expect(html({ busy: true }).match(/disabled/g)).toHaveLength(2);
  });
});

describe("GoalOrderError", () => {
  it("shows the message and a retry button of 44px", () => {
    const out = renderToStaticMarkup(<GoalOrderError goalId="g1" error="API error 500" onRetry={vi.fn()} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("API error 500");
    expect(out).toContain("다시 시도");
    expect(out).toContain("min-height:44px");
  });
});
