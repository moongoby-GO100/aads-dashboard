import { describe, expect, it } from "vitest";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { markdownSanitizeSchema } from "./markdownPolicy";

// MarkdownRenderer와 동일한 plugin 순서를 그대로 재현한다.
// sanitize는 반드시 raw/highlight 뒤에 와야 한다.
function render(markdown: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeHighlight, { detect: true, ignoreMissing: true })
      .use(rehypeSanitize, markdownSanitizeSchema)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(markdown),
  );
}

describe("markdown sanitize policy blocks injection", () => {
  it("drops raw script blocks", () => {
    const output = render('# t\n\n<script>window.owned = 1</script>\n');
    expect(output).not.toContain("<script");
  });

  it("drops event handler attributes", () => {
    const output = render('<img src="x" onerror="window.owned = 1">\n');
    expect(output).not.toContain("onerror");
  });

  it("drops javascript: links", () => {
    const output = render("[go](javascript:alert(1))\n");
    expect(output).not.toContain("javascript:");
  });

  it("drops iframes and objects", () => {
    const output = render('<iframe src="https://attacker.invalid"></iframe>\n');
    expect(output).not.toContain("<iframe");
  });
});

describe("markdown sanitize policy keeps existing rendering", () => {
  it("keeps highlight classes so code blocks stay themed", () => {
    const output = render("```js\nconst a = 1;\n```\n");
    expect(output).toContain("hljs");
    expect(output).toContain("language-js");
    expect(output).toMatch(/hljs-/);
  });

  it("keeps GFM table alignment", () => {
    const output = render("| a | b |\n| :-- | --: |\n| 1 | 2 |\n");
    expect(output).toContain('align="right"');
    expect(output).not.toContain('style=');
  });

  it("keeps task list markers", () => {
    const output = render("- [x] done\n- [ ] todo\n");
    expect(output).toContain("task-list-item");
    expect(output).toContain('type="checkbox"');
  });

  it("keeps safe links and headings", () => {
    const output = render("## h\n\n[x](https://example.com/a)\n");
    expect(output).toContain('href="https://example.com/a"');
    expect(output).toContain("<h2");
  });
});
