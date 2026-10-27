import type { MoveDirection } from "@/lib/goalOrder";

const BTN: React.CSSProperties = {
  width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: 10,
  border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)",
  fontSize: 16, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
};

export function GoalOrderControls({ goalId, canUp, canDown, busy, onMove }: {
  goalId: string; canUp: boolean; canDown: boolean; busy: boolean;
  onMove: (goalId: string, dir: MoveDirection) => void;
}) {
  const dim = (disabled: boolean): React.CSSProperties => ({ ...BTN, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" });
  return (
    <div data-testid="goal-order-controls" style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
      <button type="button" data-testid="goal-order-up" aria-label="처리 순서 올리기" disabled={!canUp || busy}
        style={dim(!canUp || busy)} onClick={() => onMove(goalId, "up")}>▲</button>
      <button type="button" data-testid="goal-order-down" aria-label="처리 순서 내리기" disabled={!canDown || busy}
        style={dim(!canDown || busy)} onClick={() => onMove(goalId, "down")}>▼</button>
    </div>
  );
}

export function GoalOrderError({ goalId, error, onRetry }: {
  goalId: string; error: string; onRetry: (goalId: string) => void;
}) {
  return (
    <div role="alert" data-testid="goal-order-error" style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #ef4444", background: "rgba(239,68,68,.08)", color: "#dc2626", fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>순서를 바꾸지 못했습니다. 원래 순서로 되돌렸습니다. ({error})</span>
      <button type="button" data-testid="goal-order-retry" onClick={() => onRetry(goalId)}
        style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid #dc2626", background: "none", color: "inherit", fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
    </div>
  );
}
