// /goals 목록 처리 순서: 우선순위 → priority_order(작을수록 먼저, 없으면 뒤) → 서버가 준 순서.
// 서버: POST /goals/reorder {goal_ids} 는 받은 순서대로 1..n 을 테넌트 전체에 매긴다.
import { compareOrderValue, priorityRankOf } from "@/lib/goalStrip";

export interface OrderableGoal {
  id?: string;
  goal_id?: string;
  priority?: string | null;
  priority_order?: number | null;
}

export type MoveDirection = "up" | "down";

export function goalIdOf(g: OrderableGoal): string {
  return g.goal_id || g.id || "";
}

export function hasOrder(g: OrderableGoal): boolean {
  return typeof g.priority_order === "number" && Number.isFinite(g.priority_order);
}

/** 안정 정렬. priority_order 가 하나도 없는 구 응답은 우선순위 순서만 적용되어 서버 순서가 그대로 남는다. */
export function sortGoalsByOrder<T extends OrderableGoal>(goals: readonly T[]): T[] {
  return goals
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const p = priorityRankOf({ priority: a.g.priority }) - priorityRankOf({ priority: b.g.priority });
      if (p !== 0) return p;
      const o = compareOrderValue(a.g.priority_order, b.g.priority_order);
      if (o !== 0) return o;
      return a.i - b.i;
    })
    .map((x) => x.g);
}

/** 이동 가능한 이웃: 같은 우선순위 안에서 순서 값이 있는 바로 앞/뒤 목표. 없으면 null (경계). */
export function neighborOf<T extends OrderableGoal>(
  sorted: readonly T[], goalId: string, dir: MoveDirection,
): T | null {
  const idx = sorted.findIndex((g) => goalIdOf(g) === goalId);
  if (idx < 0 || !hasOrder(sorted[idx])) return null;
  const rank = priorityRankOf({ priority: sorted[idx].priority });
  const step = dir === "up" ? -1 : 1;
  const n = sorted[idx + step];
  if (!n || !hasOrder(n)) return null;
  return priorityRankOf({ priority: n.priority }) === rank ? n : null;
}

/** 화면에 보이는 두 목표의 처리 순서 값을 맞바꾼 새 목록 (낙관적 갱신용). */
export function swapOrders<T extends OrderableGoal>(goals: readonly T[], aId: string, bId: string): T[] {
  const a = goals.find((g) => goalIdOf(g) === aId);
  const b = goals.find((g) => goalIdOf(g) === bId);
  if (!a || !b) return [...goals];
  return goals.map((g) => {
    const id = goalIdOf(g);
    if (id === aId) return { ...g, priority_order: b.priority_order };
    if (id === bId) return { ...g, priority_order: a.priority_order };
    return g;
  });
}

/**
 * reorder 에 보낼 전체 순서. 순서 값이 있는 목표를 priority_order 순으로 세운 뒤 두 목표의 자리를 맞바꾼다.
 * 프로젝트 필터로 일부만 보여도 전체 목록을 넘기면 다른 프로젝트 목표의 상대 순서는 그대로다.
 */
export function buildReorderIds<T extends OrderableGoal>(all: readonly T[], aId: string, bId: string): string[] {
  const ids = all
    .map((g, i) => ({ g, i }))
    .filter((x) => hasOrder(x.g))
    .sort((x, y) => compareOrderValue(x.g.priority_order, y.g.priority_order) || x.i - y.i)
    .map((x) => goalIdOf(x.g));
  const ai = ids.indexOf(aId);
  const bi = ids.indexOf(bId);
  if (ai < 0 || bi < 0) throw new Error("목록이 바뀌었습니다. 새로고침 후 다시 시도해 주십시오.");
  [ids[ai], ids[bi]] = [ids[bi], ids[ai]];
  return ids;
}

export interface MoveDeps<T extends OrderableGoal> {
  /** 필터 없는 전체 목록 (프로젝트 필터가 켜져 있을 때만 호출). */
  fetchAll: () => Promise<readonly T[]>;
  reorder: (goalIds: string[]) => Promise<unknown>;
}

export type MoveResult<T> =
  | { ok: true; goals: T[] }
  | { ok: false; goals: T[]; error: string };

/**
 * 한 칸 이동. 낙관적으로 바뀐 목록은 호출 쪽이 먼저 그리고, 실패하면 `goals`(원래 목록)로 되돌린다.
 * 반환의 goals 는 성공이면 이동 후 목록, 실패면 이동 전 원래 목록.
 */
export async function moveGoal<T extends OrderableGoal>(
  current: readonly T[], filtered: boolean, goalId: string, dir: MoveDirection, deps: MoveDeps<T>,
): Promise<MoveResult<T>> {
  const prev = [...current];
  const neighbor = neighborOf(sortGoalsByOrder(prev), goalId, dir);
  if (!neighbor) return { ok: true, goals: prev };
  try {
    const all = filtered ? await deps.fetchAll() : prev;
    const ids = buildReorderIds(all, goalId, goalIdOf(neighbor));
    await deps.reorder(ids);
    return { ok: true, goals: swapOrders(prev, goalId, goalIdOf(neighbor)) };
  } catch (cause) {
    return { ok: false, goals: prev, error: cause instanceof Error && cause.message ? cause.message : "순서를 바꾸지 못했습니다." };
  }
}
