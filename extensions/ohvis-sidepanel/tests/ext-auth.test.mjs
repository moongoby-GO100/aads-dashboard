import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sendAuthToFrame, AUTH_MESSAGE_TYPE } from "../lib/auth-bridge.js";
import { BASE_URL, EXT_AUTH_URL } from "../lib/api.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_PATH = join(ROOT, "..", "..", "public", "ext-auth.html");
const html = readFileSync(HTML_PATH, "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";

function loadCore() {
  const m = html.match(/\/\/ ext-auth-core:begin[^\n]*\n([\s\S]*?)\/\/ ext-auth-core:end/);
  assert.ok(m, "core block markers");
  return new Function(`${m[1]}; return { ALLOWED_ORIGINS, isJwtShape, acceptAuthMessage, buildPartitionedCookie };`)();
}

function extensionIdFromKey(key) {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const EXT_ORIGIN = `chrome-extension://${extensionIdFromKey(manifest.key)}`;

test("(a) postMessage 의 targetOrigin 은 https://aads.newtalk.kr 로 고정", async () => {
  const calls = [];
  const frameWindow = { postMessage: (...args) => calls.push(args) };
  assert.equal(await sendAuthToFrame({ frameWindow, getToken: async () => JWT }), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], { type: AUTH_MESSAGE_TYPE, token: JWT });
  assert.equal(calls[0][1], "https://aads.newtalk.kr");
  assert.equal(BASE_URL, "https://aads.newtalk.kr");
});

test("(b) 토큰이 없으면 전송하지 않는다", async () => {
  for (const empty of ["", null, undefined]) {
    const calls = [];
    const frameWindow = { postMessage: (...args) => calls.push(args) };
    assert.equal(await sendAuthToFrame({ frameWindow, getToken: async () => empty }), false);
    assert.equal(calls.length, 0);
  }
  assert.equal(await sendAuthToFrame({ frameWindow: null, getToken: async () => JWT }), false);
});

test("sidepanel.js: iframe 은 ext-auth.html 로 열고 '*' targetOrigin 을 쓰지 않는다", () => {
  const src = readFileSync(join(ROOT, "sidepanel.js"), "utf8");
  assert.equal(EXT_AUTH_URL, "https://aads.newtalk.kr/ext-auth.html");
  assert.match(src, /src:\s*PANEL_FRAME_URL/);
  assert.doesNotMatch(src, /src:\s*CHAT_URL/);
  assert.doesNotMatch(src, /postMessage\([^)]*["']\*["']/);
  assert.match(src, /state\.authFailed/);
  const bridge = readFileSync(join(ROOT, "lib", "auth-bridge.js"), "utf8");
  assert.doesNotMatch(bridge, /["']\*["']/);
  assert.doesNotMatch(bridge, /console\./);
});

test("manifest key 로 계산한 확장 ID 가 ext-auth.html 허용 origin 과 일치", () => {
  const core = loadCore();
  assert.deepEqual(core.ALLOWED_ORIGINS, [EXT_ORIGIN]);
  assert.match(EXT_ORIGIN, /^chrome-extension:\/\/[a-p]{32}$/);
});

test("(c) 허용된 확장 origin 의 올바른 메시지만 수락", () => {
  const core = loadCore();
  assert.equal(core.acceptAuthMessage(EXT_ORIGIN, { type: "ohvis-auth", token: JWT }), JWT);
});

test("(d) JWT 형식이 아닌 토큰은 거부", () => {
  const core = loadCore();
  for (const bad of ["", "abc", "a.b", "a.b.c.d", "a..c", "a.b.c d", "<script>.b.c", `${"a".repeat(5000)}.b.c`, 123, null, undefined, {}, ["a", "b", "c"]]) {
    assert.equal(core.acceptAuthMessage(EXT_ORIGIN, { type: "ohvis-auth", token: bad }), null, String(bad).slice(0, 20));
  }
  assert.equal(core.isJwtShape(JWT), true);
});

test("(e) 다른 origin·형식 오류 메시지는 무시", () => {
  const core = loadCore();
  const msg = { type: "ohvis-auth", token: JWT };
  for (const origin of [
    "https://aads.newtalk.kr", "https://evil.example", "null", "", undefined,
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", `${EXT_ORIGIN}.evil`, `${EXT_ORIGIN}/`, EXT_ORIGIN.toUpperCase(),
  ]) {
    assert.equal(core.acceptAuthMessage(origin, msg), null, String(origin));
  }
  for (const data of [null, undefined, "str", 5, {}, { token: JWT }, { type: "other", token: JWT }]) {
    assert.equal(core.acceptAuthMessage(EXT_ORIGIN, data), null);
  }
});

test("쿠키는 Secure; SameSite=None; Partitioned 로 설정", () => {
  const core = loadCore();
  assert.equal(core.buildPartitionedCookie(JWT), `aads_token=${JWT}; path=/; max-age=604800; Secure; SameSite=None; Partitioned`);
});

test("ext-auth.html: 5초 대기 후 로그인 링크, 토큰 로그·URL 노출 없음", () => {
  assert.match(html, /setTimeout\([\s\S]*?,\s*5000\)/);
  assert.match(html, /href="\/login"[^>]*target="_blank"/);
  assert.match(html, /window\.parent !== window/);
  assert.match(html, /event\.source !== window\.parent/);
  assert.match(html, /location\.replace\("\/chat"\)/);
  assert.doesNotMatch(html, /console\./);
  assert.doesNotMatch(html, /location\.(search|hash)/);
});
