"use client";
/**
 * AADS-185-C3: ResearchProgress — Gemini Deep Research 진행 상황
 * SSE research.progress 이벤트 기반 프로그레스 바
 * 완료 시 "보고서 보기" 버튼
 */
interface ResearchProgressProps {
  isActive: boolean;
  progress: string | null;
  onViewReport?: () => void;
}

export default function ResearchProgress({
  isActive,
  progress,
  onViewReport,
}: ResearchProgressProps) {
  if (!isActive && !progress) return null;

  const isDone = progress === "완료";

  return (
    <div
      className="mb-3 rounded-xl px-4 py-3"
      style={{
        background: "var(--bg-secondary, #1e1e2e)",
        border: "1px solid var(--border, #3a3a4a)",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-lg">🔬</span>
        <div className="flex-1">
          <p className="text-xs font-medium" style={{ color: "var(--text-primary, #fff)" }}>
            {isDone ? "Deep Research 완료" : "Deep Research 진행 중..."}
          </p>
          {progress && progress !== "완료" && (
            <p
              className="text-xs mt-0.5 opacity-70 line-clamp-2"
              style={{ color: "var(--text-secondary, #888)" }}
            >
              {progress}
            </p>
          )}
        </div>
        {isDone && onViewReport && (
          <button
            onClick={onViewReport}
            className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
            style={{
              background: "var(--accent, #6366f1)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            보고서 보기
          </button>
        )}
      </div>

      {/* 프로그레스 바 */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: "4px", background: "var(--border, #3a3a4a)" }}
      >
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isDone ? "" : "animate-pulse"
          }`}
          style={{
            width: isDone ? "100%" : "60%",
            background: "var(--accent, #6366f1)",
          }}
        />
      </div>

      {/* 단계 표시 */}
      {!isDone && isActive && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {["계획 수립", "웹 검색", "분석 중", "보고서 작성"].map((step, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "var(--bg-card, #252535)",
                color: "var(--text-secondary, #888)",
                border: "1px solid var(--border, #3a3a4a)",
              }}
            >
              {step}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
