"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addCardId, asDraftId, draftIdFromSearch, parseStoredCardIds, stripDraftFromUrl,
} from "@/lib/automationDraft";

const STORAGE_KEY = "aads.automationDraftCards.v1";

function readStored(): string[] {
  try {
    return parseStoredCardIds(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStored(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 저장 공간을 못 쓰면 이 탭에서만 유지한다. 상태 원본은 서버다.
  }
}

// 채팅 화면에 붙은 자동화 카드 id 목록. 목록은 캐시일 뿐이고 카드 내용은 서버에서 매번 읽는다.
export function useAutomationDraftCards(onAdded?: () => void) {
  const [ids, setIds] = useState<string[]>([]);
  const readyRef = useRef(false);
  const onAddedRef = useRef(onAdded);
  useEffect(() => { onAddedRef.current = onAdded; }, [onAdded]);

  useEffect(() => {
    let alive = true;
    // 저장소는 브라우저에서만 읽을 수 있어 첫 렌더 뒤에 불러온다(서버 렌더와 어긋나지 않게).
    void Promise.resolve().then(() => {
      if (!alive) return;
      let next = readStored();
      const fromUrl = draftIdFromSearch(window.location.search);
      if (fromUrl) {
        next = addCardId(next, fromUrl);
        const clean = stripDraftFromUrl(window.location.pathname, window.location.search, window.location.hash);
        if (clean) window.history.replaceState(window.history.state, "", clean);
      }
      readyRef.current = true;
      setIds(next);
      if (fromUrl) onAddedRef.current?.();
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (readyRef.current) writeStored(ids);
  }, [ids]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setIds(parseStoredCardIds(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((value: string) => {
    const id = asDraftId(value);
    if (!id) return;
    setIds((prev) => addCardId(prev, id));
    onAddedRef.current?.();
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const replace = useCallback((oldId: string, newId: string) => {
    const next = asDraftId(newId);
    if (!next) return;
    setIds((prev) => addCardId(prev.filter((x) => x !== oldId), next));
    onAddedRef.current?.();
  }, []);

  return { ids, add, remove, replace };
}
