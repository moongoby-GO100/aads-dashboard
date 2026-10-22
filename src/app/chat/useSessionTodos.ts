import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { chatApi, chatApiThrottled } from "./api";
import type { ChatTodoItem } from "./types";
import { TODO_PAGE_SIZE, mergeTodoPages } from "./todoView";

type TodoStatus = ChatTodoItem["status"];
export interface TodoEditError { id: string; message: string }

function todoListPath(sessionId: string, offset: number): string {
  const base = `/chat/sessions/${sessionId}/todos?include_completed=true&cleanup_stale=true&limit=${TODO_PAGE_SIZE}`;
  return offset > 0 ? `${base}&offset=${offset}` : base;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useSessionTodos(activeSessionRef: MutableRefObject<string | null>) {
  const [items, setItems] = useState<ChatTodoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitleState] = useState("");
  const [editError, setEditError] = useState<TodoEditError | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const itemsRef = useRef<ChatTodoItem[]>([]);
  const pagesRef = useRef(1);
  const loadedSessionRef = useRef<string | null>(null);
  const actionLockRef = useRef(false);
  const editTitleRef = useRef("");

  const commitItems = useCallback((next: ChatTodoItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearEdit = useCallback(() => {
    editTitleRef.current = "";
    setEditingId(null);
    setEditTitleState("");
    setEditError(null);
  }, []);

  const reset = useCallback(() => {
    pagesRef.current = 1;
    loadedSessionRef.current = null;
    commitItems([]);
    setError(null);
    setLoading(false);
    setHasMore(false);
    setMoreError(null);
    setAddError(null);
    clearEdit();
  }, [clearEdit, commitItems]);

  const refresh = useCallback(async (sessionId?: string | null, opts?: { force?: boolean }) => {
    const sid = sessionId || activeSessionRef.current;
    if (!sid) {
      reset();
      return;
    }
    if (loadedSessionRef.current !== sid) {
      if (loadedSessionRef.current !== null) {
        pagesRef.current = 1;
        commitItems([]);
        setHasMore(false);
        clearEdit();
      }
      loadedSessionRef.current = sid;
    }
    setLoading(true);
    try {
      const firstPath = todoListPath(sid, 0);
      const first = opts?.force
        ? await chatApi<ChatTodoItem[]>(firstPath)
        : await chatApiThrottled<ChatTodoItem[]>(firstPath, 2000);
      if (first === null) return;
      const pages = [first];
      for (let page = 1; page < pagesRef.current && pages[pages.length - 1].length >= TODO_PAGE_SIZE; page += 1) {
        pages.push(await chatApi<ChatTodoItem[]>(todoListPath(sid, page * TODO_PAGE_SIZE)));
      }
      if (activeSessionRef.current !== sid) return;
      const merged = mergeTodoPages(pages);
      const last = pages[pages.length - 1];
      commitItems(merged.items);
      setHasMore(last.length >= TODO_PAGE_SIZE && (pages.length === 1 || merged.lastPageAdded > 0));
      setError(null);
    } catch (err) {
      if (activeSessionRef.current === sid) setError(errorText(err, "TODO 조회 실패"));
    } finally {
      if (activeSessionRef.current === sid) setLoading(false);
    }
  }, [activeSessionRef, clearEdit, commitItems, reset]);

  const loadMore = useCallback(async () => {
    const sid = activeSessionRef.current;
    if (!sid || moreLoading) return;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const next = await chatApi<ChatTodoItem[]>(todoListPath(sid, pagesRef.current * TODO_PAGE_SIZE));
      if (activeSessionRef.current !== sid) return;
      const merged = mergeTodoPages([itemsRef.current, next]);
      pagesRef.current += 1;
      commitItems(merged.items);
      setHasMore(next.length >= TODO_PAGE_SIZE && merged.lastPageAdded > 0);
    } catch (err) {
      if (activeSessionRef.current === sid) setMoreError(errorText(err, "추가 TODO 조회 실패"));
    } finally {
      setMoreLoading(false);
    }
  }, [activeSessionRef, commitItems, moreLoading]);

  const runAction = useCallback(async (actionKey: string, path: string, init: RequestInit) => {
    const sid = activeSessionRef.current;
    if (!sid || actionLockRef.current) return;
    actionLockRef.current = true;
    setActionLoading(actionKey);
    setError(null);
    try {
      await chatApi(path, init);
      await refresh(sid, { force: true });
    } catch (err) {
      if (activeSessionRef.current === sid) setError(errorText(err, "TODO 작업 실패"));
    } finally {
      actionLockRef.current = false;
      if (activeSessionRef.current === sid) setActionLoading(null);
    }
  }, [activeSessionRef, refresh]);

  const setStatus = useCallback((item: ChatTodoItem, status: TodoStatus) => {
    const sid = activeSessionRef.current;
    if (!sid) return Promise.resolve();
    return runAction(`update:${item.id}:${status}`, `/chat/sessions/${sid}/todos/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, metadata: { updated_from_chat_ui: true } }),
    });
  }, [activeSessionRef, runAction]);

  const remove = useCallback((item: ChatTodoItem) => {
    const sid = activeSessionRef.current;
    if (!sid) return Promise.resolve();
    return runAction(`delete:${item.id}`, `/chat/sessions/${sid}/todos/${item.id}`, { method: "DELETE" });
  }, [activeSessionRef, runAction]);

  const clearStatuses = useCallback((statuses: TodoStatus[]) => {
    const sid = activeSessionRef.current;
    if (!sid) return Promise.resolve();
    return runAction(`clear:${statuses.join(",")}`, `/chat/sessions/${sid}/todos/clear`, {
      method: "POST",
      body: JSON.stringify({ statuses }),
    });
  }, [activeSessionRef, runAction]);

  const retryFailed = useCallback(() => {
    const sid = activeSessionRef.current;
    if (!sid) return Promise.resolve();
    return runAction("retry-failed", `/chat/sessions/${sid}/todos/retry-failed`, { method: "POST" });
  }, [activeSessionRef, runAction]);

  const create = useCallback(async (title: string): Promise<boolean> => {
    const sid = activeSessionRef.current;
    const text = title.trim();
    if (!sid || !text || actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionLoading("create");
    setAddError(null);
    try {
      await chatApi(`/chat/sessions/${sid}/todos`, {
        method: "POST",
        body: JSON.stringify({ title: text }),
      });
    } catch (err) {
      if (activeSessionRef.current === sid) setAddError(errorText(err, "TODO 추가 실패"));
      actionLockRef.current = false;
      setActionLoading(null);
      return false;
    }
    await refresh(sid, { force: true });
    actionLockRef.current = false;
    setActionLoading(null);
    return true;
  }, [activeSessionRef, refresh]);

  const startEdit = useCallback((item: ChatTodoItem) => {
    editTitleRef.current = item.title;
    setEditingId(item.id);
    setEditTitleState(item.title);
    setEditError(null);
  }, []);

  const setEditTitle = useCallback((value: string) => {
    editTitleRef.current = value;
    setEditTitleState(value);
  }, []);

  const saveEdit = useCallback(async (item: ChatTodoItem) => {
    const sid = activeSessionRef.current;
    const draft = editTitleRef.current.trim();
    if (!sid) return;
    if (!draft || draft === item.title) {
      clearEdit();
      return;
    }
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionLoading(`edit-${item.id}`);
    setEditError(null);
    try {
      const saved = await chatApi<ChatTodoItem>(`/chat/sessions/${sid}/todos/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: draft }),
      });
      if (activeSessionRef.current !== sid) return;
      const savedTitle = typeof saved?.title === "string" && saved.title ? saved.title : draft;
      commitItems(itemsRef.current.map((row) => (row.id === item.id ? { ...row, title: savedTitle } : row)));
      clearEdit();
    } catch (err) {
      if (activeSessionRef.current === sid) {
        setEditError({ id: item.id, message: errorText(err, "제목 저장 실패") });
      }
      return;
    } finally {
      actionLockRef.current = false;
      setActionLoading(null);
    }
    void refresh(sid, { force: true });
  }, [activeSessionRef, clearEdit, commitItems, refresh]);

  const clearAddError = useCallback(() => setAddError(null), []);

  return useMemo(() => ({
    items, loading, error, hasMore, moreLoading, moreError, actionLoading,
    editingId, editTitle, editError, addError,
    refresh, loadMore, reset, setStatus, remove, clearStatuses, retryFailed, create,
    startEdit, setEditTitle, saveEdit, cancelEdit: clearEdit, clearAddError,
  }), [
    items, loading, error, hasMore, moreLoading, moreError, actionLoading,
    editingId, editTitle, editError, addError,
    refresh, loadMore, reset, setStatus, remove, clearStatuses, retryFailed, create,
    startEdit, setEditTitle, saveEdit, clearEdit, clearAddError,
  ]);
}

export type SessionTodos = ReturnType<typeof useSessionTodos>;
