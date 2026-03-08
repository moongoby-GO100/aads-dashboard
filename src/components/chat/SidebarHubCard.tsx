"use client";

interface SidebarHubCardProps {
  id: string;
  name: string;
  icon: string;
  sessionCount: number;
  isSelected: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}

export default function SidebarHubCard({
  name,
  icon,
  sessionCount,
  isSelected,
  isCollapsed,
  onClick,
}: SidebarHubCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
      style={{
        background: isSelected ? "var(--ct-accent)" : "transparent",
        color: isSelected ? "#fff" : "var(--ct-text)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLElement).style.background = "var(--ct-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
      title={isCollapsed ? name : undefined}
    >
      <span className="text-base flex-shrink-0">{icon}</span>
      {!isCollapsed && (
        <>
          <span className="flex-1 text-sm font-medium truncate">{name}</span>
          {sessionCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
              style={{
                background: isSelected
                  ? "rgba(255,255,255,0.25)"
                  : "var(--ct-accent)",
                color: "#fff",
              }}
            >
              {sessionCount}
            </span>
          )}
        </>
      )}
    </button>
  );
}
