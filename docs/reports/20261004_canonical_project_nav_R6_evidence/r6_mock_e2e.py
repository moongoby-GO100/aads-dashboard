"""R6 후보 화면 검증 (MOCK API): 실제 backend/운영 인증 없이 Next dev 후보 화면 + Playwright route fixture."""
import json, re, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3917"
API = BASE + "/api/v1"
OUT = sys.argv[1]
results = []

def doc(key, title, status, ver, approved=False):
    return {"id": f"id-{key}", "document_key": key, "title": title, "kind": "plan", "status": status,
            "updated_at": "2026-10-04T05:00:00Z", "generation": 3, "approved_revision_id": f"rev-{key}-a" if approved else None}

FIX = {
    "ACCT": [doc("pilot119", "ACCT 파일럿119 정본", "approved", 2, True), doc("a2", "ACCT 문서2", "draft", 1),
             doc("a3", "ACCT 문서3", "review", 1), doc("a4", "ACCT 문서4", "approved", 1, True)],
    "AADS": [doc(f"pilot{n}", f"AADS 파일럿{n} 정본", "draft", 3, True) for n in (74, 92, 109, 110)],
}

def detail(project, key, approved_only):
    base = next(d for d in FIX[project] if d["document_key"] == key)
    ver = 2 if approved_only else 3
    title = base["title"]
    body = f"[MOCK] {project}/{key} {'승인본' if approved_only else '최신 초안'} 본문 v{ver}"
    return {"document": base, "status": "approved" if approved_only else base["status"],
            "revision": {"id": f"rev-{key}-{'a' if approved_only else 'l'}", "title": title, "version": ver, "revision": ver,
                         "status": "approved" if approved_only else base["status"], "content": body,
                         "change_summary": "mock", "created_at": "2026-10-04T05:00:00Z"}}

def install(page, scan, delays=None, forbidden=()):
    delays = delays or {}
    def handler(route):
        url = route.request.url
        path = url.split("/api/v1", 1)[1].split("?")[0]
        def j(status, body):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body),
                          headers={"access-control-allow-origin": "*"})
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"})
        if path == "/project-docs/scan":
            if scan == "pending": return  # never answered
            if scan == "error": return j(500, {"detail": "scan failed"})
            return j(200, {"projects": [{"project": "AADS", "files": [{"name": "SCAN-FILE.md", "path": "SCAN-FILE.md", "base_path": "/b", "type": "report", "size": 1, "modified_at": 1, "format": "md"}], "total": 1}], "scanned_at": 1})
        m = re.match(r"^/projects/([A-Z0-9_-]+)/documents(?:/([^/]+))?(?:/(history))?$", path)
        if m:
            proj, key, hist = m.groups()
            time.sleep(delays.get(proj, 0))
            if proj in forbidden: return j(403, {"detail": "project_access_denied"})
            if proj not in FIX: return j(200, {"documents": []})
            if not key: return j(200, {"documents": FIX[proj]})
            if hist: return j(200, {"revisions": []})
            return j(200, detail(proj, key, "approved_only=true" in url))
        if path.startswith("/auth/me") or path.startswith("/me"):
            return j(200, {"user_id": "mock", "is_internal_admin": True})
        return j(200, {})
    page.route("**/api/v1/**", handler)

def check(name, ok, note=""):
    results.append({"name": name, "ok": bool(ok), "note": note}); print(("PASS " if ok else "FAIL ") + name, note)

def open_canonical(page):
    page.goto(BASE + "/docs", wait_until="domcontentloaded")
    page.get_by_role("tab", name="문서 정본").click(timeout=90000)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for vp_name, vp in (("desktop", {"width": 1366, "height": 900}), ("mobile", {"width": 390, "height": 844})):
        for scan in ("pending", "error", "ok"):
            ctx = browser.new_context(viewport=vp, service_workers="block")
            ctx.add_init_script("localStorage.setItem('aads_token','mock-not-a-secret')")
            page = ctx.new_page(); install(page, scan)
            open_canonical(page)
            acct = page.get_by_role("button", name="ACCT", exact=True)
            acct.wait_for(timeout=15000)
            check(f"{vp_name}/scan={scan}: ACCT button visible", acct.is_visible())
            acct.click()
            page.get_by_text("ACCT 파일럿119 정본").first.wait_for(timeout=15000)
            check(f"{vp_name}/scan={scan}: ACCT list 4 docs", page.get_by_role("button", name=re.compile("ACCT (파일럿119|문서)")).count() == 4)
            page.get_by_role("button", name=re.compile("ACCT 파일럿119 정본")).first.click()
            page.get_by_text("현재 승인된 정본").wait_for(timeout=15000)
            body = page.locator("body").inner_text()
            check(f"{vp_name}/scan={scan}: pilot119 approved body+revision", "승인본 본문 v2" in body and "최신 초안 본문 v3" in body and "v2" in body)
            page.screenshot(path=f"{OUT}/{vp_name}_scan-{scan}_acct.png")
            page.get_by_role("button", name="AADS", exact=True).click()
            page.get_by_text("AADS 파일럿110 정본").first.wait_for(timeout=15000)
            body = page.locator("body").inner_text()
            check(f"{vp_name}/scan={scan}: AADS pilot74/92/109/110 listed", all(f"AADS 파일럿{n} 정본" in body for n in (74, 92, 109, 110)))
            page.get_by_role("button", name=re.compile("AADS 파일럿92 정본")).first.click()
            page.get_by_text("현재 승인된 정본").wait_for(timeout=15000)
            check(f"{vp_name}/scan={scan}: AADS pilot92 latest+approved pointer", "최신 초안 본문 v3" in page.locator("body").inner_text() and "승인본 본문 v2" in page.locator("body").inner_text())
            ctx.close()

    # stale response: AADS slow, switch to ACCT; AADS result must not overwrite
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, service_workers="block"); ctx.add_init_script("localStorage.setItem('aads_token','mock-not-a-secret')")
    page = ctx.new_page(); install(page, "pending", delays={"AADS": 2.5})
    open_canonical(page)
    page.get_by_role("button", name="ACCT", exact=True).click()
    page.get_by_text("ACCT 파일럿119 정본").first.wait_for(timeout=15000)
    page.wait_for_timeout(4500)
    body = page.locator("body").inner_text()
    check("stale: slow AADS list does not overwrite ACCT", "ACCT 파일럿119 정본" in body and "AADS 파일럿74 정본" not in body)
    ctx.close()

    # grant 403 on GO100: clear message, no login-recovery link, other project still works, retry present
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block"); ctx.add_init_script("localStorage.setItem('aads_token','mock-not-a-secret')")
    page = ctx.new_page(); install(page, "error", forbidden=("GO100",))
    open_canonical(page)
    page.get_by_role("button", name="GO100", exact=True).click()
    page.get_by_text("GO100 프로젝트의 문서 접근 권한이 없습니다").wait_for(timeout=15000)
    check("403: grant message shown", True)
    check("403: no login-recovery link", page.get_by_role("link", name="로그인 복구").count() == 0)
    check("403: retry button present", page.get_by_role("button", name=re.compile("재시도")).first.is_visible())
    page.screenshot(path=f"{OUT}/mobile_grant403_go100.png")
    page.get_by_role("button", name="ACCT", exact=True).click()
    page.get_by_text("ACCT 파일럿119 정본").first.wait_for(timeout=15000)
    check("403: switching to ACCT recovers", "접근 권한이 없습니다" not in page.locator("body").inner_text())
    ctx.close()

    # files tab preserved: canonical selection does not filter the files tab
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, service_workers="block"); ctx.add_init_script("localStorage.setItem('aads_token','mock-not-a-secret')")
    page = ctx.new_page(); install(page, "ok")
    open_canonical(page)
    page.get_by_role("button", name="ACCT", exact=True).click()
    page.get_by_text("ACCT 파일럿119 정본").first.wait_for(timeout=15000)
    page.get_by_role("tab", name="프로젝트 파일").click()
    page.get_by_text("SCAN-FILE.md").first.wait_for(timeout=15000)
    check("files tab: scanned file still listed after canonical ACCT selection", True)
    page.screenshot(path=f"{OUT}/desktop_files_tab.png")
    ctx.close()
    browser.close()

json.dump(results, open(f"{OUT}/r6_mock_e2e_results.json", "w"), ensure_ascii=False, indent=1)
print("TOTAL", len(results), "FAILED", sum(not r["ok"] for r in results))
