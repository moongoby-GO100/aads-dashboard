"use client";

export interface SlashCommand {
  cmd: string;
  desc: string;
  expand: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/상태", desc: "전체 시스템 상태 확인", expand: "전체 시스템 상태 확인해줘" },
  { cmd: "/헬스체크", desc: "서비스 헬스체크 실행", expand: "모든 서비스 헬스체크 실행해" },
  { cmd: "/비용", desc: "최근 API 비용 보고", expand: "최근 API 사용 비용 보고해" },
  { cmd: "/배포", desc: "최근 배포 상태 확인", expand: "최근 배포 작업 상태 확인해" },
  { cmd: "/세션", desc: "현재 세션 정보", expand: "현재 세션 정보 보여줘" },
  { cmd: "/검색", desc: "웹 검색", expand: "다음을 검색해줘: " },
  { cmd: "/코드", desc: "코드 분석/수정", expand: "다음 코드를 분석해줘: " },
  { cmd: "/파이프라인", desc: "Pipeline Runner 상태", expand: "Pipeline Runner 전체 작업 상태 확인해" },
  { cmd: "/도움말", desc: "사용 가능한 명령어 목록", expand: "" },
];

interface SlashCommandMenuProps {
  filter: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  position: { bottom: number; left: number };
}

export default function SlashCommandMenu({
  filter,
  selectedIndex,
  onSelect,
  position,
}: SlashCommandMenuProps) {
  const filtered = SLASH_COMMANDS.filter((c) =>
    c.cmd.startsWith("/" + filter)
  );

  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: position.bottom,
        left: position.left,
        width: "280px",
        maxHeight: "300px",
        overflowY: "auto",
        background: "var(--ct-card, #1e1e2e)",
        border: "1px solid var(--ct-border, #333)",
        borderRadius: "10px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        zIndex: 100,
        padding: "4px 0",
      }}
    >
      {filtered.map((cmd, i) => (
        <div
          key={cmd.cmd}
          onClick={() => onSelect(cmd)}
          style={{
            padding: "8px 14px",
            cursor: "pointer",
            background:
              i === selectedIndex
                ? "var(--ct-accent, #6d28d9)"
                : "transparent",
            color:
              i === selectedIndex ? "#fff" : "var(--ct-text, #e0e0e0)",
            transition: "background 0.1s",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
          onMouseEnter={(e) => {
            if (i !== selectedIndex) {
              e.currentTarget.style.background =
                "var(--ct-hover, rgba(255,255,255,0.05))";
            }
          }}
          onMouseLeave={(e) => {
            if (i !== selectedIndex) {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "13px" }}>{cmd.cmd}</span>
          <span
            style={{
              fontSize: "11px",
              color:
                i === selectedIndex
                  ? "rgba(255,255,255,0.8)"
                  : "var(--ct-text-secondary, #888)",
            }}
          >
            {cmd.desc}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 필터에 맞는 명령어 수 반환 (외부에서 selectedIndex 범위 제한용) */
export function getFilteredCount(filter: string): number {
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith("/" + filter)).length;
}
