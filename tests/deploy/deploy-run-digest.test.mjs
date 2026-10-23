import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const deploySh = fs.readFileSync(path.join(root, "deploy.sh"), "utf8");
const IMG = `sha256:${"a".repeat(64)}`;
const STB = `sha256:${"b".repeat(64)}`;
const SRC = "/srv/release-worktree";

function extractFunction(name) {
  const lines = deploySh.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${name}() {`));
  assert.ok(start >= 0, `function ${name} not found in deploy.sh`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}

// deploy.sh 는 실행 시 배포를 수행하므로 헬퍼 함수만 잘라 stub 환경에서 돌린다.
function git(cwd, ...args) {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" });
}

// COMPOSE_DIR 용 git 픽스처: origin(bare) + 호스트 checkout(로컬 사본은 origin 과 다른 내용).
function makeComposeFixture(dir, { remote = "ok" }) {
  const rel = "scripts/record-release-provenance.sh";
  const body = (m) => `#!/bin/bash\nprintf '%s\\n' "$@" > "$T_ARGS"\nprintf '${m} %s\\n' "$0" > "$T_ARGS.marker"\n`;
  const origin = path.join(dir, "origin.git");
  const seed = path.join(dir, "seed");
  const compose = path.join(dir, "compose");
  fs.mkdirSync(seed, { recursive: true });
  git(seed, "init", "-q", "-b", "main");
  fs.mkdirSync(path.join(seed, "scripts"));
  fs.writeFileSync(path.join(seed, "README"), "x\n");
  if (remote !== "no-file") fs.writeFileSync(path.join(seed, rel), body("ORIGIN"), { mode: 0o755 });
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "seed");
  git(dir, "clone", "-q", "--bare", seed, origin);
  git(dir, "clone", "-q", origin, compose);
  fs.mkdirSync(path.join(compose, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(compose, rel), body("LOCAL"), { mode: 0o755 });
  if (remote === "fetch-fails") git(compose, "remote", "set-url", "origin", path.join(dir, "missing.git"));
  return compose;
}

function readonlyLine(name) {
  const line = deploySh.split("\n").find((l) => l.startsWith(`readonly ${name}=`));
  assert.ok(line, `readonly ${name} not found in deploy.sh`);
  return line;
}

function runEnd({ result = "success", image = IMG, standby = IMG, monitorSeconds = 300, provenanceBody = "exit 0", dbFails = false, remote = null, override = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-digest-"));
  const sqlFile = path.join(dir, "sql.log");
  const argsFile = path.join(dir, "prov.args");
  const prov = path.join(dir, "prov.sh");
  fs.writeFileSync(prov, `#!/bin/bash\nprintf '%s\\n' "$@" > '${argsFile}'\n${provenanceBody}\n`, { mode: 0o755 });
  const script = `
set -euo pipefail
DEPLOY_LOG_FILE='${dir}/deploy.log'; : > "$DEPLOY_LOG_FILE"
STATE_DIR=/root/aads/aads-dashboard
SOURCE_DIR='${SRC}'
${readonlyLine("MONITOR_MIN_SECONDS")}
DEPLOY_MONITOR_ELAPSED_SECONDS='${monitorSeconds}'
AADS_RELEASE_SHA=abcdef123456
${override ? `AADS_PROVENANCE_SCRIPT='${prov}'` : ""}
${remote ? `COMPOSE_DIR='${makeComposeFixture(dir, { remote })}'` : ""}
log() { echo "$1" >> "$DEPLOY_LOG_FILE"; }
_db_exec() { printf '%s\\n' "$1" >> '${sqlFile}'; ${dbFails ? "return 1" : "return 0"}; }
${extractFunction("_normalize_image_digest")}
${extractFunction("record_dashboard_provenance")}
${extractFunction("record_deploy_end")}
DEPLOY_RUN_ID=77
DEPLOY_PHASE=verify
DEPLOY_RESULT='${result}'
DEPLOY_IMAGE_DIGEST="$T_IMAGE"
DEPLOY_STANDBY_DIGEST="$T_STANDBY"
record_deploy_end
echo END_OK
`;
  const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, T_IMAGE: image, T_STANDBY: standby, T_ARGS: argsFile } });
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
  const out = { status: r.status, stdout: r.stdout, stderr: r.stderr, sql: read(sqlFile), args: read(argsFile), marker: read(`${argsFile}.marker`), log: read(path.join(dir, "deploy.log")) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

test("deploy.sh passes bash syntax check", () => {
  execFileSync("bash", ["-n", path.join(root, "deploy.sh")]);
});

test("success UPDATE writes full sha256 image_digest and standby_digest", () => {
  const r = runEnd({});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.sql, /status='success'/);
  assert.ok(r.sql.includes(`image_digest='${IMG}'`), r.sql);
  assert.ok(r.sql.includes(`standby_digest='${IMG}'`), r.sql);
});

test("failure UPDATE does not touch digests and skips provenance", () => {
  const r = runEnd({ result: "failed" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.sql, /status='failed'/);
  assert.doesNotMatch(r.sql, /image_digest/);
  assert.equal(r.args, "");
});

// fail closed: 성공으로 끝났어도 인증 게이트를 통과하지 못하면 success 원장과 계보를 쓰지 않는다.
for (const [name, opts, logRe] of [
  ["empty active digest", { image: "" }, /image digest 확인 실패/],
  ["empty standby digest", { standby: "" }, /image digest 확인 실패/],
  ["malformed digest", { image: "not-a-digest'; DROP TABLE x;--" }, /image digest 확인 실패/],
  ["active/standby mismatch", { standby: STB }, /image digest 불일치/],
  ["monitoring below 300s", { monitorSeconds: 299 }, /감시 299초 < 300초/],
  ["monitoring never ran", { monitorSeconds: 0 }, /감시 0초 < 300초/],
]) {
  test(`success is blocked when ${name}`, () => {
    const r = runEnd(opts);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.sql, /status='success'/);
    assert.match(r.sql, /status='failed'/);
    assert.match(r.sql, /release certification gate/);
    assert.doesNotMatch(r.sql, /image_digest=/);
    assert.equal((r.sql.match(/'/g) || []).length % 2, 0, `unbalanced quotes — SQL injection risk: ${r.sql}`);
    assert.equal(r.args, "", "provenance must not run");
    assert.match(r.log, logRe);
  });
}

test("provenance is called with dashboard repo/component after success", () => {
  const r = runEnd({});
  const args = r.args.trim().split("\n");
  const val = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(val("--repo"), SRC);
  assert.equal(val("--deploy-run-id"), "77");
  assert.equal(val("--project"), "AADS");
  assert.equal(val("--component"), "dashboard");
  assert.equal(val("--release-ref"), "abcdef123456");
});

test("provenance failure keeps the deploy successful", () => {
  const r = runEnd({ provenanceBody: "exit 5" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /END_OK/);
  assert.match(r.log, /릴리스 계보 기록 실패 \(배포는 성공 유지\)/);
});

test("provenance is skipped when the success UPDATE itself failed", () => {
  const r = runEnd({ dbFails: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.args, "");
});

test("without override, provenance runs the origin/main copy and removes the temp file", () => {
  const r = runEnd({ override: false, remote: "ok" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.marker, /^ORIGIN /);
  const tmp = r.marker.trim().split(" ")[1];
  assert.notEqual(tmp, undefined);
  assert.ok(!fs.existsSync(tmp), `temp script left behind: ${tmp}`);
  assert.doesNotMatch(r.log, /WARN: origin\/main/);
  const args = r.args.trim().split("\n");
  assert.equal(args[args.indexOf("--repo") + 1], SRC);
  assert.match(r.log, /릴리스 계보 기록 완료/);
});

for (const remote of ["no-file", "fetch-fails"]) {
  test(`origin/main script unavailable (${remote}) falls back to local copy with WARN`, () => {
    const r = runEnd({ override: false, remote });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /END_OK/);
    assert.match(r.marker, /^LOCAL /);
    assert.match(r.log, /\[provenance\] WARN: origin\/main 스크립트 사용 불가 — 로컬 사본 사용/);
    assert.match(r.log, /릴리스 계보 기록 완료/);
    assert.match(r.sql, /status='success'/);
  });
}

test("AADS_PROVENANCE_SCRIPT takes priority over origin/main", () => {
  const r = runEnd({ override: true, remote: "ok" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.marker, "");
  assert.equal(r.args.trim().split("\n")[0], "--repo");
  assert.doesNotMatch(r.log, /WARN: origin\/main/);
});
