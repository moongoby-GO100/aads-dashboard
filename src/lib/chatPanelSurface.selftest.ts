import {
  PANEL_SURFACE_STORAGE_KEY,
  resolvePanelSurface,
} from "./chatPanelSurface";

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

const throwing = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

// 일반 /chat — 변화 없음
const plain = memoryStorage();
assertEqual(resolvePanelSurface("", plain), false, "no query, empty storage");
assertEqual(plain.data.size, 0, "no query leaves storage untouched");
assertEqual(resolvePanelSurface("?foo=1", plain), false, "unrelated query");

// surface=panel 켜기 + 기억
const s1 = memoryStorage();
assertEqual(resolvePanelSurface("?surface=panel", s1), true, "query panel");
assertEqual(s1.getItem(PANEL_SURFACE_STORAGE_KEY), "panel", "query remembered");
assertEqual(resolvePanelSurface("?surface=panel&x=1", memoryStorage()), true, "panel with other params");

// 쿼리 없이 재진입 — 기억된 값 유지
assertEqual(resolvePanelSurface("", s1), true, "remembered without query");
assertEqual(resolvePanelSurface("?session=abc", s1), true, "remembered with other query");

// 명시적 해제
assertEqual(resolvePanelSurface("?surface=full", s1), false, "explicit non-panel");
assertEqual(s1.getItem(PANEL_SURFACE_STORAGE_KEY), null, "explicit non-panel clears memory");
assertEqual(resolvePanelSurface("", s1), false, "cleared stays off");
assertEqual(resolvePanelSurface("?surface=", memoryStorage({ [PANEL_SURFACE_STORAGE_KEY]: "panel" })), false, "empty surface clears");

// 잘못된 저장값
assertEqual(resolvePanelSurface("", memoryStorage({ [PANEL_SURFACE_STORAGE_KEY]: "other" })), false, "garbage storage value");

// 저장소 없음/차단
assertEqual(resolvePanelSurface("?surface=panel", null), true, "no storage, query");
assertEqual(resolvePanelSurface("", null), false, "no storage, no query");
assertEqual(resolvePanelSurface("?surface=panel", throwing), true, "blocked storage, query");
assertEqual(resolvePanelSurface("", throwing), false, "blocked storage, no query");

console.log("PASS: 16 chat panel surface cases");
