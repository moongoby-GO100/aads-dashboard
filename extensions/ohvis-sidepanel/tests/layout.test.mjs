import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "sidepanel.html"), "utf8");
const css = readFileSync(join(ROOT, "sidepanel.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

const pos = (needle) => {
  const i = html.indexOf(needle);
  assert.notEqual(i, -1, `missing in html: ${needle}`);
  return i;
};

test("마크업: 채팅 섹션이 승인·작업 details 보다 DOM 상 뒤에 있다", () => {
  const chat = pos('id="chat-panel"');
  assert.ok(pos('id="fold-approvals"') < chat);
  assert.ok(pos('id="fold-tasks"') < chat);
  assert.ok(pos('id="fold-approvals"') < pos('id="fold-tasks"'));
});

test("마크업: 승인·작업 details 는 기본 접힘(open 속성 없음)", () => {
  for (const id of ["fold-approvals", "fold-tasks"]) {
    const tag = html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `details#${id}`);
    assert.doesNotMatch(tag, /\sopen[\s>=]/);
  }
});

test("마크업: 기존 id 유지 + summary 건수 요소", () => {
  for (const id of ["approvals", "approvals-count", "tasks", "tasks-count", "chat-body", "btn-chat-toggle", "btn-chat-tab", "btn-refresh", "btn-login"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const id of ["approvals-summary-count", "tasks-summary-count"]) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("CSS: body 세로 flex 100vh, 채팅은 남은 높이 전체, iframe 은 100%/최소 320px", () => {
  assert.match(css, /body\s*\{[^}]*height:\s*100vh[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
  assert.match(css, /\.chat-panel\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/);
  assert.match(css, /#chat-body iframe\s*\{[^}]*height:\s*100%[^}]*min-height:\s*320px/);
  assert.doesNotMatch(css, /height:\s*480px/);
});

test("CSS: 펼친 details 본문은 max-height 40vh + overflow:auto, 채팅 숨김 시 남은 높이 사용", () => {
  assert.match(css, /\.fold-body\s*\{[^}]*max-height:\s*40vh[^}]*overflow:\s*auto/);
  assert.match(css, /main\.chat-hidden \.folds\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(css, /main\.chat-hidden \.fold-body\s*\{[^}]*max-height:\s*none/);
});

test("manifest: version 0.1.1", () => {
  assert.equal(manifest.version, "0.1.1");
});
