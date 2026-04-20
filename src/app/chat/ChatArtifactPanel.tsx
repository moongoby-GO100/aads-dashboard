"use client";
import React, { memo, useRef, useCallback, useState, useEffect } from "react";
import type { Artifact, ArtifactMode, ArtifactTab, ScreenSize, ChatSession, ChatMessage } from "./types";
import ArtifactTaskMonitor from "@/components/chat/ArtifactTaskMonitor";
import { MarkdownBlock } from "./MarkdownRenderer";
import { BASE_URL, authHdrs, updateArtifact } from "./api";

interface AgendaItem {
  id: string;
  project: string;
  title: string;
  summary: string;
  status: string;
  priority: string;
  decision?: string;
  tags?: string[];
  created_at: string;
}

const AGENDA_STATUS_COLORS: Record<string, string> = {
  "논의중": "#3b82f6",
  "결정": "#22c55e",
  "진행중": "#f97316",
  "완료": "#6b7280",
  "보류": "#eab308",
  "폐기": "#ef4444",
};

const AGENDA_PRIORITY_COLORS: Record<string, string> = {
  "P0": "#ef4444",
  "P1": "#f97316",
  "P2": "#3b82f6",
  "P3": "#6b7280",
};

interface RunnerJob {
  job_id: string;
  project: string;
  instruction: string;
  status: string;
  phase: string | null;
  cycle: number;
  error_detail: string | null;
  error_message: string | null;
  depends_on: string | null;
  model?: string;
  worker_model?: string;
  actual_model?: string;
  size?: string;
  created_at: string | null;
  started_at: string | null;
  updated_at: string | null;
}

export interface ChatArtifactPanelProps {
  screenSize: ScreenSize;
  showArtifactPanel: boolean;
  artifactMode: ArtifactMode;
  setArtifactMode: (v: ArtifactMode) => void;
  mobileOverlay: "sidebar" | "artifact" | null;
  setMobileOverlay: (v: "sidebar" | "artifact" | null) => void;
  artifacts: Artifact[];
  artifactTab: ArtifactTab;
  setArtifactTab: (v: ArtifactTab) => void;
  artifactCounts: Record<string, number>;
  filteredArtifacts: Artifact[];
  activeArtifact: Artifact | null;
  selectedArtifactIdx: number;
  setSelectedArtifactIdx: (v: number) => void;
  activeSession: ChatSession | null;
  copyArtifact: (content: string) => void;
  toDirective: (a: Artifact) => void;
  systemMessages?: ChatMessage[];
  unreadLogCount?: number;
  sessionId?: string;
}

/** 우측 아티팩트 패널 — 보고서/코드/차트/대시보드/작업 탭 */

/** 아티팩트 본문 영역 — 스크롤 끝 도달 시 자동 전환 + 키보드 ←→ */
function ArtifactContentArea({ artifactTab, filteredArtifacts, selectedArtifactIdx, setSelectedArtifactIdx, children }: {
  artifactTab: string;
  filteredArtifacts: { id: string }[];
  selectedArtifactIdx: number;
  setSelectedArtifactIdx: (v: number) => void;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNavTime = useRef(0);

  const goNext = useCallback(() => {
    if (selectedArtifactIdx < filteredArtifacts.length - 1) {
      setSelectedArtifactIdx(selectedArtifactIdx + 1);
      lastNavTime.current = Date.now();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [selectedArtifactIdx, filteredArtifacts.length, setSelectedArtifactIdx]);

  const goPrev = useCallback(() => {
    if (selectedArtifactIdx > 0) {
      setSelectedArtifactIdx(selectedArtifactIdx - 1);
      lastNavTime.current = Date.now();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [selectedArtifactIdx, setSelectedArtifactIdx]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el || Date.now() - lastNavTime.current < 600) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
    const atTop = el.scrollTop < 5;
    if (e.deltaY > 30 && atBottom) goNext();
    else if (e.deltaY < -30 && atTop) goPrev();
  }, [goNext, goPrev]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev(); }
  }, [goNext, goPrev]);

  // 아티팩트 선택 변경 시 스크롤 맨 위로 (전체보기 버튼 등 외부 변경 포함)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedArtifactIdx]);

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, overflowY: "auto", padding: artifactTab === "tasks" ? "0" : "16px", outline: "none" }}
    >
      {children}
      {filteredArtifacts.length > 1 && artifactTab !== "tasks" && (
        <div style={{
          textAlign: "center", padding: "16px 0 8px", fontSize: "11px",
          color: "var(--ct-text2)", opacity: 0.6,
        }}>
          {selectedArtifactIdx < filteredArtifacts.length - 1
            ? "↓ 스크롤하여 다음 항목"
            : `${filteredArtifacts.length}/${filteredArtifacts.length} (마지막)`
          }
          {" · ←→ 키보드로 전환"}
        </div>
      )}
    </div>
  );
}

const ChatArtifactPanel = memo(function ChatArtifactPanel(props: ChatArtifactPanelProps) {
  const {
    screenSize, showArtifactPanel, artifactMode, setArtifactMode,
    mobileOverlay, setMobileOverlay,
    artifacts, artifactTab, setArtifactTab, artifactCounts,
    systemMessages, unreadLogCount,
    filteredArtifacts, activeArtifact, selectedArtifactIdx, setSelectedArtifactIdx,
    activeSession, copyArtifact, toDirective, sessionId,
  } = props;

  // 아티팩트 검색/필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(420);
  // 배지 펄스 애니메이션 상태
  const [pulsedTabs, setPulsedTabs] = useState<Set<string>>(new Set());
  const prevArtifactCountsRef = useRef<Record<string, number>>({});

  // Runner 작업 폴링 상태
  const [runnerJobs, setRunnerJobs] = useState<RunnerJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || artifactTab !== "log") return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        setJobsLoading(true);
        const res = await fetch(`${BASE_URL}/pipeline/jobs?session_id=${sessionId}&limit=50`, { headers: authHdrs() });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRunnerJobs(data);
        }
      } catch (_) {/* ignore */} finally {
        if (!cancelled) setJobsLoading(false);
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionId, artifactTab]);

  const errorDetailKo = (d: string | null): string => {
    const map: Record<string, string> = {
      timeout: "시간 초과",
      claude_code_crash: "Claude 충돌",
      git_conflict: "Git 충돌",
      build_fail: "빌드 실패",
      disk_full: "디스크 부족",
      rate_limit: "API 제한",
      process_died: "프로세스 종료",
    };
    return d ? (map[d] ?? d) : "";
  };

  const elapsedStr = (start: string | null, end: string | null): string => {
    if (!start) return "";
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const sec = Math.floor((e - s) / 1000);
    if (sec < 60) return `${sec}초`;
    const min = Math.floor(sec / 60);
    return `${min}분 ${sec % 60}초`;
  };

  // 인라인 편집 상태
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHtmlCode, setShowHtmlCode] = useState(false);
  const [localEdits, setLocalEdits] = useState<Record<string, { title: string; content: string }>>({});

  const startEdit = useCallback((artifact: Artifact) => {
    const saved = localEdits[artifact.id];
    setEditTitle(saved?.title ?? artifact.title);
    setEditContent(saved?.content ?? artifact.content);
    setEditError(null);
    setEditingArtifactId(artifact.id);
  }, [localEdits]);

  const cancelEdit = useCallback(() => {
    setEditingArtifactId(null);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingArtifactId) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateArtifact(editingArtifactId, { title: editTitle, content: editContent });
      setLocalEdits(prev => ({ ...prev, [editingArtifactId]: { title: editTitle, content: editContent } }));
      setEditingArtifactId(null);
    } catch (e) {
      setEditError((e as Error).message || "저장 실패");
    } finally {
      setEditSaving(false);
    }
  }, [editingArtifactId, editTitle, editContent]);

  // 아젠다 상태
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaFilter, setAgendaFilter] = useState<string>("전체");
  const [expandedAgendaId, setExpandedAgendaId] = useState<string | null>(null);

  useEffect(() => {
    if (artifactTab !== "agenda") return;
    setAgendaLoading(true);
    fetch(`${BASE_URL}/agenda/`, { headers: authHdrs() })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => setAgendaItems(data.items ?? []))
      .catch(() => setAgendaItems([]))
      .finally(() => setAgendaLoading(false));
  }, [artifactTab]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setTabBarWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showTabLabel = tabBarWidth >= 320;

  // artifactCounts 변경 감지 → 증가한 탭에 펄스 트리거
  useEffect(() => {
    const prev = prevArtifactCountsRef.current;
    const newPulsed = new Set<string>();
    for (const key of Object.keys(artifactCounts)) {
      if ((artifactCounts[key] ?? 0) > (prev[key] ?? 0)) {
        newPulsed.add(key);
      }
    }
    if (newPulsed.size > 0) {
      setPulsedTabs(newPulsed);
      const t = setTimeout(() => setPulsedTabs(new Set()), 2000);
      prevArtifactCountsRef.current = { ...artifactCounts };
      return () => clearTimeout(t);
    }
    prevArtifactCountsRef.current = { ...artifactCounts };
  }, [artifactCounts]);

  return (
    <>
    <style>{`
      @keyframes badgePulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
      }
    `}</style>
    {(showArtifactPanel || (screenSize === "desktop" && artifactMode !== "hidden")) && (
      <div
        style={{
          width: screenSize !== "desktop" ? "380px" : artifactMode === "full" ? "420px" : "48px",
          minWidth: screenSize !== "desktop" ? "380px" : artifactMode === "full" ? "420px" : "48px",
          background: "var(--ct-sb)",
          borderLeft: "1px solid var(--ct-border)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.3s, min-width 0.3s, transform 0.3s",
          overflow: "hidden",
          flexShrink: 0,
          // On non-desktop, position as overlay
          ...(screenSize !== "desktop"
            ? {
                position: "fixed",
                right: 0,
                top: 0,
                height: "100%",
                zIndex: 200,
                transform: mobileOverlay === "artifact" ? "translateX(0)" : "translateX(100%)",
                boxShadow: mobileOverlay === "artifact" ? "-4px 0 20px rgba(0,0,0,0.3)" : "none",
              }
            : {}),
        }}
      >
        {artifactMode === "full" || screenSize !== "desktop" ? (
          <>
            {/* Artifact header */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--ct-border)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div style={{ flex: 1, fontWeight: 600, fontSize: "13px" }}>
                아티팩트
                {artifacts.length > 0 && (
                  <span
                    style={{
                      marginLeft: "6px",
                      fontSize: "11px",
                      background: "var(--ct-accent)",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "1px 6px",
                    }}
                  >
                    {artifacts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() =>
                  screenSize === "desktop"
                    ? setArtifactMode("mini")
                    : setMobileOverlay(null)
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  fontSize: "14px",
                  padding: "4px",
                }}
              >
                ▶
              </button>
            </div>

            {/* Artifact tabs */}
            <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ct-border)" }}>
              {/* 좌측 화살표 */}
              <button
                onClick={() => tabBarRef.current?.scrollBy({ left: -100, behavior: "smooth" })}
                style={{ flexShrink: 0, width: 28, border: "none", background: "linear-gradient(to right, var(--ct-bg, #1a1a2e) 70%, transparent)", color: "var(--ct-accent)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}
              title="← 스크롤">◀</button>
              <div
                ref={tabBarRef}
                className="hide-scrollbar"
                onWheel={(e) => { e.preventDefault(); tabBarRef.current?.scrollBy({ left: e.deltaY > 0 ? 80 : -80, behavior: "smooth" }); }}
                style={{
                  display: "flex",
                  padding: "0 4px",
                  overflowX: "auto",
                  flex: 1,
                }}
              >
                {(
                  [
                    { key: "log" as ArtifactTab, icon: "🔧", label: "로그" },
                    { key: "agenda" as ArtifactTab, icon: "📋", label: "아젠다" },
                    { key: "report" as ArtifactTab, icon: "📄", label: "보고서" },
                    { key: "dialog" as ArtifactTab, icon: "💬", label: "대화응답" },
                    { key: "code" as ArtifactTab, icon: "💻", label: "코드" },
                    { key: "html_preview" as ArtifactTab, icon: "🖼️", label: "미리보기" },
                    { key: "chart" as ArtifactTab, icon: "📊", label: "차트" },
                    { key: "tasks" as ArtifactTab, icon: "⚡", label: "작업" },
                  ]
                ).filter((tab) => {
                  if (tab.key === "tasks" || tab.key === "log" || tab.key === "agenda") return true;
                  return artifactTab === tab.key || (artifactCounts[tab.key] ?? 0) > 0;
                }).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setArtifactTab(tab.key); setSelectedArtifactIdx(0); }}
                    style={{
                      padding: "8px 10px",
                      fontSize: "11px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color:
                        artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-text2)",
                      borderBottom:
                        artifactTab === tab.key
                          ? "2px solid var(--ct-accent)"
                          : "2px solid transparent",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon}{showTabLabel ? ` ${tab.label}` : ""}
                    {tab.key !== "tasks" && tab.key !== "log" && tab.key !== "agenda" && artifactCounts[tab.key] > 0 && (
                      <span style={{
                        marginLeft: '3px',
                        fontSize: '10px',
                        opacity: 0.7,
                        display: 'inline-block',
                        animation: pulsedTabs.has(tab.key) ? 'badgePulse 0.4s ease 3' : 'none',
                      }}>({artifactCounts[tab.key]})</span>
                    )}
                    {tab.key === "log" && (unreadLogCount ?? 0) > 0 && (
                      <span style={{ marginLeft: '3px', fontSize: '10px', opacity: 0.7 }}>
                        ({unreadLogCount})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* 우측 화살표 */}
              <button
                onClick={() => tabBarRef.current?.scrollBy({ left: 100, behavior: "smooth" })}
                style={{ flexShrink: 0, width: 28, border: "none", background: "linear-gradient(to left, var(--ct-bg, #1a1a2e) 70%, transparent)", color: "var(--ct-accent)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}
              title="→ 스크롤">▶</button>
            </div>

            {/* 검색/필터 영역 */}
            {artifactTab !== "tasks" && artifactTab !== "log" && artifactTab !== "agenda" && artifactTab !== "dialog" && (
              <div style={{
                padding: "6px 10px",
                borderBottom: "1px solid var(--ct-border)",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}>
                <input
                  type="text"
                  placeholder="제목 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedArtifactIdx(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--ct-border)",
                    background: "var(--ct-input-bg)",
                    color: "var(--ct-text)",
                    fontSize: "12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {[
                    { key: null, label: "전체" },
                    { key: "report", label: "보고서" },
                    { key: "code", label: "코드" },
                    { key: "table", label: "마크다운" },
                    { key: "other", label: "기타" },
                  ].map((f) => (
                    <button
                      key={String(f.key)}
                      onClick={() => { setTypeFilter(f.key); setSelectedArtifactIdx(0); }}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "10px",
                        border: "1px solid var(--ct-border)",
                        background: typeFilter === f.key ? "var(--ct-accent)" : "transparent",
                        color: typeFilter === f.key ? "#fff" : "var(--ct-text2)",
                        fontSize: "11px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 아티팩트 리스트 헤더 */}
            {(() => {
              // localFiltered에 원본 인덱스 포함
              const lfWithIdx = filteredArtifacts
                .map((a, idx) => ({ a, idx }))
                .filter(({ a }) => {
                  const ms = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase());
                  const mt = !typeFilter || a.artifact_type === typeFilter ||
                    (typeFilter === "report" && (a.artifact_type === "report" || a.artifact_type === "text")) ||
                    (typeFilter === "other" && !["report", "text", "code", "table", "full_response"].includes(a.artifact_type));
                  return ms && mt;
                });
              const localCurPos = lfWithIdx.findIndex(({ idx }) => idx === selectedArtifactIdx);
              const prevItem = localCurPos > 0 ? lfWithIdx[localCurPos - 1] : null;
              const nextItem = localCurPos < lfWithIdx.length - 1 ? lfWithIdx[localCurPos + 1] : null;
              return lfWithIdx.length > 1 && artifactTab !== "tasks" && artifactTab !== "agenda" ? (
              <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--ct-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
              }}>
                <span style={{ color: 'var(--ct-text2)', whiteSpace: 'nowrap' }}>
                  {lfWithIdx.length}건
                </span>
                <select
                  value={selectedArtifactIdx}
                  onChange={(e) => setSelectedArtifactIdx(Number(e.target.value))}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ct-border)',
                    background: 'var(--ct-input-bg)',
                    color: 'var(--ct-text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    maxWidth: '280px',
                  }}
                >
                  {lfWithIdx.map(({ a, idx }) => (
                    <option key={a.id} value={idx}>
                      {a.title ? a.title.substring(0, 40) : `#${idx + 1}`}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    onClick={() => prevItem && setSelectedArtifactIdx(prevItem.idx)}
                    disabled={!prevItem}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--ct-border)',
                      background: 'transparent',
                      color: 'var(--ct-text2)',
                      cursor: !prevItem ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: !prevItem ? 0.4 : 1,
                    }}
                  >◀</button>
                  <button
                    onClick={() => nextItem && setSelectedArtifactIdx(nextItem.idx)}
                    disabled={!nextItem}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--ct-border)',
                      background: 'transparent',
                      color: 'var(--ct-text2)',
                      cursor: !nextItem ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: !nextItem ? 0.4 : 1,
                    }}
                  >▶</button>
                </div>
              </div>
              ) : null;
            })()}

            {/* Artifact content — 스크롤/키보드 네비게이션 */}
            <ArtifactContentArea
              artifactTab={artifactTab}
              filteredArtifacts={filteredArtifacts}
              selectedArtifactIdx={selectedArtifactIdx}
              setSelectedArtifactIdx={setSelectedArtifactIdx}
            >
              {artifactTab === "tasks" ? (
                <ArtifactTaskMonitor sessionId={activeSession?.id} />
              ) : artifactTab === "agenda" ? (
                <div>
                  {/* 상태 필터 칩 */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                    {["전체", "논의중", "진행중", "결정", "완료"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAgendaFilter(s)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          border: "1px solid var(--ct-border)",
                          background: agendaFilter === s ? "var(--ct-accent)" : "transparent",
                          color: agendaFilter === s ? "#fff" : "var(--ct-text2)",
                          fontSize: "11px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {agendaLoading ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", textAlign: "center", paddingTop: "20px" }}>
                      불러오는 중...
                    </div>
                  ) : (() => {
                    const filtered = agendaItems.filter((item) =>
                      agendaFilter === "전체" || item.status === agendaFilter
                    );
                    if (filtered.length === 0) {
                      return (
                        <div style={{ color: "var(--ct-text2)", fontSize: "12px", textAlign: "center", paddingTop: "20px" }}>
                          등록된 아젠다가 없습니다
                        </div>
                      );
                    }
                    return filtered.map((item) => {
                      const isExpanded = expandedAgendaId === item.id;
                      const statusColor = AGENDA_STATUS_COLORS[item.status] ?? "#6b7280";
                      const priorityColor = AGENDA_PRIORITY_COLORS[item.priority] ?? "#6b7280";
                      return (
                        <div
                          key={item.id}
                          onClick={() => setExpandedAgendaId(isExpanded ? null : item.id)}
                          style={{
                            background: "var(--ct-card)",
                            border: "1px solid var(--ct-border)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            marginBottom: "8px",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                            <span style={{
                              fontSize: "10px", fontWeight: 700, color: "#fff",
                              background: priorityColor, borderRadius: "4px",
                              padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
                            }}>{item.priority}</span>
                            <span style={{
                              fontSize: "12px", fontWeight: 600, color: "var(--ct-text)",
                              flex: 1, lineHeight: "1.4",
                            }}>{item.title}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: isExpanded ? "8px" : "0" }}>
                            <span style={{
                              fontSize: "10px", color: "#fff",
                              background: statusColor, borderRadius: "10px",
                              padding: "1px 7px",
                            }}>{item.status}</span>
                            {item.project && (
                              <span style={{
                                fontSize: "10px", color: "var(--ct-text2)",
                                background: "var(--ct-hover)", borderRadius: "4px",
                                padding: "1px 6px",
                              }}>{item.project}</span>
                            )}
                          </div>
                          {!isExpanded && item.summary && (
                            <div style={{
                              fontSize: "11px", color: "var(--ct-text2)", marginTop: "4px",
                              overflow: "hidden", display: "-webkit-box",
                              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              lineHeight: "1.5",
                            }}>
                              {item.summary}
                            </div>
                          )}
                          {isExpanded && (
                            <div style={{ fontSize: "12px", color: "var(--ct-text2)", lineHeight: "1.6" }}>
                              {item.summary && (
                                <div style={{ marginBottom: "6px" }}>{item.summary}</div>
                              )}
                              {item.decision && (
                                <div style={{
                                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                                  borderRadius: "6px", padding: "6px 10px", fontSize: "11px",
                                }}>
                                  <span style={{ fontWeight: 600, color: "#22c55e" }}>결정: </span>
                                  {item.decision}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : artifactTab === "log" ? (
                <div style={{ padding: "4px 0" }}>
                  {jobsLoading && runnerJobs.length === 0 ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", padding: "16px", textAlign: "center" }}>
                      로딩 중...
                    </div>
                  ) : runnerJobs.length === 0 ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", padding: "16px", textAlign: "center" }}>
                      이 세션의 Runner 작업이 없습니다
                    </div>
                  ) : (() => {
                    const roots = runnerJobs.filter(j => !j.depends_on);
                    const childMap: Record<string, RunnerJob[]> = {};
                    runnerJobs.forEach(j => {
                      if (j.depends_on) {
                        if (!childMap[j.depends_on]) childMap[j.depends_on] = [];
                        childMap[j.depends_on].push(j);
                      }
                    });

                    const statusIcon = (s: string) => ({
                      queued: "⏳", running: "🔄", awaiting_approval: "✋", done: "✅", error: "❌"
                    }[s] ?? "❓");

                    const statusColor = (s: string) => ({
                      queued: "#888", running: "#3b82f6", awaiting_approval: "#f59e0b", done: "#22c55e", error: "#ef4444"
                    }[s] ?? "#888");

                    const renderJob = (job: RunnerJob, depth = 0): React.ReactNode => {
                      const children = childMap[job.job_id] ?? [];
                      const isRunning = job.status === "running";
                      return (
                        <div key={job.job_id} style={{ marginLeft: depth * 12 }}>
                          <details style={{ borderBottom: depth === 0 ? "1px solid var(--ct-border)" : "none" }}>
                            <summary style={{
                              fontSize: "11px", cursor: "pointer", listStyle: "none",
                              display: "flex", alignItems: "flex-start", gap: "6px",
                              padding: `${depth === 0 ? 8 : 4}px 8px`, userSelect: "none",
                            }}>
                              <span style={{ color: statusColor(job.status), minWidth: 14 }}>{statusIcon(job.status)}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.6 }}>{job.job_id}</span>
                                  <span style={{ fontSize: "10px", color: statusColor(job.status), fontWeight: 600 }}>{job.status}</span>
                                  {isRunning && job.started_at && (
                                    <span style={{ fontSize: "10px", color: "#f59e0b" }}>⏱ {elapsedStr(job.started_at, null)}</span>
                                  )}
                                  {(() => {
                                    const displayModel = job.actual_model || job.worker_model || job.model;
                                    if (!displayModel) return null;
                                    const m = displayModel.toLowerCase();
                                    const isClaude = m.includes("claude") || m.includes("anthropic");
                                    const isLitellm = m.includes("kimi") || m.includes("qwen") || m.includes("minimax") || m.includes("deepseek") || m.includes("gemini");
                                    const bg = isClaude ? "rgba(99,102,241,0.2)" : isLitellm ? "rgba(16,185,129,0.2)" : "rgba(156,163,175,0.2)";
                                    const fg = isClaude ? "#818cf8" : isLitellm ? "#34d399" : "#9ca3af";
                                    return (
                                      <>
                                        <span style={{ fontSize: "9px", background: bg, color: fg, borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap" }}>
                                          {displayModel}
                                        </span>
                                        {job.size && (
                                          <span style={{ fontSize: "9px", background: "rgba(107,114,128,0.15)", color: "#9ca3af", borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap", fontWeight: 600 }}>
                                            {job.size}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                                <div style={{ fontSize: "11px", opacity: 0.75, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {job.instruction.replace(/\n/g, " ").slice(0, 80)}
                                </div>
                                {job.created_at && (
                                  <div style={{ fontSize: "10px", opacity: 0.45, marginTop: 1 }}>
                                    제출 {new Date(job.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                    {job.started_at && ` · 시작 ${new Date(job.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
                                  </div>
                                )}
                                {job.status === "error" && (
                                  <div style={{ fontSize: "10px", color: "#ef4444", marginTop: 2 }}>
                                    {job.error_detail ? `원인: ${errorDetailKo(job.error_detail)}` : ""}
                                    {job.error_message ? ` — ${job.error_message.slice(0, 80)}` : ""}
                                  </div>
                                )}
                              </div>
                            </summary>
                            <div style={{ padding: "6px 12px 8px 26px", fontSize: "11px", color: "var(--ct-text2)", background: "rgba(255,255,255,0.02)" }}>
                              <div style={{ whiteSpace: "pre-wrap", opacity: 0.8, maxHeight: "200px", overflowY: "auto", fontFamily: "monospace", fontSize: "10px", lineHeight: 1.5 }}>{job.instruction}</div>
                              {children.length > 0 && (
                                <div style={{ marginTop: 6, borderLeft: "2px solid var(--ct-border)", paddingLeft: 8 }}>
                                  {children.map(c => renderJob(c, depth + 1))}
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      );
                    };

                    return roots.map(job => renderJob(job));
                  })()}
                </div>
              ) : artifactTab === "html_preview" ? (
                activeArtifact ? (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    {/* 상단 툴바 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "8px 12px", borderBottom: "1px solid var(--ct-border)",
                      background: "var(--ct-card)", borderRadius: "8px 8px 0 0",
                    }}>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeArtifact.title || "HTML 미리보기"}
                      </span>
                      <button
                        onClick={() => setShowHtmlCode(!showHtmlCode)}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: showHtmlCode ? "var(--ct-accent)" : "var(--ct-hover)",
                          color: showHtmlCode ? "#fff" : "var(--ct-text2)",
                        }}
                      >
                        {showHtmlCode ? "미리보기" : "코드 보기"}
                      </button>
                      <button
                        onClick={() => copyArtifact(activeArtifact.content)}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: "var(--ct-hover)", color: "var(--ct-text2)",
                        }}
                      >
                        📋 복사
                      </button>
                      <button
                        onClick={() => {
                          const w = window.open("", "_blank");
                          if (w) { w.document.write(activeArtifact.content); w.document.close(); }
                        }}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: "var(--ct-hover)", color: "var(--ct-text2)",
                        }}
                      >
                        🔗 새 창
                      </button>
                    </div>
                    {/* 콘텐츠 영역 */}
                    {showHtmlCode ? (
                      <pre style={{
                        flex: 1, background: "var(--ct-code)", padding: "12px",
                        borderRadius: "0 0 8px 8px", overflowX: "auto", overflowY: "auto",
                        fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap",
                        wordBreak: "break-word", scrollbarWidth: "thin",
                      }}>
                        {activeArtifact.content}
                      </pre>
                    ) : (
                      <iframe
                        srcDoc={activeArtifact.content}
                        sandbox="allow-scripts"
                        style={{
                          flex: 1, width: "100%", border: "none",
                          borderRadius: "0 0 8px 8px", background: "#ffffff",
                          minHeight: "400px",
                        }}
                        title={activeArtifact.title || "HTML Preview"}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", paddingTop: "40px", color: "var(--ct-text2)" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>🖼️</div>
                    <div style={{ fontSize: "12px" }}>HTML 미리보기가 없습니다</div>
                    <div style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7, lineHeight: 1.5 }}>
                      AI에게 HTML 생성을 요청해 보세요
                    </div>
                  </div>
                )
              ) : activeArtifact ? (() => {
                const edited = localEdits[activeArtifact.id];
                const displayArtifact = edited
                  ? { ...activeArtifact, title: edited.title, content: edited.content }
                  : activeArtifact;
                const isEditing = editingArtifactId === activeArtifact.id;

                if (isEditing) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="제목"
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-input-bg)",
                          color: "var(--ct-text)",
                          fontSize: "13px",
                          fontWeight: 600,
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-input-bg)",
                          color: "var(--ct-text)",
                          fontSize: "13px",
                          lineHeight: "1.6",
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                          minHeight: "200px",
                          maxHeight: "70vh",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                      {editError && (
                        <div style={{ fontSize: "11px", color: "#ef4444", padding: "4px 0" }}>
                          오류: {editError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={saveEdit}
                          disabled={editSaving}
                          style={{
                            flex: 1,
                            padding: "7px 8px",
                            fontSize: "12px",
                            background: editSaving ? "var(--ct-hover)" : "var(--ct-accent)",
                            border: "none",
                            borderRadius: "6px",
                            cursor: editSaving ? "not-allowed" : "pointer",
                            color: editSaving ? "var(--ct-text2)" : "#fff",
                            fontWeight: 600,
                          }}
                        >
                          {editSaving ? "저장 중..." : "💾 저장"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          style={{
                            flex: 1,
                            padding: "7px 8px",
                            fontSize: "12px",
                            background: "var(--ct-hover)",
                            border: "1px solid var(--ct-border)",
                            borderRadius: "6px",
                            cursor: editSaving ? "not-allowed" : "pointer",
                            color: "var(--ct-text2)",
                          }}
                        >
                          ❌ 취소
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "13px",
                        marginBottom: "12px",
                        color: "var(--ct-text)",
                      }}
                    >
                      {displayArtifact.title}
                    </div>
                    {activeArtifact.session_id !== activeSession?.id && (
                      <span style={{ fontSize: "10px", color: "#888", marginLeft: "4px" }}>
                        (다른 세션)
                      </span>
                    )}
                    <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                      {displayArtifact.artifact_type === "image" ? (
                        <img
                          src={displayArtifact.content}
                          alt={displayArtifact.title}
                          style={{ maxWidth: "100%", borderRadius: "8px" }}
                        />
                      ) : displayArtifact.artifact_type === "file" ? (
                        <a
                          href={displayArtifact.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "16px",
                            background: "var(--ct-input-bg)",
                            borderRadius: "8px",
                            textDecoration: "none",
                            color: "var(--ct-text)",
                          }}
                        >
                          {"📎 " + (displayArtifact.title || "파일 다운로드")}
                        </a>
                      ) : displayArtifact.artifact_type === "chart" && displayArtifact.metadata?.subtype === "mermaid" ? (
                        <pre
                          style={{
                            background: "var(--ct-code)",
                            padding: "12px",
                            borderRadius: "8px",
                            overflowX: "auto", scrollbarWidth: "thin",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {displayArtifact.content}
                        </pre>
                      ) : displayArtifact.artifact_type === "code" ? (
                        <pre
                          style={{
                            background: "var(--ct-code)",
                            padding: "12px",
                            borderRadius: "8px",
                            overflowX: "auto", scrollbarWidth: "thin",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {displayArtifact.content}
                        </pre>
                      ) : (
                        <MarkdownBlock text={displayArtifact.content} />
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div
                  style={{
                    textAlign: "center",
                    paddingTop: "40px",
                    color: "var(--ct-text2)",
                  }}
                >
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                  <div style={{ fontSize: "12px" }}>아티팩트가 없습니다</div>
                  <div
                    style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7, lineHeight: 1.5 }}
                  >
                    AI 응답에서 아티팩트가
                    <br />
                    생성되면 여기에 표시됩니다
                  </div>
                </div>
              )}
            </ArtifactContentArea>

            {/* Artifact actions */}
            {activeArtifact && (
              <div
                style={{
                  padding: "12px",
                  borderTop: "1px solid var(--ct-border)",
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { icon: "📋", label: "복사", fn: () => copyArtifact(activeArtifact.content) },
                  { icon: "✏️", label: "편집", fn: () => editingArtifactId === activeArtifact.id ? cancelEdit() : startEdit(activeArtifact) },
                  { icon: "📋", label: "지시서", fn: () => toDirective(activeArtifact) },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={btn.fn}
                    style={{
                      flex: 1,
                      padding: "7px 8px",
                      fontSize: "11px",
                      background: "var(--ct-hover)",
                      border: "1px solid var(--ct-border)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      color: "var(--ct-text2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--ct-accent)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--ct-hover)") }
                  >
                    {btn.icon} {btn.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Mini mode — vertical icons */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "12px 0",
              gap: "8px",
              flex: 1,
            }}
          >
            {(
              [
                { key: "log" as ArtifactTab, icon: "🔧" },
                { key: "agenda" as ArtifactTab, icon: "📋" },
                { key: "report" as ArtifactTab, icon: "📄" },
                { key: "dialog" as ArtifactTab, icon: "💬" },
                { key: "code" as ArtifactTab, icon: "💻" },
                { key: "html_preview" as ArtifactTab, icon: "🖼️" },
                { key: "chart" as ArtifactTab, icon: "📊" },
                { key: "tasks" as ArtifactTab, icon: "⚡" },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setArtifactTab(tab.key); setArtifactMode("full"); setSelectedArtifactIdx(0); }}
                title={tab.key}
                style={{
                  width: "36px",
                  height: "36px",
                  fontSize: "16px",
                  background:
                    artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-hover)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: artifactTab === tab.key ? "#fff" : "var(--ct-text2)",
                }}
              >
                <span style={{ position: 'relative' }}>
                  {tab.icon}
                  {tab.key !== "tasks" && tab.key !== "log" && tab.key !== "agenda" && artifactCounts[tab.key] > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      fontSize: '9px',
                      background: 'var(--ct-accent)',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0 4px',
                      lineHeight: '14px',
                      minWidth: '14px',
                      textAlign: 'center',
                    }}>{artifactCounts[tab.key]}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    </>
  );
});

ChatArtifactPanel.displayName = "ChatArtifactPanel";
export default ChatArtifactPanel;
