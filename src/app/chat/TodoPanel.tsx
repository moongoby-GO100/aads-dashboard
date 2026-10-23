import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatTodoItem, ScreenSize } from "./types";
import type { SessionTodos } from "./useSessionTodos";
import { TODO_PAGE_SIZE, countTodos, formatTodoCreatedAt, selectVisibleTodos, todoStatusLabel } from "./todoView";

const LONG_TITLE_CHARS = { mobile: 38, wide: 90 };

function smallButton(isMobile: boolean, busy: boolean): React.CSSProperties {
  return {
    minHeight: isMobile ? "32px" : "20px",
    minWidth: isMobile ? "44px" : undefined,
    padding: isMobile ? "0 10px" : "0 6px",
    borderRadius: "5px",
    border: "1px solid var(--ct-border)",
    background: "var(--ct-hover)",
    color: "var(--ct-text2)",
    cursor: busy ? "default" : "pointer",
    fontSize: isMobile ? "12px" : "10px",
    whiteSpace: "nowrap",
    opacity: busy ? 0.6 : 1,
  };
}

interface RowProps {
  item: ChatTodoItem;
  todos: SessionTodos;
  isMobile: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
}

const TodoRow = memo(function TodoRow({ item, todos, isMobile, expanded, onToggleExpand }: RowProps) {
  const busy = !!todos.actionLoading;
  const isDone = item.status === "completed";
  const isFailed = item.status === "failed";
  const isActive = item.status === "in_progress";
  const editing = todos.editingId === item.id;
  const created = formatTodoCreatedAt(item.created_at);
  const longTitle = item.title.length > (isMobile ? LONG_TITLE_CHARS.mobile : LONG_TITLE_CHARS.wide);
  const clamp: React.CSSProperties = expanded || !longTitle
    ? {}
    : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

  return (
    <div
      data-testid="todo-row"
      data-todo-id={item.id}
      data-status={item.status}
      style={{ marginBottom: "4px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "7px", flexWrap: isMobile ? "wrap" : "nowrap", minHeight: isMobile ? "36px" : "22px" }}>
        <span
          aria-hidden
          style={{
            width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "5px",
            background: isDone ? "#22c55e" : isFailed ? "#ef4444" : isActive ? "var(--ct-accent)" : "var(--ct-text2)",
          }}
        />
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {editing ? (
            <div>
              <input
                className="aads-focus-border"
                data-testid="todo-edit-input"
                autoFocus
                maxLength={300}
                value={todos.editTitle}
                onChange={(e) => todos.setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void todos.saveEdit(item);
                  if (e.key === "Escape") todos.cancelEdit();
                }}
                onBlur={() => { if (!todos.editError) void todos.saveEdit(item); }}
                style={{
                  width: "100%", boxSizing: "border-box", minWidth: 0, fontSize: isMobile ? "14px" : "12px",
                  padding: isMobile ? "6px 8px" : "1px 4px", borderRadius: "4px",
                  border: "1px solid var(--ct-accent)", background: "var(--ct-input)",
                  color: "var(--ct-text)", outline: "none",
                }}
              />
              {todos.editError?.id === item.id && (
                <div data-testid="todo-edit-error" role="alert" style={{ marginTop: "4px", fontSize: "11px", color: "#ef4444", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>저장 실패 — 입력한 제목은 그대로 보존됩니다. {todos.editError.message}</span>
                  <button
                    type="button"
                    data-testid="todo-edit-retry"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void todos.saveEdit(item)}
                    disabled={busy}
                    style={smallButton(isMobile, busy)}
                  >다시 저장</button>
                  <button
                    type="button"
                    data-testid="todo-edit-cancel"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => todos.cancelEdit()}
                    style={smallButton(isMobile, false)}
                  >취소</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", alignItems: "baseline", columnGap: "8px", rowGap: "1px" }}>
              <span
                data-testid="todo-title"
                onClick={longTitle ? () => onToggleExpand(item.id) : undefined}
                onDoubleClick={() => todos.startEdit(item)}
                title={item.title}
                aria-expanded={longTitle ? expanded : undefined}
                style={{
                  flex: isMobile ? "1 1 100%" : "0 1 auto", minWidth: 0, fontSize: isMobile ? "13px" : "12px", lineHeight: 1.4,
                  color: isDone ? "var(--ct-text2)" : "var(--ct-text)",
                  textDecoration: isDone ? "line-through" : "none",
                  overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "pre-wrap",
                  cursor: longTitle ? "pointer" : "text",
                  ...clamp,
                }}
              >
                {item.title}
              </span>
              <span
                data-testid="todo-created-at"
                data-known={created.known ? "1" : "0"}
                style={{ flex: "0 0 auto", fontSize: "10px", color: created.known ? "var(--ct-text2)" : "#f59e0b", whiteSpace: "nowrap" }}
              >
                {created.text}
              </span>
            </div>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", flexShrink: 0,
          justifyContent: "flex-end",
          ...(isMobile ? { flex: "1 0 100%", boxSizing: "border-box" as const, justifyContent: "flex-start", paddingLeft: "15px" } : {}),
        }}>
          <span style={{ fontSize: "10px", color: "var(--ct-text2)", whiteSpace: "nowrap" }}>{todoStatusLabel(item.status)}</span>
          {isFailed && (
            <button type="button" onClick={() => void todos.setStatus(item, "pending")} disabled={busy} title="이 실패 TODO를 대기로 되돌림" style={smallButton(isMobile, busy)}>재시도</button>
          )}
          {(item.status === "pending" || item.status === "in_progress") && (
            <button type="button" onClick={() => void todos.setStatus(item, "skipped")} disabled={busy} title="이 TODO를 제외 처리" style={smallButton(isMobile, busy)}>제외</button>
          )}
          {!editing && (
            <button type="button" data-testid="todo-edit-button" onClick={() => todos.startEdit(item)} disabled={busy} title="제목 수정" style={smallButton(isMobile, busy)}>수정</button>
          )}
          {(isDone || isFailed || item.status === "skipped") && (
            <button type="button" onClick={() => void todos.remove(item)} disabled={busy} title="이 TODO를 목록에서 제거" style={smallButton(isMobile, busy)}>숨김</button>
          )}
        </div>
      </div>
    </div>
  );
});

function TodoPanel({ todos, sessionId, screenSize }: { todos: SessionTodos; sessionId: string; screenSize: ScreenSize }) {
  const isMobile = screenSize === "mobile";
  const [collapsed, setCollapsed] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const beforeLoadRef = useRef<Set<string> | null>(null);

  const counts = useMemo(() => countTodos(todos.items), [todos.items]);
  const hiddenDone = counts.completed + counts.failed + counts.skipped;
  const visible = useMemo(() => selectVisibleTodos(todos.items, showAll), [todos.items, showAll]);
  const busy = !!todos.actionLoading;

  // Pagination includes completed/failed rows too. Reveal them and keep the
  // first new row in view, even when status sorting inserts it above the button.
  useLayoutEffect(() => {
    const previous = beforeLoadRef.current;
    if (!previous || todos.moreLoading) return;
    const added = visible.find((item) => !previous.has(item.id));
    if (added && scrollRef.current) {
      const scroller = scrollRef.current;
      const row = Array.from(scroller.querySelectorAll<HTMLElement>("[data-todo-id]"))
        .find((element) => element.dataset.todoId === added.id);
      if (row) scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      beforeLoadRef.current = null;
    } else if (todos.moreError || !todos.hasMore) {
      beforeLoadRef.current = null;
    }
  }, [visible, todos.moreLoading, todos.moreError, todos.hasMore]);

  const loadMore = () => {
    beforeLoadRef.current = new Set(todos.items.map((item) => item.id));
    setShowAll(true);
    void todos.loadMore();
  };

  const toggleExpand = (id: string) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const submitAdd = async () => {
    if (!addTitle.trim()) return;
    if (await todos.create(addTitle)) { setAdding(false); setAddTitle(""); }
  };
  const headerButton: React.CSSProperties = {
    minHeight: isMobile ? "34px" : "26px", padding: "0 8px", borderRadius: "6px",
    border: "1px solid var(--ct-border)", background: "var(--ct-hover)", color: "var(--ct-text2)",
    cursor: "pointer", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap",
  };
  const bulkButton = (label: string, title: string, statuses: ChatTodoItem["status"][], testId: string) => (
    <button key={testId} type="button" data-testid={testId} onClick={() => void todos.clearStatuses(statuses)} disabled={busy} title={title} style={{ ...headerButton, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>{label}</button>
  );

  return (
    <div
      data-testid="todo-panel"
      style={{
        marginBottom: "8px", padding: "8px 10px", borderRadius: "8px",
        background: "var(--ct-card)", border: "1px solid var(--ct-border)", color: "var(--ct-text)",
        display: "flex", flexDirection: "column", minHeight: 0,
        // 데스크톱은 머리글·맥락 막대·입력창을 뺀 나머지만 쓴다. 52dvh 고정이면 1440x900 에서 대화창이 32px 로 접혔다.
        maxHeight: collapsed ? undefined : isMobile ? "46dvh" : "min(52dvh, 560px, max(160px, calc(100dvh - 700px)))",
      }}
    >
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: collapsed ? 0 : "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>TODO</span>
          {!collapsed && (
            <button
              type="button"
              onClick={() => { setAdding(true); setAddTitle(""); todos.clearAddError(); }}
              disabled={busy}
              title="새 TODO 추가"
              style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", fontSize: isMobile ? "20px" : "14px", lineHeight: 1, minHeight: isMobile ? "34px" : undefined, minWidth: isMobile ? "34px" : undefined, padding: isMobile ? "4px 10px" : "0 2px", color: "var(--ct-accent)", opacity: busy ? 0.6 : 1 }}
            >+</button>
          )}
          <span data-testid="todo-counts" title="불러온 TODO 기준 집계" style={{ fontSize: "11px", color: "var(--ct-text2)", whiteSpace: "nowrap" }}>
            진행 {counts.active} · 완료 {counts.completed}{counts.failed ? ` · 실패 ${counts.failed}` : ""}{todos.hasMore ? " +" : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", flexWrap: "wrap" }}>
          {hiddenDone > 0 && !collapsed && (
            <button
              type="button"
              data-testid="todo-filter-toggle"
              aria-pressed={showAll}
              onClick={() => setShowAll((prev) => !prev)}
              title={showAll ? "진행/대기 TODO만 표시" : "완료/실패 TODO까지 표시"}
              style={{ ...headerButton, background: showAll ? "var(--ct-accent)" : "var(--ct-hover)", color: showAll ? "#fff" : "var(--ct-text2)" }}
            >
              {showAll ? "진행만" : `전체 ${todos.items.length}`}
            </button>
          )}
          {!collapsed && counts.failed > 0 && (
            <button type="button" onClick={() => void todos.retryFailed()} disabled={busy} title="실패 TODO를 대기로 되돌림" style={{ ...headerButton, background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              실패 재시도
            </button>
          )}
          <button
            type="button"
            onClick={() => void todos.refresh(sessionId, { force: true })}
            disabled={todos.loading}
            title="TODO 새로고침"
            style={{ ...headerButton, fontWeight: 600, cursor: todos.loading ? "default" : "pointer", opacity: todos.loading ? 0.6 : 1 }}
          >{todos.loading ? "…" : "↻"}</button>
          <button
            type="button"
            data-testid="todo-collapse-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
            title={collapsed ? "TODO 목록 펼치기" : "TODO 목록 접기"}
            style={{ ...headerButton, fontWeight: 600 }}
          >{collapsed ? "▾" : "▴"}</button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div
            ref={scrollRef}
            data-testid="todo-scroll"
            role="region"
            aria-label="TODO 목록"
            tabIndex={0}
            style={{
              flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden",
              overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: "pan-y",
              paddingRight: "2px",
            }}
          >
            <div data-testid="todo-summary" style={{ fontSize: "10px", color: "var(--ct-text2)", marginBottom: "4px", overflowWrap: "anywhere" }}>
              표시 {visible.length}건 · 불러온 {todos.items.length}건 · 보기 {showAll ? "전체" : "진행/대기만"}
              {!showAll && hiddenDone > 0 ? ` · 완료 ${counts.completed}·실패 ${counts.failed}·제외 ${counts.skipped}건은 '전체'에서 확인` : ""}
              {todos.hasMore ? ` · 서버가 ${TODO_PAGE_SIZE}건씩 응답 — 더 불러올 항목 있음` : ""}
            </div>
            {todos.error && (
              <div data-testid="todo-error" role="alert" style={{ fontSize: "12px", color: "#ef4444", marginBottom: "4px", overflowWrap: "anywhere" }}>{todos.error}</div>
            )}
            {showAll && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
                {counts.completed > 0 && bulkButton("완료 비우기", "완료 TODO를 목록에서 제거", ["completed"], "todo-clear-completed")}
                {counts.failed > 0 && bulkButton("실패 비우기", "실패 TODO를 목록에서 제거", ["failed"], "todo-clear-failed")}
                {counts.pending > 0 && bulkButton("대기 비우기", "대기 TODO를 목록에서 제거", ["pending"], "todo-clear-pending")}
              </div>
            )}
            {adding && (
              <div style={{ marginBottom: "6px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input
                    className="aads-focus-border"
                    data-testid="todo-add-input"
                    autoFocus
                    maxLength={300}
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitAdd();
                      if (e.key === "Escape") { setAdding(false); setAddTitle(""); }
                    }}
                    placeholder="작업 제목 입력..."
                    style={{ flex: 1, fontSize: isMobile ? "14px" : "11px", padding: isMobile ? "6px 8px" : "3px 6px", borderRadius: "4px", border: "1px solid var(--ct-border)", background: "var(--ct-input)", color: "var(--ct-text)", outline: "none", minWidth: 0 }}
                  />
                  <button
                    type="button"
                    data-testid="todo-add-submit"
                    onClick={() => void submitAdd()}
                    disabled={!addTitle.trim() || busy}
                    style={{ ...smallButton(isMobile, false), border: "none", background: addTitle.trim() ? "var(--ct-accent)" : "var(--ct-hover)", color: addTitle.trim() ? "#fff" : "var(--ct-text2)" }}
                  >{todos.addError ? "다시 추가" : "추가"}</button>
                  <button type="button" onClick={() => { setAdding(false); setAddTitle(""); }} style={{ ...smallButton(isMobile, false), border: "none" }}>취소</button>
                </div>
                {todos.addError && (
                  <div data-testid="todo-add-error" role="alert" style={{ marginTop: "4px", fontSize: "11px", color: "#ef4444", overflowWrap: "anywhere" }}>추가 실패 — 입력한 제목은 보존됩니다. {todos.addError}</div>
                )}
              </div>
            )}
            {visible.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--ct-text2)" }}>
                진행/대기 TODO 없음{hiddenDone > 0 ? " · 전체 보기로 완료 항목 확인 가능" : ""}
              </div>
            ) : visible.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                todos={todos}
                isMobile={isMobile}
                expanded={expandedIds.has(item.id)}
                onToggleExpand={toggleExpand}
              />
            ))}
            {(todos.hasMore || todos.moreError) && (
              <div style={{ padding: "6px 0" }}>
                <button
                  type="button"
                  data-testid="todo-load-more"
                  onClick={loadMore}
                  disabled={todos.moreLoading}
                  style={{ ...headerButton, width: isMobile ? "100%" : undefined, cursor: todos.moreLoading ? "default" : "pointer", opacity: todos.moreLoading ? 0.6 : 1 }}
                >
                  {todos.moreLoading ? "불러오는 중…" : todos.moreError ? "다시 시도 — 추가 TODO 불러오기" : `더 불러오기 (현재 ${todos.items.length}건)`}
                </button>
                {todos.moreError && <div data-testid="todo-more-error" role="alert" style={{ marginTop: "4px", fontSize: "11px", color: "#ef4444", overflowWrap: "anywhere" }}>{todos.moreError}</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(TodoPanel);
