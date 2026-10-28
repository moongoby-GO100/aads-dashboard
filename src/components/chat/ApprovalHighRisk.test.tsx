import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalCardError } from "./ApprovalHighRisk";

describe("ApprovalCardError", () => {
  it("renders nothing without a message", () => {
    expect(renderToStaticMarkup(<ApprovalCardError />)).toBe("");
  });
  it("renders a wrapping role=alert inside the card", () => {
    const long = "가".repeat(400) + "x".repeat(300);
    const html = renderToStaticMarkup(<ApprovalCardError message={long} onRefresh={() => {}} onDismiss={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("max-height:132px");
    expect(html).toContain("목록 다시 조회");
    expect(html).toContain("닫기");
  });
});
