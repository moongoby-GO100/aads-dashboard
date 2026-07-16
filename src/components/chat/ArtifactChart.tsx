"use client";
/**
 * AADS-172-C: ArtifactChart
 * 차트 탭 - SVG 기반 비용 추이 + 프로젝트 현황 차트
 * (recharts 미설치 → 인라인 SVG 구현)
 */
import { useEffect, useState } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("aads_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── SVG 라인 차트 ─────────────────────────────────────────────────────────

interface LineChartProps {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
}

function LineChart({ data, labels, color = "#6C5CE7", height = 120 }: LineChartProps) {
  if (data.length === 0) return null;
  const width = 360;
  const padX = 36;
  const padY = 12;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const max = Math.max(...data, 0.001);
  const pts = data.map((v, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padY + (1 - v / max) * chartH,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(padY + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padY + chartH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
      {/* 그리드 라인 */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padY + (1 - frac) * chartH;
        return (
          <line key={frac} x1={padX} y1={y} x2={padX + chartW} y2={y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        );
      })}
      {/* 영역 채우기 */}
      <path d={areaD} fill={color} fillOpacity="0.12" />
      {/* 선 */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* 점 */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
      {/* X 라벨 */}
      {labels.map((label, i) => {
        const p = pts[i];
        if (!p) return null;
        return (
          <text key={i} x={p.x} y={height - 2} textAnchor="middle"
            fontSize="8" fill="rgba(255,255,255,0.4)">
            {label.slice(-5)}
          </text>
        );
      })}
      {/* Y 최대값 */}
      <text x={padX - 4} y={padY + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.4)">
        {max.toFixed(2)}
      </text>
    </svg>
  );
}

// ─── SVG 수평 바 차트 ───────────────────────────────────────────────────────

interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
}

const BAR_COLORS = ["#6C5CE7", "#00B894", "#FDCB6E", "#FF6B6B", "#74B9FF", "#A29BFE", "#FD79A8"];

function HBarChart({ data }: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{item.label}</span>
            <span className="text-xs font-medium" style={{ color: "var(--ct-text)" }}>{item.value}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--ct-border)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color || BAR_COLORS[idx % BAR_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 데이터 타입 ────────────────────────────────────────────────────────────

interface CostTrend {
  date: string;
  cost: number;
}

interface ProjectStat {
  project: string;
  total: number;
  completed: number;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ArtifactChart() {
  const [costTrend, setCostTrend] = useState<CostTrend[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [costRes, statsRes] = await Promise.allSettled([
          fetch(`${BASE_URL}/ops/cost-trend?days=7`, { headers: getAuthHeaders() }),
          fetch(`${BASE_URL}/ops/project-stats`, { headers: getAuthHeaders() }),
        ]);

        if (costRes.status === "fulfilled" && costRes.value.ok) {
          const data = await costRes.value.json();
          setCostTrend(Array.isArray(data) ? data : data.items || []);
        } else {
          // 샘플 데이터 (API 없을 경우)
          const today = new Date();
          setCostTrend(
            Array.from({ length: 7 }, (_, i) => {
              const d = new Date(today);
              d.setDate(d.getDate() - (6 - i));
              return { date: d.toISOString().slice(0, 10), cost: Math.random() * 2 + 0.5 };
            })
          );
        }

        if (statsRes.status === "fulfilled" && statsRes.value.ok) {
          const data = await statsRes.value.json();
          setProjectStats(Array.isArray(data) ? data : data.items || []);
        } else {
          // 샘플 데이터
          setProjectStats([
            { project: "AADS", total: 12, completed: 10 },
            { project: "SF",   total: 8,  completed: 6 },
            { project: "KIS",  total: 5,  completed: 4 },
            { project: "GO100",total: 3,  completed: 2 },
            { project: "NTV2", total: 4,  completed: 3 },
            { project: "NAS",  total: 2,  completed: 2 },
          ]);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalCost = costTrend.reduce((s, d) => s + d.cost, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 chat-scrollbar space-y-4">
      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="text-xs animate-pulse" style={{ color: "var(--ct-text-muted)" }}>로딩 중...</div>
        </div>
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--ct-error)" }}>오류: {error}</p>
      )}

      {!loading && (
        <>
          {/* 비용 추이 */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>
                📊 최근 7일 비용 추이
              </p>
              <span className="text-xs font-medium" style={{ color: "var(--ct-accent)" }}>
                ${totalCost.toFixed(2)}
              </span>
            </div>
            <LineChart
              data={costTrend.map((d) => d.cost)}
              labels={costTrend.map((d) => d.date)}
              color="#6C5CE7"
              height={100}
            />
          </div>

          {/* 프로젝트 완료율 */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
          >
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--ct-text)" }}>
              🚀 프로젝트 태스크 완료율
            </p>
            <HBarChart
              data={projectStats.map((p, idx) => ({
                label: `${p.project} (${p.completed}/${p.total})`,
                value: p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
                color: BAR_COLORS[idx % BAR_COLORS.length],
              }))}
            />
          </div>

          {/* 일별 비용 테이블 */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)" }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--ct-text)" }}>
              📅 일별 비용 내역
            </p>
            <div className="space-y-1">
              {costTrend.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--ct-text-muted)" }}>{d.date}</span>
                  <span style={{ color: "var(--ct-text)" }}>${d.cost.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
