"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import { getAuthHeaders } from "@/lib/api";
import {
  KIND_COLOR,
  KIND_HELP,
  KIND_LABEL,
  KIND_ORDER,
  UNKNOWN_KIND_LABEL,
  classifyFailure,
  dailyBuckets,
  describeDetail,
  formatKst,
  isAiResponseErrorsResponse,
  isErrorKind,
  judgeRecurrence,
  kindLabel,
  type AiResponseErrorItem,
  type AiResponseErrorsResponse,
  type ErrorKind,
  type FailureNotice,
  type Recurrence,
} from "@/lib/aiResponseErrors";

const DAY_MS = 86_400_000;
const FETCH_LIMIT = 500;
const PAGE_ROWS = 50;
const PERIODS = [7, 30] as const;

type Period = (typeof PERIODS)[number];
type KindFilter = ErrorKind | "all";

type FetchResult =
  | { ok: true; data: AiResponseErrorsResponse }
  | { ok: false; failure: FailureNotice };

async function fetchErrors(sinceMs: number): Promise<FetchResult> {
  const qs = new URLSearchParams({
    since: new Date(sinceMs).toISOString(),
    limit: String(FETCH_LIMIT),
  });
  let res: Response;
  try {
    res = await fetch(`/api/v1/ops/ai-response-errors?${qs.toString()}`, {
      headers: getAuthHeaders(),
      credentials: "include",
    });
  } catch {
    return { ok: false, failure: classifyFailure(null) };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) return { ok: false, failure: classifyFailure(res.status, body) };
  if (!isAiResponseErrorsResponse(body)) return { ok: false, failure: classifyFailure(200) };
  return { ok: true, data: body };
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
};

const mutedText: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 12 };

const buttonStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 14px",
  color: "var(--text-primary)",
  fontSize: 13,
  cursor: "pointer",
};

const activeButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "1px solid var(--accent)",
};

// ── 일별 건수 (kind 별 누적 막대) ───────────────────────────────────────────────

function DailyChart({ items, days }: { items: AiResponseErrorItem[]; days: Period }) {
  const buckets = useMemo(() => dailyBuckets(items, days), [items, days]);
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const left = 30;
  const plotH = 110;
  const W = 720;
  const colW = (W - left - 8) / buckets.length;
  const barW = colW * 0.6;
  const labelEvery = days > 7 ? 5 : 1;
  const kinds = [...KIND_ORDER, "unknown"] as const;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} 150`}
        role="img"
        aria-label="일별 AI 응답 오류 건수"
        style={{ width: "100%", minWidth: 480, height: "auto", display: "block" }}
      >
        {[0, 0.5, 1].map((r) => {
          const y = 126 - r * plotH;
          return (
            <g key={r}>
              <line x1={left} x2={W - 4} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={left - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-secondary)">
                {Math.round(max * r)}
              </text>
            </g>
          );
        })}
        {buckets.map((b, i) => {
          const x = left + i * colW + (colW - barW) / 2;
          let yCursor = 126;
          const dayLabel = `${b.day.slice(5)}`;
          const tip =
            `${b.day} 총 ${b.total}건` +
            kinds
              .filter((k) => b.byKind[k])
              .map((k) => ` · ${k === "unknown" ? UNKNOWN_KIND_LABEL : KIND_LABEL[k]} ${b.byKind[k]}`)
              .join("");
          return (
            <g key={b.day}>
              <title>{tip}</title>
              {kinds.map((k) => {
                const n = b.byKind[k] || 0;
                if (!n) return null;
                const h = (n / max) * plotH;
                yCursor -= h;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={yCursor}
                    width={barW}
                    height={h}
                    fill={k === "unknown" ? "#9ca3af" : KIND_COLOR[k]}
                  />
                );
              })}
              {b.total > 0 && (
                <text x={x + barW / 2} y={yCursor - 3} textAnchor="middle" fontSize={8} fill="var(--text-primary)">
                  {b.total}
                </text>
              )}
              {(buckets.length - 1 - i) % labelEvery === 0 && (
                <text x={x + barW / 2} y={140} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">
                  {dayLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
        {KIND_ORDER.map((k) => (
          <span key={k} style={{ ...mutedText, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, background: KIND_COLOR[k], borderRadius: 2, display: "inline-block" }} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── 실패 안내 ────────────────────────────────────────────────────────────────

function FailurePanel({ failure, onRetry }: { failure: FailureNotice; onRetry: () => void }) {
  return (
    <div role="alert" data-testid="ai-errors-failure" style={{ ...cardStyle, border: "1px solid var(--warning)", textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>{failure.title}</h3>
      <p style={{ ...mutedText, fontSize: 13, margin: "0 0 16px" }}>{failure.guide}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" onClick={onRetry} style={{ ...buttonStyle, ...activeButtonStyle }}>
          다시 시도
        </button>
        {failure.action === "login" && (
          <a href={`/login?next=${encodeURIComponent("/ops/ai-errors")}`} style={{ ...buttonStyle, textDecoration: "none", display: "inline-block" }}>
            로그인 화면으로
          </a>
        )}
      </div>
    </div>
  );
}

// ── 목록 셀 ──────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const color = isErrorKind(kind) ? KIND_COLOR[kind] : "#9ca3af";
  return (
    <span
      title={isErrorKind(kind) ? KIND_HELP[kind] : undefined}
      style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}
    >
      {kindLabel(kind)}
    </span>
  );
}

function RecurrenceBadge({ r }: { r: Recurrence }) {
  const color = r.state === "prior" ? "var(--danger)" : r.state === "new" ? "var(--success)" : "var(--text-secondary)";
  return (
    <span
      title={r.reason}
      aria-label={`${r.label}: ${r.reason}`}
      style={{ color, border: `1px solid ${color}`, borderRadius: 999, padding: "2px 8px", fontSize: 11, whiteSpace: "nowrap", cursor: "help" }}
    >
      {r.label}
    </span>
  );
}

function ErrorBookCell({ keyName }: { keyName: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!keyName) {
    return (
      <span title="연결된 오류 사전 항목이 없습니다. 추측으로 연결하지 않습니다." style={{ ...mutedText, cursor: "help" }}>
        미연결
      </span>
    );
  }
  return (
    <button
      type="button"
      title="오류 사전 항목 키입니다. 클릭하면 복사됩니다. 사전은 scripts/error_book.py 로 조회합니다."
      onClick={() => {
        void navigator.clipboard?.writeText(keyName).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{ ...buttonStyle, padding: "2px 8px", fontSize: 11, fontFamily: "monospace" }}
    >
      {copied ? "복사됨" : keyName}
    </button>
  );
}

// ── 페이지 ───────────────────────────────────────────────────────────────────

export default function AiErrorsPage() {
  const [days, setDays] = useState<Period>(7);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [current, setCurrent] = useState<AiResponseErrorsResponse | null>(null);
  const [wider, setWider] = useState<AiResponseErrorsResponse | null>(null);
  const [shownRows, setShownRows] = useState(PAGE_ROWS);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const now = Date.now();
    const [cur, prev] = await Promise.all([
      fetchErrors(now - days * DAY_MS),
      fetchErrors(now - 2 * days * DAY_MS),
    ]);
    if (id !== requestId.current) return;
    if (!cur.ok) {
      setFailure(cur.failure);
      setCurrent(null);
      setWider(null);
    } else {
      setFailure(null);
      setCurrent(cur.data);
      setWider(prev.ok ? prev.data : null);
    }
    setShownRows(PAGE_ROWS);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodStartMs = useMemo(
    () => (current ? Date.parse(current.filters.since) : 0),
    [current],
  );

  const filteredItems = useMemo(() => {
    if (!current) return [];
    return kindFilter === "all" ? current.items : current.items.filter((i) => i.kind === kindFilter);
  }, [current, kindFilter]);

  const rows = useMemo(
    () =>
      filteredItems.slice(0, shownRows).map((item) => ({
        item,
        recurrence: judgeRecurrence(item, { periodStartMs, widerItems: wider?.items ?? [] }),
      })),
    [filteredItems, shownRows, periodStartMs, wider],
  );

  const countOf = (kind: ErrorKind): number => current?.summary.by_kind[kind]?.count ?? 0;
  const priorCountOf = (kind: ErrorKind): number | null => {
    if (!wider) return null;
    return Math.max((wider.summary.by_kind[kind]?.count ?? 0) - countOf(kind), 0);
  };
  const total = current?.summary.total ?? 0;
  const truncated = current ? total > current.items.length : false;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header title="AI 응답 오류" />
      <div style={{ padding: "24px 16px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>⚠️ AI 응답 오류</h2>
            <p style={{ ...mutedText, margin: "4px 0 0" }}>오류 사전을 기준으로 응답 오류의 건수·원인·재발 여부를 봅니다.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={days === p}
                onClick={() => {
                  setDays(p);
                  setKindFilter("all");
                }}
                style={{ ...buttonStyle, ...(days === p ? activeButtonStyle : {}) }}
              >
                최근 {p}일
              </button>
            ))}
            <button type="button" onClick={() => void load()} disabled={loading} style={buttonStyle}>
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
        </div>

        {failure && <FailurePanel failure={failure} onRetry={() => void load()} />}

        {!failure && loading && !current && (
          <div style={{ ...cardStyle, textAlign: "center", ...mutedText, padding: 32 }}>불러오는 중…</div>
        )}

        {!failure && current && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-pressed={kindFilter === "all"}
                onClick={() => setKindFilter("all")}
                style={{ ...cardStyle, flex: "1 1 140px", minWidth: 140, textAlign: "center", cursor: "pointer", outline: kindFilter === "all" ? "2px solid var(--accent)" : "none" }}
              >
                <div style={mutedText}>전체</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>
                  {total.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
                </div>
                <div style={mutedText}>최근 {days}일</div>
              </button>
              {KIND_ORDER.map((k) => {
                const prior = priorCountOf(k);
                const n = countOf(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kindFilter === k}
                    onClick={() => setKindFilter(k)}
                    title={KIND_HELP[k]}
                    style={{ ...cardStyle, flex: "1 1 140px", minWidth: 140, textAlign: "center", cursor: "pointer", boxShadow: `inset 0 3px 0 ${KIND_COLOR[k]}`, outline: kindFilter === k ? "2px solid var(--accent)" : "none" }}
                  >
                    <div style={mutedText}>{KIND_LABEL[k]}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: n > 0 && k !== "interrupted" ? KIND_COLOR[k] : "var(--text-primary)" }}>
                      {n.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
                    </div>
                    <div style={mutedText}>{prior === null ? "직전 기간 비교 불가" : `직전 ${days}일 ${prior.toLocaleString()}건`}</div>
                  </button>
                );
              })}
            </div>

            {truncated && (
              <div role="note" style={{ ...cardStyle, border: "1px solid var(--warning)", marginBottom: 16, fontSize: 12, color: "var(--text-primary)" }}>
                기간 안에 {total.toLocaleString()}건이 있지만 최근 {current.items.length.toLocaleString()}건만 불러왔습니다. 일별 그래프와 목록은 이 범위 기준이고, 위 카드의 건수는 전체 기준입니다.
              </div>
            )}

            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
                일별 건수{kindFilter === "all" ? "" : ` · ${KIND_LABEL[kindFilter]}`}
              </h3>
              {filteredItems.length === 0 ? (
                <div style={{ ...mutedText, padding: 20, textAlign: "center" }}>이 기간에 기록된 AI 응답 오류가 없습니다.</div>
              ) : (
                <DailyChart items={filteredItems} days={days} />
              )}
            </div>

            <div style={{ ...cardStyle, overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
                상세 목록 <span style={mutedText}>({filteredItems.length.toLocaleString()}건)</span>
              </h3>
              {filteredItems.length === 0 ? (
                <div style={{ ...mutedText, padding: 20, textAlign: "center" }}>표시할 항목이 없습니다.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                      {["시각(KST)", "구분", "모델", "내용", "오류 사전", "재발", "세션"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ item, recurrence }) => {
                      const detail = describeDetail(item);
                      return (
                        <tr key={`${item.source_table}:${item.source_id}:${item.kind}`} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{formatKst(item.occurred_at)}</td>
                          <td style={{ padding: "8px" }}><KindBadge kind={item.kind} /></td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{item.model_used || "-"}</td>
                          <td style={{ padding: "8px", maxWidth: 480, color: "var(--text-primary)" }}>
                            <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} title={item.summary || ""}>
                              {item.summary || "-"}
                            </div>
                            {detail && <div style={{ ...mutedText, marginTop: 2 }}>{detail}</div>}
                          </td>
                          <td style={{ padding: "8px" }}><ErrorBookCell keyName={item.error_book_key} /></td>
                          <td style={{ padding: "8px" }}><RecurrenceBadge r={recurrence} /></td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            {item.session_id ? (
                              <a href={`/chat#${item.session_id}`} style={{ color: "var(--accent)" }}>세션 열기</a>
                            ) : (
                              <span style={mutedText}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {filteredItems.length > shownRows && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button type="button" style={buttonStyle} onClick={() => setShownRows((n) => n + PAGE_ROWS)}>
                    더 보기 ({(filteredItems.length - shownRows).toLocaleString()}건 남음)
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
