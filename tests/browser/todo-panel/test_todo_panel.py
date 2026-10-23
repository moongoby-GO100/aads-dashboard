#!/usr/bin/env python3
"""TODO 패널 브라우저 검증 (실제 TodoPanel + useSessionTodos + api.ts, 조회/수정 API는 fixture).

재현:
  cd <dashboard>/tests/browser/todo-panel
  npx vite build --config build.config.mts          # /tmp/todo-harness-dist/bundle.js
  python3 test_todo_panel.py [증거_디렉터리]          # 기본 /tmp/todo-evidence

운영 데이터는 읽거나 쓰지 않는다. harness.local 은 Playwright route 로만 응답한다.
"""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

DIST = Path(os.environ.get("TODO_HARNESS_OUT", "/tmp/todo-harness-dist"))
EVIDENCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/todo-evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)

HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--ct-bg:#0f1115;--ct-sb:#161a21;--ct-card:#1c212b;--ct-border:#2c3340;--ct-text:#e6e8ee;--ct-text2:#9aa3b2;--ct-hover:#262c38;--ct-accent:#3b82f6;--ct-input:#12161d}
html,body{margin:0;height:100%;font-family:sans-serif}
</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>"""

LONG_TITLE = (
    "채팅 화면 TODO 패널에서 진행 18건 완료 77건 실패 5건이 전부 보이지 않는 문제의 원인을 확인하고 "
    "내부 스크롤과 등록일시 표시, 긴 한국어 제목 전체 읽기, 저장 실패 시 원문 보존까지 모바일과 PC에서 함께 검증한 뒤 결과를 보고한다"
)


def iso(day_offset, minutes=0):
    base = 1_761_000_000 + day_offset * 86400 + minutes * 60  # 2025-10 이후
    return time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(base))


def make_item(sid, n, status, sort, created=None, title=None):
    item = {
        "id": f"{sid}-{n:04d}", "session_id": sid, "message_id": None, "execution_id": None,
        "title": title or f"{sid} 작업 {n:04d}", "status": status, "sort_order": sort,
        "source": "user_turn", "created_at": created, "updated_at": iso(0),
    }
    if created is None:
        item.pop("created_at")
    return item


def build_main():
    items = []
    n = 0
    for i in range(18):
        n += 1
        items.append(make_item("s-main", n, "in_progress" if i < 3 else "pending", n, iso(-30 + i)))
    for i in range(77):
        n += 1
        items.append(make_item("s-main", n, "completed", n, iso(-60 + i)))
    for i in range(5):
        n += 1
        items.append(make_item("s-main", n, "failed", n, iso(-5 + i)))
    items[0]["title"] = LONG_TITLE
    items[0]["created_at"] = "2026-10-21T15:05:00+00:00"          # -> 2026-10-22 00:05 KST
    items[1]["created_at"] = "not-a-date"                           # 잘못된 날짜
    items[2].pop("created_at")                                      # 누락
    items[3]["created_at"] = "1970-01-01T00:00:00+00:00"            # epoch
    items[4]["created_at"] = "2026-10-22 09:30:00"                  # tz 없는 값
    items[5]["title"] = (LONG_TITLE + " ") * 2                       # 서버 최대 300자에 가까운 제목
    return items


def build_big():
    items = []
    n = 0
    for i in range(30):
        n += 1
        items.append(make_item("s-big", n, "pending", n, iso(-20 + i % 10)))
    for i in range(400):
        n += 1
        items.append(make_item("s-big", n, "completed", n, iso(-100 + i % 50)))
    for i in range(20):
        n += 1
        items.append(make_item("s-big", n, "failed", n, iso(-9 + i % 5)))
    return items


STATE = {}
CALLS = []


def reset_state():
    STATE.clear()
    STATE.update({
        "s-main": build_main(),
        "s-big": build_big(),
        "s-large": [make_item("s-large", n, "pending" if n <= 12 else "failed" if n <= 196 else "completed", n, iso(-n % 50)) for n in range(1, 1601)],
        "s-old": build_big()[:260],
        "s-other": [make_item("s-other", i, "pending", i, iso(-i)) for i in range(1, 4)],
        "s-slow": [make_item("s-slow", i, "pending", i, iso(-i)) for i in range(1, 4)],
        "fail_patch": False,
        "fail_get": False,
    })
    CALLS.clear()


RANK = {"in_progress": 0, "pending": 0, "failed": 1, "skipped": 1, "completed": 1}


def ordered(items):
    return sorted(items, key=lambda it: (RANK[it["status"]], it["sort_order"], it.get("created_at") or "", it["id"]))


def api_handler(route, request):
    url = urlparse(request.url)
    m = re.match(r"^/api/v1/chat/sessions/([^/]+)/todos(?:/([^/]+))?$", url.path)
    headers = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
    if request.method == "OPTIONS":
        return route.fulfill(status=204, headers=headers)
    if not m:
        return route.fulfill(status=404, headers=headers, body="{}")
    sid, todo_id = m.group(1), m.group(2)
    items = STATE.get(sid, [])
    q = parse_qs(url.query)
    CALLS.append({"method": request.method, "path": url.path, "query": url.query, "body": request.post_data})
    if request.method == "GET" and not todo_id:
        if STATE["fail_get"]:
            return route.fulfill(status=500, headers=headers, body="boom")
        limit = min(int(q.get("limit", ["100"])[0]), 200)
        offset = 0 if sid == "s-old" else int(q.get("offset", ["0"])[0])
        rows = ordered(items)[offset:offset + limit]
        if sid == "s-slow":
            time.sleep(1.2)
        return route.fulfill(status=200, headers={**headers, "content-type": "application/json"}, body=json.dumps(rows))
    if request.method == "PATCH" and todo_id:
        if STATE["fail_patch"]:
            return route.fulfill(status=500, headers=headers, body='{"detail":"failed to update session todo"}')
        body = json.loads(request.post_data or "{}")
        for it in items:
            if it["id"] == todo_id:
                if "title" in body:
                    it["title"] = body["title"]
                if "status" in body:
                    it["status"] = body["status"]
                return route.fulfill(status=200, headers={**headers, "content-type": "application/json"}, body=json.dumps(it))
        return route.fulfill(status=404, headers=headers, body="{}")
    return route.fulfill(status=405, headers=headers, body="{}")


RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append({"name": name, "pass": bool(cond), "detail": detail})
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def open_page(ctx, session="s-main", screen="desktop"):
    page = ctx.new_page()
    def dispatch(route, request):
        path = urlparse(request.url).path
        if path.startswith("/api/"):
            return api_handler(route, request)
        if path == "/bundle.js":
            return route.fulfill(status=200, content_type="application/javascript", body=(DIST / "bundle.js").read_text())
        return route.fulfill(status=200, content_type="text/html", body=HTML)

    page.route("http://harness.local/**", dispatch)
    page.goto(f"http://harness.local/?session={session}&screen={screen}")
    page.wait_for_selector("[data-testid=todo-panel]")
    return page


def expand(page):
    if page.locator("[data-testid=todo-collapse-toggle]").get_attribute("aria-expanded") == "false":
        page.click("[data-testid=todo-collapse-toggle]")
    page.wait_for_selector("[data-testid=todo-scroll]")


def metrics(page):
    return page.evaluate("""() => {
      const s = document.querySelector('[data-testid=todo-scroll]');
      const rows = [...s.querySelectorAll('[data-testid=todo-row]')];
      const last = rows[rows.length - 1];
      const sr = s.getBoundingClientRect();
      const lr = last ? last.getBoundingClientRect() : null;
      const vh = window.innerHeight;
      const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, h: r.height}; };
      return {
        scrollHeight: s.scrollHeight, clientHeight: s.clientHeight, scrollTop: s.scrollTop, scrollWidth: s.scrollWidth, clientWidth: s.clientWidth,
        rows: rows.length,
        lastVisible: lr ? (lr.top >= sr.top - 1 && lr.bottom <= sr.bottom + 1) : null,
        header: rect('[data-testid=chat-header]'), input: rect('[data-testid=chat-textarea]'), vh,
        panel: rect('[data-testid=todo-panel]'),
      };
    }""")


def wheel_to_bottom(page):
    page.hover("[data-testid=todo-scroll]")
    for _ in range(40):
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(40)
        m = metrics(page)
        if m["scrollTop"] + m["clientHeight"] >= m["scrollHeight"] - 1:
            break
    page.wait_for_timeout(150)
    return metrics(page)


def touch_swipe_up(cdp, x, y, distance=240, steps=8):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - distance * i / steps}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def layout_ok(m):
    return (m["header"] and m["header"]["top"] >= 0 and m["header"]["bottom"] <= m["vh"]
            and m["input"] and m["input"]["bottom"] <= m["vh"] + 1 and m["input"]["h"] >= 50)


def scenario_desktop(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720}, timezone_id="America/Los_Angeles")
    page = open_page(ctx)
    counts = page.inner_text("[data-testid=todo-counts]")
    check("D1 헤더 집계 진행18·완료77·실패5", "진행 18" in counts and "완료 77" in counts and "실패 5" in counts, counts)
    expand(page)
    summary = page.inner_text("[data-testid=todo-summary]")
    check("D2 표시건수/집계 구분 문구", "표시 18건" in summary and "불러온 100건" in summary, summary)
    m = metrics(page)
    check("D3 진행 18행 모두 렌더(8행 상한 제거)", m["rows"] == 18, f"rows={m['rows']}")
    check("D4 scrollHeight>clientHeight", m["scrollHeight"] > m["clientHeight"], f"{m['scrollHeight']}>{m['clientHeight']}")
    check("D5 헤더·입력창이 뷰포트 안에 유지", layout_ok(m), json.dumps({k: m[k] for k in ('header', 'input', 'vh')}))
    page.screenshot(path=str(EVIDENCE / "desktop-active-top.png"))
    m = wheel_to_bottom(page)
    check("D6 PC wheel 로 마지막 행 가시", m["lastVisible"] and m["scrollTop"] > 0, f"scrollTop={m['scrollTop']}")
    page.evaluate("document.querySelector('[data-testid=todo-scroll]').scrollTop = 0")
    page.focus("[data-testid=todo-scroll]")
    page.keyboard.press("End")
    page.wait_for_timeout(200)
    m = metrics(page)
    check("D7 키보드 End 로 마지막 행 가시", m["lastVisible"], f"scrollTop={m['scrollTop']}")
    page.screenshot(path=str(EVIDENCE / "desktop-active-bottom.png"))

    page.click("[data-testid=todo-filter-toggle]")
    page.wait_for_timeout(100)
    m = metrics(page)
    summary = page.inner_text("[data-testid=todo-summary]")
    check("D8 전체 보기 100행", m["rows"] == 100, f"rows={m['rows']} {summary}")
    m = wheel_to_bottom(page)
    last_status = page.evaluate("[...document.querySelectorAll('[data-testid=todo-row]')].pop().dataset.status")
    check("D9 전체 보기 wheel 마지막 행(완료) 가시", m["lastVisible"] and last_status == "completed", f"status={last_status}")
    check("D10 전체 보기에서도 헤더·입력창 유지", layout_ok(m))
    page.screenshot(path=str(EVIDENCE / "desktop-all-bottom.png"))
    failed_visible = page.locator("[data-testid=todo-row][data-status=failed]").count()
    check("D11 실패 5행 접근 가능", failed_visible == 5, f"failed={failed_visible}")

    page.evaluate("document.querySelector('[data-testid=todo-scroll]').scrollTop = 0")
    first = page.locator("[data-testid=todo-row]").first
    created = first.locator("[data-testid=todo-created-at]").inner_text()
    check("D12 created_at → KST (브라우저 TZ=LA 에서도)", created == "2026-10-22 00:05 KST", created)
    rows = page.locator("[data-testid=todo-row]")
    texts = [rows.nth(i).locator("[data-testid=todo-created-at]").inner_text() for i in range(5)]
    check("D13 잘못된/누락/epoch 은 등록일시 미확인", texts[1:4] == ["등록일시 미확인"] * 3, str(texts))
    check("D14 tz 없는 값은 UTC 로 해석", texts[4] == "2026-10-22 18:30 KST", texts[4])
    unknown_flags = [rows.nth(i).locator("[data-testid=todo-created-at]").get_attribute("data-known") for i in range(5)]
    check("D15 known 플래그", unknown_flags == ["1", "0", "0", "0", "1"], str(unknown_flags))

    title = rows.nth(5).locator("[data-testid=todo-title]")
    full_expected = (LONG_TITLE + " ") * 2
    clamped = page.evaluate("(el) => el.scrollHeight > el.clientHeight + 1", title.element_handle())
    check("D16 아주 긴 제목은 기본 2줄 접힘", clamped)
    title.click()
    page.wait_for_timeout(100)
    expanded_text = title.inner_text()
    still = page.evaluate("(el) => el.scrollHeight > el.clientHeight + 1", title.element_handle())
    check("D17 클릭하면 제목 전문 표시", expanded_text == full_expected and not still, f"len={len(expanded_text)}")
    page.screenshot(path=str(EVIDENCE / "desktop-long-title-expanded.png"))
    ctx.close()


def scenario_mobile(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = open_page(ctx, screen="mobile")
    check("M1 모바일에서 TODO 패널 렌더", page.locator("[data-testid=todo-panel]").count() == 1)
    expand(page)
    m = metrics(page)
    check("M2 scrollHeight>clientHeight", m["scrollHeight"] > m["clientHeight"], f"{m['scrollHeight']}>{m['clientHeight']}")
    check("M3 헤더·입력창이 화면 안에 유지", layout_ok(m), json.dumps({k: m[k] for k in ('header', 'input', 'vh', 'panel')}))
    check("M4 가로 넘침 없음", m["scrollWidth"] <= m["clientWidth"] + 1, f"{m['scrollWidth']} vs {m['clientWidth']}")
    page.screenshot(path=str(EVIDENCE / "mobile-active-top.png"))
    cdp = ctx.new_cdp_session(page)
    box = page.locator("[data-testid=todo-scroll]").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] - 20
    for _ in range(30):
        touch_swipe_up(cdp, x, y, 200)
        page.wait_for_timeout(120)
        m = metrics(page)
        if m["scrollTop"] + m["clientHeight"] >= m["scrollHeight"] - 1:
            break
    m = metrics(page)
    check("M5 touch 스와이프로 마지막 행 가시", m["lastVisible"] and m["scrollTop"] > 0, f"scrollTop={m['scrollTop']}")
    page.screenshot(path=str(EVIDENCE / "mobile-active-bottom.png"))

    page.click("[data-testid=todo-filter-toggle]")
    page.wait_for_timeout(100)
    page.evaluate("document.querySelector('[data-testid=todo-scroll]').scrollTop = 0")
    box = page.locator("[data-testid=todo-scroll]").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] - 20
    for _ in range(120):
        touch_swipe_up(cdp, x, y, 200)
        page.wait_for_timeout(120)
        m = metrics(page)
        if m["scrollTop"] + m["clientHeight"] >= m["scrollHeight"] - 1:
            break
    m = metrics(page)
    check("M6 전체 100행 touch 로 마지막 행 가시", m["rows"] == 100 and m["lastVisible"], f"rows={m['rows']} scrollTop={m['scrollTop']}")

    page.evaluate("document.querySelector('[data-testid=todo-scroll]').scrollTop = 0")
    first = page.locator("[data-testid=todo-row]").first
    title = first.locator("[data-testid=todo-title]")
    created_box = first.locator("[data-testid=todo-created-at]").bounding_box()
    title_box = title.bounding_box()
    check("M7 모바일은 등록일시가 제목 아래로 줄바꿈(제목 폭 전체 사용)", created_box["y"] >= title_box["y"] + title_box["height"] - 2, f"title={title_box} created={created_box}")
    title.tap()
    page.wait_for_timeout(100)
    full = title.inner_text()
    clipped = page.evaluate("(el) => el.scrollHeight > el.clientHeight + 1", title.element_handle())
    tbox = title.bounding_box()
    check("M8 모바일에서 탭하면 긴 제목 전문 표시", full == LONG_TITLE and not clipped and tbox["x"] + tbox["width"] <= 392, f"w={tbox['width']}")
    page.screenshot(path=str(EVIDENCE / "mobile-long-title-expanded.png"))
    small = page.evaluate("""() => [...document.querySelectorAll('[data-testid=todo-row] button')].filter(b => b.getBoundingClientRect().height < 30).length""")
    check("M9 행 버튼 터치 영역 ≥30px", small == 0, f"small buttons={small}")
    hdr_small = page.evaluate("""() => [...document.querySelectorAll('[data-testid=todo-panel] > div:first-child button')].filter(b => b.getBoundingClientRect().height < 30).length""")
    check("M10 헤더 버튼 터치 영역 ≥30px", hdr_small == 0, f"small={hdr_small}")
    ctx.close()


def scenario_pagination(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = open_page(ctx, session="s-big")
    expand(page)
    page.click("[data-testid=todo-filter-toggle]")
    page.wait_for_timeout(100)
    first_page = [c for c in CALLS if c["method"] == "GET" and "limit=200" in c["query"] and "offset" not in c["query"]]
    check("P1 목록 요청이 limit=200 (서버 최대)", len(first_page) >= 1, str(first_page[:1]))
    m = metrics(page)
    check("P2 첫 페이지 200행 + 더 불러오기 표시", m["rows"] == 200 and page.locator("[data-testid=todo-load-more]").count() == 1, f"rows={m['rows']}")
    summary = page.inner_text("[data-testid=todo-summary]")
    check("P3 상한 도달 안내", "더 불러올 항목 있음" in summary and page.inner_text("[data-testid=todo-counts]").rstrip().endswith("+"), summary)
    page.screenshot(path=str(EVIDENCE / "desktop-pagination-200.png"))
    page.click("[data-testid=todo-load-more]")
    page.wait_for_function("document.querySelectorAll('[data-testid=todo-row]').length === 400")
    page.click("[data-testid=todo-load-more]")
    page.wait_for_function("document.querySelectorAll('[data-testid=todo-row]').length === 450")
    page.wait_for_timeout(150)
    check("P4 offset 으로 450건 전부 도달, 더 불러오기 사라짐", page.locator("[data-testid=todo-load-more]").count() == 0)
    ids = page.evaluate("[...document.querySelectorAll('[data-testid=todo-row]')].map(r => r.dataset.todoId)")
    check("P5 중복 행 없음", len(ids) == len(set(ids)) == 450, f"{len(ids)}/{len(set(ids))}")
    counts = page.inner_text("[data-testid=todo-counts]")
    check("P6 집계가 전체 450건 기준(진행30·완료400·실패20)", "진행 30" in counts and "완료 400" in counts and "실패 20" in counts and "+" not in counts, counts)
    page.click("[data-testid=todo-load-more]") if page.locator("[data-testid=todo-load-more]").count() else None
    CALLS.clear()
    page.click("[data-testid=todo-refresh]") if page.locator("[data-testid=todo-refresh]").count() else page.click("button[title='TODO 새로고침']")
    page.wait_for_timeout(500)
    refetch = [c for c in CALLS if c["method"] == "GET"]
    check("P7 새로고침 후에도 450건 유지(로드한 페이지 재조회)", page.locator("[data-testid=todo-row]").count() == 450 and len(refetch) >= 3, f"gets={len(refetch)}")
    ctx.close()

    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = open_page(ctx, session="s-old")
    expand(page)
    page.click("[data-testid=todo-filter-toggle]")
    page.wait_for_selector("[data-testid=todo-load-more]")
    page.click("[data-testid=todo-load-more]")
    page.wait_for_timeout(500)
    rows = page.locator("[data-testid=todo-row]").count()
    check("P8 offset 미지원 서버: 중복 없이 200행, 더 불러오기 종료", rows == 200 and page.locator("[data-testid=todo-load-more]").count() == 0, f"rows={rows}")
    ctx.close()


def scenario_load_more_from_active(browser):
    for width, height, screen in ((1280, 720, "desktop"), (390, 844, "mobile")):
        ctx = browser.new_context(viewport={"width": width, "height": height})
        page = open_page(ctx, session="s-big", screen=screen)
        expand(page)
        check(f"L1 {screen} 기본 진행 필터 30행", page.locator("[data-testid=todo-row]").count() == 30)
        previous = set(page.locator("[data-testid=todo-row]").evaluate_all("rows => rows.map(r => r.dataset.todoId)"))
        # Include hidden first-page rows so the anchor must be from page two.
        previous.update(it["id"] for it in ordered(STATE["s-big"])[:200])
        page.click("[data-testid=todo-load-more]")
        page.wait_for_function("document.querySelectorAll('[data-testid=todo-row]').length === 400")
        check(f"L2 {screen} 더 불러오기 후 완료 항목도 표시", page.locator("[data-testid=todo-filter-toggle]").get_attribute("aria-pressed") == "true")
        added_id = next(row for row in page.locator("[data-testid=todo-row]").evaluate_all("rows => rows.map(r => r.dataset.todoId)") if row not in previous)
        visible = page.locator(f"[data-todo-id='{added_id}']").evaluate("""row => {
            const r = row.getBoundingClientRect(), s = row.closest('[data-testid=todo-scroll]').getBoundingClientRect();
            return r.top >= s.top - 1 && r.top < s.bottom && s.height > 0;
        }""")
        check(f"L3 {screen} 새 페이지 첫 항목 실제 가시", visible)
        page.screenshot(path=str(EVIDENCE / f"{screen}-load-more-visible.png"))
        ctx.close()


def scenario_large_narrow_list(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = open_page(ctx, session="s-large")
    # Real chat shares its width with both the session and artifact sidebars.
    page.locator("#root").evaluate("e => e.style.width = '560px'")
    expand(page)
    for total in range(400, 1601, 200):
        page.click("[data-testid=todo-load-more]")
        page.wait_for_function("n => document.querySelectorAll('[data-testid=todo-row]').length === n", arg=total)
        scroller = page.locator("[data-testid=todo-scroll]")
        actual_height = scroller.evaluate("e => e.clientHeight")
        check(f"N{total} 좁은 채팅에서도 목록 공간 확보", actual_height >= 64, f"height={actual_height}")
    page.screenshot(path=str(EVIDENCE / "desktop-1600-narrow.png"))
    check("N1600 입력창 유지", layout_ok(metrics(page)))
    ctx.close()


def scenario_edit(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = open_page(ctx)
    expand(page)
    first_id = page.locator("[data-testid=todo-row]").first.get_attribute("data-todo-id")
    row = page.locator(f"[data-todo-id='{first_id}']")
    row.locator("[data-testid=todo-title]").dblclick()
    inp = page.locator("[data-testid=todo-edit-input]")
    inp.fill("수정된 제목 가나다라마바사 — 긴 한국어 제목 보존 검증")
    STATE["fail_patch"] = True
    inp.press("Enter")
    page.wait_for_selector("[data-testid=todo-edit-error]")
    check("E1 저장 실패 시 오류 표시", "저장 실패" in page.inner_text("[data-testid=todo-edit-error]"), page.inner_text("[data-testid=todo-edit-error]"))
    check("E2 저장 실패 시 입력 원문 보존", page.locator("[data-testid=todo-edit-input]").input_value() == "수정된 제목 가나다라마바사 — 긴 한국어 제목 보존 검증")
    page.screenshot(path=str(EVIDENCE / "desktop-edit-failure.png"))
    check("E3 서버 저장본은 변경되지 않음", STATE["s-main"][0]["title"] == LONG_TITLE)
    STATE["fail_patch"] = False
    page.click("[data-testid=todo-edit-retry]")
    page.wait_for_function("!document.querySelector('[data-testid=todo-edit-input]')")
    shown = page.locator(f"[data-todo-id='{first_id}'] [data-testid=todo-title]").inner_text()
    check("E4 재시도 성공 → 즉시 새 제목 렌더(2초 throttle 무관)", shown == "수정된 제목 가나다라마바사 — 긴 한국어 제목 보존 검증", shown)
    patches = [c for c in CALLS if c["method"] == "PATCH"]
    check("E5 PATCH 본문이 입력 제목 그대로", json.loads(patches[-1]["body"]) == {"title": "수정된 제목 가나다라마바사 — 긴 한국어 제목 보존 검증"}, str(patches[-1]["body"]))
    page.reload()
    page.wait_for_selector("[data-testid=todo-panel]")
    expand(page)
    shown = page.locator(f"[data-todo-id='{first_id}'] [data-testid=todo-title]").inner_text()
    check("E6 새로고침 후에도 저장된 제목 유지(저장→API→렌더)", shown == "수정된 제목 가나다라마바사 — 긴 한국어 제목 보존 검증", shown)
    row = page.locator(f"[data-todo-id='{first_id}']")
    row.locator("[data-testid=todo-edit-button]").click()
    page.locator("[data-testid=todo-edit-input]").fill("취소될 제목")
    page.locator("[data-testid=todo-edit-input]").press("Escape")
    shown = page.locator(f"[data-todo-id='{first_id}'] [data-testid=todo-title]").inner_text()
    check("E7 Escape 는 편집 취소(원제목 유지)", shown.startswith("수정된 제목"), shown)
    n_patch = len([c for c in CALLS if c["method"] == "PATCH"])
    row.locator("[data-testid=todo-edit-button]").click()
    page.locator("[data-testid=todo-edit-input]").press("Enter")
    page.wait_for_timeout(200)
    check("E8 변경 없는 저장은 PATCH 생략", len([c for c in CALLS if c["method"] == "PATCH"]) == n_patch)
    # 상태 변경 동작 유지
    page.locator("[data-testid=todo-row][data-status=pending] button[title='이 TODO를 제외 처리']").first.click()
    page.wait_for_timeout(400)
    skipped = [it for it in STATE["s-main"] if it["status"] == "skipped"]
    check("E9 기존 상태변경(제외) 동작 유지", len(skipped) == 1, str(len(skipped)))
    # 추가 실패 시 입력 보존은 POST 미구현 라우트(405)로 확인
    page.click("button[title='새 TODO 추가']")
    page.fill("[data-testid=todo-add-input]", "추가 실패 보존 확인")
    page.click("[data-testid=todo-add-submit]")
    page.wait_for_selector("[data-testid=todo-add-error]")
    check("E10 추가 실패 시 오류 표시 + 입력 보존", page.locator("[data-testid=todo-add-input]").input_value() == "추가 실패 보존 확인")
    ctx.close()


def scenario_isolation(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = open_page(ctx, session="s-main")
    expand(page)
    page.evaluate("window.__setSession('s-other')")
    page.wait_for_function("document.querySelector('[data-testid=todo-counts]') && document.querySelector('[data-testid=todo-counts]').innerText.includes('진행 3')")
    check("S0 세션 전환 시 패널 접힘 초기화", page.locator("[data-testid=todo-collapse-toggle]").get_attribute("aria-expanded") == "false")
    expand(page)
    ids = page.evaluate("[...document.querySelectorAll('[data-testid=todo-row]')].map(r => r.dataset.todoId)")
    check("S1 세션 전환 후 다른 세션 행이 섞이지 않음", ids and all(i.startswith("s-other") for i in ids), str(ids))
    page.evaluate("window.__setSession('s-slow')")
    page.wait_for_timeout(200)
    page.evaluate("window.__setSession('s-other')")
    page.wait_for_timeout(2000)
    expand(page)
    ids = page.evaluate("[...document.querySelectorAll('[data-testid=todo-row]')].map(r => r.dataset.todoId)")
    check("S2 늦게 도착한 이전 세션 응답이 현재 세션 목록을 덮지 않음", ids and all(i.startswith("s-other") for i in ids), str(ids))
    page.evaluate("window.__setSession('s-main')")
    page.wait_for_function("document.querySelector('[data-testid=todo-counts]').innerText.includes('완료 77')")
    counts = page.inner_text("[data-testid=todo-counts]")
    check("S4 원래 세션으로 복귀 시 100건 집계 복원", "진행 18" in counts and "실패 5" in counts, counts)
    ctx.close()

    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    STATE["fail_get"] = True
    page = open_page(ctx, session="s-main")
    page.wait_for_timeout(500)
    expand(page)
    check("S5 조회 실패 시 오류 배너 표시", page.locator("[data-testid=todo-error]").count() == 1)
    STATE["fail_get"] = False
    ctx.close()


def main():
    reset_state()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for scenario in (scenario_desktop, scenario_mobile, scenario_pagination, scenario_load_more_from_active, scenario_large_narrow_list, scenario_edit, scenario_isolation):
            reset_state()
            try:
                scenario(browser)
            except Exception as exc:  # noqa: BLE001
                check(f"{scenario.__name__} 예외 없이 완료", False, repr(exc)[:300])
        browser.close()
    (EVIDENCE / "results.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
    failed = [r for r in RESULTS if not r["pass"]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed; evidence={EVIDENCE}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
