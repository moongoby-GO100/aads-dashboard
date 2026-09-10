"use client";
import React, { memo, useRef, useCallback, useState, useEffect } from "react";
import type { Artifact, ArtifactMode, ArtifactTab, ScreenSize, ChatSession, ChatMessage } from "./types";
import ArtifactTaskMonitor from "@/components/chat/ArtifactTaskMonitor";
import TaskCard from "@/components/tasks/TaskCard";
import { MarkdownBlock } from "./MarkdownRenderer";
import { BASE_URL, authHdrs, updateArtifact } from "./api";

const ARTIFACT_PANEL_MIN_WIDTH = 420;
const ARTIFACT_PANEL_DEFAULT_WIDTH = 600;
const ARTIFACT_PANEL_MAX_FALLBACK = 1180;

const clampArtifactPanelWidth = (width: number) => {
  const viewportMax =
    typeof window !== "undefined"
      ? Math.max(ARTIFACT_PANEL_MIN_WIDTH, Math.floor(window.innerWidth * 0.82))
      : ARTIFACT_PANEL_MAX_FALLBACK;
  return Math.min(viewportMax, Math.max(ARTIFACT_PANEL_MIN_WIDTH, Math.round(width)));
};

interface AgendaItem {
  id: string | number;
  project: string;
  title: string;
  summary: string;
  status: string;
  priority: string;
  decision?: string;
  tags?: string[];
  created_at: string;
  source_session_id?: string | null;
}

const AGENDA_STATUS_COLORS: Record<string, string> = {
  "논의중": "#3b82f6",
  "결정": "#22c55e",
  "진행중": "#f97316",
  "완료": "#6b7280",
  "보류": "#eab308",
  "폐기": "#ef4444",
};

const AGENDA_PRIORITY_COLORS: Record<string, string> = {
  "P0": "#ef4444",
  "P1": "#f97316",
  "P2": "#3b82f6",
  "P3": "#6b7280",
};

interface RunnerJob {
  job_id: string;
  project: string;
  instruction: string;
  status: string;
  phase: string | null;
  display_status?: string;
  status_label?: string;
  cycle: number;
  error_detail: string | null;
  error_message: string | null;
  depends_on: string | null;
  model?: string;
  worker_model?: string;
  actual_model?: string;
  size?: string;
  created_at: string | null;
  started_at: string | null;
  updated_at: string | null;
}

interface DeployQueueItem {
  id?: number;
  project?: string;
  component?: string | null;
  deploy_type?: string | null;
  target_env?: string | null;
  release_sha?: string | null;
  runner_job_id?: string | null;
  status?: string;
  phase?: string;
  queue_position?: number | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  phase_started_at?: string | null;
  phase_completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  estimated_remaining_ms?: number | null;
  duration_ms?: number | null;
  bg_sync_status?: string | null;
  stalled?: boolean;
  effective_status?: string | null;
  release_title?: string | null;
  release_summary?: string | null;
  changed_files?: string[];
  changed_file_count?: number | null;
}

interface DeployDurationItem {
  project?: string;
  sample_count?: number;
  avg_duration_ms?: number | null;
  p50_duration_ms?: number | null;
  p90_duration_ms?: number | null;
  last_completed_at?: string | null;
  source?: string;
}

interface DeployProjectOverviewItem {
  id?: number;
  project?: string;
  component?: string | null;
  deploy_type?: string | null;
  target_env?: string | null;
  status?: string;
  effective_status?: string | null;
  phase?: string | null;
  release_sha?: string | null;
  runner_job_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  last_deploy_at?: string | null;
  last_success_sha?: string | null;
  source?: string;
  has_deploy_run?: boolean;
  has_pipeline_job?: boolean;
  is_active?: boolean;
  is_queued?: boolean;
  duration_ms?: number | null;
  release_title?: string | null;
  release_summary?: string | null;
  changed_files?: string[];
  changed_file_count?: number | null;
}

interface DeploySignalItem {
  runner_job_id?: string;
  project?: string;
  status?: string;
  phase?: string;
  signal?: string;
  idle_seconds?: number | null;
  requires_ceo_approval?: boolean;
}

interface DeployObservabilityStatus {
  generated_at?: string;
  degraded?: boolean;
  degraded_reasons?: string[];
  active_deployments?: DeployQueueItem[];
  queued_deployments?: DeployQueueItem[];
  recent_completed_deployments?: DeployQueueItem[];
  recent_deployments?: DeployQueueItem[];
  recent_durations_per_project?: DeployDurationItem[];
  project_deployments?: DeployProjectOverviewItem[];
  component_deployments?: DeployProjectOverviewItem[];
  phase_timeline?: DeployQueueItem[];
  stale_zombie_signals?: DeploySignalItem[];
  bg_digest_sync?: DeployQueueItem[];
  next_deploy_readiness?: {
    ready?: boolean;
    blockers?: string[];
    next_queued_runner_job_id?: string | null;
  };
}

export interface ChatArtifactPanelProps {
  screenSize: ScreenSize;
  showArtifactPanel: boolean;
  artifactMode: ArtifactMode;
  setArtifactMode: (v: ArtifactMode) => void;
  mobileOverlay: "sidebar" | "artifact" | null;
  setMobileOverlay: (v: "sidebar" | "artifact" | null) => void;
  artifacts: Artifact[];
  artifactTab: ArtifactTab;
  setArtifactTab: (v: ArtifactTab) => void;
  artifactCounts: Record<string, number>;
  filteredArtifacts: Artifact[];
  activeArtifact: Artifact | null;
  selectedArtifactIdx: number;
  setSelectedArtifactIdx: (v: number) => void;
  activeSession: ChatSession | null;
  copyArtifact: (content: string) => void;
  toDirective: (a: Artifact) => void | Promise<void>;
  systemMessages?: ChatMessage[];
  unreadLogCount?: number;
  sessionId?: string;
}

/** 우측 아티팩트 패널 — 보고서/코드/차트/대시보드/작업 탭 */

function formatDurationText(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "-";
  const safeSeconds = Math.max(0, Math.round(seconds));
  if (safeSeconds < 60) return `${safeSeconds}초`;
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  if (minutes < 60) return `${minutes}분 ${restSeconds}초`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}시간 ${restMinutes}분`;
}

function formatMillis(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return formatDurationText(Math.round(ms / 1000));
}

function formatKst(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function deployTone(status: string | undefined | null): string {
  switch ((status || "").toLowerCase()) {
    case "ready":
    case "completed":
    case "success":
    case "synced":
      return "#22c55e";
    case "queued":
    case "awaiting_approval":
    case "verifying":
    case "syncing_standby":
    case "unknown":
      return "#f59e0b";
    case "running":
      return "#3b82f6";
    case "stalled":
    case "error":
    case "failed":
    case "mismatch":
    case "blocked":
    case "cancelled":
    case "superseded":
      return "#ef4444";
    default:
      return "var(--ct-text2)";
  }
}

function effectiveDeployStatus(item: { status?: string | null; effective_status?: string | null; stalled?: boolean }): string {
  if (item.stalled) return "stalled";
  return (item.effective_status || item.status || "unknown").toLowerCase();
}

function deployStatusLabel(status: string | null | undefined): string {
  switch ((status || "unknown").toLowerCase()) {
    case "queued": return "대기";
    case "awaiting_approval": return "승인 대기";
    case "running":
    case "verifying":
    case "syncing_standby": return "진행 중";
    case "stalled": return "지연·확인 필요";
    case "completed":
    case "success": return "완료";
    case "failed":
    case "error": return "실패";
    case "blocked": return "차단";
    case "cancelled": return "취소";
    case "superseded": return "대체됨";
    case "unknown": return "이력 없음";
    default: return status || "이력 없음";
  }
}

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function deployTargetLabel(item: { project?: string; component?: string | null; target_env?: string | null }): string {
  const project = item.project || "-";
  const component = item.component && item.component !== "api" ? `/${item.component}` : "";
  const env = item.target_env && item.target_env !== "production" ? ` · ${item.target_env}` : "";
  return `${project}${component}${env}`;
}

function isTerminalDeployStatus(status: string | null | undefined): boolean {
  return ["completed", "success", "failed", "error", "blocked", "superseded", "cancelled"].includes((status || "").toLowerCase());
}

function deployStartedAt(item: DeployQueueItem): string | null {
  return item.started_at || item.requested_at || item.created_at || item.phase_started_at || item.updated_at || null;
}

function deployFinishedAt(item: DeployQueueItem): string | null {
  return item.completed_at || item.phase_completed_at || (isTerminalDeployStatus(item.status) ? item.updated_at || null : null);
}

function deployElapsed(item: DeployQueueItem, nowMs: number): string {
  const start = deployStartedAt(item);
  if (!start) return "-";
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return "-";
  const end = deployFinishedAt(item);
  const endMs = end ? new Date(end).getTime() : nowMs;
  if (Number.isNaN(endMs)) return "-";
  return formatDurationText((endMs - startMs) / 1000);
}

function deployAppliedSummary(item: DeployQueueItem): string {
  const title = (item.release_title || item.release_summary || "").trim();
  if (title) return title;
  const files = item.changed_files || [];
  if (files.length > 0) return `${files[0]} 등 ${item.changed_file_count || files.length}개 파일 변경`;
  return "적용 내용 미기록";
}

function DeployChangeSummary({ item }: { item: DeployQueueItem }) {
  const files = item.changed_files || [];
  return (
    <div style={{
      marginTop: 8,
      borderTop: "1px solid var(--ct-border)",
      paddingTop: 8,
      minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: "var(--ct-text2)", marginBottom: 3 }}>적용 내용</div>
      <div style={{ fontSize: 12, fontWeight: 750, color: "var(--ct-text)", lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {deployAppliedSummary(item)}
      </div>
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
          {files.slice(0, 4).map((file) => (
            <span key={file} style={{
              border: "1px solid var(--ct-border)",
              borderRadius: 6,
              padding: "2px 6px",
              fontSize: 10,
              color: "var(--ct-text2)",
              fontFamily: "monospace",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {file}
            </span>
          ))}
          {(item.changed_file_count || files.length) > files.slice(0, 4).length && (
            <span style={{ fontSize: 10, color: "var(--ct-text2)", padding: "2px 0" }}>
              +{(item.changed_file_count || files.length) - files.slice(0, 4).length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatDeployTime(dateStr: string | null | undefined, includeDate = false): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (includeDate || !isToday) {
    return `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")} ${time}`;
  }
  return time;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function projectOverviewElapsed(startedAt: string | null | undefined, nowMs: number): string {
  if (!startedAt) return "-";
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) return "-";
  return formatDurationText((nowMs - startMs) / 1000);
}

const ALL_PROJECTS: readonly string[] = ["AADS", "FOOD", "GO100", "KIS", "SF", "NTV2", "NAS"];

function DeployStatusCard({
  status,
  loading,
  error,
  nowMs,
  onRefresh,
}: {
  status: DeployObservabilityStatus | null;
  loading: boolean;
  error: string | null;
  nowMs: number;
  onRefresh: () => void;
}) {
  const active = status?.active_deployments || [];
  const queued = status?.queued_deployments || [];
  const history = status?.recent_deployments?.length
    ? status.recent_deployments
    : status?.recent_completed_deployments || [];
  const durations = status?.recent_durations_per_project || [];
  const projectDeployments = status?.project_deployments || [];
  const projectDeploymentsByName = new Map(projectDeployments.map((item) => [item.project, item]));
  const projectDisplayItems: DeployProjectOverviewItem[] = [
    ...ALL_PROJECTS.map((p) => projectDeploymentsByName.get(p) || ({ project: p, status: "미등록" } as DeployProjectOverviewItem)),
    ...projectDeployments.filter((item) => item.project && ALL_PROJECTS.indexOf(item.project) === -1),
  ];
  const componentDeployments = status?.component_deployments || [];
  const staleSignals = status?.stale_zombie_signals || [];
  const blockers = status?.next_deploy_readiness?.blockers || [];
  const current = active[0] || queued[0] || null;
  const currentProject = current?.project;
  const currentDuration = currentProject
    ? durations.find((item) => item.project === currentProject)
    : null;
  const estimatedRemaining = current?.estimated_remaining_ms != null
    ? formatMillis(current.estimated_remaining_ms)
    : currentDuration?.p50_duration_ms != null
      ? `P50 ${formatMillis(currentDuration.p50_duration_ms)}`
      : "-";
  const currentStatus = current ? effectiveDeployStatus(current) : null;
  const cards = [
    { label: "현재 배포", value: current ? `${current.id != null ? `#${current.id}` : current.runner_job_id || "ID 없음"} · ${deployStatusLabel(currentStatus)}` : "대기 없음", tone: deployTone(currentStatus) },
    { label: "현재 Phase", value: current?.phase || "-", tone: deployTone(currentStatus || current?.phase) },
    { label: "경과시간", value: current ? deployElapsed(current, nowMs) : "-", tone: "var(--ct-text)" },
    { label: "예상잔여", value: estimatedRemaining, tone: "var(--ct-text)" },
    { label: "대기건", value: `${queued.length}건`, tone: queued.length ? "#f59e0b" : "#22c55e" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ct-text)" }}>배포 상태</div>
          <div style={{ fontSize: 11, color: "var(--ct-text2)", marginTop: 2 }}>
            수집 {status?.generated_at ? formatKst(status.generated_at) : "-"}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="배포 상태 새로고침"
          style={{
            padding: "5px 9px",
            borderRadius: 6,
            border: "1px solid var(--ct-border)",
            background: "var(--ct-hover)",
            color: "var(--ct-text2)",
            fontSize: 11,
            cursor: loading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          새로고침
        </button>
      </div>

      {error && (
        <div style={{
          border: "1px solid rgba(239,68,68,0.35)",
          background: "rgba(239,68,68,0.1)",
          color: "#fca5a5",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 11,
          lineHeight: 1.45,
          overflowWrap: "anywhere",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            background: "var(--ct-card)",
            border: "1px solid var(--ct-border)",
            borderRadius: 8,
            padding: "9px 10px",
            minWidth: 0,
          }}>
            <div style={{ fontSize: 10, color: "var(--ct-text2)", marginBottom: 5 }}>{card.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: card.tone, overflowWrap: "anywhere" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {status?.degraded && (
        <div style={{
          border: "1px solid rgba(245,158,11,0.42)",
          background: "rgba(245,158,11,0.1)",
          color: "#fbbf24",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 11,
          lineHeight: 1.45,
          overflowWrap: "anywhere",
        }}>
          제한 수집: {(status.degraded_reasons || []).join(", ") || "unknown"}
        </div>
      )}

      <div style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "10px 11px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 9 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)" }}>프로젝트별 배포 현황</div>
          <div style={{ fontSize: 10, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{projectDeployments.length}/{projectDisplayItems.length}개</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 7 }}>
          {projectDisplayItems.map((item) => {
            const isPlaceholder = item.status === "미등록";
            const itemStatus = effectiveDeployStatus(item);
            const tone = isPlaceholder ? "var(--ct-text2)" : deployTone(itemStatus || item.phase);
            const lastTime = item.last_deploy_at || item.completed_at || item.updated_at || item.started_at;
            const inProgress = !isPlaceholder && (item.is_active || item.is_queued);
            return (
              <div
                key={item.project || "unknown-project"}
                style={{
                  border: `1px solid ${inProgress ? tone : "var(--ct-border)"}`,
                  borderRadius: 8,
                  padding: "8px 9px",
                  minWidth: 0,
                  background: inProgress ? "rgba(59,130,246,0.08)" : "transparent",
                  opacity: isPlaceholder ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center", minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {deployTargetLabel(item)}
                  </span>
                  <span style={{ fontSize: 10, color: tone, fontWeight: 750, whiteSpace: "nowrap" }}>
                      {deployStatusLabel(itemStatus)}
                  </span>
                </div>
                {isPlaceholder ? (
                  <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 5 }}>배포 이력 없음</div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.phase || "phase 없음"}
                    </div>
                    {item.started_at && (
                      <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 5, whiteSpace: "nowrap" }}>
                        시작 {formatDeployTime(item.started_at)}
                      </div>
                    )}
                    {item.completed_at ? (
                      <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 3, whiteSpace: "nowrap" }}>
                        완료 {formatDeployTime(item.completed_at)}
                      </div>
                    ) : inProgress && item.started_at ? (
                      <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3, whiteSpace: "nowrap" }}>
                        ⏱ {projectOverviewElapsed(item.started_at, nowMs)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 3, whiteSpace: "nowrap" }}>
                        최근 {formatKst(lastTime)}
                      </div>
                    )}
                    <div style={{
                      fontSize: 10,
                      color: "var(--ct-text2)",
                      marginTop: 5,
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {item.id != null ? `배포 #${item.id}` : shortSha(item.release_sha || item.last_success_sha) !== "-" ? `sha ${shortSha(item.release_sha || item.last_success_sha)}` : item.runner_job_id || item.source || "-"}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {[...active, ...queued].length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...active, ...queued].slice(0, 8).map((item, index) => {
            const itemStatus = effectiveDeployStatus(item);
            const tone = deployTone(itemStatus || item.phase);
            return (
              <div key={`${item.id || item.runner_job_id || index}-${index}`} style={{
                background: "var(--ct-card)",
                border: `1px solid ${item.stalled ? "#ef4444" : "var(--ct-border)"}`,
                borderRadius: 8,
                padding: "10px 11px",
                minWidth: 0,
              }}>
                {item.release_title && (
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", marginBottom: 5, overflowWrap: "anywhere" }}>
                    {item.release_title}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 7, minWidth: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", whiteSpace: "nowrap" }}>
                    {deployTargetLabel(item)}
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: tone,
                    border: `1px solid ${tone}`,
                    borderRadius: 999,
                    padding: "1px 7px",
                    whiteSpace: "nowrap",
                  }}>
                    {deployStatusLabel(itemStatus)}
                  </span>
                  {item.id != null && (
                    <span style={{ fontSize: 10, color: "var(--ct-text)", fontWeight: 800, whiteSpace: "nowrap" }}>
                      배포 #{item.id}
                    </span>
                  )}
                  {item.queue_position != null && (
                    <span style={{ fontSize: 10, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>
                      #{item.queue_position}
                    </span>
                  )}
                  {(item.changed_file_count || 0) > 0 && (
                    <span style={{
                      fontSize: 10,
                      color: "var(--ct-text2)",
                      border: "1px solid var(--ct-border)",
                      borderRadius: 999,
                      padding: "1px 7px",
                      whiteSpace: "nowrap",
                    }}>
                      파일 {item.changed_file_count}개
                    </span>
                  )}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
                  gap: 7,
                  fontSize: 11,
                }}>
                  <div>
                    <div style={{ color: "var(--ct-text2)", marginBottom: 2 }}>Phase</div>
                    <div style={{ color: "var(--ct-text)", fontWeight: 700, overflowWrap: "anywhere" }}>{item.phase || "-"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ct-text2)", marginBottom: 2 }}>시작</div>
                    <div style={{ color: "var(--ct-text)", fontWeight: 700 }}>{formatKst(deployStartedAt(item))}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ct-text2)", marginBottom: 2 }}>종료</div>
                    <div style={{ color: "var(--ct-text)", fontWeight: 700 }}>{formatKst(deployFinishedAt(item))}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ct-text2)", marginBottom: 2 }}>경과</div>
                    <div style={{ color: "var(--ct-text)", fontWeight: 700 }}>{deployElapsed(item, nowMs)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ct-text2)", marginBottom: 2 }}>잔여</div>
                    <div style={{ color: "var(--ct-text)", fontWeight: 700 }}>{formatMillis(item.estimated_remaining_ms)}</div>
                  </div>
                </div>
                <div style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 7,
                  fontSize: 10,
                  color: "var(--ct-text2)",
                  fontFamily: "monospace",
                }}>
                  <span>sha {shortSha(item.release_sha)}</span>
                  {item.runner_job_id && <span>{item.runner_job_id}</span>}
                  {item.bg_sync_status && <span>bg {item.bg_sync_status}</span>}
                </div>
                <DeployChangeSummary item={item} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          background: "var(--ct-card)",
          border: "1px solid var(--ct-border)",
          borderRadius: 8,
          padding: "14px 12px",
          fontSize: 12,
          color: "var(--ct-text2)",
          textAlign: "center",
        }}>
          진행 중인 배포가 없습니다
        </div>
      )}

      {blockers.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {blockers.map((blocker) => (
            <span key={blocker} style={{
              border: "1px solid rgba(245,158,11,0.5)",
              color: "#fbbf24",
              borderRadius: 999,
              padding: "3px 8px",
              fontSize: 10,
              overflowWrap: "anywhere",
            }}>
              {blocker}
            </span>
          ))}
        </div>
      )}

      {staleSignals.slice(0, 4).map((signal) => (
        <div key={`${signal.runner_job_id || signal.project}-${signal.signal}`} style={{
          fontSize: 11,
          color: "#fca5a5",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.22)",
          borderRadius: 8,
          padding: "7px 9px",
          overflowWrap: "anywhere",
        }}>
          {signal.project || "-"} · {signal.signal || "-"} · {signal.runner_job_id || "-"}
        </div>
      ))}

      {componentDeployments.length > 0 && (
        <div style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 7 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)" }}>컴포넌트별 배포</div>
            <div style={{ fontSize: 10, color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{componentDeployments.length}개</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {componentDeployments.slice(0, 8).map((item, index) => {
              const tone = deployTone(item.status || item.phase);
              const lastTime = item.last_deploy_at || item.completed_at || item.updated_at || item.started_at;
              return (
                <div
                  key={`${item.project || "unknown"}-${item.component || index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(95px, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    borderTop: index === 0 ? "none" : "1px solid var(--ct-border)",
                    paddingTop: index === 0 ? 0 : 7,
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {deployTargetLabel(item)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.phase || item.deploy_type || "phase 없음"} · {formatKst(lastTime)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: tone, fontWeight: 800, whiteSpace: "nowrap" }}>{item.status || "-"}</div>
                    <div style={{ fontSize: 10, color: "var(--ct-text2)", fontFamily: "monospace", marginTop: 3, maxWidth: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortSha(item.release_sha || item.last_success_sha)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", marginBottom: 7 }}>최근 배포 이력</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.slice(0, 8).map((item, index) => {
              const durationLabel = formatDurationMs(item.duration_ms) || deployElapsed(item, nowMs);
              const itemStatus = effectiveDeployStatus(item);
              const tone = deployTone(itemStatus);
              return (
                <div key={`${item.id || item.release_sha || index}-completed`} style={{ borderTop: index === 0 ? "none" : "1px solid var(--ct-border)", paddingTop: index === 0 ? 0 : 8, minWidth: 0 }}>
                  {item.release_title && (
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", marginBottom: 4, overflowWrap: "anywhere" }}>
                      {item.release_title}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--ct-text)", fontWeight: 800, whiteSpace: "nowrap" }}>{deployTargetLabel(item)}</span>
                    {item.id != null && <span style={{ fontSize: 10, color: "var(--ct-text)", fontWeight: 800, whiteSpace: "nowrap" }}>배포 #{item.id}</span>}
                    <span style={{ fontSize: 10, color: tone, whiteSpace: "nowrap" }}>{deployStatusLabel(itemStatus)}</span>
                    <span style={{ fontSize: 10, color: "var(--ct-text2)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortSha(item.release_sha)}
                    </span>
                    {(item.changed_file_count || 0) > 0 && (
                      <span style={{
                        fontSize: 10,
                        color: "var(--ct-text2)",
                        border: "1px solid var(--ct-border)",
                        borderRadius: 999,
                        padding: "1px 7px",
                        whiteSpace: "nowrap",
                      }}>
                        파일 {item.changed_file_count}개
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ct-text2)", marginTop: 6, overflowWrap: "anywhere" }}>
                    시작 {formatDeployTime(deployStartedAt(item))} → 완료 {formatDeployTime(deployFinishedAt(item))}
                    {durationLabel && ` (총 ${durationLabel})`}
                  </div>
                  <DeployChangeSummary item={item} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {durations.length > 0 && (
        <div style={{ background: "var(--ct-card)", border: "1px solid var(--ct-border)", borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ct-text)", marginBottom: 7 }}>최근 배포시간</div>
          {durations.slice(0, 5).map((item) => (
            <div key={item.project || "unknown"} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 7, padding: "4px 0", borderTop: "1px solid var(--ct-border)", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ct-text)", fontWeight: 700 }}>{item.project || "-"}</span>
              <span style={{ fontSize: 11, color: "var(--ct-text2)" }}>P50 {formatMillis(item.p50_duration_ms)} / P90 {formatMillis(item.p90_duration_ms)}</span>
              <span style={{ fontSize: 10, color: "var(--ct-text2)" }}>{item.sample_count || 0}건</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 아티팩트 본문 영역 — 스크롤 끝 도달 시 자동 전환 + 키보드 ←→ */
function ArtifactContentArea({ artifactTab, filteredArtifacts, selectedArtifactIdx, setSelectedArtifactIdx, children }: {
  artifactTab: string;
  filteredArtifacts: { id: string }[];
  selectedArtifactIdx: number;
  setSelectedArtifactIdx: (v: number) => void;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNavTime = useRef(0);

  const goNext = useCallback(() => {
    if (selectedArtifactIdx < filteredArtifacts.length - 1) {
      setSelectedArtifactIdx(selectedArtifactIdx + 1);
      lastNavTime.current = Date.now();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [selectedArtifactIdx, filteredArtifacts.length, setSelectedArtifactIdx]);

  const goPrev = useCallback(() => {
    if (selectedArtifactIdx > 0) {
      setSelectedArtifactIdx(selectedArtifactIdx - 1);
      lastNavTime.current = Date.now();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [selectedArtifactIdx, setSelectedArtifactIdx]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el || Date.now() - lastNavTime.current < 600) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
    const atTop = el.scrollTop < 5;
    if (e.deltaY > 30 && atBottom) goNext();
    else if (e.deltaY < -30 && atTop) goPrev();
  }, [goNext, goPrev]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev(); }
  }, [goNext, goPrev]);

  // 아티팩트 선택 변경 시 스크롤 맨 위로 (전체보기 버튼 등 외부 변경 포함)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedArtifactIdx]);

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, overflowY: "auto", padding: artifactTab === "tasks" ? "0" : "16px", outline: "none" }}
    >
      {children}
      {filteredArtifacts.length > 1 && artifactTab !== "tasks" && (
        <div style={{
          textAlign: "center", padding: "16px 0 8px", fontSize: "11px",
          color: "var(--ct-text2)", opacity: 0.6,
        }}>
          {selectedArtifactIdx < filteredArtifacts.length - 1
            ? "↓ 스크롤하여 다음 항목"
            : `${filteredArtifacts.length}/${filteredArtifacts.length} (마지막)`
          }
          {" · ←→ 키보드로 전환"}
        </div>
      )}
    </div>
  );
}

const ChatArtifactPanel = memo(function ChatArtifactPanel(props: ChatArtifactPanelProps) {
  const {
    screenSize, showArtifactPanel, artifactMode, setArtifactMode,
    mobileOverlay, setMobileOverlay,
    artifacts, artifactTab, setArtifactTab, artifactCounts,
    systemMessages, unreadLogCount,
    filteredArtifacts, activeArtifact, selectedArtifactIdx, setSelectedArtifactIdx,
    activeSession, copyArtifact, toDirective, sessionId,
  } = props;

  // 아티팩트 검색/필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(420);
  // Reloads and session changes remount this panel at 420px. Manual widening
  // and drag resizing remain available for the current session only.
  const [desktopPanelWidthPx, setDesktopPanelWidthPx] = useState(ARTIFACT_PANEL_DEFAULT_WIDTH);
  const [isResizingArtifactPanel, setIsResizingArtifactPanel] = useState(false);
  // 배지 펄스 애니메이션 상태
  const [pulsedTabs, setPulsedTabs] = useState<Set<string>>(new Set());
  const prevArtifactCountsRef = useRef<Record<string, number>>({});

  // Runner 작업 폴링 상태
  const [runnerJobs, setRunnerJobs] = useState<RunnerJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployObservabilityStatus | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployNowMs, setDeployNowMs] = useState(() => Date.now());

  const loadDeployStatus = useCallback(async () => {
    setDeployLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/ops/deploy/status`, { headers: authHdrs(), credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      setDeployStatus(data);
      setDeployError(null);
    } catch (e) {
      setDeployError((e as Error).message || "배포 상태를 불러오지 못했습니다.");
    } finally {
      setDeployLoading(false);
    }
  }, []);

  useEffect(() => {
    const panelVisible = showArtifactPanel || (screenSize === "desktop" && artifactMode !== "hidden");
    if (!panelVisible) return;
    void loadDeployStatus();
    const statusInterval = setInterval(() => void loadDeployStatus(), 15000);
    const clockInterval = setInterval(() => setDeployNowMs(Date.now()), 1000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(clockInterval);
    };
  }, [artifactMode, loadDeployStatus, screenSize, showArtifactPanel]);

  useEffect(() => {
    if (!sessionId || artifactTab !== "log") return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        setJobsLoading(true);
        const res = await fetch(`${BASE_URL}/pipeline/jobs?session_id=${sessionId}&limit=50`, { headers: authHdrs() });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRunnerJobs(data);
        }
      } catch (_) {/* ignore */} finally {
        if (!cancelled) setJobsLoading(false);
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionId, artifactTab]);

  const errorDetailKo = (d: string | null): string => {
    const map: Record<string, string> = {
      timeout: "시간 초과",
      claude_code_crash: "Claude 충돌",
      git_conflict: "Git 충돌",
      build_fail: "빌드 실패",
      disk_full: "디스크 부족",
      rate_limit: "API 제한",
      process_died: "프로세스 종료",
      no_changes: "변경 없음",
      dedup_blocked: "중복 차단",
      blocked_dependency: "의존 차단",
      cancelled: "종결",
    };
    if (!d) return "";
    const key = d.split(":")[0];
    return map[key] ?? map[d] ?? d;
  };

  const openArtifactInNewTab = useCallback((artifact: Artifact) => {
    const title = artifact.title || "AADS Artifact";
    const content = artifact.content || "";
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const windowRef = window.open("", "_blank", "noopener,noreferrer");
    if (!windowRef) return;

    if (artifact.artifact_type === "image" || artifact.artifact_type === "file") {
      windowRef.location.href = content;
      return;
    }

    windowRef.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e5e7eb; }
    header { position: sticky; top: 0; padding: 14px 18px; background: rgba(15, 23, 42, 0.94); border-bottom: 1px solid rgba(148, 163, 184, 0.24); backdrop-filter: blur(10px); }
    h1 { margin: 0; font-size: 15px; line-height: 1.35; }
    main { padding: 18px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #020617; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(title)}</h1></header>
  <main><pre>${escapeHtml(content)}</pre></main>
</body>
</html>`);
    windowRef.document.close();
  }, []);

  const elapsedStr = (start: string | null, end: string | null): string => {
    if (!start) return "";
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const sec = Math.floor((e - s) / 1000);
    if (sec < 60) return `${sec}초`;
    const min = Math.floor(sec / 60);
    return `${min}분 ${sec % 60}초`;
  };

  // 인라인 편집 상태
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHtmlCode, setShowHtmlCode] = useState(false);
  const [localEdits, setLocalEdits] = useState<Record<string, {
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>>({});

  const startEdit = useCallback((artifact: Artifact) => {
    const saved = localEdits[artifact.id];
    setEditTitle(saved?.title ?? artifact.title);
    setEditContent(saved?.content ?? artifact.content);
    setEditError(null);
    setEditingArtifactId(artifact.id);
  }, [localEdits]);

  const cancelEdit = useCallback(() => {
    setEditingArtifactId(null);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingArtifactId) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const savedArtifact = await updateArtifact(editingArtifactId, { title: editTitle, content: editContent });
      setLocalEdits(prev => ({
        ...prev,
        [editingArtifactId]: {
          title: savedArtifact.title,
          content: savedArtifact.content,
          metadata: savedArtifact.metadata,
        },
      }));
      setEditingArtifactId(null);
    } catch (e) {
      setEditError((e as Error).message || "저장 실패");
    } finally {
      setEditSaving(false);
    }
  }, [editingArtifactId, editTitle, editContent]);

  // 아젠다 상태
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [agendaFilter, setAgendaFilter] = useState<string>("전체");
  const [expandedAgendaId, setExpandedAgendaId] = useState<string | null>(null);
  const [agendaDraftTitle, setAgendaDraftTitle] = useState("");
  const [agendaDraftSummary, setAgendaDraftSummary] = useState("");
  const [agendaDraftPriority, setAgendaDraftPriority] = useState("P2");
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [agendaEditTitle, setAgendaEditTitle] = useState("");
  const [agendaEditSummary, setAgendaEditSummary] = useState("");
  const [agendaEditPriority, setAgendaEditPriority] = useState("P2");
  const [agendaEditStatus, setAgendaEditStatus] = useState("논의중");

  const loadAgendaItems = useCallback(async () => {
    if (!sessionId) {
      setAgendaItems([]);
      return;
    }
    setAgendaLoading(true);
    setAgendaError(null);
    const qs = `?source_session_id=${encodeURIComponent(sessionId)}&limit=50`;
    try {
      const res = await fetch(`${BASE_URL}/agenda/${qs}`, { headers: authHdrs(), credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      setAgendaItems(data.items ?? []);
    } catch (e) {
      setAgendaItems([]);
      setAgendaError((e as Error).message || "아이디어 메모를 불러오지 못했습니다.");
    } finally {
      setAgendaLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (artifactTab !== "agenda") return;
    void loadAgendaItems();
  }, [artifactTab, loadAgendaItems]);

  const resetAgendaDraft = useCallback(() => {
    setAgendaDraftTitle("");
    setAgendaDraftSummary("");
    setAgendaDraftPriority("P2");
  }, []);

  const createAgendaMemo = useCallback(async () => {
    if (!sessionId || agendaSaving) return;
    const title = agendaDraftTitle.trim();
    const summary = agendaDraftSummary.trim();
    if (!title && !summary) {
      setAgendaError("제목이나 내용을 입력해 주십시오.");
      return;
    }
    setAgendaSaving(true);
    setAgendaError(null);
    try {
      const res = await fetch(`${BASE_URL}/agenda/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHdrs() },
        body: JSON.stringify({
          project: "AADS",
          title: title || summary.split("\n")[0].slice(0, 80) || "아이디어 메모",
          summary,
          priority: agendaDraftPriority,
          tags: ["idea_memo", "chat"],
          created_by: "CEO",
          source_session_id: sessionId,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      resetAgendaDraft();
      await loadAgendaItems();
    } catch (e) {
      setAgendaError((e as Error).message || "아이디어 메모 저장 실패");
    } finally {
      setAgendaSaving(false);
    }
  }, [agendaDraftPriority, agendaDraftSummary, agendaDraftTitle, agendaSaving, loadAgendaItems, resetAgendaDraft, sessionId]);

  const startAgendaEdit = useCallback((item: AgendaItem) => {
    setEditingAgendaId(String(item.id));
    setExpandedAgendaId(String(item.id));
    setAgendaEditTitle(item.title ?? "");
    setAgendaEditSummary(item.summary ?? "");
    setAgendaEditPriority(item.priority ?? "P2");
    setAgendaEditStatus(item.status ?? "논의중");
    setAgendaError(null);
  }, []);

  const cancelAgendaEdit = useCallback(() => {
    setEditingAgendaId(null);
    setAgendaError(null);
  }, []);

  const updateAgendaMemo = useCallback(async (agendaId: string | number, patch?: Partial<Pick<AgendaItem, "title" | "summary" | "status" | "priority">>) => {
    if (agendaSaving) return;
    const payload = patch ?? {
      title: agendaEditTitle.trim(),
      summary: agendaEditSummary.trim(),
      priority: agendaEditPriority,
      status: agendaEditStatus,
      caller_role: "CEO",
      caller_project: "AADS",
    };
    if (!patch && !payload.title && !payload.summary) {
      setAgendaError("제목이나 내용을 입력해 주십시오.");
      return;
    }
    setAgendaSaving(true);
    setAgendaError(null);
    try {
      const res = await fetch(`${BASE_URL}/agenda/${agendaId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHdrs() },
        body: JSON.stringify({
          ...payload,
          caller_role: "CEO",
          caller_project: "AADS",
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setEditingAgendaId(null);
      await loadAgendaItems();
    } catch (e) {
      setAgendaError((e as Error).message || "아이디어 메모 수정 실패");
    } finally {
      setAgendaSaving(false);
    }
  }, [agendaEditPriority, agendaEditStatus, agendaEditSummary, agendaEditTitle, agendaSaving, loadAgendaItems]);

  useEffect(() => {
    if (screenSize !== "desktop") return;
    const handleResize = () => {
      setDesktopPanelWidthPx((current) => clampArtifactPanelWidth(current));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [screenSize]);

  const startArtifactPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (screenSize !== "desktop" || artifactMode === "mini" || artifactMode === "hidden") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = desktopPanelWidthPx;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    setIsResizingArtifactPanel(true);

    const handleMove = (pointerEvent: PointerEvent) => {
      setDesktopPanelWidthPx(clampArtifactPanelWidth(startWidth + startX - pointerEvent.clientX));
    };
    const handleUp = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setIsResizingArtifactPanel(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }, [artifactMode, desktopPanelWidthPx, screenSize]);

  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setTabBarWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showTabLabel = tabBarWidth >= 320;
  const desktopPanelWidth =
    artifactMode === "mini" || artifactMode === "hidden"
      ? "48px"
      : `${desktopPanelWidthPx}px`;
  const deployBadgeCount =
    (deployStatus?.active_deployments?.length || 0) +
    (deployStatus?.queued_deployments?.length || 0) +
    (deployStatus?.recent_completed_deployments?.length || 0);

  // artifactCounts 변경 감지 → 증가한 탭에 펄스 트리거
  useEffect(() => {
    const prev = prevArtifactCountsRef.current;
    const newPulsed = new Set<string>();
    for (const key of Object.keys(artifactCounts)) {
      if ((artifactCounts[key] ?? 0) > (prev[key] ?? 0)) {
        newPulsed.add(key);
      }
    }
    if (newPulsed.size > 0) {
      setPulsedTabs(newPulsed);
      const t = setTimeout(() => setPulsedTabs(new Set()), 2000);
      prevArtifactCountsRef.current = { ...artifactCounts };
      return () => clearTimeout(t);
    }
    prevArtifactCountsRef.current = { ...artifactCounts };
  }, [artifactCounts]);

  return (
    <>
    <style>{`
      @keyframes badgePulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
      }
    `}</style>
    {(showArtifactPanel || (screenSize === "desktop" && artifactMode !== "hidden")) && (
      <div
        style={{
          width: screenSize !== "desktop" ? "min(100vw, 420px)" : desktopPanelWidth,
          minWidth: screenSize !== "desktop" ? "min(100vw, 420px)" : desktopPanelWidth,
          maxWidth: screenSize !== "desktop" ? "100vw" : "82vw",
          background: "var(--ct-sb)",
          borderLeft: "1px solid var(--ct-border)",
          display: "flex",
          flexDirection: "column",
          transition: isResizingArtifactPanel ? "none" : "width 0.3s, min-width 0.3s, transform 0.3s",
          overflow: "hidden",
          flexShrink: 0,
          position: "relative",
          // On non-desktop, position as overlay
          ...(screenSize !== "desktop"
            ? {
                position: "fixed",
                right: 0,
                top: 0,
                height: "100%",
                zIndex: 200,
                transform: mobileOverlay === "artifact" ? "translateX(0)" : "translateX(100%)",
                boxShadow: mobileOverlay === "artifact" ? "-4px 0 20px rgba(0,0,0,0.3)" : "none",
              }
            : {}),
        }}
      >
        {screenSize === "desktop" && artifactMode !== "mini" && artifactMode !== "hidden" && (
          <div
            aria-label="아티팩트 패널 폭 조절"
            title="드래그해서 아티팩트 패널 폭 조절"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startArtifactPanelResize}
            style={{
              position: "absolute",
              left: "-4px",
              top: 0,
              bottom: 0,
              width: "8px",
              cursor: "col-resize",
              zIndex: 5,
              touchAction: "none",
              background: isResizingArtifactPanel ? "rgba(108,99,255,0.24)" : "transparent",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "3px",
                top: 0,
                bottom: 0,
                width: "2px",
                background: isResizingArtifactPanel ? "var(--ct-accent)" : "rgba(255,255,255,0.12)",
              }}
            />
          </div>
        )}
        {(artifactMode === "wide" || artifactMode === "full") || screenSize !== "desktop" ? (
          <>
            {/* Artifact header */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--ct-border)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div style={{ flex: 1, fontWeight: 600, fontSize: "13px" }}>
                아티팩트
                {artifacts.length > 0 && (
                  <span
                    style={{
                      marginLeft: "6px",
                      fontSize: "11px",
                      background: "var(--ct-accent)",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "1px 6px",
                    }}
                  >
                    {artifacts.length}
                  </span>
                )}
              </div>
              {screenSize === "desktop" && (
                <button
                  onClick={() => {
                    const nextMode = artifactMode === "wide" ? "full" : "wide";
                    setArtifactMode(nextMode);
                    setDesktopPanelWidthPx(
                      clampArtifactPanelWidth(nextMode === "wide" ? 980 : ARTIFACT_PANEL_DEFAULT_WIDTH),
                    );
                  }}
                  title={artifactMode === "wide" ? "보통 폭으로 보기" : "넓게 보기"}
                  style={{
                    background: artifactMode === "wide" ? "var(--ct-accent)" : "var(--ct-hover)",
                    border: "1px solid var(--ct-border)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    color: artifactMode === "wide" ? "#fff" : "var(--ct-text2)",
                    fontSize: "11px",
                    padding: "4px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  넓게
                </button>
              )}
              <button
                onClick={() =>
                  screenSize === "desktop"
                    ? setArtifactMode("mini")
                    : setMobileOverlay(null)
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ct-text2)",
                  fontSize: "14px",
                  padding: "4px",
                }}
              >
                ▶
              </button>
            </div>

            {/* Artifact tabs */}
            <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ct-border)" }}>
              {/* 좌측 화살표 */}
              <button
                onClick={() => tabBarRef.current?.scrollBy({ left: -100, behavior: "smooth" })}
                style={{ flexShrink: 0, width: 28, border: "none", background: "linear-gradient(to right, var(--ct-bg, #1a1a2e) 70%, transparent)", color: "var(--ct-accent)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}
              title="← 스크롤">◀</button>
              <div
                ref={tabBarRef}
                className="hide-scrollbar"
                onWheel={(e) => { e.preventDefault(); tabBarRef.current?.scrollBy({ left: e.deltaY > 0 ? 80 : -80, behavior: "smooth" }); }}
                style={{
                  display: "flex",
                  padding: "0 4px",
                  overflowX: "auto",
                  flex: 1,
                }}
              >
                {(
                  [
                    { key: "log" as ArtifactTab, icon: "🔧", label: "로그" },
                    { key: "deploy" as ArtifactTab, icon: "🚀", label: "배포" },
                    { key: "agenda" as ArtifactTab, icon: "📋", label: "아이디어 메모" },
                    { key: "report" as ArtifactTab, icon: "📄", label: "보고서" },
                    { key: "dialog" as ArtifactTab, icon: "💬", label: "대화응답" },
                    { key: "code" as ArtifactTab, icon: "💻", label: "코드" },
                    { key: "html_preview" as ArtifactTab, icon: "🖼️", label: "미리보기" },
                    { key: "chart" as ArtifactTab, icon: "📊", label: "차트" },
                    { key: "tasks" as ArtifactTab, icon: "⚡", label: "작업" },
                  ]
                ).filter((tab) => {
                  if (tab.key === "tasks" || tab.key === "log" || tab.key === "deploy" || tab.key === "agenda") return true;
                  return artifactTab === tab.key || (artifactCounts[tab.key] ?? 0) > 0;
                }).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setArtifactTab(tab.key); setSelectedArtifactIdx(0); }}
                    style={{
                      padding: "8px 10px",
                      fontSize: "11px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color:
                        artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-text2)",
                      borderBottom:
                        artifactTab === tab.key
                          ? "2px solid var(--ct-accent)"
                          : "2px solid transparent",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.icon}{showTabLabel ? ` ${tab.label}` : ""}
                    {tab.key !== "tasks" && tab.key !== "log" && tab.key !== "agenda" && artifactCounts[tab.key] > 0 && (
                      <span style={{
                        marginLeft: '3px',
                        fontSize: '10px',
                        opacity: 0.7,
                        display: 'inline-block',
                        animation: pulsedTabs.has(tab.key) ? 'badgePulse 0.4s ease 3' : 'none',
                      }}>({artifactCounts[tab.key]})</span>
                    )}
                    {tab.key === "log" && (unreadLogCount ?? 0) > 0 && (
                      <span style={{ marginLeft: '3px', fontSize: '10px', opacity: 0.7 }}>
                        ({unreadLogCount})
                      </span>
                    )}
                    {tab.key === "deploy" && deployBadgeCount > 0 && (
                      <span style={{ marginLeft: '3px', fontSize: '10px', opacity: 0.7 }}>
                        ({deployBadgeCount})
                      </span>
                    )}
                    {tab.key === "agenda" && agendaItems.length > 0 && (
                      <span style={{ marginLeft: '3px', fontSize: '10px', opacity: 0.7 }}>
                        ({agendaItems.length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* 우측 화살표 */}
              <button
                onClick={() => tabBarRef.current?.scrollBy({ left: 100, behavior: "smooth" })}
                style={{ flexShrink: 0, width: 28, border: "none", background: "linear-gradient(to left, var(--ct-bg, #1a1a2e) 70%, transparent)", color: "var(--ct-accent)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}
              title="→ 스크롤">▶</button>
            </div>

            {/* 검색/필터 영역 */}
            {artifactTab !== "tasks" && artifactTab !== "log" && artifactTab !== "agenda" && artifactTab !== "dialog" && (
              <div style={{
                padding: "6px 10px",
                borderBottom: "1px solid var(--ct-border)",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}>
                <input
                  type="text"
                  placeholder="제목 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedArtifactIdx(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--ct-border)",
                    background: "var(--ct-input-bg)",
                    color: "var(--ct-text)",
                    fontSize: "12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {[
                    { key: null, label: "전체" },
                    { key: "report", label: "보고서" },
                    { key: "code", label: "코드" },
                    { key: "table", label: "마크다운" },
                    { key: "other", label: "기타" },
                  ].map((f) => (
                    <button
                      key={String(f.key)}
                      onClick={() => { setTypeFilter(f.key); setSelectedArtifactIdx(0); }}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "10px",
                        border: "1px solid var(--ct-border)",
                        background: typeFilter === f.key ? "var(--ct-accent)" : "transparent",
                        color: typeFilter === f.key ? "#fff" : "var(--ct-text2)",
                        fontSize: "11px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 아티팩트 리스트 헤더 */}
            {(() => {
              // localFiltered에 원본 인덱스 포함
              const lfWithIdx = filteredArtifacts
                .map((a, idx) => ({ a, idx }))
                .filter(({ a }) => {
                  const ms = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase());
                  const mt = !typeFilter || a.artifact_type === typeFilter ||
                    (typeFilter === "report" && (a.artifact_type === "report" || a.artifact_type === "text" || a.artifact_type === "task_card")) ||
                    (typeFilter === "other" && !["report", "text", "code", "table", "full_response"].includes(a.artifact_type));
                  return ms && mt;
                });
              const localCurPos = lfWithIdx.findIndex(({ idx }) => idx === selectedArtifactIdx);
              const prevItem = localCurPos > 0 ? lfWithIdx[localCurPos - 1] : null;
              const nextItem = localCurPos < lfWithIdx.length - 1 ? lfWithIdx[localCurPos + 1] : null;
              return lfWithIdx.length > 1 && artifactTab !== "tasks" && artifactTab !== "agenda" ? (
              <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--ct-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
              }}>
                <span style={{ color: 'var(--ct-text2)', whiteSpace: 'nowrap' }}>
                  {lfWithIdx.length}건
                </span>
                <select
                  value={selectedArtifactIdx}
                  onChange={(e) => setSelectedArtifactIdx(Number(e.target.value))}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ct-border)',
                    background: 'var(--ct-input-bg)',
                    color: 'var(--ct-text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    maxWidth: '280px',
                  }}
                >
                  {lfWithIdx.map(({ a, idx }) => (
                    <option key={a.id} value={idx}>
                      {a.title ? a.title.substring(0, 40) : `#${idx + 1}`}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    onClick={() => prevItem && setSelectedArtifactIdx(prevItem.idx)}
                    disabled={!prevItem}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--ct-border)',
                      background: 'transparent',
                      color: 'var(--ct-text2)',
                      cursor: !prevItem ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: !prevItem ? 0.4 : 1,
                    }}
                  >◀</button>
                  <button
                    onClick={() => nextItem && setSelectedArtifactIdx(nextItem.idx)}
                    disabled={!nextItem}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--ct-border)',
                      background: 'transparent',
                      color: 'var(--ct-text2)',
                      cursor: !nextItem ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: !nextItem ? 0.4 : 1,
                    }}
                  >▶</button>
                </div>
              </div>
              ) : null;
            })()}

            {/* Artifact content — 스크롤/키보드 네비게이션 */}
            <ArtifactContentArea
              artifactTab={artifactTab}
              filteredArtifacts={filteredArtifacts}
              selectedArtifactIdx={selectedArtifactIdx}
              setSelectedArtifactIdx={setSelectedArtifactIdx}
            >
              {artifactTab === "tasks" ? (
                <ArtifactTaskMonitor sessionId={activeSession?.id} />
              ) : artifactTab === "deploy" ? (
                <DeployStatusCard
                  status={deployStatus}
                  loading={deployLoading}
                  error={deployError}
                  nowMs={deployNowMs}
                  onRefresh={() => void loadDeployStatus()}
                />
              ) : artifactTab === "agenda" ? (
                <div>
                  <div style={{
                    background: "var(--ct-card)",
                    border: "1px solid var(--ct-border)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginBottom: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ flex: 1, fontSize: "12px", fontWeight: 700, color: "var(--ct-text)" }}>
                        직접 아이디어 메모
                      </span>
                      <button
                        onClick={() => void loadAgendaItems()}
                        disabled={agendaLoading}
                        title="아이디어 메모 새로고침"
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-hover)",
                          color: "var(--ct-text2)",
                          fontSize: "11px",
                          cursor: agendaLoading ? "wait" : "pointer",
                        }}
                      >
                        새로고침
                      </button>
                    </div>
                    <input
                      value={agendaDraftTitle}
                      onChange={(e) => setAgendaDraftTitle(e.target.value)}
                      placeholder="메모 제목"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "7px 9px",
                        borderRadius: "6px",
                        border: "1px solid var(--ct-border)",
                        background: "var(--ct-input)",
                        color: "var(--ct-text)",
                        fontSize: "12px",
                        outline: "none",
                      }}
                    />
                    <textarea
                      value={agendaDraftSummary}
                      onChange={(e) => setAgendaDraftSummary(e.target.value)}
                      placeholder="메모 내용"
                      rows={4}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 9px",
                        borderRadius: "6px",
                        border: "1px solid var(--ct-border)",
                        background: "var(--ct-input)",
                        color: "var(--ct-text)",
                        fontSize: "12px",
                        lineHeight: 1.5,
                        resize: "vertical",
                        outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <select
                        value={agendaDraftPriority}
                        onChange={(e) => setAgendaDraftPriority(e.target.value)}
                        style={{
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-input)",
                          color: "var(--ct-text)",
                          fontSize: "12px",
                        }}
                      >
                        {["P0", "P1", "P2", "P3"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button
                        onClick={() => void createAgendaMemo()}
                        disabled={agendaSaving || (!agendaDraftTitle.trim() && !agendaDraftSummary.trim())}
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-accent)",
                          background: agendaSaving ? "var(--ct-hover)" : "var(--ct-accent)",
                          color: "#fff",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: agendaSaving ? "wait" : "pointer",
                          opacity: (!agendaDraftTitle.trim() && !agendaDraftSummary.trim()) ? 0.5 : 1,
                        }}
                      >
                        {agendaSaving ? "저장 중..." : "메모 저장"}
                      </button>
                      <button
                        onClick={resetAgendaDraft}
                        disabled={agendaSaving}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "transparent",
                          color: "var(--ct-text2)",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        비우기
                      </button>
                    </div>
                    {agendaError && (
                      <div style={{
                        border: "1px solid rgba(239,68,68,0.35)",
                        background: "rgba(239,68,68,0.1)",
                        color: "#fca5a5",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "11px",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}>
                        {agendaError}
                      </div>
                    )}
                  </div>
                  {/* 상태 필터 칩 */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                    {["전체", "논의중", "진행중", "보류", "결정", "완료"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAgendaFilter(s)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          border: "1px solid var(--ct-border)",
                          background: agendaFilter === s ? "var(--ct-accent)" : "transparent",
                          color: agendaFilter === s ? "#fff" : "var(--ct-text2)",
                          fontSize: "11px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {agendaLoading ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", textAlign: "center", paddingTop: "20px" }}>
                      불러오는 중...
                    </div>
                  ) : (() => {
                    const filtered = agendaItems.filter((item) =>
                      agendaFilter === "전체" || item.status === agendaFilter
                    );
                    if (filtered.length === 0) {
                      return (
                        <div style={{ color: "var(--ct-text2)", fontSize: "12px", textAlign: "center", paddingTop: "20px" }}>
                          현재 세션에 연결된 아이디어 메모가 없습니다
                        </div>
                      );
                    }
                    return filtered.map((item) => {
                      const itemId = String(item.id);
                      const isExpanded = expandedAgendaId === itemId;
                      const isEditingAgenda = editingAgendaId === itemId;
                      const statusColor = AGENDA_STATUS_COLORS[item.status] ?? "#6b7280";
                      const priorityColor = AGENDA_PRIORITY_COLORS[item.priority] ?? "#6b7280";
                      return (
                        <div
                          key={item.id}
                          onClick={() => setExpandedAgendaId(isExpanded ? null : itemId)}
                          style={{
                            background: "var(--ct-card)",
                            border: "1px solid var(--ct-border)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            marginBottom: "8px",
                            cursor: "pointer",
                          }}
                        >
                          {isEditingAgenda ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                            >
                              <input
                                value={agendaEditTitle}
                                onChange={(e) => setAgendaEditTitle(e.target.value)}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "7px 9px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--ct-border)",
                                  background: "var(--ct-input)",
                                  color: "var(--ct-text)",
                                  fontSize: "12px",
                                }}
                              />
                              <textarea
                                value={agendaEditSummary}
                                onChange={(e) => setAgendaEditSummary(e.target.value)}
                                rows={5}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "8px 9px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--ct-border)",
                                  background: "var(--ct-input)",
                                  color: "var(--ct-text)",
                                  fontSize: "12px",
                                  lineHeight: 1.5,
                                  resize: "vertical",
                                }}
                              />
                              <div style={{ display: "flex", gap: "6px" }}>
                                <select
                                  value={agendaEditPriority}
                                  onChange={(e) => setAgendaEditPriority(e.target.value)}
                                  style={{
                                    padding: "6px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--ct-border)",
                                    background: "var(--ct-input)",
                                    color: "var(--ct-text)",
                                    fontSize: "12px",
                                  }}
                                >
                                  {["P0", "P1", "P2", "P3"].map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <select
                                  value={agendaEditStatus}
                                  onChange={(e) => setAgendaEditStatus(e.target.value)}
                                  style={{
                                    flex: 1,
                                    padding: "6px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--ct-border)",
                                    background: "var(--ct-input)",
                                    color: "var(--ct-text)",
                                    fontSize: "12px",
                                  }}
                                >
                                  {["논의중", "진행중", "보류", "결정", "완료", "폐기"].map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  onClick={() => void updateAgendaMemo(item.id)}
                                  disabled={agendaSaving}
                                  style={{
                                    flex: 1,
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--ct-accent)",
                                    background: "var(--ct-accent)",
                                    color: "#fff",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    cursor: agendaSaving ? "wait" : "pointer",
                                  }}
                                >
                                  저장
                                </button>
                                <button
                                  onClick={cancelAgendaEdit}
                                  disabled={agendaSaving}
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--ct-border)",
                                    background: "transparent",
                                    color: "var(--ct-text2)",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                  }}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                          <>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                            <span style={{
                              fontSize: "10px", fontWeight: 700, color: "#fff",
                              background: priorityColor, borderRadius: "4px",
                              padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
                            }}>{item.priority}</span>
                            <span style={{
                              fontSize: "12px", fontWeight: 600, color: "var(--ct-text)",
                              flex: 1, lineHeight: "1.4",
                            }}>{item.title}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: isExpanded ? "8px" : "0" }}>
                            <span style={{
                              fontSize: "10px", color: "#fff",
                              background: statusColor, borderRadius: "10px",
                              padding: "1px 7px",
                            }}>{item.status}</span>
                            {item.project && (
                              <span style={{
                                fontSize: "10px", color: "var(--ct-text2)",
                                background: "var(--ct-hover)", borderRadius: "4px",
                                padding: "1px 6px",
                              }}>{item.project}</span>
                            )}
                          </div>
                          {!isExpanded && item.summary && (
                            <div style={{
                              fontSize: "11px", color: "var(--ct-text2)", marginTop: "4px",
                              overflow: "hidden", display: "-webkit-box",
                              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              lineHeight: "1.5",
                            }}>
                              {item.summary}
                            </div>
                          )}
                          {isExpanded && (
                            <div style={{ fontSize: "12px", color: "var(--ct-text2)", lineHeight: "1.6" }}>
                              {item.summary && (
                                <div style={{ marginBottom: "8px", whiteSpace: "pre-wrap" }}>{item.summary}</div>
                              )}
                              {item.decision && (
                                <div style={{
                                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                                  borderRadius: "6px", padding: "6px 10px", fontSize: "11px",
                                }}>
                                  <span style={{ fontWeight: 600, color: "#22c55e" }}>결정: </span>
                                  {item.decision}
                                </div>
                              )}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}
                              >
                                <button
                                  onClick={() => startAgendaEdit(item)}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--ct-border)",
                                    background: "var(--ct-hover)",
                                    color: "var(--ct-text2)",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                  }}
                                >
                                  수정
                                </button>
                                {["논의중", "진행중", "보류", "완료"].filter((s) => s !== item.status).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => void updateAgendaMemo(item.id, { status: s })}
                                    disabled={agendaSaving}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--ct-border)",
                                      background: "transparent",
                                      color: "var(--ct-text2)",
                                      fontSize: "11px",
                                      cursor: agendaSaving ? "wait" : "pointer",
                                    }}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          </>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : artifactTab === "log" ? (
                <div style={{ padding: "4px 0" }}>
                  {jobsLoading && runnerJobs.length === 0 ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", padding: "16px", textAlign: "center" }}>
                      로딩 중...
                    </div>
                  ) : runnerJobs.length === 0 ? (
                    <div style={{ color: "var(--ct-text2)", fontSize: "12px", padding: "16px", textAlign: "center" }}>
                      이 세션의 Runner 작업이 없습니다
                    </div>
                  ) : (() => {
                    const jobIds = new Set(runnerJobs.map(j => j.job_id));
                    const roots = runnerJobs.filter(j => !j.depends_on || !jobIds.has(j.depends_on));
                    const childMap: Record<string, RunnerJob[]> = {};
                    runnerJobs.forEach(j => {
                      if (j.depends_on) {
                        if (!childMap[j.depends_on]) childMap[j.depends_on] = [];
                        childMap[j.depends_on].push(j);
                      }
                    });

                    const statusIcon = (s: string) => ({
                      queued: "⏳", running: "🔄", awaiting_approval: "✋", done: "✅", error: "❌",
                      cancelled: "⚪", no_changes: "⚪", dedup_blocked: "⛔", blocked_dependency: "⛔"
                    }[s] ?? "❓");

                    const statusColor = (s: string) => ({
                      queued: "#888", running: "#3b82f6", awaiting_approval: "#f59e0b", done: "#22c55e", error: "#ef4444",
                      cancelled: "#9ca3af", no_changes: "#9ca3af", dedup_blocked: "#f59e0b", blocked_dependency: "#f59e0b"
                    }[s] ?? "#888");

                    const renderJob = (job: RunnerJob, depth = 0): React.ReactNode => {
                      const children = childMap[job.job_id] ?? [];
                      const isRunning = job.status === "running";
                      const displayStatus = job.display_status || job.phase || job.status;
                      const statusLabel = job.status_label || displayStatus;
                      return (
                        <div key={job.job_id} style={{ marginLeft: depth * 12 }}>
                          <details style={{ borderBottom: depth === 0 ? "1px solid var(--ct-border)" : "none" }}>
                            <summary style={{
                              fontSize: "11px", cursor: "pointer", listStyle: "none",
                              display: "flex", alignItems: "flex-start", gap: "6px",
                              padding: `${depth === 0 ? 8 : 4}px 8px`, userSelect: "none",
                            }}>
                              <span style={{ color: statusColor(displayStatus), minWidth: 14 }}>{statusIcon(displayStatus)}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: "10px", opacity: 0.6 }}>{job.job_id}</span>
                                  <span style={{ fontSize: "10px", color: statusColor(displayStatus), fontWeight: 600 }}>{statusLabel}</span>
                                  {isRunning && job.started_at && (
                                    <span style={{ fontSize: "10px", color: "#f59e0b" }}>⏱ {elapsedStr(job.started_at, null)}</span>
                                  )}
                                  {(() => {
                                    const displayModel = job.actual_model || job.worker_model || job.model;
                                    if (!displayModel) return null;
                                    const m = displayModel.toLowerCase();
                                    const isClaude = m.includes("claude") || m.includes("anthropic");
                                    const isLitellm = m.includes("kimi") || m.includes("qwen") || m.includes("minimax") || m.includes("deepseek") || m.includes("gemini");
                                    const bg = isClaude ? "rgba(99,102,241,0.2)" : isLitellm ? "rgba(16,185,129,0.2)" : "rgba(156,163,175,0.2)";
                                    const fg = isClaude ? "#818cf8" : isLitellm ? "#34d399" : "#9ca3af";
                                    return (
                                      <>
                                        <span style={{ fontSize: "9px", background: bg, color: fg, borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap" }}>
                                          {displayModel}
                                        </span>
                                        {job.size && (
                                          <span style={{ fontSize: "9px", background: "rgba(107,114,128,0.15)", color: "#9ca3af", borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap", fontWeight: 600 }}>
                                            {job.size}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                                <div style={{ fontSize: "11px", opacity: 0.75, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {job.instruction.replace(/\n/g, " ").slice(0, 80)}
                                </div>
                                {job.created_at && (
                                  <div style={{ fontSize: "10px", opacity: 0.45, marginTop: 1 }}>
                                    제출 {new Date(job.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                    {job.started_at && ` · 시작 ${new Date(job.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
                                  </div>
                                )}
                                {(job.status === "error" || ["no_changes", "dedup_blocked", "blocked_dependency"].includes(displayStatus)) && (
                                  <div style={{ fontSize: "10px", color: displayStatus === "error" ? "#ef4444" : "#f59e0b", marginTop: 2 }}>
                                    {job.error_detail ? `원인: ${errorDetailKo(job.error_detail)}` : ""}
                                    {job.error_message ? ` — ${job.error_message.slice(0, 80)}` : ""}
                                  </div>
                                )}
                              </div>
                            </summary>
                            <div style={{ padding: "6px 12px 8px 26px", fontSize: "11px", color: "var(--ct-text2)", background: "rgba(255,255,255,0.02)" }}>
                              <div style={{ whiteSpace: "pre-wrap", opacity: 0.8, maxHeight: "200px", overflowY: "auto", fontFamily: "monospace", fontSize: "10px", lineHeight: 1.5 }}>{job.instruction}</div>
                              {children.length > 0 && (
                                <div style={{ marginTop: 6, borderLeft: "2px solid var(--ct-border)", paddingLeft: 8 }}>
                                  {children.map(c => renderJob(c, depth + 1))}
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      );
                    };

                    return roots.map(job => renderJob(job));
                  })()}
                </div>
              ) : artifactTab === "html_preview" ? (
                activeArtifact ? (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    {/* 상단 툴바 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "8px 12px", borderBottom: "1px solid var(--ct-border)",
                      background: "var(--ct-card)", borderRadius: "8px 8px 0 0",
                    }}>
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--ct-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeArtifact.title || "HTML 미리보기"}
                      </span>
                      <button
                        onClick={() => setShowHtmlCode(!showHtmlCode)}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: showHtmlCode ? "var(--ct-accent)" : "var(--ct-hover)",
                          color: showHtmlCode ? "#fff" : "var(--ct-text2)",
                        }}
                      >
                        {showHtmlCode ? "미리보기" : "코드 보기"}
                      </button>
                      <button
                        onClick={() => copyArtifact(activeArtifact.content)}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: "var(--ct-hover)", color: "var(--ct-text2)",
                        }}
                      >
                        📋 복사
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`${BASE_URL}/chat/artifacts/${activeArtifact.id}/export`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...authHdrs() },
                              body: JSON.stringify({ format: "md" }),
                            });
                            if (!res.ok) return;
                            const data = await res.json();
                            const blob = new Blob([data.content], { type: data.mime || "text/markdown" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = data.filename || "artifact.md";
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {}
                        }}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: "var(--ct-hover)", color: "var(--ct-text2)",
                        }}
                      >
                        ⬇️ 내보내기
                      </button>
                      <button
                        onClick={() => {
                          const w = window.open("", "_blank");
                          if (w) { w.document.write(activeArtifact.content); w.document.close(); }
                        }}
                        style={{
                          padding: "4px 10px", fontSize: "11px", borderRadius: "6px",
                          border: "1px solid var(--ct-border)", cursor: "pointer",
                          background: "var(--ct-hover)", color: "var(--ct-text2)",
                        }}
                      >
                        🔗 새 창
                      </button>
                    </div>
                    {/* 콘텐츠 영역 */}
                    {showHtmlCode ? (
                      <pre style={{
                        flex: 1, background: "var(--ct-code)", padding: "12px",
                        borderRadius: "0 0 8px 8px", overflowX: "auto", overflowY: "auto",
                        fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap",
                        wordBreak: "break-word", scrollbarWidth: "thin",
                      }}>
                        {activeArtifact.content}
                      </pre>
                    ) : (
                      <iframe
                        srcDoc={activeArtifact.content}
                        sandbox="allow-scripts"
                        style={{
                          flex: 1, width: "100%", border: "none",
                          borderRadius: "0 0 8px 8px", background: "#ffffff",
                          minHeight: "400px",
                        }}
                        title={activeArtifact.title || "HTML Preview"}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", paddingTop: "40px", color: "var(--ct-text2)" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>🖼️</div>
                    <div style={{ fontSize: "12px" }}>HTML 미리보기가 없습니다</div>
                    <div style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7, lineHeight: 1.5 }}>
                      AI에게 HTML 생성을 요청해 보세요
                    </div>
                  </div>
                )
              ) : activeArtifact ? (() => {
                const edited = localEdits[activeArtifact.id];
                const displayArtifact = edited
                  ? { ...activeArtifact, title: edited.title, content: edited.content, metadata: edited.metadata ?? activeArtifact.metadata }
                  : activeArtifact;
                const isEditing = editingArtifactId === activeArtifact.id;

                if (isEditing) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="제목"
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-input-bg)",
                          color: "var(--ct-text)",
                          fontSize: "13px",
                          fontWeight: 600,
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--ct-border)",
                          background: "var(--ct-input-bg)",
                          color: "var(--ct-text)",
                          fontSize: "13px",
                          lineHeight: "1.6",
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                          minHeight: "200px",
                          maxHeight: "70vh",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                      {editError && (
                        <div style={{ fontSize: "11px", color: "#ef4444", padding: "4px 0" }}>
                          오류: {editError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={saveEdit}
                          disabled={editSaving}
                          style={{
                            flex: 1,
                            padding: "7px 8px",
                            fontSize: "12px",
                            background: editSaving ? "var(--ct-hover)" : "var(--ct-accent)",
                            border: "none",
                            borderRadius: "6px",
                            cursor: editSaving ? "not-allowed" : "pointer",
                            color: editSaving ? "var(--ct-text2)" : "#fff",
                            fontWeight: 600,
                          }}
                        >
                          {editSaving ? "저장 중..." : "💾 저장"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          style={{
                            flex: 1,
                            padding: "7px 8px",
                            fontSize: "12px",
                            background: "var(--ct-hover)",
                            border: "1px solid var(--ct-border)",
                            borderRadius: "6px",
                            cursor: editSaving ? "not-allowed" : "pointer",
                            color: "var(--ct-text2)",
                          }}
                        >
                          ❌ 취소
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "13px",
                        marginBottom: "12px",
                        color: "var(--ct-text)",
                      }}
                    >
                      {displayArtifact.title}
                    </div>
                    {activeArtifact.session_id !== activeSession?.id && (
                      <span style={{ fontSize: "10px", color: "#888", marginLeft: "4px" }}>
                        (다른 세션)
                      </span>
                    )}
                    {/* artifact-summary-stats */}
                    {(() => {
                      const c = displayArtifact.content || "";
                      const chars = c.length;
                      const words = c.trim().split(/\s+/).filter(Boolean).length;
                      const lines = c.split("\n").length;
                      const sections = (c.match(/^#{1,3}\s+/gm) || []).length;
                      const tables = (c.match(/^\|.+\|$/gm) || []).length;
                      const codeBlocks = Math.floor(((c.match(/```/g) || []).length) / 2);
                      const typeLabel: Record<string, string> = {
                        report: "\ud83d\udcc4 \ubcf4\uace0\uc11c",
                        code: "\ud83d\udcbb \ucf54\ub4dc",
                        chart: "\ud83d\udcca \ucc28\ud2b8",
                        full_response: "\ud83d\udcc4 \ubcf4\uace0\uc11c",
                        table: "\ud83d\udcca \ud45c",
                        image: "\ud83d\uddbc\ufe0f \uc774\ubbf8\uc9c0",
                        file: "\ud83d\udcce \ud30c\uc77c",
                        task_card: "\ud83d\udccb \uc791\uc5c5",
                      };
                      const label = typeLabel[displayArtifact.artifact_type] || "\ud83d\udcc4 \ubb38\uc11c";
                      if (chars < 10) return null;
                      const stats = [
                        { k: "\uc720\ud615", v: label },
                        { k: "\uae00\uc790", v: chars.toLocaleString() },
                        { k: "\ub2e8\uc5b4", v: words.toLocaleString() },
                        { k: "\uc904", v: lines.toLocaleString() },
                      ];
                      if (sections > 0) stats.push({ k: "\uc139\uc158", v: String(sections) });
                      if (tables > 0) stats.push({ k: "\ud45c", v: String(tables) });
                      if (codeBlocks > 0) stats.push({ k: "\ucf54\ub4dc\ube14\ub85d", v: String(codeBlocks) });
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", gap: "12px",
                          padding: "4px 0", marginBottom: "8px",
                          borderBottom: "1px solid var(--ct-border)",
                          overflowX: "auto",
                        }}>
                          {stats.map((s, i) => (
                            <span key={i} style={{ display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
                              <span style={{ color: "var(--ct-text-muted)", fontSize: "10px" }}>{s.k}</span>
                              <span style={{ color: "var(--ct-text)", fontSize: "11px", fontWeight: 500 }}>{s.v}</span>
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                      {displayArtifact.artifact_type === "image" ? (
                        <img
                          src={displayArtifact.content}
                          alt={displayArtifact.title}
                          style={{ maxWidth: "100%", borderRadius: "8px" }}
                        />
                      ) : displayArtifact.artifact_type === "file" ? (
                        <a
                          href={displayArtifact.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "16px",
                            background: "var(--ct-input-bg)",
                            borderRadius: "8px",
                            textDecoration: "none",
                            color: "var(--ct-text)",
                          }}
                        >
                          {"📎 " + (displayArtifact.title || "파일 다운로드")}
                        </a>
                      ) : displayArtifact.artifact_type === "chart" ? (
                        displayArtifact.metadata?.subtype === "mermaid" ? (
                          <pre
                            onClick={() => openArtifactInNewTab(displayArtifact)}
                            title="차트를 새 탭으로 열기"
                            style={{
                              background: "var(--ct-code)",
                              padding: "12px",
                              borderRadius: "8px",
                              overflowX: "auto", scrollbarWidth: "thin",
                              fontFamily: "monospace",
                              fontSize: "12px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              cursor: "pointer",
                            }}
                          >
                            {displayArtifact.content}
                          </pre>
                        ) : (
                          <div
                            onClick={() => openArtifactInNewTab(displayArtifact)}
                            title="차트를 새 탭으로 열기"
                            style={{ cursor: "pointer" }}
                          >
                            <MarkdownBlock text={displayArtifact.content} />
                          </div>
                        )
                      ) : displayArtifact.artifact_type === "code" ? (
                        <pre
                          style={{
                            background: "var(--ct-code)",
                            padding: "12px",
                            borderRadius: "8px",
                            overflowX: "auto", scrollbarWidth: "thin",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {displayArtifact.content}
                        </pre>
                      ) : displayArtifact.artifact_type === "task_card" ? (
                        <TaskCard content={displayArtifact.content} />
                      ) : (
                        <MarkdownBlock text={displayArtifact.content} />
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div
                  style={{
                    textAlign: "center",
                    paddingTop: "40px",
                    color: "var(--ct-text2)",
                  }}
                >
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                  <div style={{ fontSize: "12px" }}>아티팩트가 없습니다</div>
                  <div
                    style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7, lineHeight: 1.5 }}
                  >
                    AI 응답에서 아티팩트가
                    <br />
                    생성되면 여기에 표시됩니다
                  </div>
                </div>
              )}
            </ArtifactContentArea>

            {/* Artifact actions */}
            {activeArtifact && (
              <div
                style={{
                  padding: "12px",
                  borderTop: "1px solid var(--ct-border)",
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
	                {[
	                  { icon: "📋", label: "복사", fn: () => copyArtifact(localEdits[activeArtifact.id]?.content ?? activeArtifact.content) },
	                  ...(activeArtifact.artifact_type === "chart"
	                    ? [{ icon: "🔗", label: "새 탭", fn: () => openArtifactInNewTab(activeArtifact) }]
	                    : []),
	                  { icon: "✏️", label: "편집", fn: () => editingArtifactId === activeArtifact.id ? cancelEdit() : startEdit(activeArtifact) },
	                  {
	                    icon: activeArtifact.metadata?.subtype === "directive_draft" ? "📝" : "📋",
	                    label: activeArtifact.metadata?.subtype === "directive_draft" ? "입력창에 넣기" : "지시서",
	                    fn: () => toDirective({
	                      ...activeArtifact,
	                      title: localEdits[activeArtifact.id]?.title ?? activeArtifact.title,
	                      content: localEdits[activeArtifact.id]?.content ?? activeArtifact.content,
	                      metadata: localEdits[activeArtifact.id]?.metadata ?? activeArtifact.metadata,
	                    }),
	                  },
	                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={btn.fn}
                    style={{
                      flex: 1,
                      padding: "7px 8px",
                      fontSize: "11px",
                      background: "var(--ct-hover)",
                      border: "1px solid var(--ct-border)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      color: "var(--ct-text2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--ct-accent)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--ct-hover)") }
                  >
                    {btn.icon} {btn.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Mini mode — vertical icons */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "12px 0",
              gap: "8px",
              flex: 1,
            }}
          >
            {(
              [
                { key: "log" as ArtifactTab, icon: "🔧", label: "로그" },
                { key: "deploy" as ArtifactTab, icon: "🚀", label: "배포" },
                { key: "agenda" as ArtifactTab, icon: "📋", label: "아이디어 메모" },
                { key: "report" as ArtifactTab, icon: "📄", label: "보고서" },
                { key: "dialog" as ArtifactTab, icon: "💬", label: "대화응답" },
                { key: "code" as ArtifactTab, icon: "💻", label: "코드" },
                { key: "html_preview" as ArtifactTab, icon: "🖼️", label: "미리보기" },
                { key: "chart" as ArtifactTab, icon: "📊", label: "차트" },
                { key: "tasks" as ArtifactTab, icon: "⚡", label: "작업" },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setArtifactTab(tab.key); setArtifactMode("full"); setSelectedArtifactIdx(0); }}
                title={tab.label}
                style={{
                  width: "36px",
                  height: "36px",
                  fontSize: "16px",
                  background:
                    artifactTab === tab.key ? "var(--ct-accent)" : "var(--ct-hover)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: artifactTab === tab.key ? "#fff" : "var(--ct-text2)",
                }}
              >
                <span style={{ position: 'relative' }}>
                  {tab.icon}
                  {tab.key !== "tasks" && tab.key !== "log" && tab.key !== "agenda" && artifactCounts[tab.key] > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      fontSize: '9px',
                      background: 'var(--ct-accent)',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0 4px',
                      lineHeight: '14px',
                      minWidth: '14px',
                      textAlign: 'center',
                    }}>{artifactCounts[tab.key]}</span>
                  )}
                  {tab.key === "agenda" && agendaItems.length > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      fontSize: '9px',
                      background: 'var(--ct-accent)',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0 4px',
                      lineHeight: '14px',
                      minWidth: '14px',
                      textAlign: 'center',
                    }}>{agendaItems.length}</span>
                  )}
                  {tab.key === "deploy" && deployBadgeCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      fontSize: '9px',
                      background: 'var(--ct-accent)',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '0 4px',
                      lineHeight: '14px',
                      minWidth: '14px',
                      textAlign: 'center',
                    }}>{deployBadgeCount}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    </>
  );
});

ChatArtifactPanel.displayName = "ChatArtifactPanel";
export default ChatArtifactPanel;
