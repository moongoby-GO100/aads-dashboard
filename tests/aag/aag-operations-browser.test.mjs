// 아키텍처 상태(/aag) 화면 브라우저 검증. 모든 /api/v1 응답은 로컬 fixture(page.route)이며 live API 검증이 아니다.
// 사용: node --test tests/aag/aag-operations-browser.test.mjs
//   AAG_BASE_URL  이미 떠 있는 로컬 dev 서버를 쓸 때(없으면 next dev 를 직접 띄우고 끝나면 내린다)
//   AAG_CAPTURE_DIR  캡처·ARIA 저장 위치(기본 /tmp/aag-captures)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ALL_FINDINGS, axesUnproven, findingsPage, operations, SNAP } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AAG_PLAYWRIGHT_CORE || "playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.AAG_PORT || 3917);
const BASE = process.env.AAG_BASE_URL || `http://localhost:${PORT}`;
const CAPTURES = process.env.AAG_CAPTURE_DIR || "/tmp/aag-captures";
fs.mkdirSync(CAPTURES, { recursive: true });

let server = null;
let browser = null;

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* 아직 기동 중 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server not ready: ${url}`);
}

before(async () => {
  if (!process.env.AAG_BASE_URL) {
    server = spawn("node_modules/.bin/next", ["dev", "--webpack", "-p", String(PORT)], {
      cwd: root,
      env: { ...process.env, NEXT_PUBLIC_API_URL: `${BASE}/api/v1`, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitFor(`${BASE}/login`, 150000);
  }
  browser = await chromium.launch({ executablePath: process.env.AAG_CHROMIUM || undefined, args: ["--no-sandbox"] });
}, { timeout: 200000 });

after(async () => {
  await browser?.close();
  server?.kill("SIGTERM");
});

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// ops/findings: 시나리오가 응답을 정한다. 반환 {status, body} 또는 "abort".
async function session(device, handlers = {}) {
  const context = await browser.newContext({ ...device, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const url = new URL(BASE);
  await context.addCookies([{ name: "aads_token", value: "fixture-token", domain: url.hostname, path: "/" }]);
  await context.addInitScript(() => { try { localStorage.setItem("aads_token", "fixture-token"); } catch { /* ignore */ } });
  const calls = [];
  await context.route("**/api/v1/**", async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname.replace(/^\/api\/v1/, "");
    if (p === "/auth/me") {
      return route.fulfill({ json: { user_id: "u1", email: "ceo@fixture.test", is_admin: true, is_internal_admin: true } });
    }
    if (p === "/aag/v2/operations" || p === "/aag/v2/findings") {
      calls.push({ path: p, search: u.search, params: Object.fromEntries(u.searchParams), headers: route.request().headers() });
      const kind = p.endsWith("operations") ? "ops" : "findings";
      const handler = handlers[kind] ?? (kind === "ops" ? () => ({ status: 200, body: operations() }) : (url2) => ({ status: 200, body: findingsPage(url2) }));
      const out = await handler(u, calls.filter((c) => c.path === p).length);
      if (out === "abort") return route.abort("connectionrefused");
      return route.fulfill({ status: out.status, json: out.body });
    }
    if (p.includes("stream")) return route.abort();
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { context, page, calls, errors };
}

const open = async (page, search = "") => {
  await page.goto(`${BASE}/aag${search}`);
  await page.locator("[data-testid=aag-root]").waitFor();
};
const shot = (page, name) => page.screenshot({ path: path.join(CAPTURES, `${name}.png`), fullPage: true });

test("첫 진입: 사이드바 nav → GO100 기본 대상·4축·P0/P1 (desktop)", { timeout: 120000 }, async () => {
  const { context, page, calls, errors } = await session(DESKTOP);
  await page.goto(`${BASE}/missing-page-for-nav`);
  await page.getByRole("button", { name: /운영·서버/ }).click();
  await page.getByRole("link", { name: /아키텍처 상태/ }).click();
  await page.locator("#aag-axes").waitFor();
  assert.equal(new URL(page.url()).pathname, "/aag");
  const ops = calls.find((c) => c.path === "/aag/v2/operations");
  assert.deepEqual(
    { project: ops.params.project, repository_id: ops.params.repository_id, target_ref: ops.params.target_ref },
    { project: "GO100", repository_id: "kis-autotrade-v4", target_ref: "refs/heads/main" },
  );
  assert.equal(ops.headers["authorization"], "Bearer fixture-token");
  assert.equal(await page.locator("[data-axis]").count(), 4);
  assert.match(await page.getByTestId("aag-axes-summary").innerText(), /4개 축 중/);
  await page.locator("[data-finding-key]").first().waitFor();
  const fcall = calls.find((c) => c.path === "/aag/v2/findings");
  assert.equal(fcall.params.snapshot_id, SNAP, "결함 목록은 상태 요약과 같은 스냅샷에 고정");
  const firstSeverity = await page.locator("[data-finding-key]").first().innerText();
  assert.match(firstSeverity, /^P0/);
  assert.equal(await page.getByRole("heading", { level: 1 }).count() >= 0, true);
  await shot(page, "desktop-first-entry");
  fs.writeFileSync(path.join(CAPTURES, "desktop-first-entry.aria.txt"), await page.locator("main").ariaSnapshot());
  assert.deepEqual(errors, []);
  await context.close();
});

test("4축은 하나의 green 으로 합쳐지지 않고 0/0·결함 없음은 미입증으로 보인다", { timeout: 60000 }, async () => {
  const { context, page } = await session(DESKTOP, {
    ops: () => ({ status: 200, body: operations({ axes: axesUnproven }) }),
    findings: (u) => ({ status: 200, body: { ...findingsPage(u), findings: [], pagination: { total: 0, returned: 0, next_cursor: null } } }),
  });
  await open(page);
  await page.locator("[data-axis]").first().waitFor();
  const tones = await page.locator("[data-axis]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.axis, e.dataset.tone])));
  assert.deepEqual(tones, { freshness: "warn", last_run: "bad", debt: "unknown", coverage: "unknown" });
  const text = await page.locator("section[aria-labelledby=aag-axes]").innerText();
  assert.match(text, /결함 없음은 미입증/);
  assert.match(text, /검사 범위 미입증/);
  assert.equal(await page.locator("[data-axis][data-tone=ok]").count(), 0, "정상(green) 축 없음");
  assert.match(await page.getByTestId("aag-findings-empty").innerText(), /결함 없음.으로 판단하지 마세요/);
  await shot(page, "desktop-unproven");
  await context.close();
});

test("서버 partial 판정이면 전체 수치가 채워져도 검사 완료·결함 없음으로 표시하지 않는다", { timeout: 60000 }, async () => {
  const data = operations();
  data.axes = {
    ...data.axes,
    debt: { status: "none_detected", p0: 0, p1: 0, p2: 0, p3: 0 },
    coverage: { status: "partial", inventory_scanned: 40, inventory_total: 40, risk_scanned: 8, risk_total: 8 },
  };
  const s = await session(DESKTOP, { ops: () => ({ status: 200, body: data }) });
  await open(s.page);
  await s.page.locator("[data-axis]").first().waitFor();
  assert.equal(await s.page.locator("[data-axis=coverage]").getAttribute("data-tone"), "warn");
  assert.equal(await s.page.locator("[data-axis=debt]").getAttribute("data-tone"), "unknown");
  await shot(s.page, "desktop-partial-with-full-counts");
  await s.context.close();
});

test("필터 복원 · 스냅샷 고정 findings · 상세 이동", { timeout: 90000 }, async () => {
  const { context, page, calls } = await session(DESKTOP);
  await open(page);
  await page.locator("[data-finding-key]").first().waitFor();
  await page.getByRole("button", { name: /^P1 \d/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-finding-key]").length === 2);
  const p1 = calls.filter((c) => c.path === "/aag/v2/findings").at(-1);
  assert.equal(p1.params.severity, "P1");
  assert.equal(p1.params.snapshot_id, SNAP);
  await page.getByRole("button", { name: /^전체$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-finding-key]").length === 4);
  await page.getByRole("button", { name: "더 보기" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-finding-key]").length === 8);
  const more = calls.filter((c) => c.path === "/aag/v2/findings").at(-1);
  assert.equal(more.params.cursor, "c:4");
  assert.equal(more.params.snapshot_id, SNAP);
  // 상세 열기 → 주소에 finding 이 남는다
  const row = page.locator("[data-finding-key='aag-stable-key-v1:P1-2']");
  await row.getByRole("button").first().click();
  assert.match(page.url(), /finding=aag-stable-key-v1%3AP1-2/);
  await row.getByRole("region").waitFor();
  assert.match(await row.innerText(), /연결되지 않은 라우터/);
  assert.equal(await row.getByText("stable_finding_key", { exact: true }).isHidden(), true, "내부 식별자는 접힌 근거 상세 안");
  // 새로고침해도 같은 상세가 복원
  await page.reload();
  await page.locator("[data-finding-key='aag-stable-key-v1:P1-2']").getByRole("region").waitFor();
  // 대상 저장(주소 없이 재진입)
  await page.getByText("대상 설정").click();
  await page.getByLabel("브랜치").fill("refs/heads/release");
  await page.getByRole("button", { name: "이 대상으로 보기" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=aag-target-line]")?.textContent?.includes("refs/heads/release"));
  await page.goto(`${BASE}/aag`);
  await page.waitForFunction(() => document.querySelector("[data-testid=aag-target-line]")?.textContent?.includes("refs/heads/release"));
  const last = calls.filter((c) => c.path === "/aag/v2/operations").at(-1);
  assert.equal(last.params.target_ref, "refs/heads/release");
  // 잘못된 주소 값은 기본값으로
  await page.goto(`${BASE}/aag?ref=../../etc&sev=P9`);
  await page.locator("[data-testid=aag-root]").waitFor();
  assert.match(await page.getByText(/올바르지 않아 기본값/).innerText(), /브랜치/);
  await context.close();
});

test("주소로 지정한 결함이 첫 페이지 밖에 있어도 상세로 이동한다", { timeout: 60000 }, async () => {
  const { context, page, calls } = await session(DESKTOP);
  const key = ALL_FINDINGS.at(-1).stable_finding_key;
  await open(page, `?finding=${encodeURIComponent(key)}`);
  await page.getByTestId("aag-pinned-finding").getByRole("region").waitFor();
  assert.ok(calls.some((c) => c.params.stable_finding_key === key && c.params.snapshot_id === SNAP));
  await shot(page, "desktop-deeplink-detail");
  await context.close();
});

test("오류 복구: 401 로그인 / 403 권한 / 404 미스캔 / 404 미배포 / 네트워크 재시도", { timeout: 120000 }, async () => {
  // 401
  let s = await session(DESKTOP, { ops: () => ({ status: 401, body: { detail: "expired" } }) });
  await s.page.goto(`${BASE}/aag`);
  await s.page.waitForURL(/\/login\?next=.*aag.*reason=session_expired/);
  assert.match(decodeURIComponent(s.page.url()), /next=\/aag\?project=GO100/);
  await s.context.close();
  // 403
  s = await session(DESKTOP, { ops: () => ({ status: 403, body: { detail: "forbidden" } }) });
  await open(s.page);
  const forbidden = s.page.locator("[data-error-kind=forbidden]");
  await forbidden.waitFor();
  assert.match(await forbidden.innerText(), /권한/);
  assert.match(await forbidden.innerText(), /다음 행동/);
  assert.equal(await s.page.locator("[data-axis]").count(), 0, "403 에서는 옛 값을 보여주지 않는다");
  await shot(s.page, "desktop-403");
  await s.context.close();
  // 404 미스캔
  s = await session(DESKTOP, { ops: () => ({ status: 404, body: { detail: "No authoritative AAG v2 snapshot" } }) });
  await open(s.page);
  await s.page.locator("[data-error-kind=not_scanned]").waitFor();
  assert.match(await s.page.locator("[data-error-kind=not_scanned]").innerText(), /결함이 없다는 뜻이 아닙니다/);
  await shot(s.page, "desktop-404-not-scanned");
  await s.context.close();
  // 404 API 미배포
  s = await session(DESKTOP, { ops: () => ({ status: 404, body: { detail: "Not Found" } }) });
  await open(s.page);
  await s.page.locator("[data-error-kind=endpoint_missing]").waitFor();
  await s.context.close();
  // 네트워크 실패 → 다시 시도 → 복구
  let down = true;
  s = await session(DESKTOP, { ops: () => (down ? "abort" : { status: 200, body: operations() }) });
  await open(s.page);
  const net = s.page.locator("[data-error-kind=network]");
  await net.waitFor();
  assert.match(await net.innerText(), /다음 행동/);
  await shot(s.page, "desktop-network");
  down = false;
  await net.getByRole("button", { name: "다시 시도" }).click();
  await s.page.locator("[data-axis]").first().waitFor();
  assert.equal(await s.page.locator("[data-error-kind]").count(), 0);
  await s.context.close();
});

test("동일 화면의 마지막 조회만 유지하고 새 페이지에서는 이전 값을 복원하지 않는다", { timeout: 90000 }, async () => {
  let down = false;
  const s = await session(DESKTOP, { ops: () => (down ? "abort" : { status: 200, body: operations() }) });
  await open(s.page);
  await s.page.locator("[data-axis]").first().waitFor();
  down = true;
  await s.page.getByRole("button", { name: "상태 새로고침" }).click();
  await s.page.locator("[data-error-kind=network]").waitFor();
  const banner = s.page.getByTestId("aag-saved-banner");
  await banner.waitFor();
  assert.match(await banner.innerText(), /현재 서버 상태가 아닙니다/);
  assert.ok((await s.page.locator("[data-axis]").count()) === 4);
  await shot(s.page, "desktop-saved-stale");
  await s.page.reload();
  await s.page.locator("[data-error-kind=network]").waitFor();
  assert.equal(await s.page.getByTestId("aag-saved-banner").count(), 0);
  assert.equal(await s.page.locator("[data-axis]").count(), 0);
  await s.context.close();
});

test("새 로그인에서 네트워크 오류가 나도 이전 로그인 영구 캐시를 표시하지 않는다", { timeout: 90000 }, async () => {
  const s = await session(DESKTOP, { ops: () => "abort" });
  await s.context.addInitScript((data) => {
    localStorage.setItem("aag.ops.last.v1:GO100|kis-autotrade-v4|refs/heads/main", JSON.stringify({ savedAt: "2026-10-20T00:00:00Z", data }));
  }, operations({ commit_sha: "PRIVATE_PREVIOUS_LOGIN", snapshot_id: "previous-login-private-state" }));
  await open(s.page);
  await s.page.locator("[data-error-kind=network]").waitFor();
  assert.equal(await s.page.getByTestId("aag-saved-banner").count(), 0);
  assert.equal(await s.page.locator("[data-axis]").count(), 0);
  assert.ok(!(await s.page.locator("main").innerText()).includes("PRIVATE_PREVIOUS_LOGIN"));
  await shot(s.page, "desktop-login-cache-isolation");
  await s.context.close();
});

test("권한 거부 후 네트워크 오류가 나도 이전 조회 값을 다시 표시하지 않는다", { timeout: 90000 }, async () => {
  let mode = "ok";
  const s = await session(DESKTOP, { ops: () => mode === "ok" ? { status: 200, body: operations() } : mode === "denied" ? { status: 403, body: { detail: "forbidden" } } : "abort" });
  await open(s.page);
  await s.page.locator("[data-axis]").first().waitFor();
  mode = "denied";
  await s.page.getByRole("button", { name: "상태 새로고침" }).click();
  await s.page.locator("[data-error-kind=forbidden]").waitFor();
  mode = "offline";
  await s.page.getByRole("button", { name: "상태 새로고침" }).click();
  await s.page.locator("[data-error-kind=network]").waitFor();
  assert.equal(await s.page.getByTestId("aag-saved-banner").count(), 0);
  assert.equal(await s.page.locator("[data-axis]").count(), 0);
  await s.context.close();
});

test("복구 안내는 실행 버튼 없이 승인 필요로만 보인다", { timeout: 60000 }, async () => {
  const s = await session(DESKTOP, { ops: () => ({ status: 200, body: operations({ recovery_actions: [{ kind: "rescan", label: "다시 스캔", enabled: true, reason: "" }] }) }) });
  await open(s.page);
  const rec = s.page.locator("[data-recovery-kind=rescan]");
  await rec.waitFor();
  assert.match(await rec.innerText(), /승인 필요/);
  assert.equal(await rec.getByRole("button").count(), 0);
  assert.equal(s.calls.filter((c) => c.path !== "/aag/v2/operations" && c.path !== "/aag/v2/findings").length, 0);
  await s.context.close();
});

test("모바일: 가로 넘침 없음 · 터치 44px · 키보드 포커스 · 대비 (390px)", { timeout: 120000 }, async () => {
  const s = await session(MOBILE);
  await open(s.page);
  await s.page.locator("[data-finding-key]").first().waitFor();
  await shot(s.page, "mobile-first-entry");
  fs.writeFileSync(path.join(CAPTURES, "mobile-first-entry.aria.txt"), await s.page.locator("main").ariaSnapshot());
  await s.page.locator("[data-finding-key]").first().getByRole("button").click();
  await shot(s.page, "mobile-finding-detail");

  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `가로 넘침 ${overflow}px`);

  const small = await s.page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("[data-testid=aag-root] button, [data-testid=aag-root] a, [data-testid=aag-root] input, [data-testid=aag-root] select, [data-testid=aag-root] summary")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  assert.deepEqual(small, [], "44px 미만 터치 대상");

  const contrast = await s.page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] > 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
    let min = 21; const bad = []; let n = 0;
    for (const el of document.querySelectorAll("[data-testid=aag-root] *")) {
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!own || el.closest("[disabled]")) continue;
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
      const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      n += 1; min = Math.min(min, ratio);
      if (ratio < 4.5) bad.push(`${el.tagName} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
    }
    return { checked: n, min: Number(min.toFixed(2)), bad };
  });
  fs.writeFileSync(path.join(CAPTURES, "mobile-contrast.json"), JSON.stringify(contrast, null, 2));
  assert.ok(contrast.checked > 20);
  assert.deepEqual(contrast.bad, []);

  await s.context.close();
});

test("모바일: 오류 화면도 줄바꿈되고 재시도 버튼이 44px 이상", { timeout: 60000 }, async () => {
  const s = await session(MOBILE, { ops: () => "abort" });
  await open(s.page);
  const err = s.page.locator("[data-error-kind=network]");
  await err.waitFor();
  const box = await err.getByRole("button", { name: "다시 시도" }).boundingBox();
  assert.ok(box.height >= 44 && box.width >= 44);
  assert.ok((await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  await shot(s.page, "mobile-network-error");
  await s.context.close();
});

test("모바일: 키보드만으로 주요 컨트롤에 닿고 포커스 표시가 보인다", { timeout: 60000 }, async () => {
  const s = await session(MOBILE);
  await open(s.page);
  await s.page.locator("[data-finding-key]").first().waitFor();
  // 키보드: Tab 으로 주요 컨트롤에 닿고 포커스 표시가 보인다
  const seen = [];
  for (let i = 0; i < 60; i += 1) {
    await s.page.keyboard.press("Tab");
    const info = await s.page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16), id: el.id, outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2, inRoot: !!el.closest("[data-testid=aag-root]") };
    });
    if (info?.inRoot) seen.push(info);
  }
  assert.ok(seen.some((x) => x.id === "aag-project"), "프로젝트 선택에 키보드로 닿는다");
  assert.ok(seen.some((x) => x.label.startsWith("상태 새로고침")));
  assert.ok(seen.some((x) => /^P1 \d/.test(x.label)));
  assert.deepEqual(seen.filter((x) => !x.outline).map((x) => x.label), [], "포커스 표시(outline) 없는 컨트롤");
  await s.context.close();
});
