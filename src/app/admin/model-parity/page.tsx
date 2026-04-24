"use client";

import { useCallback, useEffect, useState } from "react";

import Header from "@/components/Header";
import { api } from "@/lib/api";

type Tab = "models" | "routing" | "daily";

interface ModelParitySummary {
  window_days: number;
  window_start: string;
  window_end: string;
  tracked_models: number;
  tracked_intents: number;
  tracked_messages: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
}

interface ModelStat {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_tokens_per_call: number;
  distinct_intents: number;
  configured_intents: number;
}

interface RoutingModelBucket {
  model: string;
  count: number;
  tool_enabled: number;
  thinking_enabled: number;
  gemini_direct_enabled: number;
  intents: string[];
}

interface RoutingRouteBucket {
  model: string;
  tools: boolean;
  group: string;
  thinking: boolean;
  gemini_direct: string;
  count: number;
  intents: string[];
}

interface RoutingSummary {
  source: string;
  total_intents: number;
  tool_enabled_intents: number;
  thinking_enabled_intents: number;
  gemini_direct_intents: number;
  by_model: RoutingModelBucket[];
  by_route: RoutingRouteBucket[];
}

interface DailyModelStat {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface DailyStat {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  models: DailyModelStat[];
}

interface ModelParityData {
  summary: ModelParitySummary;
  routing: RoutingSummary;
  models: ModelStat[];
  daily: DailyStat[];
}

interface IntentMapEntry {
  model: string;
  tools: boolean;
  group: string;
  thinking: boolean;
  gemini_direct: string;
  naver_type?: string;
}

interface IntentMapResponse {
  source: string;
  count: number;
  intent_map: Record<string, IntentMapEntry>;
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function formatDateLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function boolLabel(value: boolean | undefined): string {
  return value ? "yes" : "no";
}

export default function ModelParityPage() {
  const [tab, setTab] = useState<Tab>("models");
  const [data, setData] = useState<ModelParityData | null>(null);
  const [intentMap, setIntentMap] = useState<IntentMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [parityRes, intentMapRes] = await Promise.all([
        api.getModelParity(),
        api.getModelParityIntentMap(),
      ]);
      setData(parityRes as ModelParityData);
      setIntentMap(intentMapRes as IntentMapResponse);
    } catch (err) {
      console.error("model parity load failed", err);
      setError(err instanceof Error ? err.message : "모델 패리티 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "models", label: "모델 현황", icon: "📊" },
    { key: "routing", label: "인텐트 라우팅", icon: "🧭" },
    { key: "daily", label: "일별 추이", icon: "📈" },
  ];

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "16px",
  };

  const btnStyle = (active?: boolean) => ({
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer" as const,
    fontWeight: active ? 600 : 400,
    background: active ? "var(--accent)" : "var(--bg-hover)",
    color: active ? "#fff" : "var(--text-primary)",
  });

  if (loading) {
    return (
      <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
        <Header title="모델 패리티" />
        <div className="flex-1 p-3 md:p-6 overflow-auto">
          <div style={{ ...cardStyle, color: "var(--text-secondary)", textAlign: "center" }}>로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!data || !intentMap) {
    return (
      <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
        <Header title="모델 패리티" />
        <div className="flex-1 p-3 md:p-6 overflow-auto">
          <div style={{ ...cardStyle, color: "var(--danger)" }}>
            {error || "모델 패리티 데이터를 표시할 수 없습니다."}
          </div>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: "Tracked Models", value: data.summary.tracked_models, tone: "var(--accent)" },
    { label: "Routed Intents", value: data.summary.tracked_intents, tone: "var(--success)" },
    { label: "Calls (7d)", value: data.summary.total_calls, tone: "var(--warning)" },
    { label: "Total Tokens", value: data.summary.total_tokens, tone: "var(--text-primary)" },
    { label: "Thinking", value: data.routing.thinking_enabled_intents, tone: "var(--accent)" },
    { label: "Gemini Direct", value: data.routing.gemini_direct_intents, tone: "var(--success)" },
  ];

  const intentMapEntries = Object.entries(intentMap.intent_map || {});

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="모델 패리티" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex gap-2 mb-4 flex-wrap">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} style={btnStyle(tab === item.key)}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {error ? (
          <div style={{ ...cardStyle, color: "var(--danger)", marginBottom: "16px" }}>{error}</div>
        ) : null}

        {tab === "models" && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {summaryCards.map((item) => (
                <div key={item.label} style={{ ...cardStyle, padding: "14px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>
                    {item.label}
                  </div>
                  <div style={{ color: item.tone, fontWeight: 700, fontSize: "26px" }}>
                    {formatNumber(item.value)}
                  </div>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: "12px" }}>
                <div>
                  <h3 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>
                    최근 {data.summary.window_days}일 모델 호출 현황
                  </h3>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    source: {data.routing.source}
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "var(--bg-hover)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                  }}
                >
                  messages: {formatNumber(data.summary.tracked_messages)}
                </div>
              </div>

              {data.models.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["모델", "호출", "입력", "출력", "총합", "평균/호출", "설정 인텐트", "실사용 인텐트"].map((header) => (
                          <th
                            key={header}
                            style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-secondary)", fontSize: "12px" }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((model) => (
                        <tr key={model.model} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", color: "var(--text-primary)", fontWeight: 600 }}>{model.model}</td>
                          <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 600 }}>{formatNumber(model.calls)}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{formatNumber(model.input_tokens)}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{formatNumber(model.output_tokens)}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text-primary)" }}>{formatNumber(model.total_tokens)}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{formatNumber(model.avg_tokens_per_call)}</td>
                          <td style={{ padding: "10px 8px", color: "var(--success)", fontWeight: 600 }}>
                            {formatNumber(model.configured_intents)}
                          </td>
                          <td style={{ padding: "10px 8px", color: "var(--warning)", fontWeight: 600 }}>
                            {formatNumber(model.distinct_intents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  최근 7일 기준 집계 가능한 모델 호출 로그가 없습니다.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "routing" && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {data.routing.by_model.map((bucket) => (
                <div key={bucket.model} style={{ ...cardStyle, padding: "14px" }}>
                  <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: "4px" }}>{bucket.model}</div>
                  <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "24px", marginBottom: "8px" }}>
                    {formatNumber(bucket.count)}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1.7 }}>
                    tools {formatNumber(bucket.tool_enabled)} / thinking {formatNumber(bucket.thinking_enabled)} / direct{" "}
                    {formatNumber(bucket.gemini_direct_enabled)}
                  </div>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h3 style={{ color: "var(--text-primary)", marginBottom: "12px", fontSize: "16px", fontWeight: 600 }}>
                라우팅 버킷
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["모델", "tools", "group", "thinking", "gemini_direct", "인텐트 수", "인텐트 목록"].map((header) => (
                        <th
                          key={header}
                          style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-secondary)", fontSize: "12px" }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.routing.by_route.map((bucket, index) => (
                      <tr key={`${bucket.model}-${bucket.group}-${bucket.gemini_direct}-${index}`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 8px", color: "var(--text-primary)", fontWeight: 600 }}>{bucket.model}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{boolLabel(bucket.tools)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{bucket.group || "-"}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{boolLabel(bucket.thinking)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{bucket.gemini_direct || "-"}</td>
                        <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 600 }}>{formatNumber(bucket.count)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1.6 }}>
                          {bucket.intents.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={cardStyle}>
              <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: "12px" }}>
                <h3 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600 }}>INTENT_MAP 덤프</h3>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                  {intentMap.source} / {formatNumber(intentMap.count)} intents
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["intent", "model", "tools", "group", "thinking", "gemini_direct"].map((header) => (
                        <th
                          key={header}
                          style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-secondary)", fontSize: "12px" }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {intentMapEntries.map(([intent, cfg]) => (
                      <tr key={intent} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 8px", color: "var(--text-primary)", fontWeight: 600 }}>{intent}</td>
                        <td style={{ padding: "10px 8px", color: "var(--accent)" }}>{cfg.model}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{boolLabel(cfg.tools)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{cfg.group || "-"}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{boolLabel(cfg.thinking)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{cfg.gemini_direct || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "daily" && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {data.daily.map((day) => (
                <div key={day.date} style={{ ...cardStyle, padding: "14px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginBottom: "4px" }}>
                    {formatDateLabel(day.date)}
                  </div>
                  <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "24px", marginBottom: "6px" }}>
                    {formatNumber(day.calls)}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1.7 }}>
                    input {formatNumber(day.input_tokens)} / output {formatNumber(day.output_tokens)}
                  </div>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h3 style={{ color: "var(--text-primary)", marginBottom: "12px", fontSize: "16px", fontWeight: 600 }}>
                일별 모델 추이
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["일자", "호출", "입력", "출력", "총합", "모델 분포"].map((header) => (
                        <th
                          key={header}
                          style={{ padding: "10px 8px", textAlign: "left", color: "var(--text-secondary)", fontSize: "12px" }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr key={day.date} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 8px", color: "var(--text-primary)", fontWeight: 600 }}>{day.date}</td>
                        <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 600 }}>{formatNumber(day.calls)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{formatNumber(day.input_tokens)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)" }}>{formatNumber(day.output_tokens)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-primary)" }}>{formatNumber(day.total_tokens)}</td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1.6 }}>
                          {day.models.length > 0
                            ? day.models.map((model) => `${model.model} (${formatNumber(model.calls)})`).join(", ")
                            : "기록 없음"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
