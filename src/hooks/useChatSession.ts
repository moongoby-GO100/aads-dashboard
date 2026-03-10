"use client";
/**
 * AADS-172-B: useChatSession
 * 채팅 워크스페이스 + 세션 + 메시지 상태 관리 훅
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { chatApi, type ChatMessage, type ChatSession, type ChatWorkspace } from "@/services/chatApi";
import { getStreamSnapshot, getActiveStreamIds } from "@/services/streamManager";

export interface UseChatSessionReturn {
  workspaces: ChatWorkspace[];
  sessions: ChatSession[];
  messages: ChatMessage[];
  currentWorkspace: ChatWorkspace | null;
  currentSession: ChatSession | null;
  loading: boolean;
  error: string | null;

  selectWorkspace: (w: ChatWorkspace) => Promise<void>;
  selectSession: (s: ChatSession) => Promise<void>;
  createNewSession: (title?: string) => Promise<ChatSession | null>;
  appendMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string, meta?: Partial<ChatMessage>) => void;
  loadWorkspaces: () => Promise<void>;
  // AADS-190: StreamManager 연동
  getBackgroundStream: () => import("@/services/streamManager").StreamSnapshot | null;
  activeStreamSessionIds: () => string[];
}

export function useChatSession(): UseChatSessionReturn {
  const [workspaces, setWorkspaces] = useState<ChatWorkspace[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<ChatWorkspace | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ws = await chatApi.getWorkspaces();
      setWorkspaces(ws);
      // 첫 번째 워크스페이스 자동 선택
      if (ws.length > 0 && !currentWorkspace) {
        const first = ws[0];
        setCurrentWorkspace(first);
        const slist = await chatApi.getSessions(first.id);
        setSessions(slist);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadWorkspaces();
  }, [loadWorkspaces]);

  const selectWorkspace = useCallback(async (w: ChatWorkspace) => {
    setCurrentWorkspace(w);
    setCurrentSession(null);
    setMessages([]);
    setLoading(true);
    try {
      const slist = await chatApi.getSessions(w.id);
      setSessions(slist);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const selectSession = useCallback(async (s: ChatSession) => {
    setCurrentSession(s);
    setLoading(true);
    setMessages([]);
    try {
      const msgs = await chatApi.getMessages(s.id, 50, 0);
      setMessages(msgs); // API returns ORDER BY created_at ASC (oldest first = correct display order)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const createNewSession = useCallback(
    async (title?: string): Promise<ChatSession | null> => {
      if (!currentWorkspace) return null;
      try {
        const sess = await chatApi.createSession(currentWorkspace.id, title);
        setSessions((prev) => [sess, ...prev]);
        setCurrentSession(sess);
        setMessages([]);
        return sess;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [currentWorkspace]
  );

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback(
    (content: string, meta?: Partial<ChatMessage>) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return [
          ...prev.slice(0, -1),
          { ...last, content, ...meta },
        ];
      });
    },
    []
  );

  // AADS-190: 현재 세션의 백그라운드 스트림 상태 조회
  const getBackgroundStream = useCallback(() => {
    if (!currentSession) return null;
    return getStreamSnapshot(currentSession.id);
  }, [currentSession]);

  // AADS-190: 활성 스트리밍 세션 ID 목록
  const activeStreamSessionIds = useCallback(() => getActiveStreamIds(), []);

  return {
    workspaces,
    sessions,
    messages,
    currentWorkspace,
    currentSession,
    loading,
    error,
    selectWorkspace,
    selectSession,
    createNewSession,
    appendMessage,
    updateLastMessage,
    loadWorkspaces,
    getBackgroundStream,
    activeStreamSessionIds,
  };
}
