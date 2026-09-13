"use client";
/**
 * InlineChart — ```chart 코드블록을 인라인 SVG 차트로 렌더링
 *
 * 지원 형식 (JSON):
 *   단일 계열: { type: "line"|"bar", labels: string[], data: number[], title?, color? }
 *   다중 계열: { type, labels: string[], data: [{ label, values: number[] }, ...], title? }
 *
 * 다중 계열을 지원하지 않던 시절, data 안의 객체가 그대로 React 자식으로 들어가
 * "Objects are not valid as a React child (object with keys {label, values})"
 * (React #31) 로 채팅 전체가 렌더링 오류 화면이 됐다. 2026-09-13 세션 5090a247
 * 실측 — 메시지 한 건이 대화창 전체를 못 뜨게 만들었다.
 *
 * 그래서 parseSpec 은 두 가지를 모두 한다.
 *   1) 어떤 형식이든 숫자 계열로 정규화한다.
 *   2) 정규화할 수 없으면 null 을 돌려준다 — 렌더 대신 안내를 띄운다.
 * 화면에 들어가는 값은 언제나 숫자다. 알 수 없는 형식이 와도 깨지지 않는다.
 */
import React, { useMemo } from "react";

interface ChartSeries {
  label: string;
  values: number[];
}

interface ChartSpec {
  type?: "line" | "bar";
  labels?: string[];
  series: ChartSeries[];
  title?: string;
  color?: string;
}

const SERIES_COLORS = ["#6C5CE7", "#00B894", "#FDCB6E", "#FF6B6B", "#74B9FF", "#A29BFE", "#FD79A8"];

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function toLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : ""));
}

function parseSpec(raw: string): ChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const spec = parsed as Record<string, unknown>;
  const type = spec.type === "bar" ? "bar" : "line";
  const labels = toLabels(spec.labels);
  const title = typeof spec.title === "string" ? spec.title : undefined;
  const color = typeof spec.color === "string" ? spec.color : undefined;

  // 단일 계열: data: number[]
  if (isNumberArray(spec.data)) {
    return { type, labels, title, color, series: [{ label: "", values: spec.data }] };
  }

  // 다중 계열: data: [{ label, values: number[] }, ...]
  if (Array.isArray(spec.data) && spec.data.length > 0) {
    const series: ChartSeries[] = [];
    for (const [i, entry] of spec.data.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      if (!isNumberArray(row.values)) return null;
      series.push({
        label: typeof row.label === "string" ? row.label : `계열 ${i + 1}`,
        values: row.values,
      });
    }
    return { type, labels, title, color, series };
  }

  return null;
}

function seriesMax(series: ChartSeries[]): number {
  let max = 0;
  for (const s of series) for (const v of s.values) if (v > max) max = v;
  return max;
}

// ─── SVG 라인 차트 ───────────────────────────────────────────────────────────

function InlineLineChart({ spec }: { spec: ChartSpec }) {
  const { series } = spec;
  const longest = Math.max(...series.map((s) => s.values.length));
  const labels = spec.labels || Array.from({ length: longest }, (_, i) => String(i + 1));
  const W = 340, H = 110, px = 28, py = 14;
  const cW = W - px * 2, cH = H - py * 2;
  const max = Math.max(seriesMax(series), 0.001);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = py + (1 - f) * cH;
        return <line key={f} x1={px} y1={y} x2={px + cW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {series.map((s, si) => {
        const color = spec.color || SERIES_COLORS[si % SERIES_COLORS.length];
        const pts = s.values.map((v, i) => ({
          x: px + (i / Math.max(s.values.length - 1, 1)) * cW,
          y: py + (1 - v / max) * cH,
        }));
        if (pts.length === 0) return null;
        const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(py + cH).toFixed(1)} L${pts[0].x.toFixed(1)},${(py + cH).toFixed(1)} Z`;
        return (
          <g key={si}>
            {series.length === 1 && <path d={areaD} fill={color} fillOpacity="0.12" />}
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}
          </g>
        );
      })}
      {labels.map((lbl, i) => {
        const x = px + (i / Math.max(longest - 1, 1)) * cW;
        if (i >= longest) return null;
        return (
          <text key={i} x={x} y={H - 2} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)">
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

function InlineBarChart({ spec }: { spec: ChartSpec }) {
  const { series } = spec;
  const longest = Math.max(...series.map((s) => s.values.length));
  const labels = spec.labels || Array.from({ length: longest }, (_, i) => String(i + 1));
  const max = Math.max(seriesMax(series), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {Array.from({ length: longest }, (_, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "2px", color: "rgba(255,255,255,0.6)" }}>
            <span>{String(labels[i] ?? i + 1).slice(0, 20)}</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
              {series.map((s) => (typeof s.values[i] === "number" ? s.values[i] : "-")).join(" / ")}
            </span>
          </div>
          {series.map((s, si) => {
            const v = s.values[i];
            if (typeof v !== "number") return null;
            return (
              <div key={si} style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", marginTop: si ? "2px" : 0 }}>
                <div style={{
                  height: "6px", borderRadius: "3px",
                  width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`,
                  background: spec.color || SERIES_COLORS[si % SERIES_COLORS.length],
                  transition: "width 0.3s ease",
                }} />
              </div>
            );
          })}
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

  const multi = spec.series.length > 1;

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
      {multi && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "10px",
          padding: "6px 12px", fontSize: "10px", color: "rgba(255,255,255,0.6)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {spec.series.map((s, si) => (
            <span key={si} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{
                width: "8px", height: "8px", borderRadius: "2px",
                background: spec.color || SERIES_COLORS[si % SERIES_COLORS.length],
              }} />
              {s.label || `계열 ${si + 1}`}
            </span>
          ))}
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        {spec.type === "bar"
          ? <InlineBarChart spec={spec} />
          : <InlineLineChart spec={spec} />
        }
      </div>
    </div>
  );
}
