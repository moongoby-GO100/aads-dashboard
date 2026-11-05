"""실제 /chat Next 라우트(dev 서버)에서 수정요청 → 새 판본 → 재승인 전 과정을 엄격 모의 API 로 검증한다.

- 하네스 페이지 없음: 브라우저는 dev 서버의 실제 /chat 을 연다.  (실제 백엔드 실연동은 M9 로 이관, 미검증)
- 모의 API: strict_mock.StrictMock (aads-server 목업 검토 라우트와 같은 메서드·경로·본문·오류코드).
- 네트워크 가드: 컨텍스트 route('**/*') 가 dev 출처와 모의 API 출처만 통과시키고, 나머지는 전송 전에 abort 하며 센다.
  service_workers='block'. 예상 밖 non-GET 은 즉시 실패(페이지를 닫는다).

실행(승인된 dev 서버가 NEXT_PUBLIC_API_URL=http://aads-mock.test/api/v1 로 떠 있어야 한다):
  M7_DEV_ORIGIN=http://127.0.0.1:3187 PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright \
    python3 -m pytest tests/browser/mockup-chat/test_real_chat.py -q
증거(스크린샷·네트워크 로그)는 /tmp/m7-evidence 에 쓰며 커밋하지 않는다.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.async_api import Page, async_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parent))
import strict_mock as sm  # noqa: E402

DEV = os.environ.get("M7_DEV_ORIGIN", "http://127.0.0.1:3187").rstrip("/")
MOCK = "http://aads-mock.test"
EVIDENCE = Path(os.environ.get("M7_EVIDENCE_DIR", "/tmp/m7-evidence"))
VIEWPORTS = {"desktop": (1440, 1000), "mobile": (390, 844)}
ALLOWED_WRITES = (
    ("POST", re.compile(r"^/api/v1/chat/messages/send$")),
    ("POST", re.compile(rf"^/api/v1/projects/{sm.PROJECT}/mockup-reviews/change-intake$")),
    ("POST", re.compile(rf"^/api/v1/projects/{sm.PROJECT}/mockup-reviews/[0-9a-f-]{{36}}/approve$")),
)
SCENES: list[dict] = []   # 증거 목록(스크린샷)


# --------------------------------------------------------------------------- guard
# Next dev 서버가 콘솔 오류 스택을 해석하려고 같은 출처로 보내는 도구 요청. 앱 API 가 아니며 서버 상태를 바꾸지 않는다.
# 이 요청을 부른 콘솔 오류가 알려진 것(`ai-streaming-<sid>` 중복 키, 제품 기존 동작)이 아니면 check() 가 실패시킨다.
DEV_TOOLING_PATH = "/__nextjs_original-stack-frames"
KNOWN_CONSOLE_ERRORS = (
    re.compile(r"Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed"),
    re.compile(r"Encountered two children with the same key.*ai-streaming-"),
    re.compile(r"Failed to load resource: net::ERR_(FAILED|CONNECTION_RESET)"),
    re.compile(r"Failed to load resource: the server responded with a status of (409|503)"),
)


class Guard:
    def __init__(self) -> None:
        self.aborted: list[dict] = []        # 전송 전에 막은 외부 요청
        self.reached_external: list[str] = []  # 외부 출처에서 응답이 돌아온 요청(0 이어야 한다)
        self.fatal: list[str] = []
        self.dev_tooling: list[str] = []
        self.netlog: list[dict] = []
        self.preflights = 0
        self.ws_blocked: list[str] = []
        self.page: Page | None = None

    def allowed_write(self, method: str, path: str) -> bool:
        return any(m == method and rx.match(path) for m, rx in ALLOWED_WRITES)


def cors(extra: dict | None = None) -> dict:
    return {"access-control-allow-origin": DEV, "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-credentials": "true",
            "access-control-expose-headers": "*", **(extra or {})}


class Env:
    def __init__(self, name: str, vp: str, playwright) -> None:
        self.name, self.vp, self.pw = name, vp, playwright
        self.mock = sm.StrictMock()
        self.guard = Guard()
        self.n = 0
        self.page: Page = None  # type: ignore[assignment]
        self.errors: list[str] = []
        self.sandbox_noise = 0
        self.console: list[str] = []

    async def start(self, hash_: str | None = sm.SID_A, query: str = "") -> None:
        self.browser = await self.pw.chromium.launch(headless=True, args=["--no-sandbox"])
        w, h = VIEWPORTS[self.vp]
        self.ctx = await self.browser.new_context(viewport={"width": w, "height": h}, service_workers="block",
                                                  locale="ko-KR")
        await self.ctx.add_cookies([{"name": "aads_token", "value": "fixture-token", "url": DEV}])
        await self.ctx.add_init_script(
            "try { if (window === window.top) localStorage.setItem('aads_token','fixture-token'); } catch (e) {}")
        await self.ctx.route("**/*", self.on_route)
        await self.ctx.route_web_socket("**/*", self.on_ws)
        self.ctx.on("response", self.on_response)
        self.page = await self.ctx.new_page()
        self.guard.page = self.page
        self.page.on("pageerror", self.on_pageerror)
        self.page.on("console", lambda m: self.console.append(f"{m.type}: {m.text[:300]}") if m.type in ("error", "warning") else None)
        await self.goto(hash_, query)

    def on_pageerror(self, error) -> None:
        # service_workers='block' 이 Playwright 주입 스크립트로 구현되는데, 그 스크립트가 sandbox="" 프레임에서
        # navigator.serviceWorker 를 읽다 SecurityError 를 낸다(service_workers='allow' 면 사라짐). 제품 코드 오류가 아니다.
        text = str(error)
        if "serviceWorker" in text and "context is sandboxed" in text and "<anonymous>" in str(getattr(error, "stack", "")):
            self.sandbox_noise += 1
            return
        self.errors.append(text + " | " + str(getattr(error, "stack", ""))[:400])

    async def goto(self, hash_: str | None = sm.SID_A, query: str = "") -> None:
        url = f"{DEV}/chat{query}" + (f"#{hash_}" if hash_ else "")
        await self.page.goto(url, wait_until="domcontentloaded", timeout=120_000)
        await self.page.locator("textarea").first.wait_for(timeout=60_000)

    async def stop(self) -> None:
        try:
            EVIDENCE.mkdir(parents=True, exist_ok=True)
            log = EVIDENCE / f"{self.name}-{self.vp}.network.json"
            log.write_text(json.dumps({
                "scenario": self.name, "viewport": self.vp, "dev_origin": DEV, "mock_origin": MOCK,
                "external_requests_aborted_before_send": len(self.guard.aborted),
                "external_requests_actually_sent": len(self.guard.reached_external),
                "websockets_blocked": self.guard.ws_blocked, "cors_preflights_answered": self.guard.preflights,
                "unexpected_writes": self.guard.fatal, "dev_tooling_posts": self.guard.dev_tooling, "mock_violations": self.mock.violations,
                "unmocked_gets": self.mock.unmocked_gets, "page_errors": self.errors, "console_errors": self.console, "playwright_sw_block_sandbox_noise": self.sandbox_noise,
                "aborted_urls": self.guard.aborted, "writes": self.mock.writes, "failed_write_attempts": self.mock.failed_writes, "requests": self.guard.netlog,
            }, ensure_ascii=False, indent=1, default=str))
            SCENES.append({"scenario": self.name, "viewport": self.vp, "kind": "network-log", "path": str(log),
                           "sha256": hashlib.sha256(log.read_bytes()).hexdigest(),
                           "aborted_external": len(self.guard.aborted), "sent_external": len(self.guard.reached_external),
                           "writes": [f"{w['method']} {w['path'].split('/api/v1')[-1]} -> {w.get('status')}" for w in self.mock.writes]})
        finally:
            try:
                await self.ctx.unroute_all(behavior="ignoreErrors")
            except Exception:
                pass
            await self.browser.close()

    # ---- routing -----------------------------------------------------------------
    async def on_route(self, route) -> None:
        req = route.request
        sp = urlsplit(req.url)
        origin = f"{sp.scheme}://{sp.netloc}"
        method = req.method
        entry = {"method": method, "url": req.url, "type": req.resource_type}
        self.guard.netlog.append(entry)
        if origin == MOCK or (origin == DEV and sp.path.startswith("/api/")):
            if method == "OPTIONS":
                self.guard.preflights += 1
                entry["disposition"] = "preflight"
                return await route.fulfill(status=204, headers=cors())
            if method not in ("GET", "HEAD") and not self.guard.allowed_write(method, sp.path):
                entry["disposition"] = "FATAL-unexpected-write"
                self.guard.fatal.append(f"{method} {req.url}")
                await route.abort()
                asyncio.create_task(self.page.close())
                return
            entry["disposition"] = "mock"
            res = await self.mock.handle(method, req.url, await req.all_headers(), req.post_data_buffer)
            if res.get("abort"):
                entry["status"] = "aborted-by-mock"
                return await route.abort("connectionreset")
            entry["status"] = res["status"]
            return await route.fulfill(status=res["status"], headers=cors({"content-type": res["content_type"]}), body=res["body"])
        if origin == DEV:
            if method == "POST" and sp.path == DEV_TOOLING_PATH:
                entry["disposition"] = "dev-tooling-symbolication"
                self.guard.dev_tooling.append(req.url)
                return await route.continue_()
            if method not in ("GET", "HEAD"):
                entry["disposition"] = "FATAL-unexpected-dev-write"
                self.guard.fatal.append(f"{method} {req.url}")
                await route.abort()
                asyncio.create_task(self.page.close())
                return
            entry["disposition"] = "dev"
            return await route.continue_()
        if sp.scheme in ("data", "blob", "about"):
            entry["disposition"] = "inline"
            return await route.continue_()
        entry["disposition"] = "ABORTED-external"
        self.guard.aborted.append({"method": method, "url": req.url[:200]})
        await route.abort("blockedbyclient")

    async def on_ws(self, ws) -> None:
        sp = urlsplit(ws.url)
        if f"{'wss' if sp.scheme == 'wss' else 'ws'}://{sp.netloc}".replace("ws://", "http://") == DEV:
            ws.connect_to_server()      # Next dev HMR(같은 출처)
            return
        self.guard.ws_blocked.append(ws.url)
        await ws.close()

    def on_response(self, resp) -> None:
        sp = urlsplit(resp.url)
        origin = f"{sp.scheme}://{sp.netloc}"
        if origin not in (DEV, MOCK) and sp.scheme in ("http", "https"):
            self.guard.reached_external.append(resp.url)

    # ---- helpers -----------------------------------------------------------------
    def check(self) -> None:
        assert not self.guard.fatal, f"예상 밖 쓰기 요청: {self.guard.fatal}"
        assert not self.mock.violations, f"모의 서버 계약 위반: {self.mock.violations}"
        unknown = [c for c in self.console if c.startswith("error:") and not any(rx.search(c) for rx in KNOWN_CONSOLE_ERRORS)]
        assert not unknown, f"알 수 없는 콘솔 오류: {unknown}"

    async def shot(self, label: str) -> str:
        self.check()
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        self.n += 1
        path = EVIDENCE / f"{self.name}-{self.vp}-{self.n:02d}-{label}.png"
        await self.page.screenshot(path=str(path))
        SCENES.append({"scenario": self.name, "viewport": self.vp, "kind": "screenshot", "label": label, "path": str(path),
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        return str(path)

    async def until(self, cond, what: str, timeout: float = 15.0) -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.check()
            if cond():
                return
            await asyncio.sleep(0.05)
        raise AssertionError(f"시간 초과: {what}")

    def writes(self, suffix: str) -> list[dict]:
        return [w for w in self.mock.writes if w["path"].endswith(suffix)]

    # ---- 화면 요소 ---------------------------------------------------------------
    def msg(self, mid: str):
        return self.page.locator(f'[data-message-id="{mid}"]')

    @property
    def panel(self):
        return self.page.locator('aside[aria-label="목업 검토"]')

    @property
    def composer(self):
        return self.page.locator("textarea").first

    async def open_card(self, mid: str) -> None:
        card = self.msg(mid)
        await card.scroll_into_view_if_needed()
        await card.get_by_role("button", name=re.compile("우측 패널에서 보기")).first.click()
        await expect(self.panel).to_have_count(1, timeout=15_000)
        await expect(self.panel).to_be_visible()

    async def type_and_send(self, text: str) -> None:
        await self.composer.fill(text)
        await self.composer.press("Enter")

    async def switch_session(self, sid: str) -> None:
        title = {sm.SID_A: "목업 검토 대화 A", sm.SID_B: "목업 검토 대화 B"}[sid]
        item = self.page.get_by_text(title, exact=True).first
        if (self.page.viewport_size or {}).get("width", 1440) <= 640:
            await self.page.get_by_role("button", name="☰").first.click()
        await item.click()


MSG_A_CARD1 = sm.det_uuid("m", "a", 2)
MSG_A_CARD2 = sm.det_uuid("m", "a", 3)
MSG_B_CARD = sm.det_uuid("m", "b", 2)


def pending_req(env: Env, label: str):
    return env.page.get_by_text(label)


# --------------------------------------------------------------------- 4a
async def s4a(env: Env) -> None:
    """카드 → 같은 아티팩트 패널 → 이전/이번 비교 + 고정 판본 문서 열람 (+ sandbox/CSP 보존)."""
    await env.start()
    m = env.mock
    await env.open_card(MSG_A_CARD1)
    panel = env.panel
    await expect(panel).to_contain_text("로그인 화면 목업")
    await expect(panel).to_contain_text("판본 v2 (최신)")
    assert await panel.get_attribute("data-embedded") == "1" or env.vp == "mobile", "카드는 같은 아티팩트 패널 안에서 열려야 한다"
    assert env.page.url.endswith(f"#{sm.SID_A}") or sm.SID_A in env.page.url
    await env.shot("card-opened-panel")

    await panel.get_by_role("button", name="이전 판(v1)과 비교").click()
    await expect(panel.get_by_text("이전 v1")).to_be_visible()
    await expect(panel.get_by_text("이번 v2")).to_be_visible()
    imgs = panel.locator("section[aria-label='이전 판 비교'] img")
    await env.until(lambda: True, "noop")
    await expect(imgs).to_have_count(2, timeout=15_000)
    for i in range(2):
        await env.page.wait_for_function("el => el.complete && el.naturalWidth > 0", arg=await imgs.nth(i).element_handle(), timeout=10_000)
    rev1, rev2 = m.heads[sm.REVIEW_1].revisions
    fetched = {(e["path"].split("/revisions/")[1].split("/")[0]) for e in m.log if "/assets/" in e["path"]}
    assert {rev1.id, rev2.id} <= fetched, "비교는 두 판본의 자산을 각각 불러와야 한다"
    await env.shot("compare-v1-v2")

    await panel.locator("summary", has_text="수정 문서·변경 이력").click()
    await panel.get_by_role("button", name="고정 판본 열람").click()
    pinned = panel.locator(f"section[aria-label='{sm.DOC_KEY} 고정 판본']")
    await expect(pinned).to_contain_text("PINNED-R2", timeout=15_000)
    await expect(pinned).not_to_contain_text("LATEST-R4")
    reads = [r for r in m.doc_reads]
    assert reads and all(r["revision_query"] == "2" and r["served"] == 2 for r in reads), reads
    assert all(r["revision_query"] is not None for r in reads), "최신 본문(무 revision)을 읽으면 안 된다"
    hist = [e for e in m.log if e["path"].endswith("/history")]
    assert hist, "고정 판본은 history 로 revision 번호를 찾아야 한다"
    await env.shot("pinned-doc-r2")

    # 목업이 아닌 html_preview: sandbox/CSP 보존
    await env.page.evaluate("() => { document.documentElement.dataset.m7 = '1'; }")
    sandbox = await _open_html_preview(env)
    attr = await sandbox.get_attribute("sandbox")
    assert attr == "", f"sandbox 속성은 빈 값(모든 권한 제거)이어야 한다: {attr!r}"
    srcdoc = await sandbox.get_attribute("srcdoc")
    for needle in ("default-src 'none'", "script-src 'none'", "connect-src 'none'"):
        assert needle in srcdoc, f"CSP 누락: {needle}"
    assert "http-equiv=\"Content-Security-Policy\"" in srcdoc or "http-equiv='Content-Security-Policy'" in srcdoc
    frame = next(f for f in env.page.frames if f != env.page.main_frame)
    assert await frame.evaluate("() => typeof window.__leak") == "undefined", "스크립트가 실행되면 안 된다"
    assert await env.page.locator("iframe button").count() == 0
    assert any("Blocked script execution in 'about:srcdoc'" in c for c in env.console), "브라우저가 샌드박스 안의 스크립트를 실제로 막았어야 한다"
    await env.shot("html-preview-sandbox")
    assert not m.writes, f"4a 는 쓰기 요청이 없어야 한다: {m.writes}"


async def _open_html_preview(env: Env):
    """아티팩트 패널에서 html_preview 아티팩트를 연다."""
    page = env.page
    if env.vp == "mobile":
        pass
    tab = page.get_by_role("button", name=re.compile("HTML|미리보기"))
    if await tab.count():
        await tab.first.click()
    await page.get_by_text("정적 HTML 미리보기").first.click()
    iframe = page.locator("iframe[sandbox]")
    await expect(iframe.first).to_be_visible(timeout=15_000)
    return iframe.first



INTAKE_KEYS = {"idempotency_key", "expected_generation", "change_request_id", "session_id", "source_message_id", "comment",
               "review_id", "artifact_id", "reply_to_id", "screen_id"}
APPROVE_KEYS = {"revision_id", "manifest_hash", "expected_generation", "confirm", "idempotency_key"}
UUID_RX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def assert_intake_body(env: Env, body: dict, *, review_id: str, session_id: str, comment: str, artifact_id: str | None,
                       reply_to_id: str | None, expected_generation: int, screen_id: str | None = None) -> None:
    """change-intake 본문: 서버 ChangeIntake 모델 그대로(base_revision_id 없음 — 서버가 최신 판에서 정한다)."""
    assert set(body) == INTAKE_KEYS, f"본문 키 불일치: {sorted(set(body) ^ INTAKE_KEYS)}"
    assert "base_revision_id" not in body
    assert body["review_id"] == review_id and body["session_id"] == session_id
    assert body["comment"] == comment.strip()
    assert body["artifact_id"] == artifact_id and body["reply_to_id"] == reply_to_id and body["screen_id"] == screen_id
    assert body["expected_generation"] == expected_generation, (body["expected_generation"], expected_generation)
    for key in ("change_request_id", "source_message_id", "session_id", "review_id"):
        assert UUID_RX.match(body[key]), (key, body[key])
    assert re.fullmatch(r"[A-Za-z0-9._:-]{8,64}", body["idempotency_key"])
    saved = [m for m in env.mock.messages[session_id] if m["id"] == body["source_message_id"]]
    assert len(saved) == 1 and saved[0]["role"] == "user" and saved[0]["content"].strip() == comment.strip(), \
        "source_message_id 는 서버에 저장된 내 메시지여야 한다"


def assert_approve_body(body: dict, *, revision, expected_generation: int) -> None:
    """승인 본문: 판본 id, 매니페스트의 실제 sha256(64 소문자 hex), expected_generation, confirm=true, 멱등 키."""
    assert set(body) == APPROVE_KEYS, f"본문 키 불일치: {sorted(set(body) ^ APPROVE_KEYS)}"
    assert body["revision_id"] == revision.id
    assert re.fullmatch(r"[0-9a-f]{64}", body["manifest_hash"])
    independent = hashlib.sha256(json.dumps(revision.manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    assert body["manifest_hash"] == independent, "manifest_hash 는 매니페스트의 실제 sha256 이어야 한다"
    assert body["expected_generation"] == expected_generation and body["confirm"] is True
    assert re.fullmatch(r"[A-Za-z0-9._:-]{8,64}", body["idempotency_key"])


def user_message(env: Env, sid: str, text: str) -> dict:
    rows = [m for m in env.mock.messages[sid] if m["role"] == "user" and m["content"].strip() == text.strip()]
    assert len(rows) == 1, f"저장된 사용자 메시지가 정확히 1건이어야 한다: {rows}"
    return rows[0]


async def reply_to(env: Env, mid: str) -> None:
    card = env.msg(mid)
    await card.scroll_into_view_if_needed()
    await card.locator('button[title="이 응답에 답글"]').first.click()


def target_region(env: Env):
    return env.page.get_by_role("region", name="목업 수정 요청 대상")


async def arm_from_panel(env: Env, review_title: str) -> None:
    """패널 하단 [수정 요청] → [입력창에 수정 요청 쓰기] (신뢰 UI, iframe 밖)."""
    await env.panel.get_by_role("button", name="수정 요청", exact=True).click()
    await env.panel.get_by_role("button", name="입력창에 수정 요청 쓰기").click()
    await expect(target_region(env)).to_contain_text(f"{review_title} 수정 요청 모드", timeout=10_000)


async def wait_write(env: Env, suffix: str, count: int = 1, *, status=None) -> list[dict]:
    def done() -> bool:
        rows = env.writes(suffix)
        return len(rows) >= count and all("status" in r for r in rows[:count]) and (status is None or rows[count - 1]["status"] == status)
    await env.until(done, f"{suffix} 쓰기 {count}건 (status={status})", 20)
    return env.writes(suffix)


async def panel_ready(env: Env) -> None:
    """패널이 보이는 상태로 만든다(모바일은 시트가 닫혀 있으면 카드로 다시 연다)."""
    if not (await env.panel.count() and await env.panel.first.is_visible()):
        await env.open_card(MSG_A_CARD1)
    await expect(env.panel).to_be_visible()


# --------------------------------------------------------------------- 4b
async def s4b(env: Env) -> None:
    """답장/선택으로 대상 고정, 후보가 여럿일 때 사용자가 고른 대상만 접수."""
    await env.start()
    m = env.mock
    # 후보 2건: 자동으로 고르지 않고 사용자가 고르게 한다.
    await expect(target_region(env)).to_contain_text("목업 수정 요청 (대상 2건 중 선택)", timeout=20_000)
    await expect(target_region(env)).not_to_contain_text("수정 요청 모드")
    await env.shot("two-candidates-no-auto-pick")

    # 일반 대화는 접수하지 않는다.
    await env.type_and_send("그냥 질문입니다. 접수하지 마세요")
    await wait_write(env, "/chat/messages/send")
    await env.page.wait_for_timeout(500)
    assert not env.writes("/change-intake"), "수정 요청 모드가 아니면 change-intake 를 보내면 안 된다"

    # 결제 카드에 답글 → 대상이 결제 목업으로 고정되고, 다른 목업을 장전하면 되묻는다.
    await reply_to(env, MSG_A_CARD2)
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    region = target_region(env)
    await expect(region).to_contain_text("수정 요청 대상이 둘 이상입니다", timeout=15_000)
    await expect(region.get_by_role("button", name="결제 화면 목업")).to_be_visible()
    await env.shot("reply-vs-panel-ambiguous")
    await region.get_by_role("button", name="결제 화면 목업").click()
    await expect(region).to_contain_text("결제 화면 목업 수정 요청 모드")
    gen = m.heads[sm.REVIEW_2].generation
    await env.type_and_send("결제 버튼 색을 더 진하게")
    rows = await wait_write(env, "/change-intake", 1, status=200)
    assert_intake_body(env, rows[0]["body"], review_id=sm.REVIEW_2, session_id=sm.SID_A, comment="결제 버튼 색을 더 진하게",
                       artifact_id=sm.ART_2, reply_to_id=MSG_A_CARD2, expected_generation=gen)
    assert rows[0]["response"]["base_revision_id"] == m.heads[sm.REVIEW_2].latest, "기준 판은 서버가 최신 판으로 정한다"
    assert m.heads[sm.REVIEW_1].generation == 6 and not m.heads[sm.REVIEW_1].changes, "고르지 않은 목업은 건드리지 않는다"
    await expect(region).to_contain_text("수정 요청이 접수되었습니다", timeout=10_000)
    await env.shot("reply-pinned-intake-registered")

    # 답글 없이 후보에서 직접 선택(새 화면).
    await env.goto(sm.SID_A)
    region = target_region(env)
    await region.get_by_role("button", name=re.compile("목업 수정 요청")).click()
    await region.get_by_role("button", name="로그인 화면 목업", exact=True).click()
    await expect(region).to_contain_text("로그인 화면 목업 수정 요청 모드")
    gen = m.heads[sm.REVIEW_1].generation
    await env.type_and_send("로그인 입력칸 간격을 넓혀 주세요")
    rows = await wait_write(env, "/change-intake", 2, status=200)
    assert_intake_body(env, rows[1]["body"], review_id=sm.REVIEW_1, session_id=sm.SID_A, comment="로그인 입력칸 간격을 넓혀 주세요",
                       artifact_id=sm.ART_1, reply_to_id=None, expected_generation=gen)
    assert len(m.heads[sm.REVIEW_1].changes) == 1 and len(m.heads[sm.REVIEW_2].changes) == 1
    await env.shot("picked-candidate-intake-registered")


async def open_card_and_arm(env: Env, mid: str, title: str) -> None:
    await env.open_card(mid)
    await arm_from_panel(env, title)


# --------------------------------------------------------------------- 4c
async def s4c(env: Env) -> None:
    """수정요청 입력 → change-intake → 새 불변 판본 v(n+1) → 패널 표시 → 신뢰 UI 재승인 → approved."""
    await env.start()
    m = env.mock
    head = m.heads[sm.REVIEW_1]
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    gen0, v2 = head.generation, head.revisions[-1]
    assert len(head.revisions) == 2 and head.status == "review_ready"
    await env.shot("armed-change-request")
    text = "로그인 버튼을 파란색으로 바꿔 주세요"
    await env.type_and_send(text)
    rows = await wait_write(env, "/change-intake", 1, status=200)
    assert [w["path"].split("/api/v1")[-1] for w in m.writes][:2] == ["/chat/messages/send", f"/projects/{sm.PROJECT}/mockup-reviews/change-intake"]
    assert_intake_body(env, rows[0]["body"], review_id=sm.REVIEW_1, session_id=sm.SID_A, comment=text,
                       artifact_id=sm.ART_1, reply_to_id=None, expected_generation=gen0)
    resp = rows[0]["response"]
    assert resp["base_revision_id"] == v2.id and resp["status"] == "changes_requested" and resp["approved"] is False
    assert head.generation == gen0 + 1, "쓰기는 generation 을 올린다"
    await expect(target_region(env)).to_contain_text("수정 요청이 접수되었습니다", timeout=10_000)
    await env.shot("intake-registered")
    assert not env.writes("/approve")

    # 에이전트가 새 불변 판본 v3 를 보고(테스트가 서버 상태를 직접 갱신) → 같은 패널에서 새로고침.
    old_v2_hash = v2.manifest_hash
    reported = m.agent_reports_new_revision(sm.REVIEW_1)
    assert reported["revision"] == 3 and head.revisions[1].manifest_hash == old_v2_hash, "이전 판본은 바뀌지 않는다(불변)"
    await panel_ready(env)
    await env.panel.get_by_role("button", name="새로고침").click()
    # 새 판이 생겨도 보고 있던 v2 는 그대로 두고(지난 판본 안내), 승인·수정 요청은 막힌다. 최신 보기를 눌러야 v3 로 옮겨 간다.
    await expect(env.panel).to_contain_text("지난 판본을 보고 있습니다", timeout=15_000)
    await expect(env.panel.get_by_role("button", name="승인", exact=True)).to_be_disabled()
    await expect(env.panel.get_by_role("button", name="수정 요청", exact=True)).to_be_disabled()
    await env.shot("v3-reported-panel-still-on-v2")
    assert not env.writes("/approve"), "지난 판본 화면에서는 승인 요청이 나가면 안 된다"
    await env.panel.get_by_role("button", name="최신 보기").click()
    await expect(env.panel).to_contain_text("판본 v3 (최신)", timeout=15_000)
    await env.panel.get_by_role("button", name="이전 판(v2)과 비교").click()
    await expect(env.panel.get_by_text("이전 v2")).to_be_visible()
    await expect(env.panel.get_by_text("이번 v3")).to_be_visible()
    await env.panel.locator("summary", has_text="수정 문서·변경 이력").click()
    await expect(env.panel).to_contain_text("반영됨")
    await expect(env.panel).to_contain_text(text)
    await env.shot("v3-shown-in-panel")

    # 재승인: iframe 밖 신뢰 UI.
    v3, gen1 = head.revisions[-1], head.generation
    approve = env.panel.get_by_role("button", name="승인", exact=True)
    await expect(approve).to_be_enabled()
    assert await approve.evaluate("el => el.ownerDocument === window.top.document && !el.closest('iframe')")
    assert await env.page.locator("iframe >> internal:control=enter-frame >> button").count() == 0
    await approve.click()
    dialog = env.page.get_by_role("dialog", name="승인 확인")
    await expect(dialog).to_contain_text("판본 v3")
    await env.shot("approve-confirm-dialog")
    await dialog.get_by_role("button", name="승인합니다").click()
    rows = await wait_write(env, "/approve", 1, status=200)
    assert_approve_body(rows[0]["body"], revision=v3, expected_generation=gen1)
    assert rows[0]["path"].endswith(f"/mockup-reviews/{sm.REVIEW_1}/approve")
    assert rows[0]["response"]["status"] == "approved" and rows[0]["response"]["revision_id"] == v3.id
    assert head.status == "approved" and head.approved == v3.id and head.generation == gen1 + 1
    await expect(env.panel).to_contain_text("승인했습니다.", timeout=10_000)
    await expect(env.panel).to_contain_text("승인본", timeout=10_000)
    await env.shot("re-approved")
    assert len(env.writes("/approve")) == 1


# --------------------------------------------------------------------- 4d
async def s4d(env: Env) -> None:
    """저장/접수 503: 보낸 내용이 사라지지 않고, 재시도하면 같은 본문으로 한 번만 접수된다."""
    await env.start()
    m = env.mock
    head = m.heads[sm.REVIEW_1]
    send_rx, intake_rx = r"/chat/messages/send$", r"/mockup-reviews/change-intake$"

    # (1) 메시지 저장이 한 번 503: 앱이 같은 멱등 키로 다시 보내고, 저장이 확인된 뒤에만 접수한다.
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    text1 = "로그인 버튼을 파란색으로 바꿔 주세요"
    m.add_failure("POST", send_rx, 503, times=1)
    gen = head.generation
    await env.type_and_send(text1)
    await env.until(lambda: len(m.failed_writes) == 1, "첫 저장 503", 15)
    await expect(env.page.get_by_text(text1).first).to_be_visible()
    assert not env.writes("/change-intake"), "메시지 저장이 확인되기 전에는 접수하지 않는다"
    await env.shot("send-503-bubble-kept")
    rows = await wait_write(env, "/change-intake", 1, status=200)
    sends = env.writes("/chat/messages/send")
    assert len(sends) == 1 and sends[0]["status"] == 200
    failed = m.failed_writes[0]
    assert failed["status"] == 503 and failed["body"]["content"] == text1
    assert failed["body"]["idempotency_key"] == sends[0]["body"]["idempotency_key"], "재시도는 같은 멱등 키여야 한다(중복 저장 방지)"
    assert_intake_body(env, rows[0]["body"], review_id=sm.REVIEW_1, session_id=sm.SID_A, comment=text1,
                       artifact_id=sm.ART_1, reply_to_id=None, expected_generation=gen)
    assert len([c for c in head.changes if c["comment"] == text1]) == 1
    await env.shot("send-503-retry-registered")

    # (2) 저장이 계속 실패: 접수하지 않고 알려 준다. 보낸 말풍선에서 입력창으로 복사해 다시 보낼 수 있다.
    await env.goto(sm.SID_A)
    await expect(target_region(env)).to_contain_text("대상 2건 중 선택", timeout=20_000)
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    text2 = "로그인 입력칸 간격을 넓혀 주세요"
    m.add_failure("POST", send_rx, 503, times=99)
    n_changes = len(head.changes)
    await env.type_and_send(text2)
    region = target_region(env)
    await expect(region).to_contain_text("수정 요청을 접수하지 않았습니다", timeout=90_000)
    # 알림이 뜬 뒤에도 앱의 자동 재시도가 끝날 때까지 기다린다(끝난 뒤에야 실패 주입을 풀어 결과가 흔들리지 않게).
    last, since = -1, time.monotonic()
    while time.monotonic() - since < 12:
        env.check()
        if len(m.failed_writes) != last:
            last, since = len(m.failed_writes), time.monotonic()
        await asyncio.sleep(0.25)
    m.fail_next.clear()
    attempts = [f for f in m.failed_writes if f["body"]["content"] == text2]
    assert len(attempts) >= 2 and len({f["body"]["idempotency_key"] for f in attempts}) == 1, "자동 재시도는 같은 멱등 키여야 한다"
    assert len(head.changes) == n_changes and len(env.writes("/change-intake")) == 1, "저장 실패한 말은 접수되지 않는다"
    assert not [w for w in m.writes if w["path"].endswith("/chat/messages/send") and w["body"]["content"] == text2]
    await env.shot("send-503-exhausted-not-registered")
    # 저장 안 된 말풍선(tmp-)에는 '복사' 버튼이 없지만 입력창에 내용이 그대로 남아 있어 같은 내용을 다시 보낼 수 있다.
    bubble = env.page.locator("[data-message-id^='tmp-']", has_text=text2).last
    assert await bubble.get_by_title("입력창에 복사 (재지시)").count() == 0
    await expect(env.composer).to_have_value(text2)   # 재시도가 끝나면 앱이 입력창에 내용을 되돌려 놓는다
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    await expect(env.composer).to_have_value(text2)
    await env.composer.press("Enter")
    rows = await wait_write(env, "/change-intake", 2, status=200)
    assert rows[1]["body"]["comment"] == text2 and rows[1]["body"]["review_id"] == sm.REVIEW_1
    assert len(head.changes) == n_changes + 1
    await env.shot("send-503-manual-retry-registered")

    # (3) 접수(change-intake)만 503: 같은 본문으로 다시 접수하며 서버에는 한 건만 남는다.
    await env.goto(sm.SID_A)
    await expect(target_region(env)).to_contain_text("대상 2건 중 선택", timeout=20_000)
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    text3 = "로그인 제목 글자를 키워 주세요"
    m.add_failure("POST", intake_rx, 503, times=1)
    n_changes = len(head.changes)
    await env.type_and_send(text3)
    region = target_region(env)
    await expect(region).to_contain_text("접수되지 않은 수정 요청 1건이 있습니다", timeout=30_000)
    first = [f for f in m.failed_writes if f["path"].endswith("/change-intake")]
    assert len(first) == 1 and len(head.changes) == n_changes
    await env.shot("intake-503-pending-retry")
    await region.get_by_role("button", name="다시 접수").click()
    rows = await wait_write(env, "/change-intake", 3, status=200)
    assert rows[2]["body"] == first[0]["body"], "다시 접수는 처음과 똑같은 본문(같은 change_request_id·멱등 키)이어야 한다"
    assert len(head.changes) == n_changes + 1
    await expect(region).to_contain_text("수정 요청이 접수되었습니다", timeout=10_000)
    await expect(region).not_to_contain_text("접수되지 않은")
    assert not json.loads(await env.page.evaluate("sessionStorage.getItem('aads:mockup:pending-intents') || '[]'")), "접수된 의도는 지운다"
    await env.shot("intake-503-retry-registered")


# --------------------------------------------------------------------- 4e
async def s4e(env: Env) -> None:
    """A→B→A 세션 전환 + 느린 응답: 늦게 도착한 다른 세션의 응답이 대상·메시지를 오염시키지 않는다."""
    await env.start()
    m = env.mock
    region = target_region(env)
    await expect(region).to_contain_text("대상 2건 중 선택", timeout=20_000)

    # 패널을 열고 A 의 로그인 목업을 장전한다 — 세션이 바뀌면 이 상태가 모두 사라져야 한다.
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")
    await env.shot("A-armed-before-switch")
    m.add_delay(rf"/mockup-reviews\?.*session_id={sm.SID_B}", 2.5)
    m.add_delay(rf"/mockup-reviews/{sm.REVIEW_3}$", 2.5)
    m.add_delay(rf"/chat/messages\?.*session_id={sm.SID_B}", 2.0)
    m.add_delay(rf"/chat/artifacts\?.*session_id={sm.SID_B}", 2.0)
    await env.switch_session(sm.SID_B)
    await env.page.wait_for_timeout(300)
    await env.switch_session(sm.SID_A)           # B 의 응답이 오기 전에 A 로 돌아온다
    await env.page.wait_for_timeout(4500)         # B 의 늦은 응답이 모두 도착한 뒤
    await expect(env.msg(MSG_A_CARD1)).to_have_count(1, timeout=15_000)
    assert await env.msg(MSG_B_CARD).count() == 0, "B 의 메시지가 A 화면에 섞이면 안 된다"
    await expect(region).to_contain_text("대상 2건 중 선택", timeout=15_000)
    await expect(region).not_to_contain_text("수정 요청 모드")
    assert await env.page.locator("aside[aria-label='목업 검토']").filter(has_text="관리자 화면 목업").count() == 0
    await env.shot("A-B-A-late-B-responses-ignored")
    assert not env.writes("/change-intake")

    # A 에서 보낸 일반 메시지는 접수되지 않는다(장전 상태가 세션 전환으로 사라졌으므로).
    await env.type_and_send("전환 뒤 일반 질문")
    await wait_write(env, "/chat/messages/send", 1, status=200)
    await env.page.wait_for_timeout(600)
    assert not env.writes("/change-intake"), "세션 전환 뒤에는 장전이 풀려 있어야 한다"

    # B 로 완전히 이동 → 이번에는 A 쪽 응답을 느리게 해 B→A→B 로 전환한다.
    await env.switch_session(sm.SID_B)
    await expect(env.msg(MSG_B_CARD)).to_have_count(1, timeout=20_000)
    await expect(region).to_contain_text("목업 수정 요청", timeout=15_000)
    await expect(region).not_to_contain_text("중 선택")
    assert await env.msg(MSG_A_CARD1).count() == 0
    m.add_delay(rf"/mockup-reviews\?.*session_id={sm.SID_A}", 2.5)
    m.add_delay(rf"/mockup-reviews/{sm.REVIEW_1}$", 2.5)
    m.add_delay(rf"/mockup-reviews/{sm.REVIEW_2}$", 2.5)
    m.add_delay(rf"/chat/messages\?.*session_id={sm.SID_A}", 2.0)
    m.add_delay(rf"/chat/artifacts\?.*session_id={sm.SID_A}", 2.0)
    await env.switch_session(sm.SID_A)
    await env.page.wait_for_timeout(300)
    await env.switch_session(sm.SID_B)
    await env.page.wait_for_timeout(4500)
    await expect(env.msg(MSG_B_CARD)).to_have_count(1, timeout=15_000)
    assert await env.msg(MSG_A_CARD1).count() == 0 and await env.msg(MSG_A_CARD2).count() == 0, "A 의 메시지가 B 화면에 섞이면 안 된다"
    await expect(region).to_contain_text("목업 수정 요청", timeout=15_000)
    await expect(region).not_to_contain_text("중 선택")
    await expect(region).not_to_contain_text("로그인 화면 목업")
    await expect(region).not_to_contain_text("결제 화면 목업")
    await env.shot("B-A-B-late-A-responses-ignored")

    # 이 상태에서 접수하면 B 의 목업(R3)만 대상이다.
    gens = {rid: (h.generation, len(h.changes)) for rid, h in m.heads.items()}
    await env.open_card(MSG_B_CARD)
    await arm_from_panel(env, "관리자 화면 목업")
    text = "관리자 표의 줄 간격을 줄여 주세요"
    await env.type_and_send(text)
    rows = await wait_write(env, "/change-intake", 1, status=200)
    assert_intake_body(env, rows[0]["body"], review_id=sm.REVIEW_3, session_id=sm.SID_B, comment=text,
                       artifact_id=sm.ART_B, reply_to_id=None, expected_generation=gens[sm.REVIEW_3][0])
    for rid in (sm.REVIEW_1, sm.REVIEW_2):
        assert (m.heads[rid].generation, len(m.heads[rid].changes)) == gens[rid], "다른 세션의 목업은 건드리지 않는다"
    assert [w["body"].get("session_id") for w in env.writes("/chat/messages/send")] == [sm.SID_A, sm.SID_B]
    await env.shot("B-intake-only-B-target")


# --------------------------------------------------------------------- 4f
async def s4f(env: Env) -> None:
    """새로고침·재연결 복구(응답 유실 → 같은 본문 재접수)와 모바일 대체 입력창 복귀."""
    await env.start()
    m = env.mock
    head = m.heads[sm.REVIEW_1]
    region = target_region(env)
    await open_card_and_arm(env, MSG_A_CARD1, "로그인 화면 목업")

    # (1) 서버는 접수를 처리했지만 응답이 유실된다 → 앱은 접수 여부를 모른다 → 새로고침 뒤에도 의도가 남는다.
    n_changes = len(head.changes)
    text = "로그인 버튼 색을 파란색으로 바꿔 주세요"
    m.add_failure("POST", r"/change-intake$", "lose", times=1)
    await env.type_and_send(text)
    await expect(region).to_contain_text("접수되지 않은 수정 요청 1건이 있습니다", timeout=30_000)
    lost = env.writes("/change-intake")
    assert len(lost) == 1 and lost[0]["status"] == "response_lost" and len(head.changes) == n_changes + 1, "서버는 이미 한 건을 처리했다"
    await env.shot("intake-response-lost")
    await env.page.reload(wait_until="domcontentloaded")
    await env.composer.wait_for(timeout=60_000)
    await expect(region).to_contain_text("접수되지 않은 수정 요청 1건이 있습니다", timeout=30_000)
    await env.shot("reload-pending-intent-kept")
    await region.get_by_role("button", name="다시 접수").click()
    rows = await wait_write(env, "/change-intake", 2, status=200)
    assert rows[1]["body"] == lost[0]["body"], "재접수는 처음과 같은 본문(같은 멱등 키)이어야 한다"
    assert len(head.changes) == n_changes + 1, "멱등 재생: 서버의 변경 요청은 한 건"
    assert rows[1]["response"]["change_request_id"] == lost[0]["response"]["change_request_id"]
    await expect(region).to_contain_text("수정 요청이 접수되었습니다", timeout=10_000)
    assert not json.loads(await env.page.evaluate("sessionStorage.getItem('aads:mockup:pending-intents') || '[]'"))
    await env.shot("reload-resubmit-idempotent")

    # (2) 알림 딥링크로 새로 열기: 고정 패널 + 수정 요청 → 입력창 복귀(모바일은 시트가 닫히고 입력창으로 돌아온다).
    latest = m.heads[sm.REVIEW_1].latest
    await env.goto(sm.SID_A, f"?mockup_review={sm.REVIEW_1}&mockup_project=AADS&mockup_revision={latest}")
    await expect(env.panel).to_be_visible(timeout=30_000)
    await expect(env.panel).to_contain_text("로그인 화면 목업")
    await env.shot("deep-link-panel")
    await env.panel.get_by_role("button", name="수정 요청", exact=True).click()
    await env.panel.get_by_role("button", name="입력창에 수정 요청 쓰기").click()
    await expect(region).to_contain_text("로그인 화면 목업 수정 요청 모드", timeout=10_000)
    await env.page.wait_for_function("() => document.activeElement && document.activeElement.tagName === 'TEXTAREA'", timeout=5_000)
    if env.vp == "mobile":
        await expect(env.panel).to_have_count(0, timeout=5_000)
    await env.shot("composer-focused-after-request-mode")
    text2 = "로그인 화면 하단 여백을 줄여 주세요"
    n_changes, gen = len(head.changes), head.generation
    await env.type_and_send(text2)
    rows = await wait_write(env, "/change-intake", 3, status=200)
    assert rows[2]["body"]["artifact_id"] in (None, sm.ART_1), rows[2]["body"]["artifact_id"]
    assert_intake_body(env, rows[2]["body"], review_id=sm.REVIEW_1, session_id=sm.SID_A, comment=text2,
                       artifact_id=rows[2]["body"]["artifact_id"], reply_to_id=None, expected_generation=gen)
    assert len(head.changes) == n_changes + 1
    await env.shot("deep-link-intake-registered")


# --------------------------------------------------------------------- 4g
async def confirm_approve(env: Env, version: int) -> None:
    approve = env.panel.get_by_role("button", name="승인", exact=True)
    await expect(approve).to_be_enabled(timeout=10_000)
    await approve.click()
    dialog = env.page.get_by_role("dialog", name="승인 확인")
    await expect(dialog).to_contain_text(f"판본 v{version}")
    await dialog.get_by_role("button", name="승인합니다").click()


async def s4g(env: Env) -> None:
    """409 거절: 낡은 판본 승인, generation 불일치 승인, 포인터가 옮겨간 뒤의 수정 요청 접수."""
    await env.start()
    m = env.mock
    r1, r2 = m.heads[sm.REVIEW_1], m.heads[sm.REVIEW_2]

    # (1) 승인 확인창을 연 사이 에이전트가 v3 를 올렸다 → 화면이 모르는 채로 v2 를 승인하면 서버가 거절한다.
    await env.open_card(MSG_A_CARD1)
    v2, gen = r1.revisions[-1], r1.generation
    approve = env.panel.get_by_role("button", name="승인", exact=True)
    await expect(approve).to_be_enabled(timeout=10_000)
    await approve.click()
    dialog = env.page.get_by_role("dialog", name="승인 확인")
    await expect(dialog).to_contain_text("판본 v2")
    reported = m.agent_reports_new_revision(sm.REVIEW_1)
    assert reported["revision"] == 3
    gen_after_report = r1.generation
    await env.shot("approve-dialog-open-while-v3-arrives")
    await dialog.get_by_role("button", name="승인합니다").click()
    rows = await wait_write(env, "/approve", 1, status=409)
    assert_approve_body(rows[0]["body"], revision=v2, expected_generation=gen)
    assert rows[0]["error"]["code"] == "stale_revision" and rows[0]["error"]["latest_revision"] == 3
    assert r1.approved is None and r1.status == "review_ready" and r1.generation == gen_after_report, "거절된 승인은 아무것도 바꾸지 않는다"
    await expect(env.panel).to_contain_text("다른 곳에서 목업이 바뀌었습니다", timeout=10_000)
    await expect(env.panel).to_contain_text("최신 판본: v3")
    await env.shot("stale-approve-409")
    # 복구: 새로고침 → 최신(v3) 으로 승인하면 된다.
    await env.panel.get_by_text("새로고침", exact=True).click()
    latest_btn = env.panel.get_by_role("button", name="최신 보기")
    if await latest_btn.count():
        await latest_btn.click()
    await expect(env.panel).to_contain_text("판본 v3 (최신)", timeout=15_000)
    v3, gen3 = r1.revisions[-1], r1.generation
    await confirm_approve(env, 3)
    rows = await wait_write(env, "/approve", 2, status=200)
    assert_approve_body(rows[1]["body"], revision=v3, expected_generation=gen3)
    assert r1.approved == v3.id and len(env.writes("/approve")) == 2
    await env.shot("stale-approve-recovered")

    # (2) 같은 판본이라도 다른 사용자가 먼저 썼으면(generation 만 오름) 승인은 거절된다.
    await env.page.reload(wait_until="domcontentloaded")
    await env.composer.wait_for(timeout=60_000)
    await env.open_card(MSG_A_CARD2)
    await expect(env.panel).to_contain_text("결제 화면 목업", timeout=15_000)
    v1, gen = r2.revisions[-1], r2.generation
    approve = env.panel.get_by_role("button", name="승인", exact=True)
    await expect(approve).to_be_enabled(timeout=10_000)
    await approve.click()
    dialog = env.page.get_by_role("dialog", name="승인 확인")
    await expect(dialog).to_contain_text("판본 v1")
    bumped = m.other_actor_writes(sm.REVIEW_2)
    await dialog.get_by_role("button", name="승인합니다").click()
    rows = await wait_write(env, "/approve", 3, status=409)
    assert_approve_body(rows[2]["body"], revision=v1, expected_generation=gen)
    assert rows[2]["error"]["code"] == "stale_revision" and rows[2]["error"]["generation"] == bumped == gen + 1
    assert r2.approved is None and r2.status == "changes_requested" and r2.generation == bumped
    await expect(env.panel).to_contain_text("다른 곳에서 목업이 바뀌었습니다", timeout=10_000)
    await env.shot("generation-mismatch-409")

    # (3) 장전한 뒤 에이전트가 새 판을 올려 포인터가 움직였다 → 접수는 거절되고 변경 요청은 생기지 않는다.
    await env.page.reload(wait_until="domcontentloaded")
    await env.composer.wait_for(timeout=60_000)
    await open_card_and_arm(env, MSG_A_CARD2, "결제 화면 목업")
    n_changes, armed_gen = len(r2.changes), r2.generation
    m.agent_reports_new_revision(sm.REVIEW_2)
    assert r2.pointer_generation > armed_gen
    text = "결제 버튼을 더 크게 해 주세요"
    await env.type_and_send(text)
    rows = await wait_write(env, "/change-intake", 1, status=409)
    assert_intake_body(env, rows[0]["body"], review_id=sm.REVIEW_2, session_id=sm.SID_A, comment=text,
                       artifact_id=rows[0]["body"]["artifact_id"], reply_to_id=None, expected_generation=armed_gen)
    assert rows[0]["error"]["code"] == "stale_revision"
    assert len(r2.changes) == n_changes, "거절된 접수는 변경 요청을 만들지 않는다"
    await env.page.wait_for_timeout(800)
    await env.shot("intake-409-after-pointer-move")
    assert len(env.writes("/change-intake")) == 1, "409 는 자동으로 다시 보내지 않는다"


# ------------------------------------------------------------- guard self-test
async def sguard(env: Env) -> None:
    """네트워크 가드 자기 검증: 외부 출처는 전송 전에 중단·집계되고, 예상 밖 쓰기는 즉시 실패로 잡힌다."""
    await env.start()
    page, g = env.page, env.guard
    before = len(g.aborted)
    result = await page.evaluate("""async () => {
      const out = [];
      for (const url of ['https://example.com/m7-guard-probe', 'http://203.0.113.9/m7-guard-probe']) {
        try { await fetch(url, { mode: 'no-cors' }); out.push('sent'); } catch (e) { out.push('blocked'); }
      }
      return out;
    }""")
    assert result == ["blocked", "blocked"], result
    await page.evaluate("() => { const i = new Image(); i.src = 'https://example.org/m7-guard-probe.png'; document.body.appendChild(i); }")
    while len(g.aborted) < before + 3:
        await asyncio.sleep(0.05)
    await asyncio.sleep(0.3)
    env.console[:] = [c for c in env.console if "ERR_BLOCKED_BY_CLIENT" not in c]   # 의도한 차단이 남긴 콘솔 줄
    assert g.reached_external == [], "외부 출처로 실제 전송된 요청은 0 이어야 한다"
    assert {urlsplit(a["url"]).hostname for a in g.aborted[before:]} == {"example.com", "203.0.113.9", "example.org"}
    await env.shot("guard-external-aborted")
    # 예상 밖 쓰기(허용 목록에 없는 경로) → 서버로 가지 않고 즉시 실패로 기록, 모의 서버에는 쓰기가 남지 않는다.
    writes_before = len(env.mock.writes)
    await page.evaluate("""() => fetch('http://aads-mock.test/api/v1/projects/AADS/mockup-reviews/unexpected', {method: 'POST', body: '{}'}).catch(() => 0)""")
    for _ in range(200):
        if g.fatal:
            break
        await asyncio.sleep(0.05)
    assert g.fatal, "예상 밖 쓰기 감지"
    assert any("/mockup-reviews/unexpected" in f for f in g.fatal) and len(env.mock.writes) == writes_before
    g.fatal.clear()        # 자기 검증이므로 실패로 이어지지 않게 비운다(다른 시나리오는 비우지 않는다).


SCENARIOS = {"4a": s4a, "4b": s4b, "4c": s4c, "4d": s4d, "4e": s4e, "4f": s4f, "4g": s4g, "guard": sguard}
IDS = [(n, v) for n in SCENARIOS for v in VIEWPORTS]


async def run_scenario(name: str, vp: str) -> None:
    async with async_playwright() as pw:
        env = Env(name, vp, pw)
        try:
            await SCENARIOS[name](env)
            env.check()
            assert env.guard.reached_external == [], f"외부 출처에 실제로 전송된 요청: {env.guard.reached_external}"
            assert not env.errors, f"페이지 오류: {env.errors}"
        except BaseException:
            if env.page and not env.page.is_closed():
                try:
                    await env.shot("FAILURE")
                except Exception:
                    pass
            if env.guard.fatal:
                raise AssertionError(f"예상 밖 쓰기 요청 즉시 실패: {env.guard.fatal}")
            raise
        finally:
            if getattr(env, "browser", None):
                await env.stop()


def finalize() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "manifest.json").write_text(json.dumps(SCENES, ensure_ascii=False, indent=1))


@pytest.mark.parametrize("name,vp", IDS, ids=[f"{n}-{v}" for n, v in IDS])
def test_real_chat(name: str, vp: str) -> None:
    try:
        asyncio.run(run_scenario(name, vp))
    finally:
        finalize()


if __name__ == "__main__":
    which = sys.argv[1:] or [f"{n}:{v}" for n, v in IDS]
    for item in which:
        n, v = item.split(":")
        asyncio.run(run_scenario(n, v))
        print("OK", item)
    finalize()
