import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runs the REAL deploy.sh top to bottom (not extracted functions) against fake docker / wget / nginx /
// sleep / monotonic clock. Every host path is rewritten into a temp dir so nothing real is touched.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const deploySh = fs.readFileSync(path.join(root, "deploy.sh"), "utf8");

const OLD = `sha256:${"1".repeat(64)}`;
const NEW = `sha256:${"2".repeat(64)}`;
const OTHER = `sha256:${"3".repeat(64)}`;
const START_UPTIME = 5000;

const UPSTREAM = `upstream aads_dashboard {
    zone aads_dashboard 64k;
    least_conn;
    # Active slot is the non-backup line. dashboard deploy.sh rewrites 3100/3101.
    server 127.0.0.1:3100 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3101 max_fails=3 fail_timeout=30s backup;
    keepalive 16;
}
`;

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe", encoding: "utf8" }).trim();
}

// Replace a literal exactly once; a moved/renamed line makes the test fail instead of silently touching the host.
function sub(script, from, to, { all = false } = {}) {
  assert.ok(script.includes(from), `deploy.sh no longer contains: ${from}`);
  return all ? script.split(from).join(to) : script.replace(from, () => to);
}

function makeFakeBin(dir) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const w = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  const upt = '"$FAKE_DIR/uptime"';
  const lockState = `if flock -n -x "$FAKE_LOCK" -c true 2>/dev/null; then echo free; else echo held; fi`;
  w("ps", "exit 0");
  w("systemctl", "exit 1");
  w("curl", 'echo "curl $*" >> "$FAKE_DIR/events"; exit 22');
  w(
    "sleep",
    `echo "sleep $1" >> "$FAKE_DIR/events"
awk -v u="$(cat ${upt})" -v s="$1" 'BEGIN { printf "%.2f\\n", u + s }' > ${upt}.tmp && mv ${upt}.tmp ${upt}`,
  );
  w(
    "nginx",
    `echo "nginx $* lock=$(${lockState})" >> "$FAKE_DIR/events"
if [ "$1" = "-s" ] && [ -f "$FAKE_DIR/nginx.reload_fail" ]; then exit 1; fi
exit 0`,
  );
  w(
    "wget",
    `url=""; for a in "$@"; do case "$a" in http*) url="$a";; esac; done
now=$(cat ${upt})
echo "wget $now $url" >> "$FAKE_DIR/events"
# fail when every configured condition (url substring, uptime >= fail_from) holds; no condition file = never fail
if [ -f "$FAKE_DIR/wget.fail_url" ] || [ -f "$FAKE_DIR/wget.fail_from" ]; then
  ok=1
  if [ -f "$FAKE_DIR/wget.fail_url" ] && [[ "$url" != *"$(cat "$FAKE_DIR/wget.fail_url")"* ]]; then ok=0; fi
  if [ -f "$FAKE_DIR/wget.fail_from" ] && ! awk -v n="$now" -v f="$(cat "$FAKE_DIR/wget.fail_from")" 'BEGIN{exit !(n>=f)}'; then ok=0; fi
  [ "$ok" = 1 ] && exit 1
fi
exit 0`,
  );
  w(
    "docker",
    `rd() { [ -f "$FAKE_DIR/$1" ] && cat "$FAKE_DIR/$1" || printf '%s' "$2"; }
case "$1" in
  inspect)
    c="$2"; fmt="$4"; [ -n "$fmt" ] || fmt="\${3#--format=}"
    case "$fmt" in
      *State.Status*) rd "state.$c" running; echo ;;
      "{{.Image}}") if [ -f "$FAKE_DIR/image.$c.fail" ]; then exit 1; fi; rd "image.$c" ""; echo ;;
      "{{.Config.Image}}") rd "cfgimage.$c" ""; echo ;;
      *Config.Env*) rd "env.$c" ""; echo ;;
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
  build)
    echo "docker build lock=$(${lockState}) $*" >> "$FAKE_DIR/events"
    tag=""; label=""; prev=""
    for a in "$@"; do
      [ "$prev" = "--tag" ] && tag="$a"
      [ "$prev" = "--label" ] && label="\${a#*=}"
      prev="$a"
    done
    echo "$tag" >> "$FAKE_DIR/build.tags"
    if [ ! -f "$FAKE_DIR/build.fail" ]; then
      rd build.result "${NEW}" > "$FAKE_DIR/imgtag.$tag"
      echo "$label" > "$FAKE_DIR/imglabel.$tag"
    fi
    exit 0 ;;
  compose)
    svc="\${@: -1}"
    echo "docker compose lock=$(${lockState}) $*" >> "$FAKE_DIR/events"
    case "$*" in *" up "*)
      if [ "$svc" = "aads-dashboard" ]; then c=aads-dashboard; else c=aads-dashboard-green; fi
      if [ -f "$FAKE_DIR/imgtag.aads-dashboard:$AADS_RELEASE_SHA" ]; then
        if [ -f "$FAKE_DIR/compose.image.$c" ]; then cat "$FAKE_DIR/compose.image.$c" > "$FAKE_DIR/image.$c"
        else cat "$FAKE_DIR/imgtag.aads-dashboard:$AADS_RELEASE_SHA" > "$FAKE_DIR/image.$c"; fi
      fi
      echo "AADS_RELEASE_SHA=$AADS_RELEASE_SHA" > "$FAKE_DIR/env.$c" ;;
    esac
    exit 0 ;;
  logs)
    c="$4"
    [ -f "$FAKE_DIR/logs.$c.fail" ] && exit 1
    [ -f "$FAKE_DIR/logs.$c" ] && cat "$FAKE_DIR/logs.$c"
    exit 0 ;;
  exec)
    case "$*" in
      *aads-postgres*)
        sql="\${@: -1}"
        echo "$sql" >> "$FAKE_DIR/db.sql"
        case "$sql" in INSERT*) echo 4242 ;; esac ;;
    esac
    exit 0 ;;
esac
exit 0`,
  );
  return bin;
}

// Runs deploy.sh in a fresh sandbox. setup(ctx) seeds fake state before the run.
function runDeploy({ env = {}, setup = () => {}, args = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-full-"));
  try {
    const origin = path.join(dir, "origin");
    fs.mkdirSync(origin);
    git(origin, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(origin, "README"), "x\n");
    git(origin, "add", "-A");
    git(origin, "commit", "-q", "-m", "one");
    const state = path.join(dir, "state");
    git(dir, "clone", "-q", origin, state);
    const source = path.join(dir, "source");
    git(dir, "clone", "-q", state, source);

    const compose = path.join(dir, "compose");
    fs.mkdirSync(compose);
    const fake = path.join(dir, "fake");
    fs.mkdirSync(fake);
    const bin = makeFakeBin(dir);
    const upstream = path.join(dir, "aads-upstream.conf");
    const upstreamSrc = path.join(dir, "upstream-source.conf");
    fs.writeFileSync(upstream, UPSTREAM);
    fs.writeFileSync(upstreamSrc, UPSTREAM);
    const verifier = path.join(dir, "verifier.sh");
    fs.writeFileSync(verifier, "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    const provenance = path.join(dir, "provenance.sh");
    fs.writeFileSync(provenance, `#!/bin/bash\necho "provenance $*" >> "${fake}/provenance.calls"\n`, { mode: 0o755 });
    const deployLock = path.join(dir, "deploy.lock");
    const nginxLock = path.join(dir, "nginx.lock");

    let s = deploySh;
    s = sub(s, 'export PATH="/usr/local/sbin:', `export PATH="${bin}:/usr/local/sbin:`);
    s = sub(s, 'COMPOSE_DIR="/root/aads/aads-server"', `COMPOSE_DIR="${compose}"`);
    s = sub(s, 'STATE_DIR="/root/aads/aads-dashboard"', `STATE_DIR="${state}"`);
    s = sub(s, 'NGINX_UPSTREAM="/etc/nginx/conf.d/aads-upstream.conf"', `NGINX_UPSTREAM="${upstream}"`);
    s = sub(s, 'NGINX_UPSTREAM_SOURCE="/root/aads/aads-server/nginx-aads-upstream.conf"', `NGINX_UPSTREAM_SOURCE="${upstreamSrc}"`);
    s = sub(s, 'LOCKFILE="/tmp/aads-dashboard-deploy.lock"', `LOCKFILE="${deployLock}"`);
    s = sub(s, 'NGINX_SWITCH_LOCK="/tmp/aads-nginx-upstream.lock"', `NGINX_SWITCH_LOCK="${nginxLock}"`);
    s = sub(s, "/root/aads/aads-server/scripts/verify-bluegreen-release-contract.sh /root/aads/aads-server", `${verifier} ${compose}`);
    s = sub(s, '[ -x "/root/aads/aads-server/scripts/verify-bluegreen-release-contract.sh" ]', `[ -x "${verifier}" ]`);
    s = sub(s, "/proc/uptime", "${FAKE_DIR}/uptime");
    assert.doesNotMatch(s.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n"), /\/root\/aads/, "an unredirected host path remains");

    fs.writeFileSync(path.join(source, "deploy.sh"), s, { mode: 0o755 });
    git(source, "add", "-A");
    git(source, "commit", "-q", "-m", "sandbox deploy.sh");
    git(source, "push", "-q", state, "HEAD:refs/heads/release-test");
    const full = git(source, "rev-parse", "HEAD");
    const short = full.slice(0, 12);

    fs.writeFileSync(path.join(fake, "uptime"), `${START_UPTIME}.00\n`);
    fs.writeFileSync(path.join(fake, "image.aads-dashboard"), OLD);
    fs.writeFileSync(path.join(fake, "image.aads-dashboard-green"), OLD);
    fs.writeFileSync(path.join(fake, "events"), "");
    const ctx = { dir, fake, bin, full, short, upstream, upstreamSrc, state, nginxLock, put: (f, v) => fs.writeFileSync(path.join(fake, f), v) };
    setup(ctx);

    const r = spawnSync("bash", [path.join(source, "deploy.sh"), ...args], {
      encoding: "utf8",
      timeout: 120000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        FAKE_DIR: fake,
        FAKE_LOCK: nginxLock,
        DASHBOARD_EXTERNAL_HEALTH_URL: "https://ext.test/login",
        AADS_PROVENANCE_SCRIPT: provenance,
        ...env,
      },
    });
    const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
    const events = read(path.join(fake, "events")).split("\n").filter(Boolean);
    return {
      status: r.status,
      out: r.stdout + r.stderr,
      events,
      db: read(path.join(fake, "db.sql")),
      provenance: read(path.join(fake, "provenance.calls")),
      upstream: read(upstream),
      source: read(upstreamSrc),
      upstreamBak: fs.existsSync(`${upstream}.dashboard.bak`) ? read(`${upstream}.dashboard.bak`) : null,
      sourceBak: fs.existsSync(`${upstreamSrc}.dashboard.bak`) ? read(`${upstreamSrc}.dashboard.bak`) : null,
      activeMarker: read(path.join(state, ".active_container")).trim(),
      portMarker: read(path.join(state, ".active_port")).trim(),
      builds: events.filter((e) => e.startsWith("docker build")),
      composeUps: events.filter((e) => e.startsWith("docker compose") && / up /.test(e)),
      wgets: events.filter((e) => e.startsWith("wget ")).map((e) => e.split(" ")),
      ctx,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const noShellErrors = (r) => {
  assert.doesNotMatch(r.out, /command not found/, r.out);
  assert.doesNotMatch(r.out, /unbound variable|unassigned/, r.out);
  assert.doesNotMatch(r.out, /syntax error/, r.out);
};
const ledgerSuccess = (r) => /status='success'/.test(r.db);
const ledgerFailed = (r) => /status='failed'/.test(r.db);
const seedReleaseImage = (c, id = NEW) => {
  c.put(`imgtag.aads-dashboard:${c.short}`, id);
  c.put(`imglabel.aads-dashboard:${c.short}`, c.full);
};
const firstIndex = (events, re) => events.findIndex((e) => re.test(e));

test("full run, default config: passes monitor_config, builds once, cuts over, monitors >=300s, records success", () => {
  const r = runDeploy();
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /AADS Dashboard blue-green 배포 성공/);
  assert.equal(r.builds.length, 1, "exactly one build per release SHA");
  assert.match(r.builds[0], /lock=free/, "no nginx lock during build");
  assert.equal(r.composeUps.length, 2, "candidate + standby");
  for (const c of r.composeUps) {
    assert.match(c, /--no-build/);
    assert.match(c, /lock=free/, "no nginx lock while starting candidate/standby");
  }
  assert.match(r.upstream, /server 127\.0\.0\.1:3101 max_fails=3 fail_timeout=30s;/);
  assert.match(r.upstream, /server 127\.0\.0\.1:3100 .* backup;/);
  assert.equal(r.activeMarker, "aads-dashboard-green");
  const reload = r.events.filter((e) => e.startsWith("nginx -s reload"));
  assert.equal(reload.length, 1);
  assert.match(reload[0], /lock=held/, "short nginx lock covers the reload");
  assert.ok(firstIndex(r.events, /^docker build/) < firstIndex(r.events, /^nginx -s reload/));
  assert.ok(firstIndex(r.events, /^wget .*127\.0\.0\.1:3101/) < firstIndex(r.events, /^nginx -s reload/), "candidate health precedes cutover");
  assert.ok(ledgerSuccess(r), r.db);
  assert.match(r.db, new RegExp(`image_digest='${NEW}', standby_digest='${NEW}'`));
  assert.match(r.provenance, /--component dashboard/);
  const monitorWgets = r.wgets.filter((w) => w[2].includes("ext.test"));
  const t0 = Math.min(...monitorWgets.map((w) => Number(w[1])));
  const tEnd = Math.max(...monitorWgets.map((w) => Number(w[1])));
  assert.ok(tEnd - t0 >= 300, `final probe only ${tEnd - t0}s after the first one`);
});

test("full run: AADS_DASHBOARD_MONITOR_* shortening is rejected before build / compose / nginx and success is never recorded", () => {
  for (const env of [
    { AADS_DASHBOARD_MONITOR_ROUNDS: "2", AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "60" },
    { AADS_DASHBOARD_MONITOR_ROUNDS: "299", AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "1" },
    { AADS_DASHBOARD_MONITOR_ROUNDS: "abc" },
    { AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "0" },
    { AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "61", AADS_DASHBOARD_MONITOR_ROUNDS: "100" },
    { AADS_DASHBOARD_MONITOR_ROUNDS: "40", AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "60" },
  ]) {
    const r = runDeploy({ env });
    noShellErrors(r);
    assert.equal(r.status, 1, JSON.stringify(env) + r.out);
    assert.match(r.out, /FAIL: 모니터링/);
    assert.equal(r.builds.length, 0);
    assert.equal(r.composeUps.length, 0);
    assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0);
    assert.equal(r.events.filter((e) => e.startsWith("docker ")).length, 0, "no docker call at all before the config gate");
    assert.ok(ledgerFailed(r), "ledger records the failed run");
    assert.ok(!ledgerSuccess(r));
    assert.equal(r.provenance, "");
    assert.match(r.upstream, /server 127\.0\.0\.1:3100 max_fails=3 fail_timeout=30s;/, "route untouched");
  }
});

test("full run: a valid longer monitor window (e.g. 6 x 60s) is honoured end to end", () => {
  const r = runDeploy({ env: { AADS_DASHBOARD_MONITOR_ROUNDS: "6", AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS: "60" } });
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  const times = r.wgets.filter((w) => w[2].includes("ext.test")).map((w) => Number(w[1]));
  assert.ok(Math.max(...times) - Math.min(...times) >= 360);
  assert.ok(ledgerSuccess(r));
});

test("full run, already_current: monitor failure -> deploy_runs failed, no success / provenance, no build or compose", () => {
  const r = runDeploy({
    setup: (c) => {
      c.put("cfgimage.aads-dashboard", `aads-dashboard:${c.short}`);
      c.put("image.aads-dashboard", NEW);
      c.put("image.aads-dashboard-green", NEW);
      c.put("wget.fail_url", "127.0.0.1:3101");
      c.put("wget.fail_from", String(START_UPTIME + 100));
    },
  });
  noShellErrors(r);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /already_current 릴리스의 P0\/P1 감시 실패/);
  assert.equal(r.builds.length, 0);
  assert.equal(r.composeUps.length, 0);
  assert.ok(ledgerFailed(r), r.db);
  assert.ok(!ledgerSuccess(r), r.db);
  assert.equal(r.provenance, "");
});

test("full run, already_current: passes only after the real 300s window, then records success + provenance", () => {
  const r = runDeploy({
    setup: (c) => {
      c.put("cfgimage.aads-dashboard", `aads-dashboard:${c.short}`);
      c.put("image.aads-dashboard", NEW);
      c.put("image.aads-dashboard-green", NEW);
    },
  });
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /SKIP: .* 이미 활성/);
  assert.equal(r.builds.length, 0);
  assert.equal(r.composeUps.length, 0);
  const times = r.wgets.filter((w) => w[2].includes("ext.test")).map((w) => Number(w[1]));
  assert.ok(Math.max(...times) - Math.min(...times) >= 300);
  assert.ok(ledgerSuccess(r));
  assert.notEqual(r.provenance, "");
});

test("full run, already_current with mismatching slot digests is not trusted: falls through to a real deploy", () => {
  const r = runDeploy({
    setup: (c) => {
      c.put("cfgimage.aads-dashboard", `aads-dashboard:${c.short}`);
      c.put("image.aads-dashboard", NEW);
      c.put("image.aads-dashboard-green", OTHER);
      seedReleaseImage(c);
    },
  });
  noShellErrors(r);
  assert.match(r.out, /두 슬롯 digest 검증 실패 — 건너뛰지 않고/);
  assert.equal(r.builds.length, 0, "verified release image is reused");
  assert.equal(r.composeUps.length, 2);
});

test("full run: standby digest empty / mismatching the active slot blocks success and provenance, monitoring never starts", () => {
  for (const standby of ["", OTHER]) {
    const r = runDeploy({ setup: (c) => c.put("compose.image.aads-dashboard", standby) });
    noShellErrors(r);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, standby ? /digest 불일치/ : /digest 조회 실패 또는 공백/);
    assert.ok(!ledgerSuccess(r), r.db);
    assert.ok(ledgerFailed(r), r.db);
    assert.equal(r.provenance, "");
    assert.equal(r.events.filter((e) => e.startsWith("sleep 60")).length, 0, "no 300s monitoring after a digest failure");
  }
});

test("full run: digest lookup failure at the final gate fails closed", () => {
  const r = runDeploy({
    setup: (c) => {
      // the previous (blue) container's image cannot be inspected at all
      c.put("compose.image.aads-dashboard", NEW);
      c.put("image.aads-dashboard.fail", "1");
    },
  });
  noShellErrors(r);
  assert.equal(r.status, 1, r.out);
  assert.ok(!ledgerSuccess(r));
  assert.equal(r.provenance, "");
});

test("full run: monitor-phase failure (P0 log / health) after cutover is never recorded as success", () => {
  for (const setup of [
    (c) => c.put("logs.aads-dashboard-green", "Uncaught TypeError: x is not a function\n"),
    (c) => c.put("logs.aads-dashboard.fail", "1"),
    (c) => {
      c.put("wget.fail_url", "127.0.0.1:3100");
      c.put("wget.fail_from", String(START_UPTIME + 250));
    },
  ]) {
    const r = runDeploy({ setup });
    noShellErrors(r);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /post-cutover/);
    assert.ok(!ledgerSuccess(r), r.db);
    assert.ok(ledgerFailed(r), r.db);
    assert.equal(r.provenance, "");
  }
});

test("full run: existing verified same-SHA image is reused (zero builds), candidate and standby still --no-build", () => {
  const r = runDeploy({ setup: (c) => seedReleaseImage(c) });
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /검증된 release 이미지 재사용/);
  assert.equal(r.builds.length, 0);
  assert.equal(r.composeUps.length, 2);
  assert.ok(r.composeUps.every((c) => /--no-build/.test(c)));
  assert.ok(ledgerSuccess(r));
});

// ---------------------------------------------------------------------------------------------
// Cutover safety: every required step is checked explicitly (perform_cutover runs under `if !`, where errexit is off).
// Failures are injected through real executables in PATH, so the full deploy.sh runs unmodified.
// ---------------------------------------------------------------------------------------------
const STALE_UP = "STALE-UPSTREAM-BACKUP\n";
const STALE_SRC = "STALE-SOURCE-BACKUP\n";
const wrapBin = (c, name, body) => fs.writeFileSync(path.join(c.bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
const seedMarkers = (c) => {
  fs.writeFileSync(path.join(c.state, ".active_container"), "aads-dashboard\n");
  fs.writeFileSync(path.join(c.state, ".active_port"), "3100\n");
};
const seedStale = (c) => {
  fs.writeFileSync(`${c.upstream}.dashboard.bak`, STALE_UP);
  fs.writeFileSync(`${c.upstreamSrc}.dashboard.bak`, STALE_SRC);
};
const failCp = (c, lastArgGlob, { partial = false } = {}) =>
  wrapBin(c, "cp", `case "\${@: -1}" in ${lastArgGlob}) ${partial ? 'echo PARTIAL > "${@: -1}"; ' : ""}echo "injected cp failure" >&2; exit 1;; esac\nexec /bin/cp "$@"`);
const failMv = (c, argExpr, glob) =>
  wrapBin(c, "mv", `case "${argExpr}" in ${glob}) echo "injected mv failure" >&2; exit 1;; esac\nexec /bin/mv "$@"`);
const nginxCounting = (c, extra) =>
  wrapBin(c, "nginx", `echo "nginx $*" >> "$FAKE_DIR/events"\n${extra}\nexit 0`);

// Nothing about routing, source copy or the active markers may differ from the pre-run state.
function assertNothingTouched(r, { reloads = 0 } = {}) {
  noShellErrors(r);
  assert.notEqual(r.status, 0, r.out);
  assert.equal(r.upstream, UPSTREAM, "live nginx upstream must be byte-identical");
  assert.equal(r.source, UPSTREAM, "source upstream copy must be byte-identical");
  assert.equal(r.activeMarker, "aads-dashboard", "active container marker unchanged");
  assert.equal(r.portMarker, "3100", "active port marker unchanged");
  assert.equal(r.events.filter((e) => e.startsWith("nginx -s reload")).length, reloads);
  assert.ok(!ledgerSuccess(r), "success must not be recorded");
  assert.ok(ledgerFailed(r), "failure must be recorded");
  assert.equal(r.provenance, "", "no release provenance");
}

for (const [name, glob, expectBak] of [
  ["first cp (live upstream) fails", '*/aads-upstream.conf.dashboard.bak', "upstream"],
  ["second cp (source upstream copy) fails", '*/upstream-source.conf.dashboard.bak', "source"],
]) {
  test(`cutover backup: ${name} with stale .bak files present -> abort before nginx/route/marker change, stale .bak never reused`, () => {
    const r = runDeploy({ setup: (c) => { seedMarkers(c); seedStale(c); failCp(c, glob); } });
    assertNothingTouched(r);
    assert.match(r.out, /백업을 확보하지 못했다/);
    assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0, "nginx never invoked");
    assert.equal(r.composeUps.length, 1, "standby untouched");
    assert.match(r.out, /nginx 전환 락 해제/, "lock released");
    assert.notEqual(r.upstreamBak, STALE_UP, "stale upstream backup must not survive under the .bak name");
    assert.notEqual(r.sourceBak, STALE_SRC, "stale source backup must not survive under the .bak name");
    assert.ok(expectBak);
  });

  test(`cutover backup: ${name} AND external health failure -> still no route change and no fake 'restored' claim`, () => {
    const r = runDeploy({ setup: (c) => { seedMarkers(c); seedStale(c); failCp(c, glob); c.put("wget.fail_url", "ext.test"); } });
    assertNothingTouched(r);
    assert.doesNotMatch(r.out, /이전 nginx route 복구 완료/);
    assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0);
  });
}

test("cutover: source sync cp fails (partial write) -> route, source copy and markers restored exactly, no success", () => {
  const r = runDeploy({ setup: (c) => { seedMarkers(c); failCp(c, `"${path.join(c.dir, "upstream-source.conf")}"`, { partial: true }); } });
  assertNothingTouched(r, { reloads: 2 });
  assert.match(r.out, /source upstream 동기화 실패/);
  assert.match(r.out, /이전 nginx route 복구 완료/);
  assert.equal(r.composeUps.length, 1);
});

for (const [name, glob] of [
  ["second marker write (.active_port) fails after the first changed", "*/.active_port"],
  ["first marker write (.active_container) fails", "*/.active_container"],
]) {
  test(`cutover: ${name} -> both markers, route and source restored, no success`, () => {
    const r = runDeploy({ setup: (c) => { seedMarkers(c); failMv(c, '${@: -1}', glob); } });
    assertNothingTouched(r, { reloads: 2 });
    assert.match(r.out, /활성 상태 마커 기록 실패/);
    assert.match(r.out, /이전 nginx route 복구 완료/);
    assert.equal(r.composeUps.length, 1);
  });
}

test("cutover: a failed cutover with no pre-existing markers leaves no marker behind", () => {
  const r = runDeploy({ setup: (c) => failMv(c, '${@: -1}', "*/.active_port") });
  noShellErrors(r);
  assert.notEqual(r.status, 0);
  assert.equal(r.activeMarker, "");
  assert.equal(r.portMarker, "");
  assert.equal(r.upstream, UPSTREAM);
  assert.ok(!ledgerSuccess(r));
});

function assertCritical(r) {
  noShellErrors(r);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /CRITICAL/);
  assert.doesNotMatch(r.out, /이전 nginx route 복구 완료/, "must not claim a restore that did not happen");
  assert.ok(!ledgerSuccess(r));
  assert.ok(ledgerFailed(r));
  assert.equal(r.provenance, "");
  assert.equal(r.composeUps.length, 1, "standby sync never runs after a failed cutover");
}

test("rollback: restore mv fails + external health failure -> CRITICAL, nonzero, backup kept, no success/provenance", () => {
  const r = runDeploy({ setup: (c) => { seedMarkers(c); failMv(c, '${@: -2:1}', "*.dashboard.bak"); c.put("wget.fail_url", "ext.test"); } });
  assertCritical(r);
  assert.match(r.upstream, /3101 max_fails=3 fail_timeout=30s;/, "route could not be restored (honestly reported)");
  assert.equal(r.upstreamBak, UPSTREAM, "backup kept for manual recovery");
  assert.equal(r.activeMarker, "aads-dashboard");
  assert.equal(r.portMarker, "3100");
});

test("rollback: backup file disappeared before rollback -> CRITICAL, nonzero, no success", () => {
  const r = runDeploy({
    setup: (c) => {
      nginxCounting(c, `case "$*" in *reload*) rm -f "${c.upstream}.dashboard.bak" "${c.upstreamSrc}.dashboard.bak";; esac`);
      c.put("wget.fail_url", "ext.test");
    },
  });
  assertCritical(r);
  assert.match(r.out, /백업/);
});

test("rollback: nginx reload fails during the rollback -> CRITICAL, nonzero, no success", () => {
  const r = runDeploy({
    setup: (c) => {
      nginxCounting(c, `case "$*" in *reload*) n=$(cat "$FAKE_DIR/reloads" 2>/dev/null || echo 0); echo $((n+1)) > "$FAKE_DIR/reloads"; [ "$n" -ge 1 ] && exit 1;; esac`);
      c.put("wget.fail_url", "ext.test");
    },
  });
  assertCritical(r);
  assert.equal(r.upstream, UPSTREAM, "files were restored; only the reload failed");
});

test("rollback: nginx -t fails during the rollback -> CRITICAL, nonzero, no success", () => {
  const r = runDeploy({
    setup: (c) => {
      nginxCounting(c, `case "$*" in -t) n=$(cat "$FAKE_DIR/tests" 2>/dev/null || echo 0); echo $((n+1)) > "$FAKE_DIR/tests"; [ "$n" -ge 1 ] && exit 1;; esac`);
      c.put("wget.fail_url", "ext.test");
    },
  });
  assertCritical(r);
});

test("full run: a successful cutover with stale .bak files present backs up the CURRENT config (stale never used)", () => {
  const r = runDeploy({ setup: (c) => { seedMarkers(c); seedStale(c); } });
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.upstreamBak, UPSTREAM, "this run's backup is the pre-cutover config");
  assert.equal(r.sourceBak, UPSTREAM);
  assert.equal(r.activeMarker, "aads-dashboard-green");
  assert.equal(r.portMarker, "3101");
  assert.ok(ledgerSuccess(r));
});

// ---------------------------------------------------------------------------------------------
// One SHA, one image: verified images are only ever reused; no forced rebuild; unverifiable tags fail closed.
// ---------------------------------------------------------------------------------------------
for (const [name, opts] of [
  ["--rebuild", { args: ["--rebuild"] }],
  ["--force --rebuild", { args: ["--force", "--rebuild"] }],
  ["DEPLOY_REBUILD=1", { env: { DEPLOY_REBUILD: "1" } }],
  ["DEPLOY_FORCE=1 DEPLOY_REBUILD=1", { env: { DEPLOY_FORCE: "1", DEPLOY_REBUILD: "1" } }],
]) {
  test(`rebuild bypass rejected: ${name} -> no build, no compose, no nginx, no ledger success, verified image untouched`, () => {
    const r = runDeploy({ ...opts, setup: (c) => seedReleaseImage(c) });
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /rebuild/i);
    assert.equal(r.builds.length, 0);
    assert.equal(r.composeUps.length, 0);
    assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0);
    assert.ok(!ledgerSuccess(r));
    assert.equal(r.upstream, UPSTREAM);
  });
}

test("DEPLOY_REBUILD=0 / empty is not a rebuild request", () => {
  const r = runDeploy({ env: { DEPLOY_REBUILD: "0" }, setup: (c) => seedReleaseImage(c) });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.builds.length, 0);
});

test("--force with a verified same-SHA image reuses it: zero builds, candidate and standby --no-build", () => {
  const r = runDeploy({ args: ["--force"], setup: (c) => seedReleaseImage(c) });
  noShellErrors(r);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.builds.length, 0);
  assert.match(r.out, /검증된 release 이미지 재사용/);
  assert.ok(r.composeUps.every((x) => /--no-build/.test(x)));
});

for (const [name, setup] of [
  ["label of another commit", (c) => { c.put(`imgtag.aads-dashboard:${c.short}`, OTHER); c.put(`imglabel.aads-dashboard:${c.short}`, "f".repeat(40)); }],
  ["legacy image without any release label", (c) => c.put(`imgtag.aads-dashboard:${c.short}`, OTHER)],
  ["docker image inspect fails for a reason other than 'no such image'", (c) => { c.put("image.inspect.error", "1"); }],
]) {
  test(`existing same-SHA tag that cannot be verified fails closed (${name}): never rebuilt/overwritten`, () => {
    let tagFile;
    const r = runDeploy({
      args: ["--force"],
      setup: (c) => { setup(c); tagFile = path.join(c.fake, `imgtag.aads-dashboard:${c.short}`); },
    });
    noShellErrors(r);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /새로운 승인 SHA/);
    assert.equal(r.builds.length, 0, "must not build over an existing tag");
    assert.equal(r.composeUps.length, 0);
    assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0);
    assert.ok(!ledgerSuccess(r));
    assert.ok(ledgerFailed(r));
    assert.ok(tagFile);
  });
}

test("full run: build failure stops before any compose / nginx / success", () => {
  const r = runDeploy({ setup: (c) => c.put("build.fail", "1") });
  assert.notEqual(r.status, 0);
  noShellErrors(r);
  assert.equal(r.composeUps.length, 0);
  assert.equal(r.events.filter((e) => e.startsWith("nginx")).length, 0);
  assert.ok(!ledgerSuccess(r));
});

test("full run: routed health failure after the nginx reload rolls the route back, no marker, no success", () => {
  const r = runDeploy({ setup: (c) => c.put("wget.fail_url", "ext.test") });
  noShellErrors(r);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /routed\(외부\) 헬스체크 실패/);
  assert.match(r.out, /이전 nginx route 복구 완료/);
  assert.match(r.upstream, /server 127\.0\.0\.1:3100 max_fails=3 fail_timeout=30s;/, "previous route restored");
  assert.match(r.upstream, /server 127\.0\.0\.1:3101 max_fails=3 fail_timeout=30s backup;/);
  assert.equal(r.activeMarker, "", "no active-state marker written");
  assert.equal(r.events.filter((e) => e.startsWith("nginx -s reload")).length, 2, "reload for cutover and for rollback");
  assert.equal(r.composeUps.length, 1, "standby not touched after a failed cutover");
  assert.ok(!ledgerSuccess(r));
  assert.ok(ledgerFailed(r));
  assert.equal(r.provenance, "");
});

test("full run: the nginx lock is held only for the cutover window and is free during every compose/build/QA call", () => {
  const r = runDeploy();
  assert.equal(r.status, 0, r.out);
  const held = r.events.filter((e) => /lock=held/.test(e));
  assert.ok(held.length >= 1);
  assert.ok(held.every((e) => e.startsWith("nginx ")), `unexpected holders: ${held.join("\n")}`);
});

test("deploy.sh: every function is defined before its first top-level call (no forward references)", () => {
  const lines = deploySh.split("\n");
  const defs = new Map();
  let inFn = false;
  const topLevel = [];
  lines.forEach((l, i) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\(\) \{/.exec(l);
    if (m) {
      defs.set(m[1], i);
      inFn = true;
      return;
    }
    if (inFn) {
      if (l === "}") inFn = false;
      return;
    }
    if (!/^\s*#/.test(l)) topLevel.push([l, i]);
  });
  assert.ok(defs.size > 20);
  for (const [name, defAt] of defs) {
    const re = new RegExp(`(^|[\\s!(\`$|&;])${name}(\\s|$|;|\\)|"|\`)`);
    const first = topLevel.find(([l]) => re.test(l));
    if (first && !/^\s*trap /.test(first[0])) assert.ok(first[1] > defAt, `${name} first called at line ${first[1] + 1} but defined at line ${defAt + 1}`);
  }
  const initAt = lines.findIndex((l) => l === "NGINX_LOCK_HELD=false");
  const monitorAt = lines.findIndex((l) => /^if ! monitor_config; then/.test(l));
  const buildAt = lines.findIndex((l) => /^if ! ensure_release_image; then/.test(l));
  assert.ok(initAt >= 0 && initAt < lines.findIndex((l) => l.startsWith("cleanup_deploy() {")), "NGINX_LOCK_HELD initialised before any trap/cleanup");
  assert.ok(monitorAt >= 0 && monitorAt < buildAt, "monitor_config gate precedes the build");
});

test("bash -n deploy.sh", () => {
  execFileSync("bash", ["-n", path.join(root, "deploy.sh")]);
});
for (const failTool of ['git', 'tar']) {
 test(`review: ${failTool} archive/extraction failure must stop before docker build`, () => {
  const r=runDeploy({setup: c => {
   const body=failTool==='git'
    ? '#!/bin/bash\ncase " $* " in *" archive "*) echo injected-archive-failure >&2; exit 23;; esac\nexec /usr/bin/git "$@"\n'
    : '#!/bin/bash\necho injected-extraction-failure >&2\nexit 24\n';
   fs.writeFileSync(path.join(c.bin,failTool),body,{mode:0o755});
  }});
  console.log(JSON.stringify({failTool,status:r.status,builds:r.builds.length,compose:r.composeUps.length,success:ledgerSuccess(r),injected:/injected-/.test(r.out)}));
  assert.notEqual(r.status,0,'source preparation failure must stop release');
  assert.equal(r.builds.length,0,'must not build incomplete context');
  assert.ok(!ledgerSuccess(r));
 });
}

for (const failTool of ["install", "build"]) {
  test(`source preparation: ${failTool} nonzero must stop even with a residual image`, () => {
    const r = runDeploy({ setup: c => {
      if (failTool === "install") {
        fs.writeFileSync(path.join(c.state, ".env.local"), "PUBLIC_FIXTURE=1\n");
        fs.writeFileSync(path.join(c.bin, "install"), "#!/bin/bash\nexit 25\n", { mode: 0o755 });
      } else {
        const docker = path.join(c.bin, "docker");
        let fake = fs.readFileSync(docker, "utf8");
        fake = fake.replace('    exit 0 ;;\n  compose)', '    exit 26 ;;\n  compose)');
        fs.writeFileSync(docker, fake);
      }
    }});
    assert.notEqual(r.status, 0, r.out);
    assert.equal(r.composeUps.length, 0, r.out);
    if (failTool === "install") assert.equal(r.builds.length, 0, r.out);
    assert.ok(!ledgerSuccess(r), r.out);
  });
}
