"use client";
/**
 * AADS-172-C: ArtifactTabs
 * 아티팩트 패널 탭 네비게이션 (Full: 수평, Mini: 수직 아이콘)
 * AADS-PREVIEW-FE: preview 탭 추가
 */
import type { PanelState, TabId } from "@/hooks/useArtifactPanel";

export const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: "report",    icon: "📄", label: "보고서" },
  { id: "code",      icon: "💻", label: "코드" },
  { id: "preview",   icon: "👁️", label: "미리보기" },
  { id: "chart",     icon: "📊", label: "차트" },
  { id: "dashboard", icon: "🖥️", label: "대시보드" },
  { id: "drive",     icon: "📁", label: "AI Drive" },
  { id: "tasks",     icon: "⚡", label: "작업" },
];

interface Props {
  activeTab: TabId;
  panelState: PanelState;
  onSelect: (tab: TabId) => void;
}

export default function ArtifactTabs({ activeTab, panelState, onSelect }: Props) {
  if (panelState === "hidden") return null;

  if (panelState === "mini") {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            title={t.label}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: activeTab === t.id ? "var(--ct-accent)" : "transparent",
              color: activeTab === t.id ? "#fff" : "var(--ct-text-muted)",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
          >
            {t.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-shrink-0 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--ct-border)" }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            background: "transparent",
            border: "none",
            borderBottom:
              activeTab === t.id
                ? "2px solid var(--ct-accent)"
                : "2px solid transparent",
            color: activeTab === t.id ? "var(--ct-accent)" : "var(--ct-text-muted)",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          <span>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
