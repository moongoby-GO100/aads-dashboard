export const UNKNOWN_FILE_SIZE = -1;

export const LIST_WIDTH_KEY = "aads.docs.listWidth.v1";
export const MIN_LIST_WIDTH = 320;
export const MAX_LIST_WIDTH_RATIO = 0.5;
export const WIDE_VIEWPORT = 1280;
export const DEFAULT_LIST_WIDTH = 400;
export const DEFAULT_LIST_WIDTH_NARROW = 340;

// 크기를 모르면(직접 열기 등) null. 0B 로 보여주면 빈 파일처럼 읽힌다.
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const kstFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function kstParts(ts: number): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of kstFormatter.formatToParts(new Date(ts * 1000))) parts[part.type] = part.value;
  return parts;
}

// 목록 행용 'MM-DD HH:mm' (KST). 수정 시각을 모르면 빈 문자열.
export function formatKstShort(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  const p = kstParts(ts);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// 뷰어 머리용 '2026-10-14 12:28 KST'.
export function formatKstFull(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  const p = kstParts(ts);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
}

// 행·머리의 '날짜 · 크기' 문구. 모르는 값은 빼고, 둘 다 모르면 빈 문자열.
export function formatDateSize(modified: number | null | undefined, size: number | null | undefined): string {
  return [formatKstShort(modified), formatFileSize(size)].filter(Boolean).join(" · ");
}

// 목록 머리 한 줄: '4,016건 · 12:28 갱신'. 갱신 시각을 모르면 건수만.
export function listSummaryText(count: number, scannedAt?: number | null): string {
  const base = `${count.toLocaleString("en-US")}건`;
  if (!scannedAt || !Number.isFinite(scannedAt) || scannedAt <= 0) return base;
  const p = kstParts(scannedAt);
  return `${base} · ${p.hour}:${p.minute} 갱신`;
}

// 'docs/reports/a.md' → 'docs/reports', 루트 파일이면 빈 문자열.
export function folderOf(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const i = clean.lastIndexOf("/");
  return i < 0 ? "" : clean.slice(0, i);
}

export function clampListWidth(width: number, containerWidth: number): number {
  const max = Math.max(MIN_LIST_WIDTH, Math.floor(containerWidth * MAX_LIST_WIDTH_RATIO));
  return Math.min(Math.max(Math.round(width), MIN_LIST_WIDTH), max);
}

export function defaultListWidth(viewportWidth: number): number {
  return viewportWidth >= WIDE_VIEWPORT ? DEFAULT_LIST_WIDTH : DEFAULT_LIST_WIDTH_NARROW;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function readStoredListWidth(storage: StorageReader | null | undefined): number | null {
  try {
    const raw = storage?.getItem(LIST_WIDTH_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= MIN_LIST_WIDTH ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredListWidth(storage: StorageWriter | null | undefined, width: number): void {
  try {
    storage?.setItem(LIST_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 폭 기억만 못 하는 것이라 무시한다.
  }
}
