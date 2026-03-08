"use client";
/**
 * AADS-172-B: DeepResearchProgress
 * Deep Research 모드 진행 표시 컴포넌트
 * - 단계별 프로그레스 바
 * - 예상 소요 시간
 */
import { useEffect, useState } from "react";

type Stage = "searching" | "analyzing" | "writing" | "done";

interface StageConfig {
  label: string;
  detail: string;
  progress: number;
  duration: number; // seconds for this stage
}

const STAGES: Record<Stage, StageConfig> = {
  searching: { label: "소스 검색 중",  detail: "관련 문서 및 웹 소스 탐색",   progress: 25,  duration: 30 },
  analyzing: { label: "분석 중",       detail: "수집된 정보 분석 및 검증",     progress: 60,  duration: 60 },
  writing:   { label: "보고서 작성 중", detail: "최종 답변 및 보고서 생성",    progress: 90,  duration: 30 },
  done:      { label: "완료",          detail: "Deep Research 완료",          progress: 100, duration: 0  },
};

interface DeepResearchProgressProps {
  isActive: boolean;
  streamingText?: string;
  onEstimatedTime?: (seconds: number) => void;
}

export default function DeepResearchProgress({
  isActive,
  streamingText = "",
  onEstimatedTime,
}: DeepResearchProgressProps) {
  const [stage, setStage] = useState<Stage>("searching");
  const [searchCount, setSearchCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime] = useState(Date.now());

  // 진행 단계 감지 (streamingText 키워드 기반)
  useEffect(() => {
    if (!isActive) return;
    const text = streamingText.toLowerCase();
    if (text.includes("작성") || text.includes("보고서") || text.includes("결론")) {
      setStage("writing");
    } else if (text.includes("분석") || text.includes("검토") || text.includes("검증")) {
      setStage("analyzing");
    } else if (text.length > 0) {
      setStage("searching");
    }
  }, [streamingText, isActive]);

  // 검색 카운트 추정
  useEffect(() => {
    if (!isActive || stage !== "searching") return;
    const timer = setInterval(() => {
      setSearchCount((c) => Math.min(c + Math.floor(Math.random() * 3 + 1), 100));
    }, 1500);
    return () => clearInterval(timer);
  }, [isActive, stage]);

  // 경과 시간
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive, startTime]);

  // 예상 시간 보고
  useEffect(() => {
    const totalEstimate = 120;
    const remaining = Math.max(0, totalEstimate - elapsedSeconds);
    onEstimatedTime?.(remaining);
  }, [elapsedSeconds, onEstimatedTime]);

  if (!isActive) return null;

  const { label, detail, progress } = STAGES[stage];
  const remainingEst = Math.max(0, 120 - elapsedSeconds);

  return (
    <div
      className="mb-3 px-4 py-3 rounded-xl"
      style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="animate-pulse text-base">🔬</span>
          <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Deep Research</span>
        </div>
        <span className="text-xs" style={{ color: "#94a3b8" }}>
          {remainingEst > 0 ? `~${remainingEst}초 남음` : "완료 중..."}
        </span>
      </div>

      {/* 단계 표시 */}
      <p className="text-xs mb-2" style={{ color: "#e2e8f0" }}>
        {stage === "searching" && searchCount > 0
          ? `소스 검색 중 (${searchCount}/100)...`
          : `${label}...`}
      </p>
      <p className="text-xs mb-2" style={{ color: "#94a3b8" }}>{detail}</p>

      {/* 프로그레스 바 */}
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa)" }}
        />
      </div>

      {/* 단계 도트 */}
      <div className="flex justify-between mt-2">
        {(["searching", "analyzing", "writing"] as Stage[]).map((s) => {
          const stageOrder: Stage[] = ["searching", "analyzing", "writing", "done"];
          const done = stageOrder.indexOf(stage) > stageOrder.indexOf(s);
          const active = stage === s;
          return (
            <div key={s} className="flex items-center gap-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: done ? "#a78bfa" : active ? "#7c3aed" : "rgba(255,255,255,0.15)",
                  boxShadow: active ? "0 0 6px rgba(139,92,246,0.8)" : undefined,
                }}
              />
              <span className="text-xs" style={{ color: active ? "#a78bfa" : "#64748b", fontSize: "10px" }}>
                {STAGES[s].label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
