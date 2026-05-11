"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import {
  DESIGN_MODIFICATION_CATEGORIES,
  DESIGN_MODIFICATION_STATUS_LABELS,
  EMPTY_DESIGN_MODIFICATION_DRAFT,
  createDesignModificationClassification,
  parseMultiValueInput,
} from "@/lib/designModificationRequests";
import type {
  DesignModificationCategory,
  DesignModificationRequest,
  DesignModificationRequestDraft,
  DesignModificationRequestSource,
} from "@/types";

type CategoryFilter = "all" | DesignModificationCategory;

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  padding: "11px 12px",
  fontSize: 14,
  outline: "none",
};

const bannerStyles: Record<"warning" | "error" | "info", CSSProperties> = {
  warning: {
    background: "rgba(245, 158, 11, 0.12)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    color: "#fcd34d",
  },
  error: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.35)",
    color: "#fca5a5",
  },
  info: {
    background: "rgba(59, 130, 246, 0.12)",
    border: "1px solid rgba(59, 130, 246, 0.35)",
    color: "#93c5fd",
  },
};

function categoryLabel(category: DesignModificationCategory): string {
  return DESIGN_MODIFICATION_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTextBlock(items: string[]): string {
  return items.join("\n");
}

function ChipList({
  items,
  emptyLabel,
}: {
  items: string[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="px-2.5 py-1 rounded-full text-xs"
          style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function CategoryBadge({ category }: { category: DesignModificationCategory }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: "rgba(59, 130, 246, 0.16)", color: "#93c5fd" }}
    >
      {categoryLabel(category)}
    </span>
  );
}

function StatusBadge({ status }: { status: DesignModificationRequest["status"] }) {
  const color =
    status === "implemented"
      ? "#86efac"
      : status === "reviewing"
        ? "#fcd34d"
        : status === "submitted"
          ? "#93c5fd"
          : "var(--text-secondary)";

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: "var(--bg-hover)", color }}
    >
      {DESIGN_MODIFICATION_STATUS_LABELS[status]}
    </span>
  );
}

export default function DesignModificationsPage() {
  const [requests, setRequests] = useState<DesignModificationRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<DesignModificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [surfaceMessage, setSurfaceMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DesignModificationRequestSource>("api");
  const [apiAvailable, setApiAvailable] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [draft, setDraft] = useState<DesignModificationRequestDraft>({
    ...EMPTY_DESIGN_MODIFICATION_DRAFT,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const draftClassification = createDesignModificationClassification(draft);
  const filteredRequests =
    filter === "all"
      ? requests
      : requests.filter((request) => request.category === filter);

  async function loadRequests(preferredId?: string | null): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDesignModificationRequests();
      setRequests(response.items);
      setApiAvailable(response.api_available);
      setDataSource(response.source);
      setSurfaceMessage(response.message ?? null);

      const nextSelectedId =
        preferredId && response.items.some((item) => item.id === preferredId)
          ? preferredId
          : response.items[0]?.id ?? null;

      setSelectedId(nextSelectedId);
      setSelectedRequest(response.items.find((item) => item.id === nextSelectedId) ?? null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedRequest(null);
      return;
    }

    const listItem = requests.find((item) => item.id === selectedId) ?? null;
    if (listItem) {
      setSelectedRequest(listItem);
    }
  }, [selectedId, requests]);

  useEffect(() => {
    if (!selectedId) {
      setDetailError(null);
      return;
    }

    let cancelled = false;

    async function loadDetail(): Promise<void> {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const response = await api.getDesignModificationRequest(selectedId);
        if (cancelled) return;
        setApiAvailable(response.api_available);
        setDataSource(response.source);
        if (response.message) {
          setSurfaceMessage(response.message);
        }
        const detailItem = response.item;
        if (detailItem) {
          setSelectedRequest(detailItem);
          setRequests((current) => {
            const next = current.map((item) => (item.id === detailItem.id ? detailItem : item));
            return next.some((item) => item.id === detailItem.id)
              ? next
              : [detailItem, ...next];
          });
        }
      } catch (fetchError) {
        if (cancelled) return;
        setDetailError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function updateDraft<K extends keyof DesignModificationRequestDraft>(
    key: K,
    value: DesignModificationRequestDraft[K]
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDraft(clearFeedback = true): void {
    setDraft({
      ...EMPTY_DESIGN_MODIFICATION_DRAFT,
    });
    if (clearFeedback) {
      setSaveError(null);
      setSaveMessage(null);
    }
  }

  async function handleSubmit(): Promise<void> {
    const normalizedDraft: DesignModificationRequestDraft = {
      ...draft,
      title: draft.title.trim(),
      category: draft.category ?? draftClassification.suggested_category,
      status: "submitted",
      current_state: draft.current_state.trim(),
      target_state: draft.target_state.trim(),
      requester: (draft.requester ?? "dashboard").trim() || "dashboard",
      notes: draft.notes?.trim() ?? "",
      locked_elements: draft.locked_elements,
      affected_routes: draft.affected_routes,
      affected_components: draft.affected_components,
      acceptance_checks: draft.acceptance_checks,
    };

    if (!normalizedDraft.title || !normalizedDraft.current_state || !normalizedDraft.target_state) {
      setSaveError("제목, 현재 상태, 목표 상태는 필수입니다.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await api.createDesignModificationRequest(normalizedDraft);
      setApiAvailable(response.api_available);
      setDataSource(response.source);
      setSurfaceMessage(response.message ?? null);
      resetDraft(false);
      setSaveMessage(
        response.message ??
          (response.source === "api"
            ? "디자인 수정 요청을 저장했습니다."
            : "디자인 수정 요청을 로컬 draft로 저장했습니다.")
      );
      await loadRequests(response.item.id);
    } catch (submitError) {
      setSaveError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="Design Modification Requests" />
      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              디자인 수정 요청 카드
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              요청 작성, 분류, 영향 범위 확인을 한 화면에서 처리합니다.
            </p>
          </div>
          <Link href="/" className="text-xs" style={{ color: "var(--accent)" }}>
            ← 대시보드
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl p-4" style={cardStyle}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              요청 수
            </p>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {loading ? "—" : requests.length}
            </p>
          </div>
          <div className="rounded-xl p-4" style={cardStyle}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              데이터 소스
            </p>
            <p className="text-2xl font-bold" style={{ color: dataSource === "api" ? "var(--accent)" : "var(--warning)" }}>
              {dataSource === "api" ? "API" : "Local"}
            </p>
          </div>
          <div className="rounded-xl p-4" style={cardStyle}>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              Classifier 기본 추천
            </p>
            <p className="text-2xl font-bold" style={{ color: "var(--success)" }}>
              {categoryLabel(draftClassification.suggested_category)}
            </p>
          </div>
        </div>

        {!apiAvailable && surfaceMessage && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4" style={bannerStyles.warning}>
            {surfaceMessage}
          </div>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4" style={bannerStyles.error}>
            목록 API 오류: {error}
          </div>
        )}

        {saveMessage && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4" style={bannerStyles.info}>
            {saveMessage}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4">
          <section className="space-y-4">
            <div className="rounded-xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  요청 목록
                </h2>
                <button
                  type="button"
                  onClick={() => resetDraft()}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                >
                  새 요청
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="px-2.5 py-1 rounded-full text-xs"
                  style={filter === "all"
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                >
                  전체 ({requests.length})
                </button>
                {DESIGN_MODIFICATION_CATEGORIES.map((category) => {
                  const count = requests.filter((request) => request.category === category.value).length;
                  return (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setFilter(category.value)}
                      className="px-2.5 py-1 rounded-full text-xs"
                      style={filter === category.value
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                    >
                      {category.label} ({count})
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <div className="text-sm py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                  로딩 중...
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                  {filter === "all"
                    ? "아직 디자인 수정 요청이 없습니다. 우측 폼에서 첫 요청을 작성하세요."
                    : "선택한 카테고리의 요청이 없습니다."}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                      className="w-full text-left rounded-xl p-4 transition-colors"
                      style={selectedId === request.id
                        ? {
                            background: "rgba(59, 130, 246, 0.12)",
                            border: "1px solid rgba(59, 130, 246, 0.5)",
                          }
                        : {
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border)",
                          }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                            {request.title}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {request.summary}
                          </p>
                        </div>
                        <CategoryBadge category={request.category} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span>
                          routes {request.affected_routes.length} · components {request.affected_components.length}
                        </span>
                        <span>{formatDateTime(request.updated_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl p-4 md:p-5" style={cardStyle}>
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    선택 요청 상세
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    현재 상태, 목표 상태, 영향 범위를 확인합니다.
                  </p>
                </div>
                {selectedRequest && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <CategoryBadge category={selectedRequest.category} />
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                )}
              </div>

              {detailError && (
                <div className="rounded-xl px-4 py-3 text-sm mb-4" style={bannerStyles.error}>
                  상세 API 오류: {detailError}
                </div>
              )}

              {detailLoading && (
                <div className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  상세 정보를 불러오는 중입니다...
                </div>
              )}

              {!selectedRequest ? (
                <div className="rounded-xl p-5 text-sm" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                  목록에서 요청을 선택하면 상세 카드가 표시됩니다.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div>
                        <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                          {selectedRequest.title}
                        </h3>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {selectedRequest.summary}
                        </p>
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {selectedRequest.source === "api" ? "server synced" : "local draft"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                          현재 상태
                        </p>
                        <p style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                          {selectedRequest.current_state || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                          목표 상태
                        </p>
                        <p style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                          {selectedRequest.target_state || "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                        Locked Elements
                      </p>
                      <ChipList items={selectedRequest.locked_elements} emptyLabel="고정 요소 없음" />
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                        Acceptance Checks
                      </p>
                      <ChipList items={selectedRequest.acceptance_checks} emptyLabel="수락 기준이 비어 있습니다." />
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                        Affected Routes
                      </p>
                      <ChipList items={selectedRequest.affected_routes} emptyLabel="영향 라우트 없음" />
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                        Affected Components
                      </p>
                      <ChipList items={selectedRequest.affected_components} emptyLabel="영향 컴포넌트 없음" />
                    </div>
                  </div>

                  <div className="rounded-xl p-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        Classifier Snapshot
                      </p>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        confidence {Math.round(selectedRequest.classification.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedRequest.classification.scores.slice(0, 3).map((score) => (
                        <span
                          key={score.category}
                          className="px-2.5 py-1 rounded-full text-xs"
                          style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                        >
                          {categoryLabel(score.category)} · {score.score}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl p-4 md:p-5" style={cardStyle}>
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    새 디자인 수정 요청
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    요청 초안을 작성하면 classifier가 적절한 카테고리를 추천합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: saving ? "var(--bg-hover)" : "var(--accent)",
                    color: "#fff",
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "저장 중..." : "요청 저장"}
                </button>
              </div>

              {saveError && (
                <div className="rounded-xl px-4 py-3 text-sm mb-4" style={bannerStyles.error}>
                  저장 오류: {saveError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    제목
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft("title", event.target.value)}
                    placeholder="예: 대시보드 카드 간격 조정"
                    style={fieldStyle}
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    요청자
                  </span>
                  <input
                    value={draft.requester ?? ""}
                    onChange={(event) => updateDraft("requester", event.target.value)}
                    placeholder="dashboard"
                    style={fieldStyle}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    현재 상태
                  </span>
                  <textarea
                    value={draft.current_state}
                    onChange={(event) => updateDraft("current_state", event.target.value)}
                    rows={6}
                    placeholder="현재 화면의 문제점, 제약사항, 불편 요소"
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    목표 상태
                  </span>
                  <textarea
                    value={draft.target_state}
                    onChange={(event) => updateDraft("target_state", event.target.value)}
                    rows={6}
                    placeholder="수정 후 기대하는 구조와 상호작용"
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>
              </div>

              <div className="rounded-xl p-4 mt-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                      Classifier
                    </p>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                      추천 카테고리: {categoryLabel(draftClassification.suggested_category)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateDraft("category", draftClassification.suggested_category)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
                  >
                    추천 적용
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DESIGN_MODIFICATION_CATEGORIES.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => updateDraft("category", category.value)}
                      className="px-2.5 py-1 rounded-full text-xs"
                      style={draft.category === category.value
                        ? { background: "var(--accent)", color: "#fff" }
                        : category.value === draftClassification.suggested_category
                          ? { background: "rgba(59, 130, 246, 0.18)", color: "#93c5fd" }
                          : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {draftClassification.scores.slice(0, 3).map((score) => (
                    <div
                      key={score.category}
                      className="rounded-xl p-3"
                      style={{ background: "rgba(15, 23, 42, 0.55)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                        {categoryLabel(score.category)}
                      </p>
                      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                        score {score.score}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {score.matched_terms.length > 0 ? score.matched_terms.join(", ") : "매칭 키워드 없음"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Locked Elements
                  </span>
                  <textarea
                    value={toTextBlock(draft.locked_elements)}
                    onChange={(event) => updateDraft("locked_elements", parseMultiValueInput(event.target.value))}
                    rows={5}
                    placeholder={"- 글로벌 헤더\n- KPI 카드 제목"}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Acceptance Checks
                  </span>
                  <textarea
                    value={toTextBlock(draft.acceptance_checks)}
                    onChange={(event) => updateDraft("acceptance_checks", parseMultiValueInput(event.target.value))}
                    rows={5}
                    placeholder={"- 모바일 360px에서도 줄바꿈 없음\n- hover 상태 색상 대비 유지"}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Affected Routes
                  </span>
                  <textarea
                    value={toTextBlock(draft.affected_routes)}
                    onChange={(event) => updateDraft("affected_routes", parseMultiValueInput(event.target.value))}
                    rows={4}
                    placeholder={"/\n/project-status\n/design-modifications"}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Affected Components
                  </span>
                  <textarea
                    value={toTextBlock(draft.affected_components)}
                    onChange={(event) => updateDraft("affected_components", parseMultiValueInput(event.target.value))}
                    rows={4}
                    placeholder={"ProjectCard\nSidebar\nHeader"}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </label>
              </div>

              <label className="block mt-4">
                <span className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                  추가 메모
                </span>
                <textarea
                  value={draft.notes ?? ""}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                  rows={4}
                  placeholder="디자인 토큰 제약, 우선순위, 참고 스크린샷 메모"
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
