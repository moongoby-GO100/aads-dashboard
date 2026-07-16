"use client";
/**
 * AADS-172-C: useArtifactPanel
 * 아티팩트 패널 3단계(Full/Mini/Hidden) 상태 관리 훅
 * AADS-PREVIEW-FE: html_preview 타입 + preview 탭 추가
 */
import { useState, useEffect, useCallback } from "react";

export type PanelState = "full" | "mini" | "hidden";
export type TabId = "report" | "code" | "chart" | "dashboard" | "drive" | "tasks" | "preview";

export interface ArtifactContent {
  type: "report" | "code" | "chart" | "html_preview";
  content: string;
  language?: string;
  title?: string;
  html?: string;
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
 * HTML 50자+ → "html_preview", 긴 코드 블록 → "code", 헤더+긴 텍스트 → "report"
 */
export function detectArtifactType(content: string): "report" | "code" | "chart" | "html_preview" | null {
  if (!content || content.length < 300) return null;

  // HTML 코드 블록이 50자 이상이면 html_preview (code보다 우선)
  const htmlMatch = content.match(/```(?:html|htm)\n([\s\S]+?)```/i);
  if (htmlMatch && htmlMatch[1].trim().length >= 50) return "html_preview";

  // 코드 블록이 200자 이상이면 code artifact
  const codeMatch = content.match(/```(\w*)\n([\s\S]+?)```/);
  if (codeMatch && codeMatch[2].length > 200) return "code";

  // 마크다운 헤더 + 긴 텍스트 → report artifact
  if ((content.match(/^#{1,3}\s+/m) || content.match(/^[-*]\s+/m)) && content.length > 500) {
    return "report";
  }

  // 차트 데이터 패턴
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

  const toggleCollapse = useCallback(() => {
    setPanelState((prev) => (prev === "full" ? "mini" : "full"));
  }, []);

  const cyclePanel = useCallback(() => {
    setPanelState((prev) => {
      if (prev === "hidden") return "full";
      if (prev === "full") return "mini";
      return "hidden";
    });
  }, []);

  const openTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setPanelState("full");
  }, []);

  const showArtifact = useCallback((item: ArtifactContent) => {
    setArtifact(item);
    const tab: TabId =
      item.type === "html_preview" ? "preview" :
      item.type === "code" ? "code" :
      item.type === "chart" ? "chart" :
      "report";
    setActiveTab(tab);
    setPanelState("full");
  }, []);

  const closePanel = useCallback(() => {
    setPanelState("hidden");
  }, []);

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
