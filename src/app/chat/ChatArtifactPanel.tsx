"use client";
import { memo, useRef, useCallback, useState, useEffect } from "react";
import type { Artifact, ArtifactMode, ArtifactTab, ScreenSize, ChatSession, ChatMessage } from "./types";
import ArtifactTaskMonitor from "@/components/chat/ArtifactTaskMonitor";
import { MarkdownBlock } from "./MarkdownRenderer";

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
    activeSession, copyArtifact, toDirective,
  } = props;

  // 아티팩트 검색/필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(420);
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


  return (
    <>
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
            <div
              ref={tabBarRef}
              style={{
                display: "flex",
                borderBottom: "1px solid var(--ct-border)",
                padding: "0 8px",
                overflowX: "auto",
                scrollbarWidth: "none",
              }}
            >
              {(
                [
                  { key: "report" as ArtifactTab, icon: "📄", label: "보고서" },
                  { key: "code" as ArtifactTab, icon: "💻", label: "코드" },
                  { key: "chart" as ArtifactTab, icon: "📊", label: "차트" },
                  { key: "dashboard" as ArtifactTab, icon: "🖥️", label: "대시보드" },
                  { key: "tasks" as ArtifactTab, icon: "⚡", label: "작업" },
                  { key: "log" as ArtifactTab, icon: "🔧", label: "로그" },
                ]
              ).map((tab) => (
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
                  {tab.key !== "tasks" && tab.key !== "log" && artifactCounts[tab.key] > 0 && (
                    <span style={{
                      marginLeft: '3px',
                      fontSize: '10px',
                      opacity: 0.7,
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

            {/* 검색/필터 영역 */}
            {artifactTab !== "tasks" && artifactTab !== "log" && (
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
                    (typeFilter === "other" && !["report", "text", "code", "table"].includes(a.artifact_type));
                  return ms && mt;
                });
              const localCurPos = lfWithIdx.findIndex(({ idx }) => idx === selectedArtifactIdx);
              const prevItem = localCurPos > 0 ? lfWithIdx[localCurPos - 1] : null;
              const nextItem = localCurPos < lfWithIdx.length - 1 ? lfWithIdx[localCurPos + 1] : null;
              return lfWithIdx.length > 1 && artifactTab !== "tasks" ? (
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
              ) : artifactTab === "log" ? (
                <div style={{ padding: "4px 0" }}>
                  {(systemMessages ?? []).length === 0 ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", padding: "16px", textAlign: "center" }}>
                      운영 로그가 없습니다
                    </div>
                  ) : (
                    [...(systemMessages ?? [])].reverse().map((msg, idx) => {
                      const isAutoReaction = msg.intent === "auto_reaction";
                      const icon = isAutoReaction ? "🤖" : "⚙️";
                      const label = isAutoReaction ? "자동 반응" : "시스템";
                      const jobMatch = msg.content?.match(/Job[:\s*]+(\S+)/);
                      const jobId = jobMatch ? jobMatch[1] : null;
                      return (
                        <details key={msg.id} style={{ borderBottom: "1px solid var(--ct-border)", margin: "0" }} open={isAutoReaction && idx === 0}>
                          <summary style={{
                            fontSize: "11px", color: "var(--ct-text2)", cursor: "pointer",
                            listStyle: "none", display: "flex", alignItems: "center", gap: "6px",
                            padding: "6px 8px", userSelect: "none",
                          }}>
                            <span>{icon}</span>
                            <span style={{ flex: 1, opacity: 0.8 }}>
                              {label}{jobId ? ` · ${jobId}` : ""}
                              {" · "}{(msg.content || "")
                                .replace(/\*\*/g, "").replace(/##/g, "").replace(/\n/g, " ")
                                .replace(/\[시스템\]\s*/g, "").trim().slice(0, 60)}…
                            </span>
                          </summary>
                          <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--ct-text2)", background: "rgba(255,255,255,0.02)" }}>
                            <MarkdownBlock text={msg.content || ""} />
                          </div>
                        </details>
                      );
                    })
                  )}
                </div>
              ) : activeArtifact ? (
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "13px",
                      marginBottom: "12px",
                      color: "var(--ct-text)",
                    }}
                  >
                    {activeArtifact.title}
                  </div>
                  {activeArtifact.session_id !== activeSession?.id && (
                    <span style={{ fontSize: "10px", color: "#888", marginLeft: "4px" }}>
                      (다른 세션)
                    </span>
                  )}
                  <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                    {activeArtifact.artifact_type === "image" ? (
                      <img
                        src={activeArtifact.content}
                        alt={activeArtifact.title}
                        style={{ maxWidth: "100%", borderRadius: "8px" }}
                      />
                    ) : activeArtifact.artifact_type === "file" ? (
                      <a
                        href={activeArtifact.content}
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
                        {"📎 " + (activeArtifact.title || "파일 다운로드")}
                      </a>
                    ) : activeArtifact.artifact_type === "chart" && activeArtifact.metadata?.subtype === "mermaid" ? (
                      <pre
                        style={{
                          background: "var(--ct-code)",
                          padding: "12px",
                          borderRadius: "8px",
                          overflowX: "auto",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {activeArtifact.content}
                      </pre>
                    ) : activeArtifact.artifact_type === "code" ? (
                      <pre
                        style={{
                          background: "var(--ct-code)",
                          padding: "12px",
                          borderRadius: "8px",
                          overflowX: "auto",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {activeArtifact.content}
                      </pre>
                    ) : (
                      <MarkdownBlock text={activeArtifact.content} />
                    )}
                  </div>
                </div>
              ) : (
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
                  { icon: "✏️", label: "편집", fn: () => {} },
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
                { key: "report" as ArtifactTab, icon: "📄" },
                { key: "code" as ArtifactTab, icon: "💻" },
                { key: "chart" as ArtifactTab, icon: "📊" },
                { key: "dashboard" as ArtifactTab, icon: "🖥️" },
                { key: "tasks" as ArtifactTab, icon: "⚡" },
                { key: "log" as ArtifactTab, icon: "🔧" },
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
                  {tab.key !== "tasks" && tab.key !== "log" && artifactCounts[tab.key] > 0 && (
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
