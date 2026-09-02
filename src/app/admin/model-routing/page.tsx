"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Header from "@/components/Header";
import { api } from "@/lib/api";

type RouteKey = string;

interface RoutingPreference {
  route_key: RouteKey;
  provider: string;
  model_id: string;
  display_name?: string;
  execution_model_id?: string | null;
  family?: string | null;
  category?: string | null;
  display_order: number;
  is_enabled: boolean;
  is_default: boolean;
  is_active?: boolean;
  is_selectable?: boolean;
  is_executable?: boolean;
  availability: string;
  verification_status?: string | null;
  notes?: string;
  updated_at?: string | null;
  updated_by?: string | null;
}

interface RoutingPreferencesResponse {
  preferences?: RoutingPreference[];
  blocked_counts?: Record<string, number>;
  route_keys?: string[];
  route_groups?: Record<string, string>;
  fallback_chain?: RoutingPreference[];
  error_models?: ErrorModel[];
}

interface ErrorModel {
  provider: string;
  model_id: string;
  display_name?: string;
  family?: string | null;
  category?: string | null;
  is_active: boolean;
  is_selectable?: boolean;
  is_executable: boolean;
  verification_status?: string | null;
  note?: string;
  updated_at?: string | null;
  last_verified_at?: string | null;
}

const ROUTE_META: Record<string, { label: string; desc: string; group: string }> = {
  llm: { label: "채팅 LLM", desc: "채팅 기본 모델과 장애 시 폴백 순서", group: "텍스트" },
  background_llm: { label: "배경 LLM", desc: "압축·메모리·평가 등 백그라운드 작업", group: "텍스트" },
  runner_llm: { label: "Runner LLM", desc: "Pipeline Runner 모델 후보", group: "러너" },
  search: { label: "검색", desc: "SearXNG/Naver/Kakao/grounding 검색", group: "리서치" },
  deep_research: { label: "딥리서치", desc: "자체 검색·크롤링·종합 보고서", group: "리서치" },
  url_analyze: { label: "URL 분석", desc: "Jina/Crawl4AI 원문 추출과 요약", group: "리서치" },
  fact_check: { label: "팩트체크", desc: "검색 근거 교차검증", group: "리서치" },
  image_analyze: { label: "이미지 분석", desc: "첨부 이미지·화면 분석", group: "멀티모달" },
  video_analyze: { label: "영상 분석", desc: "영상 프레임 추출·분석", group: "멀티모달" },
  visual_qa: { label: "Visual QA", desc: "화면/스크린샷 품질 검증", group: "멀티모달" },
  embedding: { label: "임베딩", desc: "메시지·기억 벡터화", group: "메모리" },
  semantic_search: { label: "시맨틱 검색", desc: "pgvector 유사도 검색", group: "메모리" },
  image: { label: "이미지 생성", desc: "generate_image 기본 라우팅", group: "미디어" },
  edit_image: { label: "이미지 편집", desc: "edit_image 기본 라우팅", group: "미디어" },
  video: { label: "동영상 생성", desc: "generate_video job 라우팅", group: "미디어" },
  music: { label: "음악", desc: "generate_music 기본 라우팅", group: "미디어" },
  audio: { label: "음성", desc: "TTS/audio 기본 라우팅", group: "미디어" },
  code_exec: { label: "코드 실행", desc: "Codex/CLI 기반 코드 실행", group: "도구" },
};

const ROUTE_ORDER = Object.keys(ROUTE_META);

function availabilityStyle(value: string): { background: string; color: string; border: string } {
  if (value === "available") {
    return { background: "rgba(34,197,94,0.12)", color: "var(--success)", border: "1px solid rgba(34,197,94,0.22)" };
  }
  if (value === "disabled") {
    return { background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)", border: "1px solid rgba(148,163,184,0.22)" };
  }
  if (value === "adapter_unavailable" || value === "review_required") {
    return { background: "rgba(245,158,11,0.14)", color: "#d97706", border: "1px solid rgba(245,158,11,0.26)" };
  }
  return { background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.22)" };
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function hasRoutingIssue(item: RoutingPreference): boolean {
  if (!item.is_enabled) return false;
  return item.availability !== "available";
}

function hasModelIssue(item: ErrorModel): boolean {
  if (!item.is_active || !item.is_executable) return true;
  const status = String(item.verification_status || "").trim().toLowerCase();
  return Boolean(status && !["verified", "ok"].includes(status));
}

export default function ModelRoutingPage() {
  const [items, setItems] = useState<RoutingPreference[]>([]);
  const [blockedCounts, setBlockedCounts] = useState<Record<string, number>>({});
  const [fallbackChain, setFallbackChain] = useState<RoutingPreference[]>([]);
  const [errorModels, setErrorModels] = useState<ErrorModel[]>([]);
  const [routeKeys, setRouteKeys] = useState<RouteKey[]>(ROUTE_ORDER);
  const [activeRoute, setActiveRoute] = useState<RouteKey>("llm");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setMessage("");
    api.getModelRoutingPreferences()
      .then((res: RoutingPreferencesResponse) => {
        setItems(Array.isArray(res.preferences) ? res.preferences : []);
        setBlockedCounts(res.blocked_counts || {});
        setFallbackChain(Array.isArray(res.fallback_chain) ? res.fallback_chain : []);
        setErrorModels(Array.isArray(res.error_models) ? res.error_models.filter(hasModelIssue) : []);
        const preferences = Array.isArray(res.preferences) ? res.preferences : [];
        const apiRoutes = Array.isArray(res.route_keys) ? res.route_keys : [];
        const itemRoutes = Array.from(new Set(preferences.map((item) => item.route_key)));
        const nextRoutes = Array.from(new Set([...ROUTE_ORDER, ...apiRoutes, ...itemRoutes]));
        setRouteKeys(nextRoutes);
        setActiveRoute((prev) => nextRoutes.includes(prev) ? prev : (nextRoutes[0] || "llm"));
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "모델 라우팅 설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    return routeKeys.reduce((acc, key) => {
      acc[key] = items.filter((item) => item.route_key === key);
      return acc;
    }, {} as Record<RouteKey, RoutingPreference[]>);
  }, [items, routeKeys]);

  const visibleItems = useMemo(() => grouped[activeRoute] || [], [activeRoute, grouped]);
  const defaultItem = visibleItems.find((item) => item.is_default);
  const routeStats = useMemo(() => {
    const disabled = visibleItems.filter((item) => !item.is_enabled || item.availability === "disabled").length;
    const available = visibleItems.filter((item) => item.availability === "available").length;
    const blocked = visibleItems.filter(hasRoutingIssue).length;
    return {
      available,
      disabled,
      blocked,
    };
  }, [visibleItems]);
  const visibleIssueCount = blockedCounts[activeRoute] || routeStats.blocked;
  const criticalErrorCount = useMemo(() => {
    return errorModels.filter((item) => {
      const status = String(item.verification_status || "").toLowerCase();
      return status.includes("billing") || status.includes("auth") || status.includes("rate");
    }).length;
  }, [errorModels]);

  const patchItem = (target: RoutingPreference, patch: Partial<RoutingPreference>) => {
    setItems((prev) => prev.map((item) => (
      item.route_key === target.route_key && item.provider === target.provider && item.model_id === target.model_id
        ? { ...item, ...patch }
        : item
    )));
  };

  const setDefault = (target: RoutingPreference) => {
    setItems((prev) => prev.map((item) => (
      item.route_key === target.route_key
        ? { ...item, is_default: item.provider === target.provider && item.model_id === target.model_id }
        : item
    )));
  };

  const save = async () => {
    const missingDefault = routeKeys.find((key) => (
      items.some((item) => item.route_key === key)
      && !items.some((item) => item.route_key === key && item.is_default)
    ));
    if (missingDefault) {
      setMessage(`${ROUTE_META[missingDefault]?.label || missingDefault} 기본 모델을 선택하세요.`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const preferences = items.map((item) => ({
        route_key: item.route_key,
        provider: item.provider,
        model_id: item.model_id,
        display_order: item.display_order,
        is_enabled: item.is_enabled,
        is_default: item.is_default,
        notes: item.notes || "",
      }));
      const res = await api.updateModelRoutingPreferences(preferences) as RoutingPreferencesResponse;
      setItems(Array.isArray(res.preferences) ? res.preferences : items);
      setMessage("저장 완료");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Model Routing" />
      <div className="flex-1 p-3 md:p-6 overflow-auto space-y-4">
        <section className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>DB 모델 라우팅 설정</h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                explicit 요청값 다음으로 적용되는 기본 모델과 채팅 LLM 폴백 순서를 설정합니다.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={load}
                className="px-3 py-2 rounded-lg text-xs"
                style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                새로고침
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="px-4 py-2 rounded-lg text-xs font-bold"
                style={{ background: "var(--accent)", color: "#fff", opacity: saving || loading ? 0.6 : 1 }}
              >
                {saving ? "저장 중..." : "설정 저장"}
              </button>
            </div>
          </div>
          {message && (
            <p className="text-xs mt-3 px-3 py-2 rounded" style={{
              background: message.includes("실패") || message.includes("API error") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
              color: message.includes("실패") || message.includes("API error") ? "var(--danger)" : "var(--success)",
            }}>
              {message}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {routeKeys.map((key) => {
            const meta = ROUTE_META[key] || { label: key, desc: "DB 라우팅 설정", group: "기타" };
            const routeItems = grouped[key] || [];
            const active = activeRoute === key;
            const routeDefault = routeItems.find((item) => item.is_default);
            return (
              <button
                key={key}
                onClick={() => setActiveRoute(key)}
                className="text-left rounded-xl p-4"
                style={{
                  background: active ? "rgba(59,130,246,0.12)" : "var(--bg-card)",
                  border: active ? "1px solid rgba(59,130,246,0.35)" : "1px solid var(--border)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{meta.label}</span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {routeItems.length}개
                    {(blockedCounts[key] || 0) > 0 ? ` · 오류 ${blockedCounts[key]}` : ""}
                  </span>
                </div>
                <p className="text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>{meta.group}</p>
                <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>{meta.desc}</p>
                <p className="text-xs font-mono truncate" style={{ color: "var(--accent)" }}>
                  {routeDefault ? `${routeDefault.provider}:${routeDefault.model_id}` : "default 없음"}
                </p>
              </button>
            );
          })}
        </section>

        {activeRoute === "llm" && (
          <section className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>채팅 LLM 폴백 순서</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  기본 모델 실패 또는 런타임 미가용 시 enabled 모델을 순서값 기준으로 시도합니다.
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                후보 {fallbackChain.length}개
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {fallbackChain.length === 0 ? (
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>설정된 LLM 후보가 없습니다.</span>
              ) : fallbackChain.map((item, idx) => {
                const issue = hasRoutingIssue(item);
                return (
                  <span
                    key={`${item.provider}:${item.model_id}`}
                    className="text-xs px-2 py-1 rounded font-mono"
                    style={{
                      background: issue ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                      color: issue ? "var(--danger)" : "var(--success)",
                      border: issue ? "1px solid rgba(239,68,68,0.22)" : "1px solid rgba(34,197,94,0.22)",
                    }}
                  >
                    {idx + 1}. {item.provider}:{item.model_id}
                    {issue ? ` · ${item.availability}` : ""}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>오류 모델</h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                비활성, 실행 불가, 인증/과금/검수 필요 상태인 모델입니다.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>전체 {errorModels.length}</span>
              <span>즉시 조치 {criticalErrorCount}</span>
            </div>
          </div>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
          ) : errorModels.length === 0 ? (
            <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>오류 모델이 없습니다.</p>
          ) : (
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                  <tr>
                    {["Provider", "Model", "Status", "Runtime", "Note", "Verified"].map((header) => (
                      <th key={header} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {errorModels.slice(0, 80).map((item) => {
                    const tone = availabilityStyle(item.verification_status || "not_configured");
                    return (
                      <tr key={`${item.provider}:${item.model_id}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                            {item.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[260px]">
                          <p className="font-mono text-xs break-all" style={{ color: "var(--text-primary)" }}>{item.model_id}</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{item.display_name || item.model_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] px-2 py-1 rounded whitespace-nowrap" style={tone}>
                            {item.verification_status || "unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {item.is_active ? "active" : "inactive"} · {item.is_executable ? "executable" : "not executable"}
                        </td>
                        <td className="px-4 py-3 min-w-[260px] text-xs" style={{ color: "var(--text-secondary)" }}>
                          {item.note || "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
                          {formatDateTime(item.last_verified_at || item.updated_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {ROUTE_META[activeRoute]?.label || activeRoute} 모델
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                현재 기본값: {defaultItem ? `${defaultItem.provider}:${defaultItem.model_id}` : "-"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>available {routeStats.available}</span>
              <span>blocked {visibleIssueCount}</span>
              <span>disabled {routeStats.disabled}</span>
            </div>
          </div>

          {loading ? (
            <p className="text-sm p-5" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm p-5" style={{ color: "var(--text-secondary)" }}>등록된 모델이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                  <tr>
                    {["기본", "상태", "순서", "Provider", "Model", "Availability", "Registry", "비고", "Updated"].map((header) => (
                      <th key={header} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const tone = availabilityStyle(item.availability);
                    return (
                      <tr key={`${item.route_key}:${item.provider}:${item.model_id}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3">
                          <input
                            type="radio"
                            checked={item.is_default}
                            onChange={() => setDefault(item)}
                            aria-label={`${item.model_id} 기본 모델`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                            <input
                              type="checkbox"
                              checked={item.is_enabled}
                              onChange={(event) => patchItem(item, { is_enabled: event.target.checked })}
                            />
                            enabled
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            value={item.display_order}
                            onChange={(event) => patchItem(item, { display_order: Number(event.target.value || 0) })}
                            className="w-20 rounded px-2 py-1 text-xs"
                            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            aria-label={`${item.model_id} 라우팅 순서`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                            {item.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[260px]">
                          <p className="font-mono text-xs break-all" style={{ color: "var(--text-primary)" }}>{item.model_id}</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                            {item.display_name || item.model_id}
                            {item.execution_model_id && item.execution_model_id !== item.model_id ? ` -> ${item.execution_model_id}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] px-2 py-1 rounded whitespace-nowrap" style={tone}>
                            {item.availability}
                          </span>
                          {item.verification_status && (
                            <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{item.verification_status}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 min-w-[180px]">
                          <p className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                            {item.is_active ? "active" : "inactive"} · {item.is_executable ? "executable" : "not executable"}
                          </p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                            {item.is_selectable === false ? "not selectable" : "selectable"} · {item.category || item.family || "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 min-w-[320px]">
                          <textarea
                            value={item.notes || ""}
                            onChange={(event) => patchItem(item, { notes: event.target.value })}
                            rows={2}
                            className="w-full rounded px-2 py-1 text-xs"
                            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
                          <p>{formatDateTime(item.updated_at)}</p>
                          <p>{item.updated_by || "-"}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
