"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { chatApi } from "@/app/chat/api";
import TerminalPane from "@/components/chat/terminal";

type WorkspaceChangeItem = {
  session_id: string;
  project: string;
  repo: string;
  file_path: string;
  source_tool?: string;
  change_summary?: string;
  status: "dirty" | "committed" | "pushed" | "deployed" | string;
  last_error?: string;
  commit_sha?: string | null;
  commit_message?: string | null;
  updated_at?: string | null;
  last_modified_at?: string | null;
  finalized_at?: string | null;
  pushed_at?: string | null;
  deployed_at?: string | null;
};

type WorkspaceChangeListResponse = {
  items: WorkspaceChangeItem[];
  count: number;
};

type WorkspaceFinalizeGroup = {
  project: string;
  repo: string;
  files: string[];
  ok: boolean;
  status: string;
  commit_sha?: string | null;
  commit_message?: string;
  detail?: string;
};

type WorkspaceFinalizeResponse = {
  ok: boolean;
  session_id: string;
  reason: string;
  groups: WorkspaceFinalizeGroup[];
  pending_groups: number;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function summarizeFinalize(result: WorkspaceFinalizeResponse): string {
  if (!result.groups.length) return "반영할 변경 없음";
  return result.groups
    .map((group) => {
      const sha = group.commit_sha ? ` ${group.commit_sha.slice(0, 8)}` : "";
      return `${group.repo}:${group.status}${sha}`;
    })
    .join(" | ");
}

function statusTone(status: string): { color: string; bg: string; border: string } {
  switch (status) {
    case "dirty":
      return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" };
    case "committed":
      return { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.28)" };
    case "pushed":
      return { color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
    case "deployed":
      return { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.28)" };
    default:
      return { color: "var(--ct-text2)", bg: "var(--ct-hover)", border: "var(--ct-border)" };
  }
}

export default function ChatOpsDock({
  activeSessionId,
  screenSize,
}: {
  activeSessionId: string | null;
  screenSize: string;
}) {
  const isMobile = screenSize === "mobile";
  const [showWorkspacePanel, setShowWorkspacePanel] = useState(false);
  const [showTerminalPanel, setShowTerminalPanel] = useState(false);

  const [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChangeItem[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeSummary, setFinalizeSummary] = useState<string | null>(null);

  const workspaceSummary = useMemo(() => {
    return workspaceChanges.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
  }, [workspaceChanges]);

  const workspacePanelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: "12px",
        right: "12px",
        bottom: "96px",
        maxHeight: "65vh",
      }
    : {
        position: "absolute",
        left: 0,
        bottom: "calc(100% + 8px)",
        width: "min(460px, 88vw)",
        maxHeight: "68vh",
      };

  const loadWorkspaceChanges = useCallback(async (silent = false) => {
    if (!activeSessionId) {
      setWorkspaceChanges([]);
      setWorkspaceError(null);
      return;
    }
    if (!silent) setWorkspaceLoading(true);
    try {
      const query = `/ops/workspace-changes?session_id=${encodeURIComponent(activeSessionId)}&project=AADS`;
      const result = await chatApi<WorkspaceChangeListResponse>(query);
      setWorkspaceChanges(result.items || []);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "workspace 상태 조회 실패");
    } finally {
      if (!silent) setWorkspaceLoading(false);
    }
  }, [activeSessionId]);

  const finalizeWorkspaceChanges = useCallback(async () => {
    if (!activeSessionId) return;
    setFinalizeLoading(true);
    setFinalizeSummary(null);
    try {
      const result = await chatApi<WorkspaceFinalizeResponse>("/ops/workspace-changes/finalize", {
        method: "POST",
        body: JSON.stringify({
          session_id: activeSessionId,
          project: "AADS",
          reason: "chat_ui_manual_finalize",
        }),
      });
      setFinalizeSummary(summarizeFinalize(result));
      await loadWorkspaceChanges(true);
    } catch (error) {
      setFinalizeSummary(error instanceof Error ? error.message : "finalize 실패");
    } finally {
      setFinalizeLoading(false);
    }
  }, [activeSessionId, loadWorkspaceChanges]);

  useEffect(() => {
    if (!showWorkspacePanel) return;
    void loadWorkspaceChanges();
    const interval = window.setInterval(() => {
      void loadWorkspaceChanges(true);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceChanges, showWorkspacePanel]);

  useEffect(() => {
    if (!activeSessionId) {
      setWorkspaceChanges([]);
      setFinalizeSummary(null);
    }
  }, [activeSessionId]);

  const pendingCount = (workspaceSummary.dirty || 0) + (workspaceSummary.committed || 0);

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => {
            setShowWorkspacePanel((prev) => !prev);
            setShowTerminalPanel(false);
          }}
          style={{
            fontSize: "11px",
            whiteSpace: "nowrap",
            padding: "4px 10px",
            borderRadius: "10px",
            background: pendingCount > 0 ? "rgba(245,158,11,0.14)" : "var(--ct-hover)",
            color: pendingCount > 0 ? "#f59e0b" : "var(--ct-text2)",
            border: `1px solid ${pendingCount > 0 ? "rgba(245,158,11,0.35)" : "var(--ct-border)"}`,
            cursor: "pointer",
          }}
        >
          작업 상태{pendingCount > 0 ? ` ${pendingCount}` : ""}
        </button>
        {showWorkspacePanel && (
          <div
            style={{
              ...workspacePanelStyle,
              zIndex: 40,
              overflow: "hidden",
              background: "var(--ct-panel)",
              border: "1px solid var(--ct-border)",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.32)",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)" }}>Workspace Change 상태</div>
                <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "2px" }}>
                  session {activeSessionId ? activeSessionId.slice(0, 8) : "-"} / pending {pendingCount}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => void loadWorkspaceChanges()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: "var(--ct-hover)",
                    border: "1px solid var(--ct-border)",
                    color: "var(--ct-text2)",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  새로고침
                </button>
                <button
                  onClick={() => void finalizeWorkspaceChanges()}
                  disabled={!activeSessionId || finalizeLoading || workspaceLoading || workspaceChanges.length === 0}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "8px",
                    background: finalizeLoading ? "#6b7280" : "var(--ct-accent)",
                    border: "none",
                    color: "#fff",
                    cursor: !activeSessionId || finalizeLoading || workspaceChanges.length === 0 ? "not-allowed" : "pointer",
                    opacity: !activeSessionId || finalizeLoading || workspaceChanges.length === 0 ? 0.5 : 1,
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {finalizeLoading ? "반영중..." : "Finalize"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
              {["dirty", "committed", "pushed", "deployed"].map((status) => {
                const tone = statusTone(status);
                return (
                  <span
                    key={status}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      color: tone.color,
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                    }}
                  >
                    {status} {workspaceSummary[status] || 0}
                  </span>
                );
              })}
            </div>

            {finalizeSummary && (
              <div style={{
                marginBottom: "10px",
                padding: "8px 10px",
                borderRadius: "10px",
                fontSize: "11px",
                lineHeight: 1.5,
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.18)",
                color: "var(--ct-text2)",
              }}>
                {finalizeSummary}
              </div>
            )}

            <div style={{ maxHeight: "48vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {!activeSessionId && (
                <div style={{ padding: "10px", borderRadius: "10px", background: "var(--ct-bg2)", color: "var(--ct-text2)", fontSize: "12px" }}>
                  활성 채팅 세션이 없습니다. 파일 수정이 기록된 세션에서 확인 가능합니다.
                </div>
              )}
              {workspaceLoading && <div style={{ color: "var(--ct-text2)", fontSize: "12px" }}>불러오는 중...</div>}
              {workspaceError && <div style={{ color: "#ef4444", fontSize: "12px" }}>{workspaceError}</div>}
              {!workspaceLoading && activeSessionId && workspaceChanges.length === 0 && !workspaceError && (
                <div style={{ padding: "10px", borderRadius: "10px", background: "var(--ct-bg2)", color: "var(--ct-text2)", fontSize: "12px" }}>
                  기록된 변경이 없습니다.
                </div>
              )}
              {workspaceChanges.map((item) => {
                const tone = statusTone(item.status);
                return (
                  <div
                    key={`${item.repo}:${item.file_path}`}
                    style={{
                      background: "var(--ct-bg2)",
                      border: "1px solid var(--ct-border)",
                      borderRadius: "12px",
                      padding: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ct-text)", wordBreak: "break-all" }}>
                          {item.file_path}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--ct-text2)", marginTop: "4px" }}>
                          {item.repo} {item.source_tool ? `· ${item.source_tool}` : ""} · {formatDate(item.updated_at || item.last_modified_at)}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: tone.color,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`,
                      }}>
                        {item.status}
                      </span>
                    </div>
                    {item.change_summary && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ct-text2)", lineHeight: 1.5 }}>
                        {item.change_summary}
                      </div>
                    )}
                    {(item.commit_sha || item.deployed_at || item.last_error) && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ct-text2)", lineHeight: 1.5 }}>
                        {item.commit_sha ? `SHA ${item.commit_sha.slice(0, 8)}` : ""}
                        {item.deployed_at ? `${item.commit_sha ? " · " : ""}배포 ${formatDate(item.deployed_at)}` : ""}
                        {item.last_error ? (
                          <div style={{ marginTop: "4px", color: "#ef4444", wordBreak: "break-word" }}>{item.last_error}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button
          onClick={() => {
            setShowTerminalPanel((prev) => !prev);
            setShowWorkspacePanel(false);
          }}
          style={{
            fontSize: "11px",
            whiteSpace: "nowrap",
            padding: "4px 10px",
            borderRadius: "10px",
            background: "rgba(34,197,94,0.14)",
            color: "#22c55e",
            border: "1px solid rgba(34,197,94,0.35)",
            cursor: "pointer",
          }}
        >
          Terminal
        </button>
        {showTerminalPanel && (
          <div
            style={{
              ...(isMobile
                ? {
                    position: "fixed",
                    left: "12px",
                    right: "12px",
                    bottom: "96px",
                    maxHeight: "72vh",
                  }
                : {
                    position: "absolute",
                    left: 0,
                    bottom: "calc(100% + 8px)",
                    width: "min(640px, 94vw)",
                    maxHeight: "76vh",
                  }),
              zIndex: 40,
              overflow: "hidden",
              background: "var(--ct-panel)",
              border: "1px solid var(--ct-border)",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.32)",
              padding: "12px",
            }}
          >
            <TerminalPane
              activeSessionId={activeSessionId}
              screenSize={screenSize}
              panelOpen={showTerminalPanel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
