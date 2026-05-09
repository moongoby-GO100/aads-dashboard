"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import InlineChart from "@/components/chat/InlineChart";

const isSafeUrl = (url: string) => {
  const u = url.trim().toLowerCase();
  return !u.startsWith("javascript:") && !u.startsWith("data:") && !u.startsWith("vbscript:");
};

const safeUrlTransform = (url: string) => (isSafeUrl(url) ? url : "");

const getLanguage = (className?: string) => {
  const match = /language-([^\s]+)/.exec(className || "");
  return match?.[1]?.toLowerCase() || "";
};

const stripFinalNewline = (value: string) => value.replace(/\n$/, "");

const extractNodeText = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";

  const maybeNode = node as { value?: unknown; children?: unknown[] };
  if (typeof maybeNode.value === "string") return maybeNode.value;
  if (!Array.isArray(maybeNode.children)) return "";

  return maybeNode.children.map(extractNodeText).join("");
};

const markdownPlugins: PluggableList = [remarkGfm];
const markdownRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

const markdownDisallowedElements = ["script", "style", "iframe", "object", "embed", "link", "meta"];

function MarkdownStyles() {
  return (
    <style>{`
      .aads-markdown .contains-task-list {
        list-style: none;
        padding-left: 0;
      }

      .aads-markdown .task-list-item {
        list-style: none;
      }

      .aads-markdown .hljs-comment,
      .aads-markdown .hljs-quote {
        color: #8b949e;
      }

      .aads-markdown .hljs-keyword,
      .aads-markdown .hljs-selector-tag,
      .aads-markdown .hljs-subst {
        color: #ff7b72;
      }

      .aads-markdown .hljs-literal,
      .aads-markdown .hljs-number,
      .aads-markdown .hljs-tag .hljs-attr,
      .aads-markdown .hljs-template-variable,
      .aads-markdown .hljs-variable {
        color: #79c0ff;
      }

      .aads-markdown .hljs-doctag,
      .aads-markdown .hljs-string,
      .aads-markdown .hljs-title,
      .aads-markdown .hljs-section,
      .aads-markdown .hljs-selector-id {
        color: #a5d6ff;
      }

      .aads-markdown .hljs-type,
      .aads-markdown .hljs-class .hljs-title,
      .aads-markdown .hljs-built_in {
        color: #ffa657;
      }

      .aads-markdown .hljs-attribute,
      .aads-markdown .hljs-name,
      .aads-markdown .hljs-selector-class,
      .aads-markdown .hljs-selector-attr,
      .aads-markdown .hljs-selector-pseudo {
        color: #d2a8ff;
      }

      .aads-markdown .hljs-symbol,
      .aads-markdown .hljs-bullet,
      .aads-markdown .hljs-link {
        color: #7ee787;
      }
    `}</style>
  );
}

type CodeBlockShellProps = {
  lang: string;
  code: string;
  highlightedChildren?: React.ReactNode;
  codeClassName?: string;
};

function CodeBlockShell({ lang, code, highlightedChildren, codeClassName }: CodeBlockShellProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLang = lang.trim().toLowerCase();
  const copyText = code.trimEnd();

  const handleCopy = () => {
    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (normalizedLang === "html") {
    return (
      <div
        style={{
          marginTop: "12px",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #2d3148",
        }}
      >
        <div
          style={{
            background: "#1e2130",
            padding: "6px 14px",
            fontSize: "0.75rem",
            color: "#a855f7",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>🎨 미리보기</span>
          <button
            onClick={handleCopy}
            style={{
              padding: "2px 8px",
              fontSize: "11px",
              borderRadius: "4px",
              cursor: "pointer",
              border: "1px solid #2d3148",
              fontFamily: "sans-serif",
              background: copied ? "#22c55e" : "#1e2130",
              color: copied ? "#fff" : "#a855f7",
              transition: "all 0.2s",
            }}
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <iframe
          srcDoc={code}
          style={{ width: "100%", height: "540px", border: "none", background: "#fff" }}
          sandbox=""
          title="HTML Preview"
        />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", margin: "8px 0" }}>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          padding: "2px 8px",
          fontSize: "11px",
          borderRadius: "4px",
          cursor: "pointer",
          border: "1px solid var(--ct-border)",
          fontFamily: "sans-serif",
          background: copied ? "#22c55e" : "var(--ct-card)",
          color: copied ? "#fff" : "var(--ct-text2)",
          transition: "all 0.2s",
          zIndex: 1,
        }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
      <pre
        style={{
          background: "var(--ct-code)",
          padding: "12px",
          paddingTop: normalizedLang ? "30px" : "12px",
          borderRadius: "8px",
          overflowX: "auto",
          fontSize: "12px",
          fontFamily: "monospace",
          whiteSpace: "pre",
          wordBreak: "normal",
          border: "1px solid var(--ct-border)",
          lineHeight: 1.55,
        }}
      >
        {normalizedLang && (
          <div
            style={{
              color: "var(--ct-text2)",
              fontSize: "10px",
              marginBottom: "6px",
              fontFamily: "sans-serif",
              position: "absolute",
              top: 10,
              left: 12,
            }}
          >
            {normalizedLang}
          </div>
        )}
        <code className={codeClassName || (normalizedLang ? `language-${normalizedLang}` : undefined)}>
          {highlightedChildren ?? code}
        </code>
      </pre>
    </div>
  );
}

function CopyableCodeBlock({ lang, code }: { lang: string; code: string }) {
  return <CodeBlockShell lang={lang} code={code} />;
}

type CodeRendererProps = React.ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  node?: unknown;
};

const createMarkdownComponents = (linkColor?: string, inlineMode = false): Components => ({
  p({ children }) {
    if (inlineMode) return <>{children}</>;
    return <p style={{ margin: "0 0 8px", lineHeight: 1.65 }}>{children}</p>;
  },
  h1({ children }) {
    return <div style={{ fontWeight: 700, fontSize: "17px", marginTop: "14px", marginBottom: "8px" }}>{children}</div>;
  },
  h2({ children }) {
    return <div style={{ fontWeight: 700, fontSize: "15px", marginTop: "12px", marginBottom: "6px" }}>{children}</div>;
  },
  h3({ children }) {
    return <div style={{ fontWeight: 700, fontSize: "14px", marginTop: "10px", marginBottom: "4px" }}>{children}</div>;
  },
  h4({ children }) {
    return <div style={{ fontWeight: 700, fontSize: "13px", marginTop: "10px", marginBottom: "4px" }}>{children}</div>;
  },
  a({ href, children }) {
    if (!href || !isSafeUrl(href)) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: linkColor || "var(--ct-accent)", textDecoration: "underline", wordBreak: "break-all" }}
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const imageSrc = typeof src === "string" ? src : "";
    if (!imageSrc || !isSafeUrl(imageSrc)) return null;
    return (
      <img
        src={imageSrc}
        alt={alt || ""}
        style={{
          maxWidth: "100%",
          borderRadius: "8px",
          marginTop: "8px",
          marginBottom: "8px",
          display: "block",
        }}
      />
    );
  },
  ul({ children, className }) {
    return (
      <ul className={className} style={{ margin: "4px 0 8px", paddingLeft: "18px", lineHeight: 1.65 }}>
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return <ol style={{ margin: "4px 0 8px", paddingLeft: "20px", lineHeight: 1.65 }}>{children}</ol>;
  },
  li({ children, className }) {
    return (
      <li className={className} style={{ margin: "2px 0", paddingLeft: className?.includes("task-list-item") ? 0 : undefined }}>
        {children}
      </li>
    );
  },
  input({ type, checked, disabled }) {
    if (type !== "checkbox") return <input type={type} disabled={disabled} readOnly />;
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        readOnly
        style={{ marginRight: "6px", verticalAlign: "-2px", accentColor: "var(--ct-accent)" }}
      />
    );
  },
  table({ children }) {
    return (
      <div style={{ overflowX: "auto", margin: "8px 0" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>{children}</table>
      </div>
    );
  },
  th({ children, style }) {
    return (
      <th
        style={{
          padding: "6px 12px",
          border: "1px solid var(--ct-border)",
          textAlign: "left",
          fontWeight: 700,
          background: "var(--ct-code)",
          ...style,
        }}
      >
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td
        style={{
          padding: "6px 12px",
          border: "1px solid var(--ct-border)",
          textAlign: "left",
          ...style,
        }}
      >
        {children}
      </td>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          margin: "8px 0",
          paddingLeft: "12px",
          borderLeft: "3px solid var(--ct-border)",
          color: "var(--ct-text2)",
        }}
      >
        {children}
      </blockquote>
    );
  },
  details({ children, open }) {
    return (
      <details
        open={open}
        style={{
          margin: "8px 0",
          padding: "8px 10px",
          border: "1px solid var(--ct-border)",
          borderRadius: "8px",
          background: "var(--ct-card)",
        }}
      >
        {children}
      </details>
    );
  },
  summary({ children }) {
    return <summary style={{ cursor: "pointer", fontWeight: 700 }}>{children}</summary>;
  },
  hr() {
    return <hr style={{ border: 0, borderTop: "1px solid var(--ct-border)", margin: "12px 0" }} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  code(props) {
    const { inline, className, children, node, ...rest } = props as CodeRendererProps;
    const rawCode = extractNodeText(node) || String(children ?? "");
    const lang = getLanguage(className);
    const isInline = Boolean(inline) || (!className && !rawCode.includes("\n"));

    if (isInline) {
      return (
        <code
          {...rest}
          style={{
            background: "var(--ct-code)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "90%",
          }}
        >
          {children}
        </code>
      );
    }

    if (lang === "chart") {
      return <InlineChart raw={stripFinalNewline(rawCode)} />;
    }

    return (
      <CodeBlockShell
        lang={lang}
        code={stripFinalNewline(rawCode)}
        highlightedChildren={children}
        codeClassName={className}
      />
    );
  },
});

function processInline(text: string, opts?: { linkColor?: string }): React.ReactNode {
  return <InlineMd text={text} linkColor={opts?.linkColor} />;
}

function InlineMd({ text, linkColor }: { text: string; linkColor?: string }) {
  const components = useMemo(() => createMarkdownComponents(linkColor, true), [linkColor]);

  return (
    <ReactMarkdown
      remarkPlugins={markdownPlugins}
      rehypePlugins={markdownRehypePlugins}
      disallowedElements={markdownDisallowedElements}
      urlTransform={safeUrlTransform}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}

function MarkdownBlock({ text, linkColor }: { text: string; linkColor?: string }) {
  const components = useMemo(() => createMarkdownComponents(linkColor, false), [linkColor]);

  return (
    <div className="aads-markdown" style={{ lineHeight: 1.65 }}>
      <MarkdownStyles />
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        rehypePlugins={markdownRehypePlugins}
        disallowedElements={markdownDisallowedElements}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export { processInline, InlineMd, CopyableCodeBlock, MarkdownBlock };
