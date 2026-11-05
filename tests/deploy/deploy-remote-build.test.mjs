import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 42 원격 빌드 경로(AADS-IMAGE-BUILD-42-B). 실제 42·docker 에 접속하지 않고 PATH 스텁으로 대체한다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const deploySh = fs.readFileSync(path.join(root, "deploy.sh"), "utf8");
const DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER = `sha256:${"b".repeat(64)}`;

function fn(name) {
  const lines = deploySh.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${name}() {`));
  assert.ok(start >= 0, `${name} not found`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}

function varsBlock() {
  return deploySh.split("\n").filter((l) =>
    /^(REMOTE_BUILD_FLAG_FILE|REMOTE_REGISTRY|REMOTE_DOCKER_HOST|BUILD_PATH|REMOTE_DIGEST|FALLBACK_REASON|REMOTE_FAIL_REASON)=/.test(l)).join("\n");
}

// fail: 실패시킬 단계 (registry|remote_docker|build|push|pull|digest)
function run({ env = {}, flagFile = null, fail = "" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-remote-build-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const events = path.join(dir, "events");
  fs.writeFileSync(events, "");
  const w = (n, b) => fs.writeFileSync(path.join(bin, n), `#!/bin/bash\n${b}\n`, { mode: 0o755 });
  w("df", `echo "Filesystem 1024-blocks Used Available Capacity Mounted"; echo "/dev/sda1 200000000 1 31457280 10% /"`);
  w("git", `[ "$3" = "archive" ] || [ "$1" = "-C" -a "$3" = "rev-parse" ] && true; if [ "$3" = archive ]; then tar -cf - -T /dev/null; fi; exit 0`);
  w("ps", `cat "${dir}/ps" 2>/dev/null; exit 0`);
  w("curl", `echo "curl $*" >> ${events}; [ "${fail}" = registry ] && exit 22; exit 0`);
  w("timeout", `shift; exec "$@"`);
  w("docker", `
echo "docker $*" >> ${events}
if [ "$1" = "-H" ]; then
  shift 2
  case "$1" in
    version) [ "${fail}" = remote_docker ] && exit 1; exit 0;;
    build) [ "${fail}" = build ] && exit 1; exit 0;;
    push) [ "${fail}" = push ] && exit 1; echo "latest: digest: ${DIGEST} size: 1234"; exit 0;;
  esac
fi
case "$1" in
  pull) [ "${fail}" = pull ] && exit 1; exit 0;;
  image) if [ "${fail}" = digest ]; then echo "localhost:5000/aads-dashboard@${OTHER}"; else echo "localhost:5000/aads-dashboard@${DIGEST}"; fi; exit 0;;
  build|tag|rmi) exit 0;;
esac
exit 0`);
  const flag = path.join(dir, "flag");
  if (flagFile !== null) fs.writeFileSync(flag, flagFile);
  const script = `
NGINX_LOCK_HELD=false
STATE_DIR=/x
AADS_RELEASE_SHA=abc123
RELEASE_FULL_SHA=abc123full
RELEASE_LABEL_KEY=aads.release_sha
DEPLOY_RUN_ID=7
log() { echo "$1"; }
_db_exec() { echo "DB: $1" >> ${events}; if printf '%s' "$1" | grep -q information_schema; then echo jsonb; fi; return 0; }
cleanup_release_context() { :; }
${varsBlock()}
${fn("remote_build_mode")}
${fn("build_release_image_remote42")}
${fn("record_build_info")}
${fn("build_release_image")}
build_release_image
echo "rc=$?"
`;
  const r = spawnSync("bash", ["-c", script], {
    env: {
      PATH: `${bin}:${process.env.PATH}`, HOME: dir,
      AADS_DASHBOARD_DEPLOY_DISK_CHECK_PATH: "/",
      AADS_REMOTE_BUILD_FLAG_FILE: flag, ...env,
    },
    encoding: "utf8",
  });
  const ev = fs.readFileSync(events, "utf8").split("\n").filter(Boolean);
  fs.rmSync(dir, { recursive: true, force: true });
  return { r, ev };
}

const count = (ev, re) => ev.filter((l) => re.test(l)).length;
const localBuilds = (ev) => count(ev, /^docker build /);
const remoteBuilds = (ev) => count(ev, /^docker -H ssh:\/\/mesh-42 build /);
const dbRecord = (ev) => ev.filter((l) => l.startsWith("DB: UPDATE") && l.includes("build_path")).join("\n");

test("스위치 off: 원격 명령 0회, 로컬 build 1회", () => {
  const { r, ev } = run();
  assert.match(r.stdout, /rc=0/);
  assert.equal(localBuilds(ev), 1);
  assert.equal(count(ev, /mesh-42|curl|docker pull|docker tag/), 0);
  assert.match(dbRecord(ev), /'build_path','local'/);
});

test("환경변수 42 + 전 단계 성공: 원격 build·push, pull@digest, tag 1회씩", () => {
  const { r, ev } = run({ env: { AADS_REMOTE_BUILD: "42" } });
  assert.match(r.stdout, /rc=0/);
  assert.equal(localBuilds(ev), 0);
  assert.equal(remoteBuilds(ev), 1);
  assert.equal(count(ev, /^docker -H ssh:\/\/mesh-42 push localhost:5000\/aads-dashboard:abc123$/), 1);
  assert.equal(count(ev, new RegExp(`^docker pull localhost:5000/aads-dashboard@${DIGEST}$`)), 1);
  assert.equal(count(ev, new RegExp(`^docker tag localhost:5000/aads-dashboard@${DIGEST} aads-dashboard:abc123$`)), 1);
  assert.equal(count(ev, new RegExp(`^docker rmi localhost:5000/aads-dashboard@${DIGEST}$`)), 1);
  assert.match(dbRecord(ev), /'build_path','remote42'/);
  assert.ok(dbRecord(ev).includes(DIGEST));
});

test("파일로 42 켜기 (환경변수 비어 있음)", () => {
  const { ev } = run({ flagFile: "42\n", env: { AADS_REMOTE_BUILD: "" } });
  assert.equal(remoteBuilds(ev), 1);
  assert.equal(localBuilds(ev), 0);
});

test("파일 값이 42 가 아니면 off", () => {
  const { ev } = run({ flagFile: "on\n" });
  assert.equal(remoteBuilds(ev), 0);
  assert.equal(localBuilds(ev), 1);
});

for (const [stage, reason] of [
  ["registry", "registry_check"],
  ["remote_docker", "remote_docker_check"],
  ["build", "remote_build"],
  ["push", "push"],
  ["pull", "pull"],
]) {
  test(`폴백: ${stage} 실패 → 로컬 build 정확히 1회`, () => {
    const { r, ev } = run({ env: { AADS_REMOTE_BUILD: "42" }, fail: stage });
    assert.match(r.stdout, /rc=0/);
    assert.equal(localBuilds(ev), 1);
    assert.equal(count(ev, /^docker tag /), 0);
    assert.match(dbRecord(ev), /'build_path','local_fallback'/);
    assert.ok(dbRecord(ev).includes(`'fallback_reason','${reason}:`), dbRecord(ev));
  });
}

test("digest 불일치: aads-dashboard:<sha> 태그 없이 폴백", () => {
  const { ev } = run({ env: { AADS_REMOTE_BUILD: "42" }, fail: "digest" });
  assert.equal(count(ev, /^docker tag /), 0);
  assert.equal(localBuilds(ev), 1);
  assert.match(dbRecord(ev), /digest_verify/);
});

test("동시 빌드 검사는 로컬·원격 빌드 프로세스 형태를 모두 잡는다", () => {
  for (const args of [
    "docker build --tag aads-dashboard:zzz --label a=b /tmp/x",
    "docker -H ssh://mesh-42 build --tag localhost:5000/aads-dashboard:zzz --label a=b /tmp/x",
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dash-busy-"));
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    const [first] = [`  100 docker          ${args}`];
    fs.writeFileSync(path.join(bin, "ps"), `#!/bin/bash\necho '${first}'\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "df"), `#!/bin/bash\necho H; echo "/d 1 1 31457280 1% /"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "git"), `#!/bin/bash\nif [ "$3" = archive ]; then tar -cf - -T /dev/null; fi\nexit 0\n`, { mode: 0o755 });
    const script = `
NGINX_LOCK_HELD=false; STATE_DIR=/x; AADS_RELEASE_SHA=abc; log() { echo "$1"; }
cleanup_release_context() { :; }
${varsBlock()}
${fn("remote_build_mode")}
${fn("build_release_image_remote42")}
${fn("record_build_info")}
${fn("build_release_image")}
build_release_image; echo "rc=$?"`;
    const r = spawnSync("bash", ["-c", script], {
      env: { PATH: `${bin}:${process.env.PATH}`, AADS_DASHBOARD_DEPLOY_DISK_CHECK_PATH: "/" }, encoding: "utf8",
    });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.match(r.stdout, /같은 이미지를 빌드 중인 프로세스가 있다/, args);
    assert.match(r.stdout, /rc=1/);
  }
});
