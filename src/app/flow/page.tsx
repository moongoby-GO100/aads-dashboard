"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

const PROJECTS = ["AADS", "KIS", "GO100", "NTV2", "SF", "NAS"];
const FLOW_STAGES = ["find", "layout", "operate", "wrap_up"] as const;
const FLOW_LABELS: Record<string, string> = {
  find: "Find",
  layout: "Layout",
  operate: "Operate",
  wrap_up: "Wrap up",
};

type FlowStage = typeof FLOW_STAGES[number];

interface DirectiveLifecycleItem {
  task_id: string;
  title: string;
  project: string;
  status: string;
  flow_stage?: FlowStage;
  started_at?: string;
  completed_at?: string;
  error_type?: string | null;
}

function getStageStatus(item: DirectiveLifecycleItem, stage: FlowStage): "done" | "active" | "pending" {
  const stageOrder: FlowStage[] = ["find", "layout", "operate", "wrap_up"];
  const currentIdx = stageOrder.indexOf((item.flow_stage || "find") as FlowStage);
  const stageIdx = stageOrder.indexOf(stage);

  if (item.status === "completed") return "done";
  if (item.status === "running" || item.status === "active") {
    if (stageIdx < currentIdx) return "done";
    if (stageIdx === currentIdx) return "active";
    return "pending";
  }
  return "pending";
}

const stageColor: Record<string, string> = {
  done: "#22c55e",
  active: "#3b82f6",
  pending: "#4b5563",
};

export default function FlowPage() {
  const [selectedProject, setSelectedProject] = useState("AADS");
  const [items, setItems] = useState<DirectiveLifecycleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<DirectiveLifecycleItem | null>(null);

  const fetchLifecycle = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getOpsDirectiveLifecycleByProject(selectedProject, 10);
      const raw = data.items || data.directives || data || [];
      setItems(raw);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "FLOW 데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchLifecycle();
  }, [fetchLifecycle]);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "var(--text-primary)", marginBottom: "8px" }}>
          FLOW 파이프라인
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          프로젝트별 최근 작업의 Find → Layout → Operate → Wrap up 진행 현황
        </p>
      </div>

      {/* Project tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {PROJECTS.map(p => (
          <button
            key={p}
            onClick={() => setSelectedProject(p)}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "600",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: selectedProject === p ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: selectedProject === p ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.2s",
              marginBottom: "-1px",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Status */}
      {loading && (
        <div style={{ color: "var(--text-secondary)", fontSize: "14px", padding: "24px 0" }}>로딩 중...</div>
      )}
      {error && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: "16px", fontSize: "14px" }}>
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px" }}>
          {selectedProject} 프로젝트의 최근 작업이 없습니다.
        </div>
      )}

      {/* Flow pipeline table */}
      {!loading && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "12px", alignItems: "center", paddingBottom: "8px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>태스크</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              {FLOW_STAGES.map(stage => (
                <span key={stage} style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", textAlign: "center" }}>
                  {FLOW_LABELS[stage]}
                </span>
              ))}
            </div>
          </div>

          {items.map(item => (
            <div
              key={item.task_id}
              style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "12px", alignItems: "center", padding: "12px", borderRadius: "8px", background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              {/* Task info */}
              <div>
                <button
                  onClick={() => setModalItem(item)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--accent)" }}>{item.task_id}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>
                    {item.title || item.status}
                  </div>
                </button>
              </div>

              {/* FLOW stages */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", alignItems: "center" }}>
                {FLOW_STAGES.map((stage, idx) => {
                  const status = getStageStatus(item, stage);
                  return (
                    <div key={stage} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {idx > 0 && (
                        <div style={{ width: "100%", height: "2px", background: status === "pending" ? "var(--border)" : stageColor[status], flex: 1, marginRight: "4px" }} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: "none" }}>
                        <div style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: stageColor[status],
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          color: "#fff",
                          fontWeight: "700",
                          animation: status === "active" ? "pulse 1.5s infinite" : "none",
                          boxShadow: status === "active" ? "0 0 0 4px rgba(59,130,246,0.3)" : "none",
                        }}>
                          {status === "done" ? "✓" : status === "active" ? "●" : "○"}
                        </div>
                        <span style={{ fontSize: "10px", color: stageColor[status], fontWeight: "600" }}>
                          {FLOW_LABELS[stage]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
        }
      `}</style>

      {/* Modal */}
      {modalItem && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={() => setModalItem(null)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: "12px", padding: "24px", maxWidth: "500px", width: "100%", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)" }}>{modalItem.task_id}</h2>
              <button onClick={() => setModalItem(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>
            <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
              {[
                ["제목", modalItem.title],
                ["프로젝트", modalItem.project],
                ["상태", modalItem.status],
                ["FLOW 단계", modalItem.flow_stage ? FLOW_LABELS[modalItem.flow_stage] || modalItem.flow_stage : "-"],
                ["시작", modalItem.started_at || "-"],
                ["완료", modalItem.completed_at || "-"],
                ["오류", modalItem.error_type || "-"],
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 0", color: "var(--text-secondary)", width: "80px", fontWeight: "600" }}>{label}</td>
                  <td style={{ padding: "8px 0", color: "var(--text-primary)" }}>{value}</td>
                </tr>
              ))}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
