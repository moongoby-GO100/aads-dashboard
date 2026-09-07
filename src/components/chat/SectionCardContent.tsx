"use client";
import React, { useState, useRef, useMemo, useEffect } from "react";

const SCC_STYLE_ID = "scc-v31";
const SCC_CSS = `
.cb-verdict{padding:14px 18px 12px;font-size:14px;font-weight:700;line-height:1.6;border-bottom:1px solid rgba(255,255,255,.08)}
.cb-verdict .sub{font-size:12px;font-weight:400;color:#94a3b8;margin-top:2px}
.cb-verdict .src{color:#6366f1;font-size:11px}
.cb-chipbar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
.cb-chipbtn{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid rgba(255,255,255,.08);background:transparent;color:#94a3b8}
.cb-chipbtn:hover,.cb-chipbtn.active{background:rgba(99,102,241,.10);border-color:rgba(99,102,241,.5);color:#818cf8}
.cb-chipnum{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font-size:10px;font-weight:700;line-height:1}
.cb-sec{padding:12px 0}
.cb-sec+.cb-sec{border-top:1px dashed rgba(255,255,255,.06)}
.cb-sec-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cb-sec-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:700;line-height:1;flex-shrink:0}
.cb-sec-title{font-size:12px;font-weight:700;color:#e2e8f0;letter-spacing:.3px}
.cb-sec-badge{font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;line-height:1.4}
.cb-bdg-ok{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.2)}
.cb-bdg-warn{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.2)}
.cb-bdg-fail{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.2)}
.cb-body{padding:16px 18px 18px}
.cb-next{margin-top:4px;padding:10px 14px;background:rgba(99,102,241,.06);border-radius:8px;border-left:3px solid #6366f1}
.cb-next .lbl{font-size:11px;font-weight:700;color:#6366f1;margin-bottom:4px}
.cb-footer{display:flex;align-items:center;gap:8px;padding:8px 18px 10px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:#94a3b8}
.cb-stpill{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:rgba(34,197,94,.10);color:#22c55e;border:1px solid rgba(34,197,94,.20)}
@media(max-width:768px){.cb-verdict{font-size:19px;padding:12px 14px 10px}.cb-verdict .sub{font-size:14px}.cb-chipbar{padding:8px 14px;gap:5px}.cb-chipbtn{font-size:12px;padding:4px 10px;min-height:32px}.cb-chipnum{width:18px;height:18px;font-size:11px}.cb-body{padding:12px 14px 16px}.cb-sec-title{font-size:14px}.cb-footer{font-size:12px}}
`;

function useInjectSccStyles() {
  useEffect(() => {
    if (document.getElementById(SCC_STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = SCC_STYLE_ID;
    el.textContent = SCC_CSS;
    document.head.appendChild(el);
  }, []);
}

const CRF_SECTIONS = [
  { aliases: ["지시파악", "지시 파악"], color: "rgba(99,102,241,0.15)", text: "#818cf8" },
  { aliases: ["목표"], color: "rgba(14,165,233,0.15)", text: "#38bdf8" },
  { aliases: ["계획"], color: "rgba(168,85,247,0.15)", text: "#c084fc" },
  { aliases: ["실행순서", "실행 순서"], color: "rgba(34,197,94,0.15)", text: "#4ade80" },
  { aliases: ["결과"], color: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  { aliases: ["검증"], color: "rgba(6,182,212,0.15)", text: "#22d3ee" },
  { aliases: ["리스크"], color: "rgba(239,68,68,0.15)", text: "#f87171" },
  { aliases: ["다음", "다음 단계"], color: "rgba(236,72,153,0.15)", text: "#f472b6" },
];

export function detectCrfSections(content: string): boolean {
  let count = 0;
  for (const sec of CRF_SECTIONS) {
    const pattern = new RegExp(`^##\\s+(${sec.aliases.join("|")})`, "m");
    if (pattern.test(content)) count++;
  }
  return count >= 3;
}

interface ParsedSection {
  title: string;
  badge?: "done" | "warn" | "fail";
  content: string;
}

function matchCrfIndex(title: string): number {
  for (let i = 0; i < CRF_SECTIONS.length; i++) {
    if (CRF_SECTIONS[i].aliases.some((a) => title.includes(a))) return i;
  }
  return -1;
}

function chipLabel(title: string): string {
  const m = title.match(/^(지시\s*파악|목표|계획|실행\s*순서|결과|검증|리스크|다음\s*단계?)/);
  return m ? m[1] : title.slice(0, 6);
}

function parseCrfContent(content: string) {
  const lines = content.split("\n");
  let verdict = "";
  let verdictSub = "";
  let bodyStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("## ")) {
      bodyStart = i;
      break;
    }
    if (t && !verdict) verdict = t;
    else if (t && verdict && !verdictSub) verdictSub = t;
  }

  const sections: ParsedSection[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  for (let i = bodyStart; i < lines.length; i++) {
    const hm = lines[i].trim().match(/^##\s+(.+)/);
    if (hm) {
      if (cur) flush(cur, sections);
      cur = { title: hm[1], lines: [] };
    } else if (cur) {
      cur.lines.push(lines[i]);
    }
  }
  if (cur) flush(cur, sections);

  return { verdict, verdictSub, sections };
}

function flush(cur: { title: string; lines: string[] }, out: ParsedSection[]) {
  const body = cur.lines.join("\n").trim();
  let badge: ParsedSection["badge"];
  if (/완료/.test(cur.title) || /✅.*완료|완료.*✅/.test(body)) badge = "done";
  else if (/⚠️|주의/.test(body) && !body.startsWith("✅")) badge = "warn";
  else if (/❌|실패/.test(body)) badge = "fail";
  out.push({ title: cur.title, badge, content: body });
}

interface Props {
  content: string;
  MarkdownRenderer: React.ComponentType<{ content: string }>;
  modelUsed?: string | null;
  createdAt?: string | null;
}

export default function SectionCardContent({
  content,
  MarkdownRenderer,
  modelUsed,
  createdAt,
}: Props) {
  useInjectSccStyles();
  const [activeChip, setActiveChip] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const { verdict, verdictSub, sections } = useMemo(
    () => parseCrfContent(content),
    [content],
  );

  const handleChip = (i: number) => {
    setActiveChip(i);
    refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const charCount = content.length.toLocaleString();
  const timeStr = createdAt
    ? new Date(createdAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div>
      {verdict && (
        <div className="cb-verdict">
          {verdict}
          {verdictSub && <div className="sub">{verdictSub}</div>}
        </div>
      )}

      {sections.length >= 3 && (
        <div className="cb-chipbar">
          {sections.map((sec, i) => {
            const ci = matchCrfIndex(sec.title);
            const cfg = ci >= 0 ? CRF_SECTIONS[ci] : null;
            return (
              <span
                key={i}
                className={`cb-chipbtn${activeChip === i ? " active" : ""}`}
                onClick={() => handleChip(i)}
              >
                <span
                  className="cb-chipnum"
                  style={
                    cfg
                      ? { background: cfg.color, color: cfg.text }
                      : {
                          background: "rgba(148,163,184,0.15)",
                          color: "#94a3b8",
                        }
                  }
                >
                  {i + 1}
                </span>
                {chipLabel(sec.title)}
              </span>
            );
          })}
        </div>
      )}

      <div className="cb-body">
        {sections.map((sec, i) => {
          const ci = matchCrfIndex(sec.title);
          const cfg = ci >= 0 ? CRF_SECTIONS[ci] : null;
          const isNext = sec.title.includes("다음");
          return (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="cb-sec"
            >
              <div className="cb-sec-head">
                <span
                  className="cb-sec-num"
                  style={
                    cfg
                      ? { background: cfg.color, color: cfg.text }
                      : {
                          background: "rgba(148,163,184,0.15)",
                          color: "#94a3b8",
                        }
                  }
                >
                  {i + 1}
                </span>
                <span className="cb-sec-title">{sec.title}</span>
                {sec.badge === "done" && (
                  <span className="cb-sec-badge cb-bdg-ok">완료</span>
                )}
                {sec.badge === "warn" && (
                  <span className="cb-sec-badge cb-bdg-warn">주의</span>
                )}
                {sec.badge === "fail" && (
                  <span className="cb-sec-badge cb-bdg-fail">실패</span>
                )}
              </div>
              {isNext ? (
                <div className="cb-next">
                  <div className="lbl">→ 다음 단계</div>
                  <MarkdownRenderer content={sec.content} />
                </div>
              ) : (
                <MarkdownRenderer content={sec.content} />
              )}
            </div>
          );
        })}
      </div>

      <div className="cb-footer">
        {verdict.startsWith("✅") && (
          <span className="cb-stpill">✅ 완료</span>
        )}
        {verdict.startsWith("⚠️") && (
          <span
            className="cb-stpill"
            style={{
              background: "rgba(245,158,11,.10)",
              color: "#f59e0b",
              borderColor: "rgba(245,158,11,.20)",
            }}
          >
            ⚠️ 주의
          </span>
        )}
        {verdict.startsWith("❌") && (
          <span
            className="cb-stpill"
            style={{
              background: "rgba(239,68,68,.10)",
              color: "#ef4444",
              borderColor: "rgba(239,68,68,.20)",
            }}
          >
            ❌ 실패
          </span>
        )}
        <span>
          {[modelUsed, timeStr, `${charCount}자`].filter(Boolean).join(" · ")}
        </span>
      </div>
    </div>
  );
}
