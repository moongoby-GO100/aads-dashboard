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
const OTHER = `sha256:${"b".repeat(64)}`;
const FULL = "0123456789abcdef0123456789abcdef01234567";
const SHORT = FULL.slice(0, 12);
const START = 100000; // fake monotonic clock, centiseconds

function fn(name) {
  const lines = deploySh.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${name}() {`));
  assert.ok(start >= 0, `function ${name} not found in deploy.sh`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}
function ro(name) {
  const line = deploySh.split("\n").find((l) => l.startsWith(`readonly ${name}=`));
  assert.ok(line, `readonly ${name} not found`);
  return line;
}
function gitIn(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe", encoding: "utf8" }).trim();
}

// Fake docker/wget/ps/nginx executables. They are real files because deploy.sh wraps calls in `timeout`,
// which cannot run shell functions. State lives in $FAKE_DIR files so tests can steer behaviour per call.
function makeFakeBin(dir) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const w = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  w("ps", "exit 0");
  w(
    "wget",
    `url=""; for a in "$@"; do case "$a" in http*) url="$a";; esac; done
echo "$(cat "$FAKE_DIR/clock" 2>/dev/null || echo 0) $url" >> "$FAKE_DIR/wget.calls"
now=$(cat "$FAKE_DIR/clock" 2>/dev/null || echo 0)
if [ -f "$FAKE_DIR/wget.fail_always" ]; then exit 1; fi
if [ -f "$FAKE_DIR/wget.fail_url" ] && [[ "$url" == *"$(cat "$FAKE_DIR/wget.fail_url")"* ]]; then exit 1; fi
if [ -f "$FAKE_DIR/wget.fail_from" ] && [ "$now" -ge "$(cat "$FAKE_DIR/wget.fail_from")" ]; then exit 1; fi
exit 0`,
  );
  w(
    "docker",
    `echo "$*" >> "$FAKE_DIR/docker.calls"
rd() { [ -f "$FAKE_DIR/$1" ] && cat "$FAKE_DIR/$1" || printf '%s' "$2"; }
case "$1" in
  inspect)
    c="$2"; fmt="$4"
    case "$fmt" in
      *State.Status*) rd "state.$c" running; echo ;;
      "{{.Image}}") if [ -f "$FAKE_DIR/image.$c.fail" ]; then exit 1; fi; rd "image.$c" "${IMG}"; echo ;;
      "{{.Config.Image}}") rd "cfgimage.$c" ""; echo ;;
      *) echo ;;
    esac ;;
  image)
    tag="$3"; fmt="$5"
    [ -f "$FAKE_DIR/image.inspect.error" ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    [ -f "$FAKE_DIR/imgtag.$tag" ] || { echo "Error: No such image: $tag" >&2; exit 1; }
    case "$fmt" in
      "{{.Id}}") cat "$FAKE_DIR/imgtag.$tag"; echo ;;
      *Labels*) [ -f "$FAKE_DIR/imglabel.$tag" ] && cat "$FAKE_DIR/imglabel.$tag"; echo ;;
    esac ;;
  logs)
    c="$4"
    [ -f "$FAKE_DIR/logs.$c.fail" ] && exit 1
    [ -f "$FAKE_DIR/logs.$c" ] && cat "$FAKE_DIR/logs.$c"
    exit 0 ;;
  build)
    echo "$*" > "$FAKE_DIR/build.args"
    ctx="\${@: -1}"; ls -A "$ctx" > "$FAKE_DIR/build.ctx.ls"
    exit 0 ;;
  compose) echo "$*" >> "$FAKE_DIR/compose.calls"; exit 0 ;;
esac
exit 0`,
  );
  return bin;
}

function harness(dir, body, { env = {}, fake = true } = {}) {
  const fakeDir = path.join(dir, "fake");
  fs.mkdirSync(fakeDir, { recursive: true });
  const bin = makeFakeBin(dir);
  const logFile = path.join(dir, "deploy.log");
  fs.writeFileSync(logFile, "");
  const script = `
set -euo pipefail
export PATH="${bin}:$PATH"
export FAKE_DIR="${fakeDir}"
DEPLOY_LOG_FILE="${logFile}"
log() { echo "$1" >> "$DEPLOY_LOG_FILE"; }
${ro("MONITOR_MIN_SECONDS")}
${ro("MONITOR_MAX_SECONDS")}
${ro("MONITOR_MAX_INTERVAL")}
${body}
`;
  const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, ...env } });
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    log: read(logFile),
    fake: (f) => read(path.join(fakeDir, f)),
    fakeDir,
  };
}

function withDir(fnBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-gates-"));
  try {
    return fnBody(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// 1. P0/P1 monitoring: real monitor_post_cutover + monitor_probe + monitor_config, fake clock/Docker/health.
// ---------------------------------------------------------------------------------------------
const MONITOR_PRELUDE = `
HEALTH_EXTERNAL=https://ext.test/login HEALTH_BLUE=http://127.0.0.1:3100/login HEALTH_GREEN=http://127.0.0.1:3101/login
BLUE_CONTAINER=blue GREEN_CONTAINER=green
${fn("_normalize_image_digest")}
${fn("container_image_id")}
${fn("monitor_config")}
${fn("monitor_probe")}
${fn("monitor_post_cutover")}
echo ${START} > "$FAKE_DIR/clock"
monotonic_centiseconds() { cat "$FAKE_DIR/clock"; }
# SLEEP_RATIO: percent of the requested sleep that really elapses (simulates a short/interrupted sleep).
monitor_sleep() { echo "$1" >> "$FAKE_DIR/sleeps"; echo $(( $(cat "$FAKE_DIR/clock") + $1 * 100 * \${SLEEP_RATIO:-100} / 100 )) > "$FAKE_DIR/clock"; }
`;

function runMonitor({ env = {}, setup = "", expected = IMG, after = "" } = {}) {
  return withDir((dir) => {
    const r = harness(
      dir,
      `${MONITOR_PRELUDE}
${setup}
rc=0; monitor_post_cutover 2026-10-23T00:00:00Z '${expected}' || rc=$?
echo "RC=$rc ELAPSED=$DEPLOY_MONITOR_ELAPSED_SECONDS"
${after}`,
      { env },
    );
    const times = r
      .fake("wget.calls")
      .split("\n")
      .filter((l) => l.includes("ext.test"))
      .map((l) => Number(l.split(" ")[0]));
    const m = /RC=(\d+) ELAPSED=(\d+)/.exec(r.stdout);
    return { ...r, rc: m ? Number(m[1]) : null, elapsed: m ? Number(m[2]) : null, probeTimes: times, sleeps: r.fake("sleeps").split("\n").filter(Boolean).map(Number) };
  });
}

test("monitor: default run only succeeds after >=300s of monotonic time, final probe at/after 300s", () => {
  const r = runMonitor();
  assert.equal(r.rc, 0, r.stdout + r.stderr + r.log);
  assert.ok(r.probeTimes.length >= 6, `probes: ${r.probeTimes}`);
  const last = r.probeTimes.at(-1) - START;
  assert.ok(last >= 30000, `final probe ran at +${last / 100}s (<300s)`);
  assert.equal(r.probeTimes.filter((t) => t - START < 30000).length, r.probeTimes.length - 1, "only the last probe may be at/after 300s");
  assert.ok(r.elapsed >= 300, `elapsed=${r.elapsed}`);
  assert.match(r.log, /300초 P0\/P1 모니터링 통과/);
  // old bug: 5 rounds x 60s with no trailing sleep waits only 240s
  assert.ok(r.sleeps.reduce((a, b) => a + b, 0) >= 300);
});

test("monitor: a failure first visible at +299.00s... and the 300s final check both gate success", () => {
  // healthy until +299s, broken from +299s: the final check (>=300s) must run and fail -> no success
  const r = runMonitor({ setup: `echo ${START + 29900} > "$FAKE_DIR/wget.fail_from"` });
  assert.equal(r.rc, 1, r.stdout);
  assert.equal(r.elapsed, 0, "failed monitoring must not report elapsed seconds");
  assert.match(r.log, /external health 실패/);
  assert.ok(r.probeTimes.at(-1) - START >= 29900);
});

test("monitor: probes spread to 299s are not enough — success is impossible before 300s", () => {
  // short sleeps (50% of requested) => more probes, but still no success until the clock reaches +300s
  const r = runMonitor({ env: { SLEEP_RATIO: "50" } });
  assert.equal(r.rc, 0, r.stdout + r.log);
  assert.ok(r.probeTimes.length > 6);
  assert.ok(r.probeTimes.slice(0, -1).every((t) => t - START < 30000));
  assert.ok(r.probeTimes.at(-1) - START >= 30000);
});

for (const [rounds, interval, ok] of [
  ["1", "1", false],
  ["4", "60", false], // the historical 240s config
  ["5", "59", false],
  ["299", "1", false],
  ["5", "61", false], // interval too sparse
  ["abc", "60", false],
  ["5", "0", false],
  ["5", "", true], // empty value == unset == defaults (5 x 60s)
  ["1801", "1", false], // above the upper bound
  ["10", "30", true],
  ["300", "1", true],
  ["5", "60", true],
]) {
  test(`monitor config rounds=${rounds} interval=${interval} is ${ok ? "accepted" : "rejected without any probe"}`, () => {
    const r = runMonitor({ env: { AADS_DASHBOARD_MONITOR_ROUNDS: rounds, AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: interval } });
    if (ok) {
      assert.equal(r.rc, 0, r.stdout + r.log);
      assert.ok(r.probeTimes.at(-1) - START >= 30000);
    } else {
      assert.equal(r.rc, 1, r.stdout + r.log);
      assert.equal(r.elapsed, 0);
      assert.equal(r.probeTimes.length, 0, "no health probe may run for a rejected config");
      assert.match(r.log, /FAIL: 모니터링/);
    }
  });
}

test("monitor: longer configured duration (rounds*interval>300) is honoured, never shortened", () => {
  const r = runMonitor({ env: { AADS_DASHBOARD_MONITOR_ROUNDS: "8", AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "60" } });
  assert.equal(r.rc, 0, r.log);
  assert.ok(r.probeTimes.at(-1) - START >= 48000);
});

test("monitor: unreadable / backwards / stuck monotonic clock fails closed", () => {
  const unreadable = runMonitor({ setup: `monotonic_centiseconds() { return 1; }` });
  assert.equal(unreadable.rc, 1);
  assert.match(unreadable.log, /단조 시계/);

  const garbage = runMonitor({ setup: `monotonic_centiseconds() { echo abc; }` });
  assert.equal(garbage.rc, 1);

  const backwards = runMonitor({ setup: `monitor_sleep() { echo $(( $(cat "$FAKE_DIR/clock") - 500 )) > "$FAKE_DIR/clock"; }` });
  assert.equal(backwards.rc, 1);
  assert.match(backwards.log, /뒤로 갔다/);

  const stuck = runMonitor({ setup: `monitor_sleep() { :; }\nmonitor_probe() { return 0; }` });
  assert.equal(stuck.rc, 1);
  assert.match(stuck.log, /반복 상한 초과/);
  assert.equal(stuck.elapsed, 0);
});

for (const [name, setup, logRe] of [
  ["external health", `echo ext.test > "$FAKE_DIR/wget.fail_url"`, /external health 실패/],
  ["blue health", `echo :3100 > "$FAKE_DIR/wget.fail_url"`, /blue health 실패/],
  ["green health", `echo :3101 > "$FAKE_DIR/wget.fail_url"`, /green health 실패/],
  ["container not running", `echo exited > "$FAKE_DIR/state.green"`, /컨테이너 상태/],
  ["container digest mismatch", `echo ${OTHER} > "$FAKE_DIR/image.blue"`, /digest 조회 실패 또는 불일치/],
  ["container digest empty", `echo "" > "$FAKE_DIR/image.green"`, /digest 조회 실패 또는 불일치/],
  ["container digest lookup error", `touch "$FAKE_DIR/image.blue.fail"`, /digest 조회 실패 또는 불일치/],
  ["docker logs query error", `touch "$FAKE_DIR/logs.blue.fail"`, /로그 조회 실패/],
  ["P0/P1 log line", `echo "TypeError: x is undefined" > "$FAKE_DIR/logs.green"`, /P0\/P1 로그 감지/],
]) {
  test(`monitor fails closed on ${name}`, () => {
    const r = runMonitor({ setup });
    assert.equal(r.rc, 1, r.stdout + r.log);
    assert.equal(r.elapsed, 0);
    assert.match(r.log, logRe);
  });
}

test("monitor: invalid expected digest is rejected", () => {
  for (const bad of ["", "sha256:abc", "latest"]) {
    const r = runMonitor({ expected: bad });
    assert.equal(r.rc, 1);
    assert.equal(r.probeTimes.length, 0);
  }
});

test("monitor_probe really reads the fake monotonic clock via /proc/uptime in production code", () => {
  const out = execFileSync("bash", ["-c", `${fn("monotonic_centiseconds")}\na=$(monotonic_centiseconds); sleep 0.2; b=$(monotonic_centiseconds); echo $((b-a))`], { encoding: "utf8" }).trim();
  const d = Number(out);
  assert.ok(d >= 15 && d < 200, `centisecond delta ${d}`);
});

// ---------------------------------------------------------------------------------------------
// 2. Digest verification gate.
// ---------------------------------------------------------------------------------------------
function runDigest({ active, standby, release = IMG, failActive = false }) {
  return withDir((dir) => {
    const r = harness(
      dir,
      `${fn("_normalize_image_digest")}
${fn("container_image_id")}
${fn("verify_release_digests")}
DEPLOY_IMAGE_DIGEST="" DEPLOY_STANDBY_DIGEST=""
printf '%s\\n' '${active}' > "$FAKE_DIR/image.act"
printf '%s\\n' '${standby}' > "$FAKE_DIR/image.stb"
${failActive ? 'touch "$FAKE_DIR/image.act.fail"' : ""}
rc=0; verify_release_digests '${release}' act stb || rc=$?
echo "RC=$rc IMG=[$DEPLOY_IMAGE_DIGEST] STB=[$DEPLOY_STANDBY_DIGEST]"`,
    );
    const m = /RC=(\d+) IMG=\[(.*)\] STB=\[(.*)\]/.exec(r.stdout);
    return { rc: Number(m[1]), image: m[2], standby: m[3], log: r.log };
  });
}

test("digest gate passes only for equal valid digests matching the verified release image", () => {
  const ok = runDigest({ active: IMG, standby: IMG });
  assert.equal(ok.rc, 0);
  assert.equal(ok.image, IMG);
  assert.equal(ok.standby, IMG);
});

for (const [name, opts, re] of [
  ["empty active", { active: "", standby: IMG }, /조회 실패 또는 공백/],
  ["empty standby", { active: IMG, standby: "" }, /조회 실패 또는 공백/],
  ["malformed", { active: "sha256:xyz", standby: "sha256:xyz" }, /조회 실패 또는 공백/],
  ["lookup error", { active: IMG, standby: IMG, failActive: true }, /조회 실패 또는 공백/],
  ["mismatch", { active: IMG, standby: OTHER }, /image digest 불일치/],
  ["both equal but not the release image", { active: OTHER, standby: OTHER }, /release 이미지와 다르다/],
  ["no verified release image id", { active: IMG, standby: IMG, release: "" }, /release 이미지와 다르다/],
]) {
  test(`digest gate blocks: ${name}, and leaves ledger variables empty`, () => {
    const r = runDigest(opts);
    assert.equal(r.rc, 1);
    assert.equal(r.image, "");
    assert.equal(r.standby, "");
    assert.match(r.log, re);
  });
}

// ---------------------------------------------------------------------------------------------
// 3. One build per release SHA / verified image reuse / no nginx lock during build.
// ---------------------------------------------------------------------------------------------
function runEnsure({ setup = "", buildStub = true, lockHeld = "false" }) {
  return withDir((dir) => {
    const r = harness(
      dir,
      `AADS_RELEASE_SHA=${SHORT}; RELEASE_FULL_SHA=${FULL}; RELEASE_IMAGE_ID=""; IMAGE_PROBE_ID=""; IMAGE_PROBE_LABEL=""
RELEASE_LABEL_KEY=aads.release.sha
NGINX_LOCK_HELD=${lockHeld}
${fn("_normalize_image_digest")}
${fn("release_image_field")}
${fn("probe_release_image")}
${fn("ensure_release_image")}
${buildStub ? 'build_release_image() { echo built >> "$FAKE_DIR/build.stub"; echo ' + IMG + ' > "$FAKE_DIR/imgtag.aads-dashboard:' + SHORT + '"; echo ' + FULL + ' > "$FAKE_DIR/imglabel.aads-dashboard:' + SHORT + '"; }' : fn("build_release_image") + "\ncleanup_release_context() { :; }\nSTATE_DIR=" + dir + "/repo"}
${setup}
rc=0; ensure_release_image || rc=$?
echo "RC=$rc ID=[$RELEASE_IMAGE_ID]"`,
    );
    const m = /RC=(\d+) ID=\[(.*)\]/.exec(r.stdout);
    return { ...r, rc: Number(m[1]), id: m[2], builds: r.fake("build.stub").split("\n").filter(Boolean).length };
  });
}
const tag = `aads-dashboard:${SHORT}`;
const seedImage = (id, label) => `echo ${id} > "$FAKE_DIR/imgtag.${tag}"; ${label === null ? "" : `echo ${label} > "$FAKE_DIR/imglabel.${tag}"`}`;

test("existing same-SHA image with matching release label is reused: zero builds", () => {
  const r = runEnsure({ setup: seedImage(IMG, FULL) });
  assert.equal(r.rc, 0, r.log);
  assert.equal(r.builds, 0);
  assert.equal(r.id, IMG);
  assert.match(r.log, /재빌드하지 않음/);
  assert.doesNotMatch(r.fake("docker.calls"), /(^|\n)build /);
});

test("no image yet: exactly one build, verified", () => {
  const r = runEnsure({ setup: "" });
  assert.equal(r.rc, 0, r.log);
  assert.equal(r.builds, 1);
  assert.equal(r.id, IMG);
});

for (const [name, setup] of [
  ["label belongs to another commit", seedImage(IMG, "f".repeat(40))],
  ["legacy image without any label", seedImage(IMG, null)],
  ["inspect fails for a reason other than 'no such image'", `echo x > "$FAKE_DIR/image.inspect.error"`],
]) {
  test(`existing same-SHA tag that cannot be verified fails closed, zero builds, tag not overwritten: ${name}`, () => {
    const r = runEnsure({ setup });
    assert.equal(r.rc, 1, r.log);
    assert.equal(r.builds, 0);
    assert.equal(r.id, "");
    assert.match(r.log, /새로운 승인 SHA/);
    assert.doesNotMatch(r.fake("docker.calls"), /(^|\n)build /);
  });
}

test("DEPLOY_REBUILD is not consulted by ensure_release_image: even set to 1 a verified image is only reused", () => {
  const r = runEnsure({ setup: `DEPLOY_REBUILD=1\n${seedImage(IMG, FULL)}` });
  assert.equal(r.rc, 0, r.log);
  assert.equal(r.builds, 0);
  assert.equal(r.id, IMG);
});

test("a build that yields an unverifiable image fails the release", () => {
  const r = runEnsure({ setup: `build_release_image() { echo ${IMG} > "$FAKE_DIR/imgtag.${tag}"; echo ${"e".repeat(40)} > "$FAKE_DIR/imglabel.${tag}"; }` });
  assert.equal(r.rc, 1);
  assert.equal(r.id, "");
  assert.match(r.log, /빌드한 이미지 검증 실패/);
});

test("real build_release_image: one docker build, release tag + label, committed content only, refuses while nginx lock is held", () => {
  withDir((dir) => {
    const repo = path.join(dir, "repo");
    fs.mkdirSync(repo);
    gitIn(repo, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(repo, "committed.txt"), "c\n");
    gitIn(repo, "add", "-A");
    gitIn(repo, "commit", "-q", "-m", "c");
    const full = gitIn(repo, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(repo, "dirty-untracked.txt"), "x\n");
    fs.writeFileSync(path.join(repo, "committed.txt"), "dirty edit\n");
    const body = (held) => `STATE_DIR='${repo}'; AADS_RELEASE_SHA=${full.slice(0, 12)}; RELEASE_FULL_SHA=${full}; RELEASE_CONTEXT_DIR=""
RELEASE_LABEL_KEY=aads.release.sha; NGINX_LOCK_HELD=${held}
${fn("cleanup_release_context")}
${fn("build_release_image")}
rc=0; build_release_image || rc=$?
echo "RC=$rc"`;
    const held = harness(dir, body("true"));
    assert.match(held.stdout, /RC=1/);
    assert.match(held.log, /nginx 전환 락을 잡은 채 빌드할 수 없다/);
    assert.equal(held.fake("build.args"), "", "no docker build while the nginx lock is held");

    const ok = harness(dir, body("false"));
    assert.match(ok.stdout, /RC=0/, ok.stdout + ok.stderr + ok.log);
    const args = ok.fake("build.args");
    assert.match(args, new RegExp(`--tag aads-dashboard:${full.slice(0, 12)}`));
    assert.match(args, new RegExp(`--label aads.release.sha=${full}`));
    assert.equal(ok.fake("docker.calls").split("\n").filter((l) => l.startsWith("build ")).length, 1);
    const ctx = ok.fake("build.ctx.ls");
    assert.match(ctx, /committed\.txt/);
    assert.doesNotMatch(ctx, /dirty-untracked/);
  });
});

test("real build_release_image refuses when another aads-dashboard build is running", () => {
  withDir((dir) => {
    const repo = path.join(dir, "repo");
    fs.mkdirSync(repo);
    gitIn(repo, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(repo, "a"), "a");
    gitIn(repo, "add", "-A");
    gitIn(repo, "commit", "-q", "-m", "c");
    const full = gitIn(repo, "rev-parse", "HEAD");
    const r = harness(
      dir,
      `printf '#!/bin/bash\\necho "123 docker docker build --tag aads-dashboard:other ."\\n' > "${dir}/bin/ps"
STATE_DIR='${repo}'; AADS_RELEASE_SHA=${full.slice(0, 12)}; RELEASE_FULL_SHA=${full}; RELEASE_CONTEXT_DIR=""; RELEASE_LABEL_KEY=aads.release.sha; NGINX_LOCK_HELD=false
${fn("cleanup_release_context")}
${fn("build_release_image")}
rc=0; build_release_image || rc=$?; cleanup_release_context; echo "RC=$rc"`,
    );
    assert.match(r.stdout, /RC=1/);
    assert.equal(r.fake("build.args"), "");
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Short nginx lock cutover, routed-health failure rollback, standby sync.
// ---------------------------------------------------------------------------------------------
const UPSTREAM = `upstream aads_dashboard {
    zone aads_dashboard 64k;
    least_conn;
    # Active slot is the non-backup line. dashboard deploy.sh rewrites 3100/3101.
    server 127.0.0.1:3100 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3101 max_fails=3 fail_timeout=30s backup;
    keepalive 16;
}
`;

function runCutover({ routedHealthOk = true, nginxTestOk = true, reloadOk = true, writeStateOk = true, slot = "green" }) {
  return withDir((dir) => {
    const up = path.join(dir, "aads-upstream.conf");
    const src = path.join(dir, "source-upstream.conf");
    const state = path.join(dir, "state");
    fs.mkdirSync(state);
    fs.writeFileSync(up, UPSTREAM);
    fs.writeFileSync(src, UPSTREAM);
    const lockfile = path.join(dir, "nginx.lock");
    const r = harness(
      dir,
      `NGINX_UPSTREAM='${up}'; NGINX_UPSTREAM_SOURCE='${src}'; STATE_DIR='${state}'
BLUE_PORT=3100; GREEN_PORT=3101; HEALTH_EXTERNAL=https://ext.test/login
NGINX_SWITCH_LOCK='${lockfile}'; exec 8>"$NGINX_SWITCH_LOCK"; NGINX_LOCK_HELD=false; UPSTREAM_SWITCHED=false
${fn("acquire_nginx_switch_lock")}
${fn("release_nginx_switch_lock")}
${fn("current_active_slot")}
${fn("switch_dashboard_upstream")}
${fn("file_sum")}
UPSTREAM_BACKUP_SUM=""; SOURCE_BACKUP_SUM=""; SOURCE_BACKUP_PRESENT=false; ROLLBACK_ROUTE_OK=false
MARKER_PRESENT_container=false; MARKER_CONTENT_container=""; MARKER_PRESENT_port=false; MARKER_CONTENT_port=""
${fn("backup_upstream")}
${fn("restore_from_backup")}
${fn("rollback_upstream")}
${fn("sync_upstream_source")}
${fn("verify_upstream_shape")}
${fn("write_active_state")}
${fn("snapshot_marker")}
${fn("snapshot_active_state")}
${fn("restore_marker")}
${fn("restore_active_state")}
${fn("revert_cutover")}
${fn("perform_cutover")}
nginx_test() { echo "test" >> "$FAKE_DIR/nginx.calls"; ${nginxTestOk ? "return 0" : 'if [ "$(cat "$FAKE_DIR/nginx.calls" | wc -l)" -le 1 ]; then return 1; fi; return 0'}; }
nginx_reload() { echo "reload $(grep -c 'server 127.0.0.1:3101 .*fail_timeout=30s;$' '${up}')" >> "$FAKE_DIR/nginx.calls"; ${reloadOk ? "return 0" : 'if [ "$(grep -c reload "$FAKE_DIR/nginx.calls")" -le 1 ]; then return 1; fi; return 0'}; }
wait_health() { echo "wait_health $2 $3 lock=$NGINX_LOCK_HELD" >> "$FAKE_DIR/nginx.calls"; ${routedHealthOk ? "return 0" : "return 1"}; }
${writeStateOk ? "" : "write_active_state() { return 1; }"}
rc=0; perform_cutover ${slot} aads-dashboard-${slot} ${slot === "green" ? 3101 : 3100} || rc=$?
echo "RC=$rc SWITCHED=$UPSTREAM_SWITCHED HELD=$NGINX_LOCK_HELD"
if flock -n -x '${lockfile}' -c true; then echo LOCK_FREE; else echo LOCK_BUSY; fi`,
    );
    const m = /RC=(\d+) SWITCHED=(\w+) HELD=(\w+)/.exec(r.stdout);
    const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
    return { ...r, rc: Number(m[1]), switched: m[2], held: m[3], lockFree: /LOCK_FREE/.test(r.stdout), upstream: read(up), source: read(src), activeFile: read(path.join(state, ".active_container")), nginx: r.fake("nginx.calls") };
  });
}

test("cutover success: short lock covers switch+reload+routed health, marker written, lock released", () => {
  const r = runCutover({});
  assert.equal(r.rc, 0, r.log + r.stderr);
  assert.match(r.upstream, /server 127\.0\.0\.1:3101 max_fails=3 fail_timeout=30s;/);
  assert.match(r.upstream, /server 127\.0\.0\.1:3100 .* backup;/);
  assert.equal(r.source, r.upstream);
  assert.equal(r.activeFile.trim(), "aads-dashboard-green");
  assert.match(r.nginx, /wait_health 30 external\(green\) lock=true/, "routed health runs while the lock is held");
  assert.equal(r.switched, "false");
  assert.equal(r.held, "false");
  assert.ok(r.lockFree, "nginx lock must be released after cutover");
});

test("cutover: routed health failure restores the previous route, reloads, writes no marker, releases lock", () => {
  const r = runCutover({ routedHealthOk: false });
  assert.equal(r.rc, 1);
  assert.equal(r.upstream, UPSTREAM, "previous nginx upstream restored byte-for-byte");
  assert.equal(r.source, UPSTREAM, "source upstream copy restored too");
  assert.equal(r.activeFile, null, "active marker must not point at the failed slot");
  assert.equal((r.nginx.match(/^reload/gm) || []).length, 2, "reload for the switch and again for the rollback");
  assert.match(r.log, /routed\(외부\) 헬스체크 실패 — upstream 롤백/);
  assert.match(r.log, /이전 nginx route 복구 완료/);
  assert.equal(r.switched, "false");
  assert.ok(r.lockFree);
});

test("cutover: nginx -t failure rolls back without reloading the broken config", () => {
  const r = runCutover({ nginxTestOk: false });
  assert.equal(r.rc, 1);
  assert.equal(r.upstream, UPSTREAM);
  assert.equal((r.nginx.match(/^reload/gm) || []).length, 1, "only the rollback reload");
  assert.ok(r.lockFree);
});

test("cutover: nginx reload failure rolls back", () => {
  const r = runCutover({ reloadOk: false });
  assert.equal(r.rc, 1);
  assert.equal(r.upstream, UPSTREAM);
  assert.equal(r.activeFile, null);
  assert.ok(r.lockFree);
});

test("cutover: marker write failure rolls back the route", () => {
  const r = runCutover({ writeStateOk: false });
  assert.equal(r.rc, 1);
  assert.equal(r.upstream, UPSTREAM);
  assert.ok(r.lockFree);
});

test("deploy.sh orders: build/reuse before the nginx lock; only perform_cutover takes the lock", () => {
  const lines = deploySh.split("\n");
  const idx = (re) => lines.findIndex((l) => re.test(l));
  const ensureAt = idx(/^if ! ensure_release_image; then/);
  const candidateUp = idx(/^docker compose "\$\{COMPOSE_ARGS\[@\]\}" up -d --no-build --no-deps "\$TARGET_SERVICE"/);
  const healthAt = idx(/^if ! wait_health "\$TARGET_HEALTH"/);
  const cutoverAt = idx(/^if ! perform_cutover /);
  const standbyAt = idx(/^if ! sync_dashboard_standby /);
  const digestAt = idx(/^if ! verify_release_digests "\$RELEASE_IMAGE_ID"/);
  const monitorAt = idx(/^if ! monitor_post_cutover "\$POST_CUTOVER_STARTED_AT" "\$DEPLOY_IMAGE_DIGEST"/);
  const successAt = idx(/^DEPLOY_RESULT="success"$/);
  const order = [ensureAt, candidateUp, healthAt, cutoverAt, standbyAt, digestAt, monitorAt, successAt];
  assert.ok(order.every((n) => n >= 0), `missing step: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "release steps out of order");
  const topLevelAcquire = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*acquire_nginx_switch_lock( \|\||$)/.test(l));
  assert.equal(topLevelAcquire.length, 1);
  assert.ok(topLevelAcquire[0][1] < lines.findIndex((l) => l.startsWith("perform_cutover() {")) + 4, "lock is taken inside perform_cutover only");
  assert.doesNotMatch(deploySh, /docker compose[^\n]*\sbuild(\s|$)/);
  assert.doesNotMatch(deploySh, /--no-verify/);
});

function runStandby({ healthOk }) {
  return withDir((dir) => {
    const r = harness(
      dir,
      `COMPOSE_FILE=docker-compose.prod.yml; COMPOSE_PROJECT=aads-server; MAX_WAIT=4
${fn("remove_container_if_foreign")}
${fn("container_compose_label")}
${fn("sync_dashboard_standby")}
wait_health() { ${healthOk ? "return 0" : "return 1"}; }
rc=0; sync_dashboard_standby blue aads-dashboard aads-dashboard http://x || rc=$?
echo "RC=$rc"`,
    );
    return { rc: Number(/RC=(\d+)/.exec(r.stdout)[1]), compose: r.fake("compose.calls"), log: r.log };
  });
}

test("standby sync starts with --no-build and fails the release when standby is unhealthy", () => {
  const ok = runStandby({ healthOk: true });
  assert.equal(ok.rc, 0);
  assert.match(ok.compose, /up -d --no-build --no-deps aads-dashboard/);
  const bad = runStandby({ healthOk: false });
  assert.equal(bad.rc, 1);
  assert.match(bad.compose, /--no-build/);
  assert.match(bad.log, /standby 동기화 후 헬스체크 실패/);
});

// ---------------------------------------------------------------------------------------------
// 5. Source/state role verification against real git repositories.
// ---------------------------------------------------------------------------------------------
function makeRepos(dir) {
  const origin = path.join(dir, "origin");
  fs.mkdirSync(origin);
  gitIn(origin, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(origin, "deploy.sh"), "#!/bin/bash\n");
  fs.writeFileSync(path.join(origin, ".gitignore"), "ignored.log\n");
  gitIn(origin, "add", "-A");
  gitIn(origin, "commit", "-q", "-m", "one");
  const state = path.join(dir, "state");
  gitIn(dir, "clone", "-q", origin, state);
  const source = path.join(dir, "source");
  gitIn(dir, "clone", "-q", state, source); // shares every commit with STATE
  return { origin, state, source };
}

function runSource({ prepare = () => {}, release = "", pointAt = "source" }) {
  return withDir((dir) => {
    const repos = makeRepos(dir);
    const ctx = prepare(repos) || {};
    const srcDir = repos[pointAt];
    const r = harness(
      dir,
      `STATE_DIR='${repos.state}'; SOURCE_DIR='${srcDir}'; RELEASE_FULL_SHA=""
${ctx.releaseOverride !== undefined ? `AADS_RELEASE_SHA='${ctx.releaseOverride}'` : release ? `AADS_RELEASE_SHA='${release}'` : "unset AADS_RELEASE_SHA"}
${fn("verify_release_source")}
rc=0; verify_release_source || rc=$?
echo "RC=$rc SHA=\${AADS_RELEASE_SHA:-} FULL=$RELEASE_FULL_SHA"`,
    );
    const m = /RC=(\d+) SHA=(\w*) FULL=(\w*)/.exec(r.stdout);
    return { rc: Number(m[1]), sha: m[2], full: m[3], log: r.log, head: gitIn(srcDir, "rev-parse", "HEAD"), repos };
  });
}

test("release source: clean checkout defaults to its own HEAD (12 chars)", () => {
  const r = runSource({});
  assert.equal(r.rc, 0, r.log);
  assert.equal(r.full, r.head);
  assert.equal(r.sha, r.head.slice(0, 12));
});

test("release source: explicit short and full SHA equal to HEAD are accepted, non-hex refs rejected", () => {
  for (const form of ["short", "full"]) {
    const r = withDir((dir) => {
      const repos = makeRepos(dir);
      const head = gitIn(repos.source, "rev-parse", "HEAD");
      const requested = form === "short" ? head.slice(0, 9) : head;
      const out = harness(
        dir,
        `STATE_DIR='${repos.state}'; SOURCE_DIR='${repos.source}'; RELEASE_FULL_SHA=""; AADS_RELEASE_SHA='${requested}'
${fn("verify_release_source")}
rc=0; verify_release_source || rc=$?
echo "RC=$rc SHA=$AADS_RELEASE_SHA FULL=$RELEASE_FULL_SHA"`,
      );
      return { out, head, requested };
    });
    assert.match(r.out.stdout, new RegExp(`RC=0 SHA=${r.requested} FULL=${r.head}`), r.out.log);
  }
  assert.equal(runSource({ release: "HEAD" }).rc, 1);
});

test("release source: dirty tracked file, untracked file, and wrong/older SHA are all rejected", () => {
  const dirtyTracked = runSource({ prepare: ({ source }) => fs.writeFileSync(path.join(source, "deploy.sh"), "tampered\n") });
  assert.equal(dirtyTracked.rc, 1);
  assert.match(dirtyTracked.log, /깨끗하지 않다/);

  const untracked = runSource({ prepare: ({ source }) => fs.writeFileSync(path.join(source, "stray.txt"), "x") });
  assert.equal(untracked.rc, 1);
  assert.match(untracked.log, /깨끗하지 않다/);

  const ignoredOk = runSource({ prepare: ({ source }) => fs.writeFileSync(path.join(source, "ignored.log"), "x") });
  assert.equal(ignoredOk.rc, 0, "gitignored runtime files are not source changes");

  // second commit lands in STATE; SOURCE stays on the older commit but the requested SHA is the newer one
  const older = runSource({
    prepare: ({ state }) => {
      fs.writeFileSync(path.join(state, "new.txt"), "n");
      gitIn(state, "add", "-A");
      gitIn(state, "commit", "-q", "-m", "two");
      return { releaseOverride: gitIn(state, "rev-parse", "HEAD") };
    },
  });
  assert.equal(older.rc, 1);
  assert.match(older.log, /SOURCE_DIR HEAD\(.*\) 와 다르다/);

  const dirtyShared = runSource({ pointAt: "state", prepare: ({ state }) => fs.writeFileSync(path.join(state, "deploy.sh"), "dirty shared\n") });
  assert.equal(dirtyShared.rc, 1, "a dirty shared checkout can never be the release source");
});

test("release source: commit missing from STATE object store, bad SHA format, unwritable STATE are rejected", () => {
  const unknownToState = runSource({
    prepare: ({ source }) => {
      fs.writeFileSync(path.join(source, "only-here.txt"), "n");
      gitIn(source, "add", "-A");
      gitIn(source, "commit", "-q", "-m", "local only");
    },
  });
  assert.equal(unknownToState.rc, 1);
  assert.match(unknownToState.log, /STATE_DIR 객체 저장소에 없다/);

  const badFormat = runSource({ release: "main" });
  assert.equal(badFormat.rc, 1);
  assert.match(badFormat.log, /형식이 올바르지 않다/);

  const noState = withDir((dir) => {
    const repos = makeRepos(dir);
    const r = harness(dir, `STATE_DIR='${dir}/missing'; SOURCE_DIR='${repos.source}'; RELEASE_FULL_SHA=""; unset AADS_RELEASE_SHA\n${fn("verify_release_source")}\nrc=0; verify_release_source || rc=$?; echo RC=$rc`);
    return r;
  });
  assert.match(noState.stdout, /RC=1/);
  assert.match(noState.log, /STATE_DIR 를 쓸 수 없다/);
});

test("release source: SOURCE_DIR must be the repo top level", () => {
  withDir((dir) => {
    const repos = makeRepos(dir);
    fs.mkdirSync(path.join(repos.source, "sub"));
    const out = harness(dir, `STATE_DIR='${repos.state}'; SOURCE_DIR='${repos.source}/sub'; RELEASE_FULL_SHA=""; unset AADS_RELEASE_SHA\n${fn("verify_release_source")}\nrc=0; verify_release_source || rc=$?; echo RC=$rc`);
    assert.match(out.stdout, /RC=1/);
    assert.match(out.log, /저장소 최상위에서 실행/);
  });
});

test("whole deploy.sh refuses a dirty source before the lock, the ledger and any docker call", () => {
  const verifier = "/root/aads/aads-server/scripts/verify-bluegreen-release-contract.sh";
  if (!fs.existsSync(verifier)) return; // global verifier only exists on the deploy host
  withDir((dir) => {
    const repos = makeRepos(dir);
    const state = repos.state;
    const stateLog = path.join(dir, "state-log");
    fs.mkdirSync(stateLog);
    const script = deploySh.replace('STATE_DIR="/root/aads/aads-dashboard"', `STATE_DIR="${state}"`);
    assert.notEqual(script, deploySh);
    fs.writeFileSync(path.join(repos.source, "deploy.sh"), script);
    gitIn(repos.source, "add", "-A");
    gitIn(repos.source, "commit", "-q", "-m", "test copy");
    gitIn(repos.source, "push", "-q", state, "HEAD:refs/heads/release-test");
    fs.writeFileSync(path.join(repos.source, "stray-dirty.txt"), "dirty");
    const bin = makeFakeBin(dir);
    const fakeDir = path.join(dir, "fake");
    fs.mkdirSync(fakeDir);
    const r = spawnSync("bash", [path.join(repos.source, "deploy.sh")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DIR: fakeDir }, timeout: 60000 });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /SOURCE_DIR 가 깨끗하지 않다/);
    assert.equal(fs.existsSync(path.join(fakeDir, "docker.calls")), false, "docker must not be invoked");
    assert.doesNotMatch(r.stdout, /deploy_runs #/);
  });
});

test("deploy.sh syntax is valid and STOP_PREVIOUS / single-source rules are in code", () => {
  execFileSync("bash", ["-n", path.join(root, "deploy.sh")]);
  assert.match(deploySh, /AADS_DASHBOARD_STOP_PREVIOUS:-false\}" = "true" \]; then\n\s+log "FAIL/);
});
