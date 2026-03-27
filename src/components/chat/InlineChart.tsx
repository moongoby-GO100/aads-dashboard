"use client";
/**
 * InlineChart — ```chart 코드블록을 인라인 SVG 차트로 렌더링
 *
 * 지원 형식 (JSON):
 *   { type: "line"|"bar", labels: string[], data: number[], title?: string, color?: string }
 *
 * 예시:
 *   ```chart
 *   { "type": "line", "labels": ["월","화","수"], "data": [10,25,18], "title": "일별 비용" }
 *   ```
 */
import React, { useMemo } from "react";

interface ChartSpec {
  type?: "line" | "bar";
  labels?: string[];
  data?: number[];
  title?: string;
  color?: string;
}

function parseSpec(raw: string): ChartSpec | null {
  try {
    const spec = JSON.parse(raw.trim());
    if (!Array.isArray(spec.data) || spec.data.length === 0) return null;
    return spec as ChartSpec;
  } catch {
    return null;
  }
}

// ─── SVG 라인 차트 ───────────────────────────────────────────────────────────

function InlineLineChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data!;
  const labels = spec.labels || data.map((_, i) => String(i + 1));
  const color = spec.color || "#6C5CE7";
  const W = 340, H = 110, px = 28, py = 14;
  const cW = W - px * 2, cH = H - py * 2;
  const max = Math.max(...data, 0.001);
  const pts = data.map((v, i) => ({
    x: px + (i / Math.max(data.length - 1, 1)) * cW,
    y: py + (1 - v / max) * cH,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(py + cH).toFixed(1)} L${pts[0].x.toFixed(1)},${(py + cH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = py + (1 - f) * cH;
        return <line key={f} x1={px} y1={y} x2={px + cW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      <path d={areaD} fill={color} fillOpacity="0.12" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}
      {labels.map((lbl, i) => {
        const p = pts[i];
        if (!p) return null;
        return (
          <text key={i} x={p.x} y={H - 2} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)">
            {String(lbl).slice(0, 6)}
          </text>
        );
      })}
      <text x={px - 3} y={py + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.4)">
        {max % 1 === 0 ? max : max.toFixed(2)}
      </text>
    </svg>
  );
}

// ─── SVG 바 차트 ─────────────────────────────────────────────────────────────

const BAR_COLORS = ["#6C5CE7", "#00B894", "#FDCB6E", "#FF6B6B", "#74B9FF", "#A29BFE", "#FD79A8"];

function InlineBarChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data!;
  const labels = spec.labels || data.map((_, i) => String(i + 1));
  const max = Math.max(...data, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {data.map((v, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "2px", color: "rgba(255,255,255,0.6)" }}>
            <span>{String(labels[i] ?? i + 1).slice(0, 20)}</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{v}</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)" }}>
            <div style={{
              height: "6px", borderRadius: "3px",
              width: `${(v / max) * 100}%`,
              background: spec.color || BAR_COLORS[i % BAR_COLORS.length],
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

interface InlineChartProps {
  raw: string; // ```chart 블록 내부 텍스트
}

export default function InlineChart({ raw }: InlineChartProps) {
  const spec = useMemo(() => parseSpec(raw), [raw]);

  if (!spec) {
    return (
      <div style={{
        margin: "8px 0", padding: "8px 12px", borderRadius: "8px",
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
        fontSize: "12px", color: "#f87171",
      }}>
        ⚠️ chart 파싱 오류 — JSON 형식을 확인하세요
      </div>
    );
  }

  return (
    <div style={{
      margin: "10px 0", borderRadius: "10px", overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(0,0,0,0.25)",
    }}>
      <div style={{
        padding: "6px 12px", fontSize: "11px", fontWeight: 600,
        color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "6px",
      }}>
        <span>📊</span>
        <span>{spec.title || (spec.type === "bar" ? "바 차트" : "라인 차트")}</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        {spec.type === "bar"
          ? <InlineBarChart spec={spec} />
          : <InlineLineChart spec={spec} />
        }
      </div>
    </div>
  );
}
