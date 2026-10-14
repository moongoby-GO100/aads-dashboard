import { describe, expect, it } from "vitest";
import {
  clampListWidth, defaultListWidth, folderOf, formatDateSize, formatFileSize, formatKstFull, formatKstShort,
  LIST_WIDTH_KEY, listSummaryText, readStoredListWidth, UNKNOWN_FILE_SIZE, writeStoredListWidth,
} from "./docFileView";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("formatFileSize (0B 처리)", () => {
  it("hides an unknown size instead of printing 0B", () => {
    expect(formatFileSize(UNKNOWN_FILE_SIZE)).toBeNull();
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(Number.NaN)).toBeNull();
  });
  it("still prints a real empty file as 0B", () => {
    expect(formatFileSize(0)).toBe("0B");
    expect(formatFileSize(512)).toBe("512B");
    expect(formatFileSize(2048)).toBe("2.0KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0MB");
  });
  it("drops unknown parts from the date · size text", () => {
    expect(formatDateSize(0, UNKNOWN_FILE_SIZE)).toBe("");
    expect(formatDateSize(at("2026-10-14T03:28:00Z"), UNKNOWN_FILE_SIZE)).toBe("10-14 12:28");
    expect(formatDateSize(0, 2048)).toBe("2.0KB");
    expect(formatDateSize(at("2026-10-14T03:28:00Z"), 2048)).toBe("10-14 12:28 · 2.0KB");
  });
});

describe("KST 표기", () => {
  it("formats in Asia/Seoul regardless of the browser zone", () => {
    expect(formatKstShort(at("2026-10-14T15:30:00Z"))).toBe("10-15 00:30");
    expect(formatKstFull(at("2026-10-14T03:28:51Z"))).toBe("2026-10-14 12:28 KST");
    expect(formatKstFull(0)).toBe("");
  });
});

describe("listSummaryText (목록 머리 한 줄)", () => {
  it("is '4,016건 · 12:28 갱신'", () => {
    expect(listSummaryText(4016, at("2026-10-14T03:28:51Z"))).toBe("4,016건 · 12:28 갱신");
  });
  it("falls back to the count when the scan time is unknown", () => {
    expect(listSummaryText(12)).toBe("12건");
    expect(listSummaryText(0, 0)).toBe("0건");
  });
});

describe("folderOf", () => {
  it("returns the parent folder, empty for root files", () => {
    expect(folderOf("docs/reports/a.md")).toBe("docs/reports");
    expect(folderOf("/docs/a.md")).toBe("docs");
    expect(folderOf("a.md")).toBe("");
  });
});

describe("목록 패널 폭", () => {
  it("clamps to 320px … 50% of the container", () => {
    expect(clampListWidth(100, 1200)).toBe(320);
    expect(clampListWidth(450, 1200)).toBe(450);
    expect(clampListWidth(900, 1200)).toBe(600);
    expect(clampListWidth(900, 500)).toBe(320);
  });
  it("defaults to 400px on wide screens (380~420) and 340px below 1280", () => {
    expect(defaultListWidth(1440)).toBe(400);
    expect(defaultListWidth(1280)).toBe(400);
    expect(defaultListWidth(1100)).toBe(340);
  });
  it("saves and restores the width", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readStoredListWidth(storage)).toBeNull();
    writeStoredListWidth(storage, 433.4);
    expect(store.get(LIST_WIDTH_KEY)).toBe("433");
    expect(readStoredListWidth(storage)).toBe(433);
  });
  it("ignores junk and tolerates a broken storage", () => {
    expect(readStoredListWidth({ getItem: () => "abc" })).toBeNull();
    expect(readStoredListWidth({ getItem: () => "100" })).toBeNull();
    expect(readStoredListWidth({ getItem: () => { throw new Error("denied"); } })).toBeNull();
    expect(() => writeStoredListWidth({ setItem: () => { throw new Error("full"); } }, 400)).not.toThrow();
    expect(readStoredListWidth(null)).toBeNull();
  });
});
