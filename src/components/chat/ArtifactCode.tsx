"use client";
/**
 * AADS-172-C: ArtifactCode
 * 코드 탭 - 구문 하이라이팅 + 라인 넘버 + 복사 + 지시서 생성
 */
import { useState } from "react";
import { driveApi } from "@/services/driveApi";

// ─── 간단 토큰 기반 구문 하이라이팅 ────────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "default", "from", "async", "await", "new", "this", "typeof", "instanceof", "true", "false", "null", "undefined", "=>"],
  ts: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "default", "from", "async", "await", "new", "this", "typeof", "instanceof", "true", "false", "null", "undefined", "=>", "interface", "type", "enum", "extends", "implements", "readonly", "public", "private", "protected"],
  py: ["def", "class", "import", "from", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "True", "False", "None", "with", "as", "try", "except", "finally", "raise", "pass", "break", "continue", "lambda", "yield"],
  sql: ["SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "ON", "AND", "OR", "NOT", "IN", "AS", "GROUP", "BY", "ORDER", "HAVING", "INSERT", "UPDATE", "DELETE", "CREATE", "TABLE", "INDEX", "DROP", "ALTER", "LIMIT", "OFFSET"],
  sh: ["if", "then", "else", "fi", "for", "do", "done", "while", "function", "return", "echo", "export", "source", "local", "readonly"],
};

function getKeywords(lang: string): string[] {
  const normalized = lang.toLowerCase();
  if (normalized === "javascript" || normalized === "js" || normalized === "jsx") return KEYWORDS.js;
  if (normalized === "typescript" || normalized === "ts" || normalized === "tsx") return KEYWORDS.ts;
  if (normalized === "python" || normalized === "py") return KEYWORDS.py;
  if (normalized === "sql") return KEYWORDS.sql;
  if (normalized === "bash" || normalized === "sh" || normalized === "shell") return KEYWORDS.sh;
  return [];
}

function tokenizeLine(line: string, lang: string): React.ReactNode {
  const keywords = getKeywords(lang);
  if (keywords.length === 0) return <span style={{ color: "var(--ct-text)" }}>{line}</span>;

  // 먼저 string 리터럴과 주석을 처리, 나머지는 키워드 하이라이팅
  const parts: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  let key = 0;

  const flushBuf = () => {
    if (!buf) return;
    // 버퍼에서 키워드 하이라이팅
    const kRe = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
    let last2 = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = kRe.exec(buf)) !== null) {
      if (m2.index > last2)
        parts.push(<span key={key++} style={{ color: "var(--ct-text)" }}>{buf.slice(last2, m2.index)}</span>);
      parts.push(<span key={key++} style={{ color: "#bd93f9", fontWeight: 600 }}>{m2[0]}</span>);
      last2 = m2.index + m2[0].length;
    }
    if (last2 < buf.length)
      parts.push(<span key={key++} style={{ color: "var(--ct-text)" }}>{buf.slice(last2)}</span>);
    buf = "";
  };

  while (i < line.length) {
    // 문자열 (따옴표)
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      flushBuf();
      const q = line[i];
      let str = q;
      i++;
      while (i < line.length && line[i] !== q) {
        if (line[i] === "\\") { str += line[i++]; }
        str += line[i++];
      }
      str += q;
      i++;
      parts.push(<span key={key++} style={{ color: "#f1fa8c" }}>{str}</span>);
      continue;
    }
    // 주석 (//)
    if (line[i] === "/" && line[i + 1] === "/") {
      flushBuf();
      parts.push(<span key={key++} style={{ color: "var(--ct-text-muted)", fontStyle: "italic" }}>{line.slice(i)}</span>);
      break;
    }
    // # 주석 (Python/Shell)
    if (line[i] === "#" && (lang === "py" || lang === "python" || lang === "sh" || lang === "bash" || lang === "shell")) {
      flushBuf();
      parts.push(<span key={key++} style={{ color: "var(--ct-text-muted)", fontStyle: "italic" }}>{line.slice(i)}</span>);
      break;
    }
    // 숫자
    if (/\d/.test(line[i]) && (i === 0 || /\W/.test(line[i - 1]))) {
      flushBuf();
      let num = "";
      while (i < line.length && /[\d.]/.test(line[i])) num += line[i++];
      parts.push(<span key={key++} style={{ color: "#ff9580" }}>{num}</span>);
      continue;
    }
    buf += line[i++];
  }
  flushBuf();
  return <>{parts}</>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  content: string;
  language?: string;
  title?: string;
  workspaceId?: string;
}

export default function ArtifactCode({ content, language = "text", title, workspaceId }: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const lines = content.split("\n");
  const lang = language.toLowerCase();

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCreateDirective = () => {
    const directive = `>>>DIRECTIVE_START\nTITLE: ${title || "코드 기반 지시서"}\nDESCRIPTION: |\n  다음 코드를 참고하여 작업을 진행하세요.\nfiles_owned:\n  - path/to/file.${lang}\nCODE: |\n${content}\n>>>DIRECTIVE_END`;
    navigator.clipboard.writeText(directive);
    showMsg("지시서 복사됨");
  };

  const handleSaveToDrive = async () => {
    setSaving(true);
    try {
      const ext = lang === "typescript" || lang === "ts" ? "ts"
        : lang === "javascript" || lang === "js" ? "js"
        : lang === "python" || lang === "py" ? "py"
        : lang === "sql" ? "sql"
        : "txt";
      const name = `${title || "code"}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      await driveApi.saveText(name, content, workspaceId, "Code");
      showMsg("Drive에 저장됨");
    } catch {
      showMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 바 */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--ct-border)", background: "rgba(0,0,0,0.2)" }}
      >
        <span
          className="text-xs font-mono font-medium"
          style={{ color: "var(--ct-text-muted)" }}
        >
          {lang || "text"}
          {title && ` · ${title}`}
        </span>
        <div className="flex items-center gap-1">
          {msg && <span className="text-xs mr-2" style={{ color: "var(--ct-success)" }}>{msg}</span>}
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--ct-hover)", color: copied ? "var(--ct-success)" : "var(--ct-text-muted)" }}
          >
            {copied ? "복사됨" : "복사"}
          </button>
          <button
            onClick={handleCreateDirective}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--ct-hover)", color: "var(--ct-text-muted)" }}
          >
            지시서 생성
          </button>
          <button
            onClick={handleSaveToDrive}
            disabled={saving}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "var(--ct-hover)", color: saving ? "var(--ct-text-muted)" : "var(--ct-accent)" }}
          >
            {saving ? "저장 중..." : "Drive 저장"}
          </button>
        </div>
      </div>

      {/* 코드 영역 */}
      <div className="flex-1 min-h-0 overflow-auto chat-scrollbar">
        <table
          className="w-full text-xs font-mono"
          style={{ borderCollapse: "collapse", background: "rgba(0,0,0,0.15)" }}
        >
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="group">
                {/* 라인 넘버 */}
                <td
                  className="select-none text-right pr-3 pl-2 py-0.5"
                  style={{
                    color: "var(--ct-text-muted)",
                    borderRight: "1px solid var(--ct-border)",
                    minWidth: "2.5rem",
                    userSelect: "none",
                    background: "rgba(0,0,0,0.1)",
                    fontSize: "0.65rem",
                    verticalAlign: "top",
                    paddingTop: "2px",
                  }}
                >
                  {idx + 1}
                </td>
                {/* 코드 */}
                <td
                  className="pl-3 py-0.5 whitespace-pre"
                  style={{ color: "var(--ct-text)", lineHeight: "1.5" }}
                >
                  {tokenizeLine(line, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
