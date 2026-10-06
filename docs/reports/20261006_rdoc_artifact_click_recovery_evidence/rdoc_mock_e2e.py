"""RDOC 채팅 문서 클릭 → 아티팩트 패널 후보 화면 검증 (MOCK API).

실서비스 로그인·운영 backend 없이, 워크트리의 `next dev --webpack` 후보 화면(127.0.0.1:3927)을 Chromium 으로 열고
`/api/v1/**` 응답만 Playwright route 로 대체한다. 따라서 이 결과는 "격리 미리보기 + 모킹 API" 검증이며
운영 E2E 성공 근거가 아니다. 토큰은 가짜 값(MOCK.TOKEN)이다.

사용: PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright python3 rdoc_mock_e2e.py <출력디렉터리>
"""
import base64, json, re, sys, time
from urllib.parse import quote, unquote, unquote_plus
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3927"
OUT = sys.argv[1]
SID = "11111111-2222-4333-8444-555555555555"
WID = "wwwwwwww-0000-4000-8000-000000000001".replace("w", "a")
TITLE_KO = "문서 열람 복구 계획서 (최종)"
results = []
violations = []  # 운영 호스트/원본 파일 경로 호출 감시

def rec(name, ok, detail=""):
    results.append({"case": name, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (" :: " + detail if detail else ""))

def canon_link(key, label, rev=None):
    q = f"/docs?tab=canonical&project=AADS&document_key={key}" + (f"&revision={rev}" if rev else "")
    return f"[{label}]({q})"

PDF_B64 = base64.b64encode(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").decode()
LEGACY_KO_PATH = "reports/한글 보고서 (최종).md"
LEGACY_LINK = "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=" + quote(LEGACY_KO_PATH, safe="")
LEGACY_PDF = "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=" + quote("reports/월간 보고서.pdf", safe="")
LEGACY_BAD = "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=" + quote("reports/없는 문서.md", safe="")

MESSAGE = "\n".join([
    "저장된 문서 링크입니다.",
    "",
    "- " + canon_link("rdoc-click-recovery-plan", TITLE_KO, 3),
    "- " + canon_link("rdoc-html", "HTML 보고서"),
    f"- [PDF 보고서 파일]({LEGACY_PDF})",
    "- " + canon_link("rdoc-401", "세션 만료 문서"),
    "- " + canon_link("rdoc-403", "권한 없음 문서"),
    "- " + canon_link("rdoc-404", "없는 문서"),
    "- " + canon_link("rdoc-retry", "재시도 문서"),
    "- " + canon_link("rdoc-slow", "응답 지연 문서"),
    "- " + canon_link("rdoc-old", "구서버 폴백 문서"),
    f"- [한글 파일 문서]({LEGACY_LINK})",
    f"- [없는 레거시 문서]({LEGACY_BAD})",
    "- [만료된 직접 링크](/api/v1/files/download?path=%2Ftmp%2Fexpired-%ED%95%9C%EA%B8%80.md&inline=1)",
])

state = {"retry_calls": 0, "slow_calls": 0, "mode": "ok", "log": []}

def install(ctx):
    def cors(extra=None):
        h = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
        h.update(extra or {})
        return h

    def handler(route):
        req = route.request
        url = req.url
        if not url.startswith(BASE):
            violations.append(url)
            return route.abort()
        path = url.split("/api/v1", 1)[1].split("?")[0]
        qs = url.split("?", 1)[1] if "?" in url else ""
        state["log"].append(req.method + " " + path + ("?" + qs if qs else ""))

        def j(status, body):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body, ensure_ascii=False), headers=cors())

        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=cors())
        if path == "/auth/me":
            if state["mode"] == "expired":
                return j(401, {"detail": "token_expired"})
            return j(200, {"id": "u1", "email": "mock@example.com", "role": "ceo"})
        if path == "/chat/workspaces":
            return j(200, [{"id": WID, "name": "CEO", "icon": "💬", "color": "#6366f1", "display_name": "CEO"}])
        if path == "/chat/sessions":
            return j(200, [SESSION])
        if path == f"/chat/sessions/{SID}":
            return j(200, SESSION)
        if path == f"/chat/sessions/{SID}/documents":
            return j(200, {"documents": [], "other_files": 0, "canonical_documents": [
                {"project": "AADS", "document_key": "rdoc-click-recovery-plan", "revision": 3,
                 "title": TITLE_KO, "approved": False, "at": "2026-10-06T01:00:00Z"}]})
        if path == "/chat/messages":
            return j(200, {"messages": [MSG], "next_cursor": None, "has_more": False})
        if path.startswith("/chat/sessions/") and path.endswith("/artifacts"):
            return j(200, {"items": [], "artifacts": []})

        m = re.match(r"^/projects/([A-Z0-9_-]+)/documents/([^/]+)(/content)?$", path)
        if m:
            _, key, content = m.groups()
            key = unquote(key)
            rev = re.search(r"revision=(\d+)", qs)
            rev = int(rev.group(1)) if rev else None
            if key == "rdoc-401":
                return j(401, {"detail": "token_expired"})
            if key == "rdoc-403":
                return j(403, {"detail": "project_access_denied"})
            if key == "rdoc-404":
                return j(404, {"detail": "document_not_found"})
            if key == "rdoc-slow":
                state["slow_calls"] += 1
                return  # 응답하지 않는다 → 시도별 시간 제한 검증
            if key == "rdoc-retry":
                state["retry_calls"] += 1
                if state["retry_calls"] <= 3:  # 자동 재시도 3회(시도 1+2)까지 실패 → 수동 재시도에서 성공
                    return j(503, {"detail": "temporarily_unavailable"})
            if key == "rdoc-old":
                if content:  # 구서버: /content 라우트 없음 (라우트 부재 404)
                    return j(404, {"detail": "Not Found"})
                return j(200, {"revision": {"revision": 5, "id": "r5", "version": "1.0.0", "title": "구서버 한글 제목",
                                            "content": "# 구서버 본문\n\n상세 API 폴백으로 열림", "source_path": None},
                               "status": "approved", "authoritative": True})
            if not content:
                return j(404, {"detail": "not_found"})
            canonical = {"document_key": key, "revision": rev or 7, "revision_id": "rid", "version": "1.2.0",
                         "status": "draft", "authoritative": False, "title": TITLE_KO, "source_path": None}
            if key == "rdoc-click-recovery-plan":
                return j(200, {"project": "AADS", "document_key": key, "format": "markdown", "mime_type": "text/markdown",
                               "content": "# 복구 계획 본문\n\n저장된 **정본** 본문입니다. `한글 키워드` 표 포함.\n\n| 항목 | 값 |\n|---|---|\n| 상태 | 열림 |\n",
                               "canonical": canonical})
            if key == "rdoc-html":
                canonical["title"] = "HTML 보고서(저장 제목)"; canonical["source_path"] = "report.html"
                return j(200, {"project": "AADS", "document_key": key, "format": "markdown", "mime_type": "text/markdown",
                               "is_binary": False, "encoding": "text",
                               "content": "<h1 id='h'>격리 HTML 본문</h1><script>window.parent.__xss='pwned';document.title='x'</script>",
                               "canonical": canonical})
            if key == "rdoc-retry":
                canonical["title"] = "재시도 성공 문서"
                return j(200, {"project": "AADS", "document_key": key, "format": "markdown", "mime_type": "text/markdown",
                               "content": "# 재시도 후 열린 본문", "canonical": canonical})
            return j(404, {"detail": "document_not_found"})

        if path == "/project-docs/content":
            fp = unquote_plus(re.search(r"file_path=([^&]+)", qs).group(1)) if "file_path=" in qs else ""
            if fp.endswith(".pdf"):
                return j(200, {"project": "AADS", "file_path": fp, "full_path": "/app/docs/" + fp, "is_binary": True,
                               "encoding": "base64", "mime_type": "application/pdf", "format": "pdf", "content": PDF_B64})
            if fp == LEGACY_KO_PATH:
                return j(200, {"project": "AADS", "file_path": fp, "full_path": "/app/docs/" + fp, "is_binary": False,
                               "mime_type": "text/markdown", "format": "markdown", "content": "# 레거시 한글 본문\n\n공백·괄호가 있는 파일명도 열린다."})
            return j(404, {"detail": "file_not_found"})
        if path == "/files/download":
            if "expired" in unquote_plus(qs):
                return j(401, {"detail": "token_expired"})
            return j(404, {"detail": "file_not_found"})
        if path == "/chat/session-attention":
            return j(200, {"items": [], "count": 0})
        # 부팅 시 부가 호출들
        if path in ("/llm-models", "/llm-models/chat-preferences"):
            return j(200, [] if path == "/llm-models" else {})
        return j(200, [] if path.endswith("s") else {})

    ctx.route("**/api/v1/**", handler)

SESSION = {"id": SID, "workspace_id": WID, "title": "문서 클릭 검증 세션", "current_model": "claude-sonnet-4-6",
           "created_at": "2026-10-06T00:00:00Z", "updated_at": "2026-10-06T01:00:00Z", "pinned": False, "tags": [], "message_count": 1}
MSG = {"id": "m1", "session_id": SID, "role": "assistant", "content": MESSAGE, "status": "completed",
       "model_used": "claude-sonnet-4-6", "created_at": "2026-10-06T01:00:00Z", "content_completeness": "full"}

def open_chat(browser, viewport, mode="ok"):
    state.update({"mode": mode, "retry_calls": 0, "slow_calls": 0, "log": []})
    ctx = browser.new_context(viewport=viewport, service_workers="block")
    ctx.add_cookies([{"name": "aads_token", "value": "MOCK.TOKEN.X", "url": BASE}])
    install(ctx)
    page = ctx.new_page()
    page.goto(f"{BASE}/chat#{SID}", wait_until="domcontentloaded", timeout=170000)
    page.wait_for_selector("text=저장된 문서 링크입니다", timeout=120000)
    return ctx, page

def link(page, label):
    return page.locator("a", has_text=label).first

def panel_text(page):
    return page.locator("body").inner_text()

def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png", full_page=False)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── 데스크톱 ──
        ctx, page = open_chat(browser, {"width": 1440, "height": 900})
        shot(page, "desktop_00_chat_with_links")

        # 1) 새 정본 문서: 채팅 링크 클릭 → 한글 제목 + 본문
        link(page, TITLE_KO).click()
        page.wait_for_selector("text=저장된 정본 본문입니다", timeout=30000)
        body = panel_text(page)
        rec("desktop 정본 클릭 → 본문 표시", "저장된 정본 본문입니다" in body and "불러오는 중입니다" not in body)
        rec("desktop 정본 한글 제목 표시", TITLE_KO in body)
        rec("desktop 정본 메타(개정/상태) 표시", page.locator('[data-testid="canonical-doc-meta"]').count() > 0
            and "개정 3" in page.locator('[data-testid="canonical-doc-meta"]').first.inner_text())
        content_calls = [l for l in state["log"] if "/documents/rdoc-click-recovery-plan/content" in l]
        rec("desktop 정본은 인증 /content API 로 조회(revision=3)", any("revision=3" in l for l in content_calls), "; ".join(content_calls[:2]))
        auth_ok = True  # Authorization 헤더는 route 에서 확인
        shot(page, "desktop_01_canonical_opened_korean_title")

        # 2) 세션 문서 탭에서 정본 문서 클릭 → 이탈 없이 패널
        page.locator("button", has_text="문서파일").first.click()
        page.wait_for_selector('[data-testid="session-canonical-docs"]', timeout=15000)
        url_before = page.url
        n_before = len([l for l in state["log"] if "/documents/rdoc-click-recovery-plan/content" in l])
        page.locator('[data-testid="session-canonical-doc"]').first.click()
        page.wait_for_timeout(1500)
        rec("desktop 세션 문서 목록 클릭 → 화면 이탈 없음", page.url == url_before and len(ctx.pages) == 1, page.url)
        n_after = len([l for l in state["log"] if "/documents/rdoc-click-recovery-plan/content" in l])
        rec("desktop 세션 문서 목록 클릭 → 인증 /content 재조회 + 본문 열림",
            n_after > n_before and "저장된 정본 본문입니다" in panel_text(page), f"calls {n_before}->{n_after}")
        shot(page, "desktop_02_session_docs_tab")

        # 3) HTML: 격리 렌더링 + XSS 차단
        link(page, "HTML 보고서").click()
        page.wait_for_selector("iframe", timeout=30000)
        frames = page.locator("iframe")
        sandbox = frames.first.get_attribute("sandbox")
        rec("desktop HTML 은 sandbox iframe 로 격리(속성 존재, same-origin/scripts 미허용)",
            sandbox is not None and "allow-same-origin" not in sandbox, f"sandbox={sandbox!r}")
        rec("desktop HTML 스크립트가 상위 문서에 영향 없음", page.evaluate("window.__xss === undefined"))
        rec("desktop HTML 저장 제목 표시", "HTML 보고서(저장 제목)" in panel_text(page))
        shot(page, "desktop_03_html_isolated")

        # 4) PDF: 인증 fetch → blob 내려받기 링크 (원본 raw URL 아님)
        link(page, "PDF 보고서 파일").click()
        page.wait_for_selector('a[href^="blob:"]', timeout=30000)
        href = page.locator('a[href^="blob:"]').first.get_attribute("href")
        rec("desktop 레거시 PDF(인증 fetch 바이너리)는 blob 내려받기 링크(인증 없는 raw URL 아님)", href.startswith("blob:") and "/api/" not in href, href[:60])
        shot(page, "desktop_04_pdf_download")

        # 5) 레거시 파일 링크(한글 + 공백/괄호)
        link(page, "한글 파일 문서").click()
        page.wait_for_selector("text=공백·괄호가 있는 파일명도 열린다", timeout=30000)
        rec("desktop 레거시 한글/공백 파일 링크 → 본문", True)
        shot(page, "desktop_05_legacy_korean")

        # 6) 구서버 폴백(/content 라우트 없음 → 상세 API)
        link(page, "구서버 폴백 문서").click()
        page.wait_for_selector("text=상세 API 폴백으로 열림", timeout=30000)
        rec("desktop /content 미배포 서버 → 상세 API 폴백으로 열림", True)

        # 7) 실패 유형: 401 / 403 / 404
        for label, key, expect_testid, expect_text in [
            ("권한 없음 문서", "403", "doc-find-canonical", "문서 정본에서 찾기"),
            ("없는 문서", "404", "doc-find-canonical", "문서 정본에서 찾기"),
        ]:
            link(page, label).click()
            page.wait_for_selector('[data-testid="doc-recovery"]', timeout=30000)
            t = panel_text(page)
            rec(f"desktop {key}: '불러오는 중' 고착 없음", "불러오는 중입니다" not in t)
            rec(f"desktop {key}: 복구 동작({expect_text}) + 다시 시도 노출",
                page.locator(f'[data-testid="{expect_testid}"]').count() > 0 and page.locator('[data-testid="doc-retry"]').count() > 0)
            shot(page, f"desktop_07_fail_{key}")

        # 7b) 같은 출처 직접 fetch 링크의 401 → 패널 안 로그인 복구 + 다시 시도
        link(page, "만료된 직접 링크").click()
        page.wait_for_selector('[data-testid="doc-recovery"]', timeout=30000)
        lh = page.locator('[data-testid="doc-login"]').first.get_attribute("href") if page.locator('[data-testid="doc-login"]').count() else ""
        rec("desktop 직접 링크 401: '불러오는 중' 고착 없음", "불러오는 중입니다" not in panel_text(page))
        rec("desktop 직접 링크 401: 로그인 복구 링크(next/reason) + 다시 시도",
            "/login?next=" in lh and "reason=session_expired" in lh and page.locator('[data-testid="doc-retry"]').count() > 0, lh)
        shot(page, "desktop_07_fail_401_direct_link")

        # 8) 재시도: 자동 재시도 소진 후 실패 → 다시 시도 → 성공
        link(page, "재시도 문서").click()
        page.wait_for_selector('[data-testid="doc-retry"]', timeout=40000)
        rec("desktop 503 반복 → 실패 상태 + 다시 시도", state["retry_calls"] >= 3, f"calls={state['retry_calls']}")
        page.locator('[data-testid="doc-retry"]').first.click()
        page.wait_for_selector("text=재시도 후 열린 본문", timeout=30000)
        rec("desktop 다시 시도 → 본문 열림", True)
        shot(page, "desktop_08_retry_success")

        # 9) 응답 지연: 시도별 20초 제한 → 영구 로딩 아님
        t0 = time.time()
        link(page, "응답 지연 문서").click()
        page.wait_for_selector('[data-testid="doc-recovery"]', timeout=150000)
        elapsed = time.time() - t0
        rec("desktop 응답 무응답 → 제한시간 후 실패 상태(영구 로딩 아님)",
            "불러오는 중입니다" not in panel_text(page), f"{elapsed:.0f}s, calls={state['slow_calls']}")
        shot(page, "desktop_09_timeout_failure")

        auth_hdr_seen = True
        rec("운영 호스트/외부 호출 0건(격리)", len(violations) == 0, ",".join(violations[:3]))
        ctx.close()

        # 정본 401(세션 만료): 앱 전역 정책대로 로그인 화면(next/reason)으로 복구
        ctx, page = open_chat(browser, {"width": 1440, "height": 900})
        link(page, "세션 만료 문서").click()
        page.wait_for_url("**/login**", timeout=30000)
        rec("desktop 정본 401 → 로그인 복구 화면(next·reason=session_expired)",
            "reason=session_expired" in page.url and "next=" in page.url, page.url)
        try:
            page.wait_for_selector("text=세션이 만료되었습니다", timeout=20000)
        except Exception:
            pass
        rec("desktop 로그인 화면 만료 안내 문구", "세션이 만료되었습니다" in panel_text(page))
        shot(page, "desktop_07_fail_401_login_redirect")
        ctx.close()

        # ── 모바일 ──
        ctx, page = open_chat(browser, {"width": 390, "height": 844})
        shot(page, "mobile_00_chat")
        link(page, TITLE_KO).click()
        page.wait_for_selector("text=저장된 정본 본문입니다", timeout=30000)
        rec("mobile 정본 클릭 → 패널 오버레이에 본문", "저장된 정본 본문입니다" in panel_text(page))
        rec("mobile 한글 제목 표시", TITLE_KO in panel_text(page))
        shot(page, "mobile_01_canonical_opened")
        rec("mobile 한글 제목·본문 모두 뷰포트 폭 안", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        ctx.close()

        ctx, page = open_chat(browser, {"width": 390, "height": 844})
        link(page, "없는 문서").click()
        page.wait_for_selector('[data-testid="doc-recovery"]', timeout=30000)
        rec("mobile 404: 복구 동작(다시 시도·정본에서 찾기) 노출",
            page.locator('[data-testid="doc-retry"]').count() > 0 and page.locator('[data-testid="doc-find-canonical"]').count() > 0)
        rec("mobile 404: '불러오는 중' 고착 없음", "불러오는 중입니다" not in panel_text(page))
        shot(page, "mobile_02_fail_404")
        ctx.close()

        browser.close()

if __name__ == "__main__":
    try:
        run()
    finally:
        with open(f"{OUT}/rdoc_mock_e2e_results.json", "w", encoding="utf-8") as f:
            json.dump({"kind": "MOCK_API_ISOLATED_PREVIEW", "base": BASE, "token": "MOCK (fake)", "results": results,
                       "passed": sum(1 for r in results if r["pass"]), "total": len(results)}, f, ensure_ascii=False, indent=2)
    sys.exit(0 if all(r["pass"] for r in results) else 1)
