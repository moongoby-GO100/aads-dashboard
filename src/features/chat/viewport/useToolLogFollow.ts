"use client";

import { useCallback, useEffect, useRef } from "react";

/** Own only the nested tool log viewport; never scroll the surrounding chat. */
export function useToolLogFollow(identity: string, revision: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);

  useEffect(() => { following.current = true; }, [identity]);
  useEffect(() => {
    const element = ref.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [identity, revision]);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (element) {
      following.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
    }
  }, []);

  return { ref, onScroll };
}
