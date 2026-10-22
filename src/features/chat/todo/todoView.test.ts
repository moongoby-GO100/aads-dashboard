import { describe, expect, it } from "vitest";
import type { ChatTodoItem } from "../../../app/chat/types";
import {
  TODO_DATE_UNKNOWN,
  countTodos,
  formatTodoCreatedAt,
  mergeTodoPages,
  parseTodoTimestamp,
  selectVisibleTodos,
} from "../../../app/chat/todoView";

function todo(id: string, status: ChatTodoItem["status"], sort = 0): ChatTodoItem {
  return {
    id, session_id: "s1", title: `제목 ${id}`, status, sort_order: sort, source: "user_turn",
    created_at: "2026-10-22T00:00:00+00:00", updated_at: "2026-10-22T00:00:00+00:00",
  };
}

describe("formatTodoCreatedAt", () => {
  it("renders the real created_at as KST", () => {
    expect(formatTodoCreatedAt("2026-10-21T15:05:00+00:00")).toEqual({ text: "2026-10-22 00:05 KST", known: true });
    expect(formatTodoCreatedAt("2026-10-22T01:30:45.123Z").text).toBe("2026-10-22 10:30 KST");
    expect(formatTodoCreatedAt("2026-10-22T10:30:00+09:00").text).toBe("2026-10-22 10:30 KST");
  });

  it("treats a zone-less timestamp as UTC instead of the browser's local zone", () => {
    expect(formatTodoCreatedAt("2026-10-22 01:30:00").text).toBe("2026-10-22 10:30 KST");
  });

  it("never invents a date for missing or invalid values", () => {
    for (const bad of [undefined, null, "", "   ", "not-a-date", "2026-10-22", "2026-13-45T00:00:00Z", "1970-01-01T00:00:00Z", 1761100000000, {}]) {
      expect(formatTodoCreatedAt(bad)).toEqual({ text: TODO_DATE_UNKNOWN, known: false });
    }
    expect(parseTodoTimestamp("2026-10-22T00:00:00Z")).not.toBeNull();
  });
});

describe("todo list selection", () => {
  it("keeps every row instead of cutting the list at 8", () => {
    const items = [
      ...Array.from({ length: 18 }, (_, i) => todo(`a${i}`, i % 2 ? "pending" : "in_progress", i)),
      ...Array.from({ length: 77 }, (_, i) => todo(`c${i}`, "completed", 100 + i)),
      ...Array.from({ length: 5 }, (_, i) => todo(`f${i}`, "failed", 200 + i)),
    ];
    expect(countTodos(items)).toMatchObject({ active: 18, completed: 77, failed: 5 });
    expect(selectVisibleTodos(items, false)).toHaveLength(18);
    const all = selectVisibleTodos(items, true);
    expect(all).toHaveLength(100);
    expect(all[0].status).toBe("in_progress");
    expect(all[all.length - 1].status).toBe("completed");
  });

  it("merges pages without duplicating rows an older server returns twice", () => {
    const first = [todo("1", "pending"), todo("2", "pending")];
    expect(mergeTodoPages([first, [todo("3", "pending")]])).toMatchObject({ lastPageAdded: 1 });
    const repeated = mergeTodoPages([first, first]);
    expect(repeated.items).toHaveLength(2);
    expect(repeated.lastPageAdded).toBe(0);
  });
});
