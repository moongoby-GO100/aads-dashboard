"use client";
/**
 * AADS-172-B: ActionChips
 * 입력창 위 빠른 액션 칩
 * - 웰컴 화면: 고정 5개 칩
 * - 대화 중: 컨텍스트 기반 동적 칩
 * - 칩 클릭 → 자동 메시지 전송
 */

export interface ActionChip {
  id: string;
  label: string;
  message: string;    // 전송될 메시지
  icon?: string;
}

export const WELCOME_CHIPS: ActionChip[] = [
  { id: "briefing",    label: "오늘의 브리핑",  message: "오늘 AADS 전체 상태 브리핑해줘",         icon: "📋" },
  { id: "competitor",  label: "경쟁사 분석",    message: "현재 AI 개발 자동화 경쟁사 분석해줘",     icon: "🔍" },
  { id: "project",     label: "프로젝트 현황",  message: "6개 프로젝트 전체 현황 요약해줘",         icon: "📊" },
  { id: "code-review", label: "코드 리뷰",      message: "최근 커밋된 코드 리뷰해줘",               icon: "💻" },
  { id: "directive",   label: "지시서 작성",    message: "새 지시서 작성 도와줘",                   icon: "✍️" },
];

// 컨텍스트 기반 동적 칩 생성 (마지막 메시지 내용 기반)
export function getDynamicChips(lastAssistantMessage: string): ActionChip[] {
  const msg = lastAssistantMessage.toLowerCase();
  const chips: ActionChip[] = [];

  if (msg.includes("검색") || msg.includes("소스") || msg.includes("결과")) {
    chips.push({ id: "deep-analysis", label: "심층 분석", message: "방금 내용 더 심층적으로 분석해줘", icon: "🧠" });
    chips.push({ id: "report",        label: "보고서 생성", message: "방금 내용으로 보고서 작성해줘", icon: "📄" });
  }
  if (msg.includes("오류") || msg.includes("에러") || msg.includes("버그")) {
    chips.push({ id: "fix",    label: "수정 제안",  message: "해결 방안 제시해줘",           icon: "🔧" });
    chips.push({ id: "ticket", label: "이슈 생성",  message: "지시서로 이슈 등록해줘",       icon: "🎫" });
  }
  if (msg.includes("데이터") || msg.includes("db") || msg.includes("쿼리")) {
    chips.push({ id: "optimize", label: "쿼리 최적화", message: "쿼리 최적화 방안 알려줘", icon: "⚡" });
  }
  if (msg.includes("코드") || msg.includes("함수") || msg.includes("api")) {
    chips.push({ id: "test",    label: "테스트 작성", message: "테스트 코드 작성해줘", icon: "🧪" });
    chips.push({ id: "docs",    label: "문서화",      message: "문서 작성해줘",        icon: "📝" });
  }

  // 기본 칩
  chips.push({ id: "summary",    label: "요약",        message: "위 내용 요약해줘",     icon: "📌" });
  chips.push({ id: "next-step",  label: "다음 단계",   message: "다음 단계는 뭐야?",    icon: "▶" });

  return chips.slice(0, 5);
}

interface ActionChipsProps {
  chips: ActionChip[];
  onChipClick: (message: string) => void;
  disabled?: boolean;
}

export default function ActionChips({ chips, onChipClick, disabled }: ActionChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => !disabled && onChipClick(chip.message)}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
          }}
        >
          {chip.icon && <span>{chip.icon}</span>}
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
