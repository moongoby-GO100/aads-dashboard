import { describe, expect, it } from "vitest";
import {
  createIsolatedHtmlPreviewDocument,
  createStaticTextDocument,
  staticArtifactHtml,
} from "./htmlPolicy";

describe("generated HTML isolation", () => {
  const attack =
    '</iframe><script>parent.document.body.dataset.owned="yes"</script><form action="https://attacker.invalid">';

  it("keeps generated markup encoded inside an opaque sandbox", () => {
    const output = createIsolatedHtmlPreviewDocument("unsafe <title>", attack);
    expect(output).toContain('sandbox="allow-scripts"');
    expect(output).not.toContain("allow-same-origin");
    expect(output).toContain("connect-src &#39;none&#39;");
    expect(output).not.toContain(`srcdoc="${attack}`);
    expect(output).toContain("&lt;/iframe&gt;&lt;script&gt;");
  });

  it("blocks scripts in the default inline preview", () => {
    const output = staticArtifactHtml(attack);
    expect(output).toContain("script-src 'none'");
    expect(output).toContain("form-action 'none'");
  });

  it("escapes all untrusted text in text previews", () => {
    const output = createStaticTextDocument("x", attack);
    expect(output).not.toContain(attack);
    expect(output).toContain("&lt;script&gt;");
  });
});

describe("CSP injection keeps standards mode", () => {
  it("puts the policy inside an existing head instead of before the doctype", () => {
    const output = staticArtifactHtml("<!doctype html><html><head><title>a</title></head><body>b</body></html>");
    expect(output.startsWith("<!doctype html>")).toBe(true);
    expect(output).toContain('<head><meta http-equiv="Content-Security-Policy"');
  });

  it("puts the policy after a doctype when there is no head", () => {
    const output = staticArtifactHtml("<!DOCTYPE html><p>a</p>");
    expect(output.startsWith('<!DOCTYPE html><meta http-equiv="')).toBe(true);
  });

  it("prefixes the policy for fragments without a doctype", () => {
    const output = staticArtifactHtml("<p>a</p>");
    expect(output.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
  });
});
