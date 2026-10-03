export const PANEL_SURFACE_QUERY_KEY = "surface";
export const PANEL_SURFACE_VALUE = "panel";
export const PANEL_SURFACE_STORAGE_KEY = "aads-chat-surface";
export const PANEL_BODY_FONT_PX = 13;
export const PANEL_SIDE_PADDING_PX = 8;

type SurfaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Chrome 사이드패널 iframe 전용 축소 모드 판정.
 * - `?surface=panel` 이면 켜고 sessionStorage(탭 단위)에 기억한다.
 * - 다른 `surface` 값(예: `full`)은 명시적 해제다.
 * - 쿼리가 없으면 기억된 값을 따른다(패널 내부 이동·새로고침 대응).
 * 저장소가 막힌 환경(제3자 iframe)에서는 쿼리만으로 판정한다.
 */
export function resolvePanelSurface(search: string, storage: SurfaceStorage | null): boolean {
  const requested = new URLSearchParams(search).get(PANEL_SURFACE_QUERY_KEY);
  if (requested !== null) {
    const isPanel = requested === PANEL_SURFACE_VALUE;
    try {
      if (isPanel) storage?.setItem(PANEL_SURFACE_STORAGE_KEY, PANEL_SURFACE_VALUE);
      else storage?.removeItem(PANEL_SURFACE_STORAGE_KEY);
    } catch {
      // 저장 실패는 판정에 영향 없음
    }
    return isPanel;
  }
  try {
    return storage?.getItem(PANEL_SURFACE_STORAGE_KEY) === PANEL_SURFACE_VALUE;
  } catch {
    return false;
  }
}

export function readPanelSurface(): boolean {
  if (typeof window === "undefined") return false;
  let storage: SurfaceStorage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return resolvePanelSurface(window.location.search, storage);
}
