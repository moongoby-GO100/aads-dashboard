import type { GoalWorkItem, GoalWorkOwner, GoalWorkSummary, GoalWorkTaskCounts } from "@/lib/api";

export const WORK_STATUS_LABEL: Record<string, string> = {
  draft: "초안", ready: "준비", in_progress: "진행 중", in_review: "검토 중",
  changes_requested: "수정 요청", blocked: "막힘", completed: "완료", cancelled: "취소",
};

export const workStatusLabel = (status?: string | null) =>
  (status && WORK_STATUS_LABEL[status]) || status || "상태 미확인";

export interface WorkProgressCounts { total: number; completed: number; in_progress: number; blocked: number }

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function toCounts(src: Partial<GoalWorkTaskCounts> | null | undefined): WorkProgressCounts {
  return { total: num(src?.total), completed: num(src?.completed), in_progress: num(src?.in_progress), blocked: num(src?.blocked) };
}

/** 하위 Task 를 클라이언트에서 센다(서버 task_counts 가 없을 때의 폴백). */
export function countTasksBelow(item: GoalWorkItem): WorkProgressCounts {
  const out: WorkProgressCounts = { total: 0, completed: 0, in_progress: 0, blocked: 0 };
  const walk = (node: GoalWorkItem) => {
    if (node.type === "task") {
      out.total += 1;
      if (node.status === "completed") out.completed += 1;
      else if (node.status === "in_progress") out.in_progress += 1;
      else if (node.status === "blocked") out.blocked += 1;
    }
    (node.children || []).forEach(walk);
  };
  walk(item);
  return out;
}

/** Epic/Story 의 작업 집계. 서버 task_counts 가 있으면 그 값을, 없으면 children 으로 센다. */
export function itemTaskCounts(item: GoalWorkItem): WorkProgressCounts {
  return item.task_counts ? toCounts(item.task_counts) : countTasksBelow(item);
}

export const percentOf = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

export function itemProgressText(counts: WorkProgressCounts): string {
  if (counts.total === 0) return "작업 없음";
  return `작업 ${counts.completed}/${counts.total} (${percentOf(counts.completed, counts.total)}%)`;
}

export const itemActivityText = (counts: WorkProgressCounts) => `진행 ${counts.in_progress} · 막힘 ${counts.blocked}`;

const KINDS = [["epic", "Epic"], ["story", "Story"], ["task", "Task"]] as const;
type Kind = (typeof KINDS)[number][0];

/** 마일스톤 업무 요약. 서버 work_summary 가 없으면 루트 항목 트리에서 센다. */
export function milestoneWorkCounts(
  summary: GoalWorkSummary | null | undefined,
  roots: GoalWorkItem[],
): Record<Kind, WorkProgressCounts> {
  if (summary) return { epic: toCounts(summary.epic), story: toCounts(summary.story), task: toCounts(summary.task) };
  const out: Record<Kind, WorkProgressCounts> = {
    epic: toCounts(null), story: toCounts(null), task: toCounts(null),
  };
  const walk = (node: GoalWorkItem) => {
    const bucket = out[node.type];
    if (bucket) {
      bucket.total += 1;
      if (node.status === "completed" || node.status === "in_progress" || node.status === "blocked") bucket[node.status] += 1;
    }
    (node.children || []).forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** Task 기준 막힘 수. 업무가 없으면 "업무 없음". */
export function milestoneWorkLabel(summary: GoalWorkSummary | null | undefined, roots: GoalWorkItem[]): string {
  const counts = milestoneWorkCounts(summary, roots);
  if (KINDS.every(([kind]) => counts[kind].total === 0)) return "업무 없음";
  const blocked = counts.task.total > 0 ? counts.task.blocked
    : counts.story.total > 0 ? counts.story.blocked
      : counts.epic.blocked;
  const done = KINDS.map(([kind, label]) => `${label} ${counts[kind].completed}/${counts[kind].total}`).join(" · ");
  return `${done} 완료${blocked ? ` · 막힘 ${blocked}` : ""}`;
}

export interface OwnerDisplay { text: string; warn: boolean }

const ownerName = (owner: GoalWorkOwner) =>
  owner.session_title || owner.role_key || (owner.session_id ? owner.session_id.slice(0, 8) : "이름 없음");

/**
 * 담당 표시 문구. effective_owner 가 없는 옛 응답은 기존 동작(`담당 <라벨|미지정>`)을 유지한다.
 * assigned 는 거버넌스의 담당 라벨을 그대로 쓰고, 라벨이 없을 때만 서버가 준 세션 정보로 보완한다.
 */
export function ownerDisplay(owner: GoalWorkOwner | null | undefined, assigneeLabel?: string): OwnerDisplay {
  const legacy = { text: `담당 ${assigneeLabel || "미지정"}`, warn: false };
  if (!owner) return legacy;
  switch (owner.source) {
    case "assigned":
      return assigneeLabel ? legacy
        : { text: `담당 ${owner.session_id || owner.session_title ? ownerName(owner) : "미지정"}`, warn: false };
    case "milestone_owner": return { text: `담당 대행 · ${ownerName(owner)}`, warn: false };
    case "goal_lead": return { text: `주도 정리 중 · ${ownerName(owner)}`, warn: false };
    case "none": return { text: "미지정 — 주도 없음", warn: true };
    default: return legacy;
  }
}
