"use client";
/**
 * AADS-172-C: ArtifactPanel
 * 아티팩트 패널 3단계 전환 컨테이너
 * - Full (420px): 탭 + 컨텐츠 + 액션 버튼 전체 표시
 * - Mini (48px): 세로 아이콘만 표시
 * - Hidden (0px): 완전 숨김
 * - 300ms ease-in-out 슬라이드 애니메이션
 */
import type { PanelState, TabId, ArtifactContent } from "@/hooks/useArtifactPanel";
import ArtifactTabs from "./ArtifactTabs";
import ArtifactReport from "./ArtifactReport";
import ArtifactCode, {} from "./ArtifactCode";
import ArtifactChart from "./ArtifactChart";
import ArtifactDashboard from "./ArtifactDashboard";
import AIDrive from "./AIDrive";
import ArtifactTaskMonitor from "./ArtifactTaskMonitor";

const PANEL_WIDTH: Record<PanelState, string> = {
  full:   "420px",
  mini:   "48px",
  hidden: "0px",
};

interface Props {
  panelState: PanelState;
  activeTab: TabId;
  artifact: ArtifactContent | null;
  workspaceId?: string;
  sessionId?: string;
  onTabSelect: (tab: TabId) => void;
  onToggleCollapse: () => void;
  onCyclePanel: () => void;
}

export default function ArtifactPanel({
  panelState,
  activeTab,
  artifact,
  workspaceId,
  sessionId,
  onTabSelect,
  onToggleCollapse,
}: Props) {
  const isFull = panelState === "full";
  const isMini = panelState === "mini";
  const isHidden = panelState === "hidden";

  return (
    <div
      style={{
        width: PANEL_WIDTH[panelState],
        minWidth: PANEL_WIDTH[panelState],
        overflow: "hidden",
        transition: "width 300ms ease-in-out, min-width 300ms ease-in-out",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: isHidden ? "none" : "1px solid var(--ct-border)",
        background: "var(--ct-card)",
        position: "relative",
      }}
    >
      {/* Mini 모드 */}
      {isMini && (
        <div
          className="flex flex-col items-center"
          style={{ width: 48, overflow: "hidden" }}
        >
          {/* ▶ 확장 버튼 */}
          <button
            onClick={onToggleCollapse}
            title="패널 확장"
            className="mt-2 mb-1 flex items-center justify-center rounded"
            style={{
              width: 32,
              height: 28,
              background: "var(--ct-hover)",
              border: "none",
              color: "var(--ct-text-muted)",
              cursor: "pointer",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ▶
          </button>
          <ArtifactTabs
            activeTab={activeTab}
            panelState="mini"
            onSelect={onTabSelect}
          />
        </div>
      )}

      {/* Full 모드 */}
      {isFull && (
        <div className="flex flex-col h-full" style={{ width: 420 }}>
          {/* 패널 헤더 */}
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--ct-border)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>
              아티팩트
              {artifact?.title && (
                <span className="ml-1.5 font-normal" style={{ color: "var(--ct-text-muted)" }}>
                  {artifact.title}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                Ctrl+]
              </span>
              {/* ◀ 축소 버튼 */}
              <button
                onClick={onToggleCollapse}
                title="패널 축소"
                className="flex items-center justify-center rounded"
                style={{
                  width: 24,
                  height: 24,
                  background: "var(--ct-hover)",
                  border: "none",
                  color: "var(--ct-text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ◀
              </button>
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <ArtifactTabs
            activeTab={activeTab}
            panelState="full"
            onSelect={onTabSelect}
          />

          {/* 탭 컨텐츠 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "report" && (
              <ArtifactReport
                content={artifact?.content || "보고서가 없습니다.\n\nAI 응답에서 보고서가 감지되면 자동으로 표시됩니다."}
                title={artifact?.title}
                workspaceId={workspaceId}
              />
            )}
            {activeTab === "code" && (
              <ArtifactCode
                content={artifact?.content || "// 코드가 없습니다.\n// AI 응답에서 코드 블록이 감지되면 자동으로 표시됩니다."}
                language={artifact?.language || "text"}
                title={artifact?.title}
                workspaceId={workspaceId}
              />
            )}
            {activeTab === "chart" && <ArtifactChart />}
            {activeTab === "dashboard" && <ArtifactDashboard />}
            {activeTab === "drive" && <AIDrive workspaceId={workspaceId} />}
            {activeTab === "tasks" && <ArtifactTaskMonitor sessionId={sessionId} />}
          </div>
        </div>
      )}
    </div>
  );
}
