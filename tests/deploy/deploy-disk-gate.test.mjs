import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 2026-11-04: 루트 디스크 98%(여유 5.5GB)에서도 대시보드 빌드가 확인 없이 시작될 수 있었다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const deploySh = fs.readFileSync(path.join(root, "deploy.sh"), "utf8");

function buildFn() {
  const lines = deploySh.split("\n");
  const start = lines.findIndex((l) => l.startsWith("build_release_image() {"));
  assert.ok(start >= 0, "build_release_image not found");
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}

function run(availKb, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-disk-gate-"));
  fs.writeFileSync(path.join(dir, "df"), `#!/bin/bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/sda1 200000000 1 ${availKb} 90% /"\n`, { mode: 0o755 });
  // 게이트를 통과하면 바로 다음 단계(cleanup_release_context)에서 멈추게 한다.
  const script = `
NGINX_LOCK_HELD=false
log() { echo "$1"; }
cleanup_release_context() { echo REACHED_BUILD; exit 0; }
${buildFn()}
build_release_image
`;
  const r = spawnSync("bash", ["-c", script], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AADS_DASHBOARD_DEPLOY_DISK_CHECK_PATH: "/", ...extraEnv },
    encoding: "utf8",
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

test("디스크 여유가 기본 10GB 미만이면 빌드하지 않는다", () => {
  const r = run(5 * 1024 * 1024);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /디스크 여유 부족/);
  assert.doesNotMatch(r.stdout, /REACHED_BUILD/);
});

test("디스크 여유가 충분하면 빌드 단계로 넘어간다", () => {
  const r = run(30 * 1024 * 1024);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK: 디스크 여유 30GB/);
  assert.match(r.stdout, /REACHED_BUILD/);
});

test("최소 여유는 환경변수로 조정할 수 있고 잘못된 값은 10GB 로 닫힌다", () => {
  assert.equal(run(12 * 1024 * 1024, { AADS_DASHBOARD_DEPLOY_MIN_FREE_GB: "15" }).status, 1);
  assert.equal(run(9 * 1024 * 1024, { AADS_DASHBOARD_DEPLOY_MIN_FREE_GB: "abc" }).status, 1);
});
