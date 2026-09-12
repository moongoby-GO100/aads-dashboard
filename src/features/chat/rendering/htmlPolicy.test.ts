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
    expect(output).toContain('sandbox=""');
    expect(output).not.toContain("allow-scripts");
    expect(output).not.toContain("allow-same-origin");
    expect(output).toContain("connect-src 'none'");
    expect(output).not.toContain(`srcdoc="${attack}`);
    expect(output).toContain("&lt;/iframe&gt;&lt;script&gt;");
  });

  it("blocks scripts in the default inline preview", () => {
    const output = staticArtifactHtml(attack);
    expect(output).toContain("script-src 'none'");
    expect(output).toContain("form-action 'none'");
  });

  it("cannot hide the trusted CSP in an attacker-controlled head comment", () => {
    const payload = '<!-- <head> --><script>window.owned=1</script><img src="https://attacker.invalid/x">';
    const output = staticArtifactHtml(payload);
    const cspPosition = output.indexOf('Content-Security-Policy');
    const payloadPosition = output.indexOf("&lt;!-- &lt;head&gt;");
    expect(cspPosition).toBeGreaterThan(0);
    expect(payloadPosition).toBeGreaterThan(cspPosition);
    expect(output).toContain("script-src 'none'");
    expect(output).toContain("connect-src 'none'");
  });

  it("escapes all untrusted text in text previews", () => {
    const output = createStaticTextDocument("x", attack);
    expect(output).not.toContain(attack);
    expect(output).toContain("&lt;script&gt;");
  });
});

describe("trusted wrapper keeps standards mode", () => {
  it("keeps an existing generated head encoded inside the child srcdoc", () => {
    const output = staticArtifactHtml("<!doctype html><html><head><title>a</title></head><body>b</body></html>");
    expect(output.startsWith("<!doctype html>")).toBe(true);
    expect(output).toContain('&lt;head&gt;&lt;title&gt;a&lt;/title&gt;&lt;/head&gt;');
  });

  it("wraps generated documents that have only a doctype", () => {
    const output = staticArtifactHtml("<!DOCTYPE html><p>a</p>");
    expect(output.startsWith('<!doctype html><html lang="ko">')).toBe(true);
    expect(output).toContain('&lt;!DOCTYPE html&gt;&lt;p&gt;a&lt;/p&gt;');
  });

  it("wraps fragments without promoting them to the outer document", () => {
    const output = staticArtifactHtml("<p>a</p>");
    expect(output).toContain('srcdoc="&lt;p&gt;a&lt;/p&gt;"');
  });
});
