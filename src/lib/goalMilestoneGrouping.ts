import type { GoalWorkItem } from "@/lib/api";

export interface GroupedWorkNode {
  item: GoalWorkItem;
  children: GroupedWorkNode[];
  /** 자식의 milestone_id 가 부모와 다를 때만 채워진다. 자식은 부모 쪽 그룹에 그대로 남는다. */
  mismatch: { parentMilestoneId: string; ownMilestoneId: string } | null;
}

export interface MilestoneWorkGroup {
  milestoneId: string;
  roots: GroupedWorkNode[];
  itemCount: number;
}

export interface MilestoneWorkGrouping {
  byMilestone: Record<string, MilestoneWorkGroup>;
  unassigned: GroupedWorkNode[];
  unassignedCount: number;
  totalCount: number;
}

function buildNode(item: GoalWorkItem, parent: GoalWorkItem | null): GroupedWorkNode {
  const own = item.milestone_id || "";
  const parentId = parent?.milestone_id || "";
  const mismatch = parent && own && own !== parentId
    ? { parentMilestoneId: parentId, ownMilestoneId: own }
    : null;
  return {
    item,
    mismatch,
    children: (item.children || []).map((child) => buildNode(child, item)),
  };
}

function countNodes(nodes: GroupedWorkNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

/**
 * 업무 트리를 마일스톤별로 나눈다. 배치 기준은 루트 항목의 milestone_id 뿐이며
 * (제목 매칭 없음), 자식은 부모를 따라간다. 알려진 마일스톤에 속하지 않는
 * 루트는 모두 unassigned 로 모은다 — 어떤 항목도 버리지 않는다.
 */
export function groupWorkItemsByMilestone(
  rootItems: GoalWorkItem[],
  milestoneIds: string[],
): MilestoneWorkGrouping {
  const known = new Set(milestoneIds);
  const byMilestone: Record<string, MilestoneWorkGroup> = {};
  for (const id of milestoneIds) byMilestone[id] = { milestoneId: id, roots: [], itemCount: 0 };
  const unassigned: GroupedWorkNode[] = [];

  for (const root of rootItems) {
    const node = buildNode(root, null);
    const id = root.milestone_id || "";
    if (id && known.has(id)) byMilestone[id].roots.push(node);
    else unassigned.push(node);
  }
  let totalCount = 0;
  for (const group of Object.values(byMilestone)) {
    group.itemCount = countNodes(group.roots);
    totalCount += group.itemCount;
  }
  const unassignedCount = countNodes(unassigned);
  return { byMilestone, unassigned, unassignedCount, totalCount: totalCount + unassignedCount };
}

export function countPendingApprovals(nodes: GroupedWorkNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.item.pending_approval_count || 0) + countPendingApprovals(node.children), 0);
}

/** 루트 항목 진행률의 평균(정수 %). 업무가 없으면 null. */
export function averageRootProgress(nodes: GroupedWorkNode[]): number | null {
  if (nodes.length === 0) return null;
  const total = nodes.reduce((sum, node) => sum + (Number(node.item.progress) || 0), 0);
  return Math.round(total / nodes.length);
}

export function countMismatches(nodes: GroupedWorkNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.mismatch ? 1 : 0) + countMismatches(node.children), 0);
}

export function expansionKey(goalId: string, itemId: string): string {
  return `${goalId}:${itemId}`;
}

const EXPANSION_STORAGE_KEY = "aads.goalPanel.expansion.v1";

export function parseExpansionState(raw: string | null, goalId: string): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { goalId?: unknown; expanded?: unknown };
    if (parsed.goalId !== goalId || !parsed.expanded || typeof parsed.expanded !== "object") return {};
    const prefix = `${goalId}:`;
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed.expanded as Record<string, unknown>)) {
      if (key.startsWith(prefix) && typeof value === "boolean") out[key] = value;
    }
    return out;
  } catch { return {}; }
}

export function serializeExpansionState(goalId: string, expanded: Record<string, boolean>): string {
  return JSON.stringify({ goalId, expanded });
}

export function loadExpansionState(goalId: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return parseExpansionState(window.sessionStorage.getItem(EXPANSION_STORAGE_KEY), goalId); }
  catch { return {}; }
}

export function saveExpansionState(goalId: string, expanded: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(EXPANSION_STORAGE_KEY, serializeExpansionState(goalId, expanded)); }
  catch { /* 저장소가 막혀 있어도 화면은 동작한다 */ }
}
