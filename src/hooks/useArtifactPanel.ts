"use client";
/**
 * AADS-172-C: useArtifactPanel
 * 아티팩트 패널 3단계(Full/Mini/Hidden) 상태 관리 훅
 * - Full(420px) / Mini(48px) / Hidden(0px)
 * - ◀ 버튼: Full↔Mini 토글
 * - Ctrl+]: 3단계 순환
 * - Mini 아이콘 클릭: 해당 탭으로 Full 확장
 * - AI 응답 아티팩트 감지: 자동 Full 확장
 */
import { useState, useEffect, useCallback } from "react";

export type PanelState = "full" | "mini" | "hidden";
export type TabId = "report" | "code" | "chart" | "dashboard" | "drive" | "tasks";

export interface ArtifactContent {
  type: "report" | "code" | "chart";
  content: string;
  language?: string;
  title?: string;
}

export interface ArtifactPanelHook {
  panelState: PanelState;
  activeTab: TabId;
  artifact: ArtifactContent | null;
  setActiveTab: (tab: TabId) => void;
  setArtifact: (item: ArtifactContent | null) => void;
  toggleCollapse: () => void;
  cyclePanel: () => void;
  openTab: (tab: TabId) => void;
  showArtifact: (item: ArtifactContent) => void;
  closePanel: () => void;
}

/**
 * AI 응답 텍스트에서 아티팩트 유형 감지
 * 긴 코드 블록 → "code", 헤더+긴 텍스트 → "report", 차트 JSON → "chart"
 */
export function detectArtifactType(content: string): "report" | "code" | "chart" | null {
  if (!content || content.length < 300) return null;

  // 코드 블록이 200자 이상이면 code artifact
  const codeMatch = content.match(/```(\w*)\n([\s\S]+?)```/);
  if (codeMatch && codeMatch[2].length > 200) return "code";

  // 마크다운 헤더 + 긴 텍스트 → report artifact
  if ((content.match(/^#{1,3}\s+/m) || content.match(/^[-*]\s+/m)) && content.length > 500) {
    return "report";
  }

  // 차트 데이터 패턴 (JSON 배열 + labels/data)
  if (content.includes('"labels"') && content.includes('"data"')) return "chart";

  return null;
}

export function extractCodeFromContent(content: string): { code: string; language: string } {
  const match = content.match(/```(\w*)\n([\s\S]+?)```/);
  if (match) return { language: match[1] || "text", code: match[2] };
  return { language: "text", code: content };
}

export function useArtifactPanel(): ArtifactPanelHook {
  const [panelState, setPanelState] = useState<PanelState>("hidden");
  const [activeTab, setActiveTab] = useState<TabId>("report");
  const [artifact, setArtifact] = useState<ArtifactContent | null>(null);

  // Full↔Mini 토글 (◀ 버튼)
  const toggleCollapse = useCallback(() => {
    setPanelState((prev) => (prev === "full" ? "mini" : "full"));
  }, []);

  // 3단계 순환: hidden→full→mini→hidden (Ctrl+])
  const cyclePanel = useCallback(() => {
    setPanelState((prev) => {
      if (prev === "hidden") return "full";
      if (prev === "full") return "mini";
      return "hidden";
    });
  }, []);

  // Mini 아이콘 클릭 → 해당 탭으로 Full 확장
  const openTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setPanelState("full");
  }, []);

  // AI 응답 아티팩트 감지 → 자동 Full 확장
  const showArtifact = useCallback((item: ArtifactContent) => {
    setArtifact(item);
    const tab: TabId =
      item.type === "code" ? "code" : item.type === "chart" ? "chart" : "report";
    setActiveTab(tab);
    setPanelState("full");
  }, []);

  const closePanel = useCallback(() => {
    setPanelState("hidden");
  }, []);

  // Ctrl+] 단축키 바인딩
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "]") {
        e.preventDefault();
        cyclePanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cyclePanel]);

  return {
    panelState,
    activeTab,
    artifact,
    setActiveTab,
    setArtifact,
    toggleCollapse,
    cyclePanel,
    openTab,
    showArtifact,
    closePanel,
  };
}
