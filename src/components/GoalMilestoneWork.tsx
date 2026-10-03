"use client";

import { useCallback, useMemo, useState } from "react";
import type { GoalGovernance, GoalWorkItem, WorkItemApprovalPreview } from "@/lib/api";
import {
  averageRootProgress, countMismatches, countPendingApprovals, expansionKey, loadExpansionState,
  saveExpansionState, type GroupedWorkNode,
} from "@/lib/goalMilestoneGrouping";
import { ItemBody } from "@/components/GoalWorkHierarchy";

export function useExpansionState(goalId: string) {
  const [state, setState] = useState(() => ({ goalId, map: loadExpansionState(goalId) }));
  if (state.goalId !== goalId) setState({ goalId, map: loadExpansionState(goalId) });
  const map = state.map;
  const isOpen = useCallback((itemId: string, fallback: boolean) => map[expansionKey(goalId, itemId)] ?? fallback, [goalId, map]);
  const toggle = useCallback((itemId: string, current: boolean) => {
    const next = { ...map, [expansionKey(goalId, itemId)]: !current };
    setState({ goalId, map: next });
    saveExpansionState(goalId, next);
  }, [goalId, map]);
  return { isOpen, toggle };
}

export interface WorkTreeContext {
  previews: Record<string, WorkItemApprovalPreview | null>;
  actorSessionId: string;
  onChanged: () => Promise<void>;
  isOpen: (itemId: string, fallback: boolean) => boolean;
  toggle: (itemId: string, current: boolean) => void;
  governance: GoalGovernance | null;
  itemsById: Record<string, GoalWorkItem>;
  milestoneLabels: Record<string, string>;
}

export function indexWorkItems(items: GoalWorkItem[], into: Record<string, GoalWorkItem> = {}): Record<string, GoalWorkItem> {
  for (const item of items) { into[item.id] = item; indexWorkItems(item.children || [], into); }
  return into;
}

function WorkNode({ node, depth, ctx, rootNote }: { node: GroupedWorkNode; depth: number; ctx: WorkTreeContext; rootNote?: string }) {
  const { item } = node;
  const open = ctx.isOpen(item.id, depth === 0);
  const assignment = item.assignment_id ? ctx.governance?.assignments.find((a) => a.id === item.assignment_id) : undefined;
  const assigneeLabel = assignment ? `${assignment.role_key} · ${assignment.session_title || assignment.session_id.slice(0, 8)}` : undefined;
  const dependencyLabels = (item.dependencies || []).map((dep) => {
    const target = ctx.itemsById[dep.work_item_id];
    return `${target ? target.title : dep.work_item_id.slice(0, 8)} (${dep.type})`;
  });
  const warnings: string[] = [];
  if (node.mismatch) {
    const own = node.mismatch.ownMilestoneId;
    warnings.push(`상위 항목과 다른 마일스톤(${ctx.milestoneLabels[own] || own.slice(0, 8)})으로 기록되어 있습니다. 상위 항목 아래에 그대로 표시합니다.`);
  }
  if (rootNote) warnings.push(rootNote);
  return (
    <ItemBody item={item} previews={ctx.previews} actorSessionId={ctx.actorSessionId} onChanged={ctx.onChanged} depth={depth}
      tree={{
        expanded: open, childCount: node.children.length, onToggle: () => ctx.toggle(item.id, open),
        assigneeLabel, dependencyLabels, warning: warnings.length ? warnings.join(" ") : undefined,
        children: node.children.map((child) => <WorkNode key={child.item.id} node={child} depth={depth + 1} ctx={ctx} />),
      }} />
  );
}

function SectionShell({ sectionId, label, summary, defaultOpen, ctx, children }: {
  sectionId: string; label: string; summary: string; defaultOpen: boolean;
  ctx: Pick<WorkTreeContext, "isOpen" | "toggle">; children: React.ReactNode;
}) {
  const open = ctx.isOpen(sectionId, defaultOpen);
  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" aria-expanded={open} onClick={() => ctx.toggle(sectionId, open)}
        style={{ display: "flex", gap: 7, alignItems: "center", width: "100%", minHeight: 36, padding: "0 4px", border: 0,
                 background: "transparent", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, textAlign: "left", cursor: "pointer" }}>
        <span aria-hidden style={{ width: 12, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{summary}</span>
      </button>
      {open && <div style={{ paddingLeft: 6, borderLeft: "2px solid var(--border)", marginLeft: 6 }}>{children}</div>}
    </div>
  );
}

export function MilestoneWorkTree({ milestoneId, roots, itemCount, loaded, defaultOpen, ctx }: {
  milestoneId: string; roots: GroupedWorkNode[]; itemCount: number; loaded: boolean;
  defaultOpen: boolean; ctx: WorkTreeContext;
}) {
  const pending = useMemo(() => countPendingApprovals(roots), [roots]);
  const mismatches = useMemo(() => countMismatches(roots), [roots]);
  if (!loaded) return null;
  const summary = itemCount === 0 ? "업무 없음"
    : `${itemCount}건${pending ? ` · 승인 대기 ${pending}` : ""}${mismatches ? ` · 경고 ${mismatches}` : ""}`;
  return (
    <SectionShell sectionId={`milestone:${milestoneId}`} label="업무 계층" summary={summary} defaultOpen={defaultOpen} ctx={ctx}>
      {itemCount === 0
        ? <div style={{ margin: "6px 0 8px", padding: 9, border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 11 }}>
            이 마일스톤에 연결된 Epic·Story·Task가 없습니다.
          </div>
        : <div style={{ paddingBottom: 6 }}>
            {roots.map((node) => <WorkNode key={node.item.id} node={node} depth={0} ctx={ctx} />)}
          </div>}
    </SectionShell>
  );
}

export function UnassignedWork({ roots, count, ctx }: {
  roots: GroupedWorkNode[]; count: number; ctx: WorkTreeContext;
}) {
  if (count === 0) return null;
  return (
    <section aria-label="마일스톤 미지정 업무" style={{ marginTop: 6, marginBottom: 9, padding: "9px 11px", borderRadius: 9,
      border: "1px dashed #d97706", background: "var(--bg-primary)" }}>
      <strong style={{ fontSize: 12.5, color: "var(--text-primary)" }}>마일스톤 미지정</strong>
      <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--text-secondary)" }}>
        어느 마일스톤에도 연결되지 않은 업무 {count}건
      </div>
      <SectionShell sectionId="unassigned" label="업무 계층" summary={`${roots.length}개 항목 그룹`} defaultOpen ctx={ctx}>
        {roots.map((node) => <WorkNode key={node.item.id} node={node} depth={0} ctx={ctx}
          rootNote={node.item.milestone_id ? `목표의 마일스톤 목록에 없는 milestone_id(${node.item.milestone_id.slice(0, 8)})입니다.` : undefined} />)}
      </SectionShell>
    </section>
  );
}

export function milestoneProgressLabel(roots: GroupedWorkNode[]): string {
  const percent = averageRootProgress(roots);
  return percent === null ? "업무 없음" : `업무 진행 ${percent}%`;
}
