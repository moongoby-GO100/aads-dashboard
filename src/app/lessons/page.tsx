"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface Lesson {
  id: string;
  title: string;
  category: string;
  project: string;
  task_id: string;
  severity: "critical" | "high" | "normal" | "low";
  summary: string;
  situation?: string;
  result?: string;
  solution?: string;
  prevention?: string;
}

const CATEGORIES = ["전체", "infra", "api", "deploy", "data", "patterns"];
const PROJECTS = ["전체", "AADS", "KIS", "GO100", "NTV2", "SF", "NAS"];

const severityColor: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  normal: "#3b82f6",
  low: "#6b7280",
};

const severityBg: Record<string, string> = {
  critical: "rgba(239,68,68,0.1)",
  high: "rgba(249,115,22,0.1)",
  normal: "rgba(59,130,246,0.1)",
  low: "rgba(107,114,128,0.1)",
};

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [selectedProject, setSelectedProject] = useState("전체");
  const [modalLesson, setModalLesson] = useState<Lesson | null>(null);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const cat = selectedCategory !== "전체" ? selectedCategory : undefined;
      const proj = selectedProject !== "전체" ? selectedProject : undefined;
      const data = await api.getLessons(cat, proj);
      setLessons(data.lessons || data.items || []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "교훈 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedProject]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "var(--text-primary)", marginBottom: "8px" }}>
          교훈 (Lessons Learned)
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          프로젝트 운영 중 축적된 교훈 및 개선 사항
        </p>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
        {/* Category chips */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: "4px 12px",
                borderRadius: "999px",
                border: "1px solid",
                borderColor: selectedCategory === cat ? "var(--accent)" : "var(--border)",
                background: selectedCategory === cat ? "var(--accent)" : "transparent",
                color: selectedCategory === cat ? "#fff" : "var(--text-secondary)",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Project dropdown */}
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          {PROJECTS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          {loading ? "로딩 중..." : `${lessons.length}건`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: "16px", fontSize: "14px" }}>
          {error}
        </div>
      )}

      {/* Lessons Grid */}
      {!loading && lessons.length === 0 && !error && (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px" }}>
          해당 조건의 교훈이 없습니다.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
        {lessons.map(lesson => (
          <div
            key={lesson.id}
            onClick={() => setModalLesson(lesson)}
            style={{
              padding: "16px",
              borderRadius: "10px",
              border: `1px solid ${severityColor[lesson.severity] || "var(--border)"}`,
              background: severityBg[lesson.severity] || "var(--bg-card)",
              cursor: "pointer",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>
                {lesson.id}
              </span>
              <span style={{
                padding: "2px 8px",
                borderRadius: "999px",
                background: severityColor[lesson.severity] || "#6b7280",
                color: "#fff",
                fontSize: "11px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}>
                {lesson.severity}
              </span>
            </div>
            <h3 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "6px", lineHeight: "1.4" }}>
              {lesson.title}
            </h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                {lesson.project}
              </span>
              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                {lesson.category}
              </span>
              {lesson.task_id && (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {lesson.task_id}
                </span>
              )}
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {lesson.summary}
            </p>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modalLesson && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => setModalLesson(null)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: "12px", padding: "24px", maxWidth: "640px", width: "100%", maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{modalLesson.id} · {modalLesson.project} · {modalLesson.task_id}</span>
                <h2 style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)", marginTop: "4px" }}>{modalLesson.title}</h2>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ padding: "3px 10px", borderRadius: "999px", background: severityColor[modalLesson.severity], color: "#fff", fontSize: "12px", fontWeight: "600" }}>
                  {modalLesson.severity}
                </span>
                <button onClick={() => setModalLesson(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>

            {modalLesson.summary && (
              <Section title="요약" content={modalLesson.summary} />
            )}
            {modalLesson.situation && (
              <Section title="상황" content={modalLesson.situation} />
            )}
            {modalLesson.result && (
              <Section title="결과" content={modalLesson.result} />
            )}
            {modalLesson.solution && (
              <Section title="해결" content={modalLesson.solution} />
            )}
            {modalLesson.prevention && (
              <Section title="예방법" content={modalLesson.prevention} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <h4 style={{ fontSize: "13px", fontWeight: "600", color: "var(--accent)", marginBottom: "4px", textTransform: "uppercase" }}>{title}</h4>
      <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{content}</p>
    </div>
  );
}
