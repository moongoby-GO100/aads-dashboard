import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_URL, EXT_AUTH_URL, PANEL_FRAME_URL } from "../lib/api.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "sidepanel.html"), "utf8");
const css = readFileSync(join(ROOT, "sidepanel.css"), "utf8");
const js = readFileSync(join(ROOT, "sidepanel.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

const tagOf = (id) => {
  const m = html.match(new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(m, `missing in html: #${id}`);
  return m[0];
};
const pos = (id) => html.indexOf(`id="${id}"`);
const topbar = html.match(/<header[^>]*id="topbar"[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "";

test("상단 줄: 점 + OHVIS + 승인/작업 칩 + ⋯ 메뉴가 header 한 줄 안에 있다", () => {
  assert.ok(topbar, "header#topbar");
  for (const id of ["status-dot", "chip-approvals", "chip-tasks", "btn-menu", "menu"]) {
    assert.match(topbar, new RegExp(`id="${id}"`), id);
  }
  assert.match(topbar, /<strong class="brand">OHVIS<\/strong>/);
  assert.match(topbar, /id="chip-approvals"[^>]*>승인 <span[^>]*id="approvals-summary-count"/);
  assert.match(topbar, /id="chip-tasks"[^>]*>작업 <span[^>]*id="tasks-summary-count"/);
  assert.match(css, /\.topbar\s*\{[^}]*height:\s*40px/);
});

test("상단 줄: ⋯ 메뉴 항목은 새로고침 / 새 탭에서 열기 / 승인·작업만 보기", () => {
  const menu = html.match(/<div[^>]*id="menu"[^>]*>([\s\S]*?)<\/div>/)[1];
  const labels = [...menu.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["새로고침", "새 탭에서 열기", "승인·작업만 보기"]);
  assert.match(tagOf("menu"), /\shidden[\s>]/);
});

test("상단 줄: 마지막 갱신 시각은 점 title 로, 별도 시간 요소·'OHVIS 채팅' 제목줄은 없다", () => {
  assert.doesNotMatch(html, /id="status-time"/);
  assert.doesNotMatch(html, /id="h-chat"/);
  assert.doesNotMatch(html, /OHVIS 채팅<\/h2>/);
  assert.doesNotMatch(html, /class="statusbar"/);
  assert.match(js, /\$\("status-dot"\)\.title\s*=/);
  assert.match(js, /마지막 갱신/);
});

test("시트: 기본 닫힘(hidden), 승인·작업 본문은 시트 안, 기존 id 유지", () => {
  assert.match(tagOf("sheet"), /\shidden[\s>]/);
  assert.match(tagOf("sheet-backdrop"), /\shidden[\s>]/);
  const sheetStart = pos("sheet");
  for (const id of ["approvals", "approvals-count", "tasks", "tasks-count", "sheet-approvals", "sheet-tasks"]) {
    assert.ok(pos(id) > sheetStart, `#${id} 는 시트 안`);
  }
  assert.ok(pos("chat-panel") < sheetStart);
  assert.doesNotMatch(html, /<details[^>]*class="fold/);
  assert.match(js, /sheetView:\s*null/);
  assert.match(js, /sheetOnly:\s*false/);
});

test("시트: 최대 높이 60vh, 아래 고정, 바깥 클릭·Esc 로 닫힘, 포커스 이동", () => {
  assert.match(css, /\.sheet\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0[^}]*max-height:\s*60vh/);
  assert.match(css, /\.sheet-body\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(js, /key !== "Escape"/);
  assert.match(js, /addEventListener\("pointerdown", onDocumentPointerdown\)/);
  assert.match(js, /\$\("sheet"\)\.focus\(\)/);
  assert.match(js, /sheetReturnFocus/);
  assert.match(tagOf("sheet"), /tabindex="-1"/);
});

test("시트: 승인 대기가 있을 때만 승인 칩이 주황(attention), 기존 승인/거부 동작 코드 유지", () => {
  assert.match(js, /\$\("chip-approvals"\)\.classList\.toggle\("attention", approvals > 0\)/);
  assert.doesNotMatch(js, /chip-tasks"\)\.classList\.toggle\("attention"/);
  assert.match(css, /\.chip\.attention\s*\{[^}]*var\(--warn\)/);
  for (const needle of ['decide(req.id, "approve")', 'decide(req.id, "reject")', "armRejection", "정말 거부", "toggleTask", "retryTask"]) {
    assert.ok(js.includes(needle), needle);
  }
});

test("채팅: iframe 은 상단 줄 아래 남은 높이 전부, 테두리·둥글기·카드 배경 없음", () => {
  assert.match(css, /body\s*\{[^}]*height:\s*100vh[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
  assert.match(css, /\.chat-panel\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/);
  const rule = css.match(/#chat-body iframe\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /height:\s*100%/);
  assert.match(rule, /border:\s*0/);
  assert.match(rule, /border-radius:\s*0/);
  assert.doesNotMatch(rule, /var\(--card\)/);
  assert.doesNotMatch(css, /height:\s*480px/);
});

test("안내 문구: 기본 숨김, iframe 실패·deliverAuth 실패 때만 '다시 연결' 과 함께 표시", () => {
  assert.match(tagOf("chat-notice"), /\shidden[\s>]/);
  assert.match(html, /id="chat-notice"[\s\S]*?id="btn-chat-reconnect"[^>]*>다시 연결</);
  assert.doesNotMatch(js, /채팅이 비어 있거나 로그인 화면이 보이면/);
  const fn = js.match(/function updateChatNotice\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fn, /state\.frameFailed/);
  assert.match(fn, /state\.authFailed/);
  assert.match(fn, /!state\.tokenSent/);
  assert.match(fn, /\$\("chat-notice"\)\.hidden\s*=\s*!failed/);
  assert.match(js, /addEventListener\("error"/);
  assert.match(js, /btn-chat-reconnect"\)\.addEventListener\("click", reconnectChat\)/);
});

test("토글 버튼 없음: btn-chat-toggle 삭제, 저장된 chatMode=tab 은 embed 로 복구", () => {
  assert.doesNotMatch(html, /btn-chat-toggle/);
  assert.doesNotMatch(html, /패널에서 숨기기/);
  assert.doesNotMatch(js, /btn-chat-toggle|패널에서 숨기기|setChatMode/);
  assert.match(js, /chatMode === "tab"[\s\S]*?set\(\{ chatMode: "embed" \}\)/);
  assert.match(html, /id="btn-sheet-only"[^>]*>승인·작업만 보기</);
});

test("iframe URL: 패널용은 surface=panel, 새 탭에서 열기는 surface 없는 /chat", () => {
  assert.match(js, /src:\s*PANEL_FRAME_URL/);
  const u = new URL(PANEL_FRAME_URL);
  assert.equal(u.origin + u.pathname, EXT_AUTH_URL);
  assert.equal(u.searchParams.get("surface"), "panel");
  assert.equal(CHAT_URL, "https://aads.newtalk.kr/chat");
  assert.equal(new URL(CHAT_URL).search, "");
  assert.match(js, /chrome\.tabs\.create\(\{ url: CHAT_URL \}\)/);
});

test("manifest: version 0.2.0", () => {
  assert.equal(manifest.version, "0.2.0");
});
