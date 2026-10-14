export type ListBodyState = "loading" | "error" | "empty" | "no-results" | "list";

export function listBodyState(input: { loading: boolean; hasError: boolean; count: number; query: string }): ListBodyState {
  if (input.loading) return "loading";
  if (input.hasError) return "error";
  if (input.count === 0) return input.query ? "no-results" : "empty";
  return "list";
}

// 선택 문서가 현재 목록(검색 결과 포함)에 있는지. 목록이 아직 확정되지 않았으면 "unknown".
export type SelectionPresence = "none" | "unknown" | "present" | "missing";

export function selectionPresence(input: {
  selected: string | null;
  keys: readonly string[];
  loading: boolean;
  hasError: boolean;
}): SelectionPresence {
  if (!input.selected) return "none";
  if (input.loading || input.hasError) return "unknown";
  return input.keys.includes(input.selected) ? "present" : "missing";
}

export const SLOW_LIST_MS = 3000;
