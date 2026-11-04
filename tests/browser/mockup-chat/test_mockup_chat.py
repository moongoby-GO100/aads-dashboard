#!/usr/bin/env python3
"""채팅 목업 확인 흐름 브라우저 검증 (실제 MockupTargetBar + MockupReviewPanel + MockupDocumentRef + mockupReviewApi).

재현:
  cd <dashboard>
  npx vite build --config tests/browser/mockup-chat/build.config.mts   # /tmp/mockup-harness-dist/bundle.js
  PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright python3 tests/browser/mockup-chat/test_mockup_chat.py [증거_디렉터리]

산출물(번들·스크린샷)은 /tmp 아래에만 남는다. 운영 서버로는 어떤 요청도 나가지 않는다.
- 허용 origin(http://harness.local) 밖의 요청은 전송 전에 route.abort() 로 막고, 1건이라도 있으면 실패한다.
  service worker 는 context 옵션 service_workers="block" 으로 막는다.
- 모의 API(harness.local/api/v1)는 메서드·경로·본문을 검증한다. 어긋나면 4xx 로 응답하고 위반으로 기록해 테스트를 실패시킨다.
"""
import json
import os
import re
import struct
import sys
import zlib
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright

DIST = Path(os.environ.get("MOCKUP_HARNESS_OUT", "/tmp/mockup-harness-dist"))
EVIDENCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mockup-evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)

HARNESS_ORIGIN = "http://harness.local"
ALLOWED_ORIGINS = {HARNESS_ORIGIN}   # 하니스는 별도 로컬 서버 없이 이 가상 origin 에서만 응답한다
API_PREFIX = "/api/v1"
LOCAL_SCHEMES = ("data", "blob", "about")   # 네트워크를 타지 않는 URL

SESSION = "3f9d6a52-0c1e-4c2b-9d0a-5b6f7a8c9d01"
SAVED_MESSAGE_ID = "cccccccc-0000-4000-8000-000000000001"   # harness.tsx 의 SAVED_MESSAGE_ID 와 같아야 한다
REV_A1 = "aaaaaaaa-0000-4000-8000-000000000001"
REV_A2 = "aaaaaaaa-0000-4000-8000-000000000002"
REV_A3 = "aaaaaaaa-0000-4000-8000-000000000003"
REV_B1 = "bbbbbbbb-0000-4000-8000-000000000001"
REV_ID_A = "11111111-aaaa-4aaa-8aaa-000000000001"
REV_ID_B = "22222222-bbbb-4bbb-8bbb-000000000002"
HASH = {REV_A1: "hash-a1-00000001", REV_A2: "hash-a2-00000002", REV_A3: "hash-a3-00000003", REV_B1: "hash-b1-00000001"}
GENERATION_A0 = 3

DOC_KEY = "rdoc-mockup-chat-acceptance-report"
DOC_REV = "dddddddd-0000-4000-8000-0000000000d1"          # 판본이 고정(pinned)한 문서 판본 r3
DOC_REV_NO = 3
DOC_REV_LATEST = "dddddddd-0000-4000-8000-0000000000d2"   # 이후 개정된 최신(latest) 문서 판본 r4
DOC_REV_LATEST_NO = 4
PINNED_MARK = "PINNED-R3"
LATEST_MARK = "LATEST-R4-ONLY"
DOC_TEXT_PINNED = f"# 목업 채팅 인수 보고서\n\n고정 판본 본문(모의)입니다. {PINNED_MARK}"
DOC_TEXT_LATEST = f"# 목업 채팅 인수 보고서\n\n이후 개정된 전혀 다른 내용입니다. {LATEST_MARK}"
DOC_HISTORY = [{"id": DOC_REV_LATEST, "revision": DOC_REV_LATEST_NO}, {"id": DOC_REV, "revision": DOC_REV_NO}]

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
ID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
MR = r"/projects/AADS/mockup-reviews"

# (이름, 메서드, 경로 패턴) — 여기에 없는 메서드·경로 조합은 모두 위반이다.
ROUTES = [
    ("list", "GET", rf"^{MR}$"),
    ("intake", "POST", rf"^{MR}/change-intake$"),
    ("review", "GET", rf"^{MR}/({ID})$"),
    ("approve", "POST", rf"^{MR}/({ID})/approve$"),
    ("change_report", "GET", rf"^{MR}/({ID})/change-report$"),
    ("revision", "GET", rf"^{MR}/({ID})/revisions/({ID})$"),
    ("asset", "GET", rf"^{MR}/({ID})/revisions/({ID})/assets/([^/]+)$"),
    ("doc_history", "GET", rf"^/projects/AADS/documents/{DOC_KEY}/history$"),
    ("doc_content", "GET", rf"^/projects/AADS/documents/{DOC_KEY}/content$"),
]

HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--ct-bg:#ffffff;--ct-sb:#f5f6f8;--ct-bg2:#eef0f3;--ct-border:#d5d9e0;--ct-text:#1b1f27;--ct-text2:#5b6574;--ct-hover:#eef3ff;--ct-accent:#2563eb;
--bg-card:#ffffff;--bg-primary:#f7f8fa;--border:#d5d9e0;--text-primary:#1b1f27;--text-secondary:#5b6574;--accent:#2563eb}
html,body{margin:0;height:100%;font-family:sans-serif}
</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>"""


def png(width, height, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def revision(rid, n, parent, latest, docs, status):
    return {
        "revision_id": rid, "revision": n, "status": status, "manifest_hash": HASH[rid],
        "is_latest": latest, "is_approved": False, "parent_revision_id": parent, "doc_refs": docs,
        "manifest": {
            "screens": [{"screen_id": "s1", "title": "채팅 화면", "route": "/chat"}],
            "assets": [
                {"asset_id": f"{rid[:4]}-d", "role": "primary", "mime": "image/png", "screen_id": "s1", "phase": "mockup", "viewport": "desktop", "state": "default"},
                {"asset_id": f"{rid[:4]}-m", "role": "primary", "mime": "image/png", "screen_id": "s1", "phase": "mockup", "viewport": "mobile", "state": "default"},
            ],
        },
    }


class Api:
    """Playwright route 로 응답하는 모의 서버. 메서드·경로·본문이 계약과 다르면 4xx + violations 기록."""

    def __init__(self):
        self.writes = []              # (메서드, 경로) — GET/OPTIONS 외 모든 요청
        self.bodies = []              # (경로, 파싱된 JSON 본문) — 계약을 통과한 쓰기 요청만
        self.requests = []
        self.violations = []
        self.doc_content_revisions = []   # 문서 content 요청이 지정한 revision 번호
        self.fail_review = 0          # >0 이면 review GET 을 500 으로 응답하고 1 줄인다
        self.fail_approve = None      # 상태코드를 주면 (본문 검증을 통과한) approve POST 를 그 코드로 응답
        self.doc_fail = 0             # >0 이면 문서 content GET 을 404 로 응답하고 1 줄인다
        self.status_a = "review_ready"
        self.generation = GENERATION_A0
        self.revisions_a = [(REV_A1, 1), (REV_A2, 2)]
        self.latest_a = REV_A2
        self.change_requests = []
        self.expect_comment = None    # 수정 요청 본문 comment 가 일치해야 하는 값

    # ---- 응답 조립
    def _violation(self, route, message, status):
        self.violations.append(message)
        return route.fulfill(status=status, headers=self.js, body=json.dumps({"detail": {"code": "harness_contract_violation", "message": message}}))

    def _ok(self, route, payload, status=200):
        return route.fulfill(status=status, headers=self.js, body=json.dumps(payload))

    def review(self, rid):
        if rid == REV_ID_A:
            n_of = dict(self.revisions_a)
            rows = [{"revision_id": r, "revision": n, "status": "review_ready" if r == self.latest_a else "superseded",
                     "manifest_hash": HASH[r], "is_latest": r == self.latest_a, "is_approved": False}
                    for r, n in reversed(self.revisions_a)]
            return {
                "review_id": REV_ID_A, "project": "AADS", "title": "채팅 아티팩트 목업 A", "change_type": "ui",
                "session_id": SESSION, "status": self.status_a, "generation": self.generation, "pointer_generation": self.generation,
                "latest_revision": {"revision_id": self.latest_a, "revision": n_of[self.latest_a], "manifest_hash": HASH[self.latest_a]},
                "approved_revision": None, "pending_change_requests": 0,
                "revisions": rows, "unresolved_change_requests": [],
            }
        return {
            "review_id": REV_ID_B, "project": "AADS", "title": "모바일 입력창 목업 B", "change_type": "ui",
            "session_id": SESSION, "status": "changes_requested", "generation": 1, "pointer_generation": 1,
            "latest_revision": {"revision_id": REV_B1, "revision": 1, "manifest_hash": HASH[REV_B1]},
            "approved_revision": None, "pending_change_requests": 1,
            "revisions": [{"revision_id": REV_B1, "revision": 1, "status": "review_ready", "manifest_hash": HASH[REV_B1], "is_latest": True, "is_approved": False}],
            "unresolved_change_requests": [],
        }

    # ---- 요청 분기
    def handle(self, route, request):
        parts = urlsplit(request.url)
        path = parts.path[len(API_PREFIX):] if parts.path.startswith(API_PREFIX + "/") else parts.path
        method = request.method
        self.requests.append((method, path, parts.query))
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
        self.cors = cors
        self.js = {**cors, "content-type": "application/json"}
        if method == "OPTIONS":
            return route.fulfill(status=204, headers=cors)
        if method != "GET":
            self.writes.append((method, path))

        matches = [(name, rm, re.match(pattern, path)) for name, rm, pattern in ROUTES if re.match(pattern, path)]
        if not matches:
            return self._violation(route, f"계약에 없는 경로: {method} {path}", 404)
        allowed = [x for x in matches if x[1] == method]
        if not allowed:
            return self._violation(route, f"메서드 불일치: {method} {path} (허용: {sorted({x[1] for x in matches})})", 405)
        name, _, found = allowed[0]
        return getattr(self, f"_{name}")(route, request, parts, found.groups())

    def _list(self, route, request, parts, groups):
        items = [
            {"review_id": REV_ID_A, "title": "채팅 아티팩트 목업 A", "status": self.status_a, "session_id": SESSION},
            {"review_id": REV_ID_B, "title": "모바일 입력창 목업 B", "status": "changes_requested", "session_id": SESSION},
        ]
        return self._ok(route, {"items": items, "total": 2})

    def _review(self, route, request, parts, groups):
        if groups[0] not in (REV_ID_A, REV_ID_B):
            return route.fulfill(status=404, headers=self.js, body="{}")
        if self.fail_review > 0:
            self.fail_review -= 1
            return route.fulfill(status=500, headers=self.js, body="{}")
        return self._ok(route, self.review(groups[0]))

    def _revision(self, route, request, parts, groups):
        docs = [{"role": "plan", "document_key": DOC_KEY, "revision_id": DOC_REV}]
        rid = groups[1]
        if rid in dict(self.revisions_a):
            n = dict(self.revisions_a)[rid]
            parent = self.revisions_a[n - 2][0] if n > 1 else None
            latest = rid == self.latest_a
            return self._ok(route, revision(rid, n, parent, latest, docs, "review_ready" if latest else "superseded"))
        return self._ok(route, revision(REV_B1, 1, None, True, docs, "review_ready"))

    def _asset(self, route, request, parts, groups):
        desktop = groups[2].endswith("-d")
        colour = (37, 99, 235) if desktop else (22, 163, 74)
        size = (640, 400) if desktop else (195, 422)
        return route.fulfill(status=200, headers={**self.cors, "content-type": "image/png"}, body=png(*size, colour))

    def _change_report(self, route, request, parts, groups):
        return self._ok(route, {"review_id": REV_ID_A, "status": self.status_a, "generation": self.generation,
                                "change_requests": self.change_requests})

    def _doc_history(self, route, request, parts, groups):
        return self._ok(route, {"revisions": DOC_HISTORY})

    def _doc_content(self, route, request, parts, groups):
        if self.doc_fail > 0:
            self.doc_fail -= 1
            return route.fulfill(status=404, headers=self.js, body="{}")
        wanted = parse_qs(parts.query).get("revision")
        n = int(wanted[0]) if wanted and wanted[0].isdigit() else DOC_REV_LATEST_NO   # revision 생략 = 최신
        self.doc_content_revisions.append(n)
        rev_id, text = (DOC_REV, DOC_TEXT_PINNED) if n == DOC_REV_NO else (DOC_REV_LATEST, DOC_TEXT_LATEST)
        return self._ok(route, {"project": "AADS", "document_key": DOC_KEY, "content": text,
                                "canonical": {"revision": n, "revision_id": rev_id, "document_key": DOC_KEY}})

    # ---- 쓰기 요청: 본문 계약 검증
    def _json_body(self, route, request, label):
        try:
            body = json.loads(request.post_data or "")
        except ValueError:
            return None, self._violation(route, f"{label}: JSON 본문이 아님", 400)
        if not isinstance(body, dict):
            return None, self._violation(route, f"{label}: 본문이 객체가 아님", 400)
        return body, None

    def _approve(self, route, request, parts, groups):
        body, bad = self._json_body(route, request, "approve")
        if bad:
            return bad
        if groups[0] != REV_ID_A:
            return self._violation(route, f"approve: 승인할 수 없는 review {groups[0]}", 404)
        missing = [k for k in ("revision_id", "manifest_hash", "expected_generation", "confirm", "idempotency_key") if k not in body]
        if missing:
            return self._violation(route, f"approve: 필수 필드 누락 {missing}", 422)
        wrong = []
        if body["revision_id"] != self.latest_a:
            wrong.append(f"revision_id={body['revision_id']} (고정 판본 {self.latest_a})")
        if body["manifest_hash"] != HASH[self.latest_a]:
            wrong.append(f"manifest_hash={body['manifest_hash']} (고정 판본 {HASH[self.latest_a]})")
        if body["expected_generation"] != self.generation or isinstance(body["expected_generation"], bool):
            wrong.append(f"expected_generation={body['expected_generation']} (현재 {self.generation})")
        if body["confirm"] is not True:
            wrong.append(f"confirm={body['confirm']!r} (True 여야 함)")
        if not (isinstance(body["idempotency_key"], str) and UUID_RE.match(body["idempotency_key"])):
            wrong.append("idempotency_key 가 UUID 가 아님")
        if wrong:
            return self._violation(route, "approve: 본문 불일치 " + "; ".join(wrong), 409)
        self.bodies.append((f"{MR}/{REV_ID_A}/approve", body))
        if self.fail_approve:
            return self._ok(route, {"detail": {"code": "stale_revision", "latest_revision": 3}}, status=self.fail_approve)
        self.status_a = "approved"
        return self._ok(route, {"review_id": REV_ID_A, "status": "approved", "revision_id": body["revision_id"]})

    def _intake(self, route, request, parts, groups):
        body, bad = self._json_body(route, request, "change-intake")
        if bad:
            return bad
        missing = [k for k in ("idempotency_key", "expected_generation", "change_request_id", "session_id",
                               "source_message_id", "comment", "review_id") if k not in body]
        if missing:
            return self._violation(route, f"change-intake: 필수 필드 누락 {missing}", 422)
        wrong = []
        if "confirm" in body:
            wrong.append("수정 요청 본문에 confirm(승인 필드)이 있음")
        if body["review_id"] != REV_ID_A:
            wrong.append(f"review_id={body['review_id']}")
        if body["session_id"] != SESSION:
            wrong.append(f"session_id={body['session_id']}")
        if body["expected_generation"] != self.generation or isinstance(body["expected_generation"], bool):
            wrong.append(f"expected_generation={body['expected_generation']} (현재 {self.generation})")
        if body["source_message_id"] != SAVED_MESSAGE_ID:
            wrong.append(f"source_message_id={body['source_message_id']}")
        if not (isinstance(body["comment"], str) and body["comment"].strip()
                and (self.expect_comment is None or body["comment"] == self.expect_comment)):
            wrong.append(f"comment={body['comment']!r}")
        for k in ("change_request_id", "idempotency_key"):
            if not (isinstance(body[k], str) and UUID_RE.match(body[k])):
                wrong.append(f"{k} 가 UUID 가 아님")
        if wrong:
            return self._violation(route, "change-intake: 본문 불일치 " + "; ".join(wrong), 409)
        self.bodies.append((f"{MR}/change-intake", body))
        # 접수 → 새 판본 생성(generation+1). 실제 서버의 비동기 개정 과정은 모의 서버가 즉시 끝낸 것으로 본다.
        base = self.latest_a
        new_n = len(self.revisions_a) + 1
        self.revisions_a.append((REV_A3, new_n))
        self.latest_a = REV_A3
        self.generation += 1
        self.status_a = "review_ready"
        self.change_requests.append({
            "change_request_id": body["change_request_id"], "sequence": len(self.change_requests) + 1,
            "source_message_id": body["source_message_id"], "screen_id": None, "original_text": body["comment"],
            "status": "applied", "base_revision": {"revision_id": base, "revision": dict(self.revisions_a)[base]},
            "new_revision": {"revision_id": REV_A3, "revision": new_n}, "outcome": "applied", "outcome_reason": None,
        })
        return self._ok(route, {"change_request_id": body["change_request_id"], "status": "accepted", "generation": self.generation})


def open_page(browser, width, height, mobile, api):
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile, has_touch=mobile, service_workers="block")
    ctx.add_init_script("localStorage.setItem('aads_token','harness-fake-token')")
    blocked = []   # 허용 origin 밖으로 나가려던 요청 — route.abort() 로 막은 것만 기록한다

    def dispatch(route, request):
        parts = urlsplit(request.url)
        if parts.scheme in LOCAL_SCHEMES:
            return route.continue_()
        if f"{parts.scheme}://{parts.netloc}" not in ALLOWED_ORIGINS:
            blocked.append(f"{request.method} {request.url}")
            return route.abort("blockedbyclient")
        if parts.path.startswith(API_PREFIX + "/"):
            return api.handle(route, request)
        if parts.path == "/bundle.js":
            return route.fulfill(status=200, content_type="application/javascript", body=(DIST / "bundle.js").read_text())
        if parts.path == "/":
            return route.fulfill(status=200, content_type="text/html", body=HTML)
        return route.fulfill(status=404, content_type="text/plain", body="not found")

    def block_socket(ws):
        # connect_to_server() 를 부르지 않으므로 서버로는 아무것도 나가지 않는다(sync API 에서 ws.close() 는 교착되어 부르지 않음).
        blocked.append(f"WEBSOCKET {ws.url}")

    ctx.route("**/*", dispatch)
    ctx.route_web_socket(re.compile(r".*"), block_socket)
    page = ctx.new_page()
    page.goto(HARNESS_ORIGIN + "/")
    return ctx, page, blocked


def assert_clean(ctx, api, blocked):
    assert not blocked, f"허용 origin 밖 요청 {len(blocked)}건 차단됨: {blocked}"
    assert not ctx.service_workers, f"service worker 가 등록됨: {ctx.service_workers}"
    assert not api.violations, f"모의 API 계약 위반 {len(api.violations)}건: {api.violations}"


def shot(page, name):
    path = EVIDENCE / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print("screenshot", path)


def no_horizontal_overflow(page):
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert over <= 1, f"가로 넘침 {over}px"


def open_panel(page):
    bar = page.get_by_role("region", name="목업 수정 요청 대상")
    trigger = bar.get_by_role("button", name=re.compile(r"목업 수정 요청 \(대상 2건 중 선택\)"))
    trigger.wait_for(timeout=8000)
    trigger.click()
    page.get_by_role("button", name="채팅 아티팩트 목업 A 검토 패널 열기").click()
    panel = page.get_by_role("complementary", name="목업 검토")
    panel.get_by_text(re.compile(r"판본 v2 \(최신\)")).wait_for(timeout=8000)
    return bar, panel


def confirm_approve(page, panel):
    approve = panel.get_by_role("button", name="승인", exact=True)
    approve.scroll_into_view_if_needed()
    approve.click()
    dialog = page.get_by_role("dialog", name="승인 확인")
    dialog.wait_for()
    dialog.get_by_role("button", name="승인합니다").click()
    panel.get_by_text("승인했습니다.").wait_for(timeout=5000)


def run_selftest(browser):
    """차단·계약 검증 장치 자체가 실제로 동작하는지 확인한다(장치가 고장 나 항상 통과하는 일을 막는다)."""
    api = Api()
    ctx, page, blocked = open_page(browser, 1280, 800, False, api)
    try:
        # 1) 허용 origin 밖 fetch / WebSocket 은 전송 전에 막힌다
        assert page.evaluate("fetch('https://example.invalid/leak').then(() => 'sent', () => 'failed')") == "failed"
        page.evaluate("window.__ws = new WebSocket('wss://example.invalid/ws')")
        page.wait_for_timeout(300)
        assert any("https://example.invalid/leak" in b for b in blocked), blocked
        assert any(b.startswith("WEBSOCKET") and "example.invalid" in b for b in blocked), blocked
        assert_raises(lambda: assert_clean(ctx, api, blocked), "차단된 요청이 있어도 통과함")
        blocked.clear()

        # 2) 모의 API 는 잘못된 메서드·경로·본문에 4xx 를 돌려주고 위반으로 기록한다
        def call(method, path, body=None):
            return page.evaluate(
                "async ([m, p, b]) => (await fetch('/api/v1' + p, {method: m, headers: {'content-type': 'application/json'}, body: b})).status",
                [method, path, None if body is None else json.dumps(body)])

        good = {"revision_id": REV_A2, "manifest_hash": HASH[REV_A2], "expected_generation": GENERATION_A0, "confirm": True,
                "idempotency_key": SAVED_MESSAGE_ID}
        approve = f"{MR}/{REV_ID_A}/approve"
        cases = [
            (lambda: call("GET", MR), 200, 0),
            (lambda: call("POST", MR, {}), 405, 1),                                                     # 조회는 GET 만
            (lambda: call("GET", approve), 405, 2),                                                     # 승인은 POST 만
            (lambda: call("POST", f"{MR}/{REV_ID_A}", {}), 405, 3),
            (lambda: call("POST", f"{MR}/{REV_ID_A}/unknown", {}), 404, 4),                             # 계약에 없는 경로
            (lambda: call("POST", approve, {k: v for k, v in good.items() if k != "confirm"}), 422, 5),   # 필드 누락
            (lambda: call("POST", approve, {**good, "confirm": False}), 409, 6),
            (lambda: call("POST", approve, {**good, "revision_id": REV_A1}), 409, 7),                   # 고정 판본이 아님
            (lambda: call("POST", approve, {**good, "manifest_hash": "x"}), 409, 8),
            (lambda: call("POST", approve, {**good, "expected_generation": GENERATION_A0 + 1}), 409, 9),
        ]
        for do, want, violations in cases:
            got = do()
            assert got == want and len(api.violations) == violations, (got, want, violations, api.violations)
        assert_raises(lambda: assert_clean(ctx, api, blocked), "계약 위반이 있어도 통과함")
        assert api.bodies == [] and api.status_a == "review_ready", "위반 요청이 상태를 바꿈"
        print("selftest: PASS (egress abort, 메서드/경로/본문 4xx)")
    finally:
        ctx.close()


def assert_raises(fn, message):
    try:
        fn()
    except AssertionError:
        return
    raise AssertionError(message)


def run_flow(browser, label, width, height, mobile):
    api = Api()
    ctx, page, blocked = open_page(browser, width, height, mobile, api)
    try:
        # 1) 목업 대상 목록 표시
        bar = page.get_by_role("region", name="목업 수정 요청 대상")
        trigger = bar.get_by_role("button", name=re.compile(r"목업 수정 요청 \(대상 2건 중 선택\)"))
        trigger.wait_for(timeout=8000)
        trigger.click()
        bar.get_by_role("button", name="채팅 아티팩트 목업 A", exact=True).wait_for()
        bar.get_by_role("button", name="모바일 입력창 목업 B", exact=True).wait_for()
        shot(page, f"{label}-1-target-list")

        # 2) 패널 열기 → 판본/화면/이미지
        page.get_by_role("button", name="채팅 아티팩트 목업 A 검토 패널 열기").click()
        panel = page.get_by_role("complementary", name="목업 검토")
        panel.get_by_text("채팅 아티팩트 목업 A").first.wait_for()
        panel.get_by_text(re.compile(r"판본 v2 \(최신\)")).wait_for()
        panel.locator("img").first.wait_for()
        shot(page, f"{label}-2-panel")

        # 3) 고정 판본 문서 열람 — 최신 문서 판본(r4)이 아니라 고정 판본(r3) 본문이 보여야 한다
        panel.get_by_text("수정 문서·변경 이력").click()
        panel.get_by_role("button", name="고정 판본 열람").click()
        body = panel.get_by_text(re.compile("고정 판본 본문"))
        body.wait_for(timeout=5000)
        panel.get_by_text(f"고정 판본: {DOC_REV}").wait_for()
        assert panel.get_by_text(PINNED_MARK).count() == 1, "고정 판본 본문이 표시되지 않음"
        assert page.get_by_text(LATEST_MARK).count() == 0, "최신 문서 판본 본문이 표시됨"
        assert panel.get_by_text(f"고정 판본: {DOC_REV_LATEST}").count() == 0
        assert api.doc_content_revisions == [DOC_REV_NO], f"content 요청 revision {api.doc_content_revisions}"
        body.scroll_into_view_if_needed()
        page.evaluate("document.querySelector('aside[aria-label=\"목업 검토\"] > div').scrollBy(0, 160)")
        shot(page, f"{label}-3-pinned-document")
        panel.get_by_role("button", name="문서 닫기").click()

        # 4) 승인/수정 요청(재승인 포함) 버튼 표시
        approve = panel.get_by_role("button", name="승인", exact=True)
        change = panel.get_by_role("button", name="수정 요청", exact=True)
        approve.scroll_into_view_if_needed()
        assert approve.is_enabled() and change.is_enabled(), "최신 review_ready 판본은 승인·수정 요청이 모두 가능해야 함"
        for btn in (approve, change):
            box = btn.bounding_box()
            assert box and box["height"] >= 44, f"터치 영역 부족 {box}"
        shot(page, f"{label}-4-action-buttons")
        change.click()
        panel.get_by_role("button", name="입력창에 수정 요청 쓰기").wait_for()
        shot(page, f"{label}-5-change-request-mode")
        panel.get_by_role("button", name="취소", exact=True).click()

        # 5) 재승인: 모의 POST 로만 승인(운영 호출 없음). 본문은 고정 판본과 일치해야 한다
        approve.click()
        dialog = page.get_by_role("dialog", name="승인 확인")
        dialog.wait_for()
        shot(page, f"{label}-6-approve-confirm")
        dialog.get_by_role("button", name="승인합니다").click()
        panel.get_by_text("승인했습니다.").wait_for(timeout=5000)
        assert api.writes == [("POST", f"{MR}/{REV_ID_A}/approve")], api.writes
        [(path, sent)] = api.bodies
        assert path == f"{MR}/{REV_ID_A}/approve"
        assert {k: sent[k] for k in ("revision_id", "manifest_hash", "expected_generation", "confirm")} == {
            "revision_id": REV_A2, "manifest_hash": HASH[REV_A2], "expected_generation": GENERATION_A0, "confirm": True}, sent
        shot(page, f"{label}-7-approved")
        no_horizontal_overflow(page)
        assert_clean(ctx, api, blocked)
    finally:
        ctx.close()
    return api


def run_change_reapprove(browser, label, width, height, mobile):
    # 수정 요청 접수 → 새 판본 생성(generation+1) → 재승인
    api = Api()
    comment = "채팅 화면의 헤더 높이를 줄이고 입력창을 더 크게 해 주세요"
    api.expect_comment = comment
    ctx, page, blocked = open_page(browser, width, height, mobile, api)
    try:
        bar, panel = open_panel(page)
        panel.get_by_role("button", name="수정 요청", exact=True).click()
        panel.get_by_role("button", name="입력창에 수정 요청 쓰기").click()
        bar.get_by_text(re.compile("수정 요청 모드")).first.wait_for()
        box = page.get_by_placeholder("메시지 입력")
        box.fill(comment)
        shot(page, f"{label}-14-change-request-typed")
        box.press("Enter")   # 열린 패널이 전송 버튼을 가릴 수 있어 Enter 로 보낸다

        # 접수 → 같은 패널이 새 판본(v3, 최신)으로 갱신된다
        bar.get_by_text(re.compile("수정 요청이 접수되었습니다")).wait_for(timeout=5000)
        panel.get_by_text(re.compile(r"판본 v3 \(최신\)")).wait_for(timeout=8000)
        assert api.writes == [("POST", f"{MR}/change-intake")], api.writes
        assert api.latest_a == REV_A3 and api.generation == GENERATION_A0 + 1, (api.latest_a, api.generation)
        intake = api.bodies[0][1]
        assert intake["expected_generation"] == GENERATION_A0 and intake["comment"] == comment and "confirm" not in intake, intake
        shot(page, f"{label}-15-new-revision")

        # 재승인: 새 판본(REV_A3)·새 manifest_hash·generation+1 로 승인한다
        confirm_approve(page, panel)
        assert api.writes == [("POST", f"{MR}/change-intake"), ("POST", f"{MR}/{REV_ID_A}/approve")], api.writes
        sent = api.bodies[1][1]
        assert {k: sent[k] for k in ("revision_id", "manifest_hash", "expected_generation", "confirm")} == {
            "revision_id": REV_A3, "manifest_hash": HASH[REV_A3], "expected_generation": GENERATION_A0 + 1, "confirm": True}, sent
        assert api.status_a == "approved"
        shot(page, f"{label}-16-reapproved")
        no_horizontal_overflow(page)
        assert_clean(ctx, api, blocked)
    finally:
        ctx.close()
    return api


def run_recovery(browser, label, width, height, mobile):
    # API 실패 → 복구 안내 → 다시 시도로 복구
    api = Api()
    api.fail_review = 99
    ctx, page, blocked = open_page(browser, width, height, mobile, api)
    try:
        bar = page.get_by_role("region", name="목업 수정 요청 대상")
        # review 상세 조회가 실패하면 후보 조회가 실패로 표시되고 목록은 비어 있다
        bar.get_by_text(re.compile("후보 일부를 불러오지 못했습니다")).wait_for(timeout=8000)
        shot(page, f"{label}-8-candidates-failed")
        assert not bar.get_by_role("button", name=re.compile("목업 수정 요청")).count(), "실패 시 가짜 후보를 보이면 안 됨"
        api.fail_review = 0
        page.reload()
        bar = page.get_by_role("region", name="목업 수정 요청 대상")
        bar.get_by_role("button", name=re.compile("목업 수정 요청")).click()
        api.fail_review = 1  # 패널을 여는 첫 조회만 실패
        page.get_by_role("button", name="채팅 아티팩트 목업 A 검토 패널 열기").click()
        panel = page.get_by_role("complementary", name="목업 검토")
        alert = panel.get_by_role("alert").first
        alert.wait_for(timeout=5000)
        assert "HTTP 500" in alert.inner_text() or "실패" in alert.inner_text(), alert.inner_text()
        shot(page, f"{label}-9-panel-load-error")
        panel.get_by_role("button", name="새로고침").click()
        panel.get_by_text(re.compile(r"판본 v2 \(최신\)")).wait_for(timeout=5000)
        assert panel.get_by_role("alert").count() == 0
        shot(page, f"{label}-10-recovered")

        # 승인 중 서버가 앞서 나간 경우(409/stale) → 새로고침 안내 (본문은 계약대로 검증된 뒤 오류를 주입)
        api.fail_approve = 409
        panel.get_by_role("button", name="승인", exact=True).click()
        page.get_by_role("dialog", name="승인 확인").get_by_role("button", name="승인합니다").click()
        err = panel.get_by_role("alert").first
        err.wait_for(timeout=5000)
        err.get_by_role("button", name="새로고침").wait_for()
        shot(page, f"{label}-11-approve-stale")
        assert len(api.bodies) == 1 and api.bodies[0][1]["revision_id"] == REV_A2, api.bodies
        api.fail_approve = None
        err.get_by_role("button", name="새로고침").click()
        err.wait_for(state="detached", timeout=5000)
        panel.get_by_text(re.compile(r"판본 v2 \(최신\)")).wait_for()
        assert panel.get_by_role("alert").count() == 0

        # 고정 판본 문서가 없거나 삭제된 경우 → 안내 + 다시 시도
        api.doc_fail = 1
        panel.get_by_text("수정 문서·변경 이력").click()
        panel.get_by_role("button", name="고정 판본 열람").click()
        doc_alert = panel.get_by_role("alert").filter(has_text="고정 판본이 없거나 삭제")
        doc_alert.wait_for(timeout=5000)
        shot(page, f"{label}-12-pinned-document-error")
        doc_alert.get_by_role("button", name="다시 시도").click()
        panel.get_by_text(re.compile("고정 판본 본문")).wait_for(timeout=5000)
        assert panel.get_by_text(PINNED_MARK).count() == 1 and page.get_by_text(LATEST_MARK).count() == 0
        shot(page, f"{label}-13-pinned-document-recovered")
        no_horizontal_overflow(page)
        assert_clean(ctx, api, blocked)
    finally:
        ctx.close()


def main():
    assert (DIST / "bundle.js").exists(), "먼저 vite build 로 하니스를 만들어야 합니다"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            run_selftest(browser)
            for label, w, h, mobile in (("desktop", 1280, 800, False), ("mobile", 390, 844, True)):
                api = run_flow(browser, label, w, h, mobile)
                run_change_reapprove(browser, label, w, h, mobile)
                run_recovery(browser, label, w, h, mobile)
                print(f"{label}: PASS (쓰기 호출 기록 {api.writes})")
        finally:
            browser.close()
    print("ALL PASS")


if __name__ == "__main__":
    main()
