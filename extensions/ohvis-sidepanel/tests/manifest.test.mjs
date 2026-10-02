import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

test("manifest: MV3 필수 키", () => {
  assert.equal(manifest.manifest_version, 3);
  for (const key of ["name", "version", "description", "action", "side_panel", "background", "permissions", "host_permissions", "icons"]) {
    assert.ok(manifest[key], `missing key: ${key}`);
  }
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
});

test("manifest: 사이드패널·서비스워커 설정", () => {
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.equal(manifest.background.service_worker, "background.js");
});

test("manifest: 권한은 최소 범위(sidePanel/storage/cookies + aads.newtalk.kr)", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["cookies", "sidePanel", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://aads.newtalk.kr/*"]);
});

test("manifest: 참조 파일과 아이콘(16/48/128)이 실제로 존재", () => {
  const referenced = [
    manifest.side_panel.default_path,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const sizes of ["16", "48", "128"]) assert.ok(manifest.icons[sizes], `icon ${sizes}`);
  for (const file of referenced) assert.ok(existsSync(join(ROOT, file)), `missing file: ${file}`);
});

test("background: 액션 클릭 시 사이드패널 열기 설정", () => {
  const src = readFileSync(join(ROOT, "background.js"), "utf8");
  assert.match(src, /setPanelBehavior\(\{\s*openPanelOnActionClick:\s*true\s*\}\)/);
});

test("보안: 비밀번호 입력·console 출력·API_KEY 참조 없음", () => {
  for (const file of ["sidepanel.html", "sidepanel.js", "background.js", "lib/api.js", "lib/format.js"]) {
    const src = readFileSync(join(ROOT, file), "utf8");
    assert.doesNotMatch(src, /type\s*=\s*["']password["']/i, `${file}: password input`);
    assert.doesNotMatch(src, /console\./, `${file}: console output`);
    assert.doesNotMatch(src, /ANTHROPIC_/, `${file}: ANTHROPIC reference`);
  }
});
