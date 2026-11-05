#!/usr/bin/env python3
"""배포 직후 실제 브라우저 점검(스모크) — 대시보드 QA 의 합격 판정 기준.

2026-11-05 대표님 결정: 기존 /visual-qa/full-qa 판정은 자동 통과 조건(기능 테스트 PASS + 기준 화면 비교 PASS
+ 디자인 35점 이상)을 구조적으로 만족할 수 없어(테스트 SKIP·기준 화면 없음) 배포마다 "CEO 확인 요청"으로
끝났다. 실제 오류를 잡는 점검으로 바꾼다. 디자인 감리 점수는 참고 보고로만 남는다.

점검(헤드리스 Chromium, 인증 토큰은 환경변수 AADS_SMOKE_TOKEN 으로만 받는다):
  1. API: /api/v1/health, /api/v1/auth/me 가 200
  2. /chat: 페이지 오류(uncaught) 없음, 25초 안에 메시지([data-message-id]) 또는 빈 상태가 그려짐
  3. /settings, /ops: 200, 페이지 오류 없음
출력: 마지막 줄 "SMOKE PASS ..." 또는 "SMOKE FAIL <사유>". 종료코드 0=PASS, 1=FAIL, 2=점검 불가.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("AADS_SMOKE_BASE", "https://aads.newtalk.kr").rstrip("/")
TOKEN = os.environ.get("AADS_SMOKE_TOKEN", "")
CHAT_TIMEOUT_MS = int(os.environ.get("AADS_SMOKE_CHAT_TIMEOUT_MS", "25000"))


def api_ok(path: str) -> tuple[bool, str]:
    # 기본 Python UA 는 Cloudflare 가 403 으로 막는다(2026-11-05 실측).
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "aads-post-deploy-smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200, f"{path}={r.status}"
    except Exception as e:  # noqa: BLE001
        return False, f"{path}={getattr(e, 'code', type(e).__name__)}"


def main() -> int:
    if not TOKEN:
        print("SMOKE ERROR 토큰 없음")
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except Exception:  # noqa: BLE001
        print("SMOKE ERROR playwright 없음")
        return 2
    failures: list[str] = []
    notes: list[str] = []
    for path in ("/api/v1/health", "/api/v1/auth/me"):
        ok, msg = api_ok(path)
        (notes if ok else failures).append(msg)
    host = BASE.split("://", 1)[-1].split("/")[0]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_cookies([{"name": "aads_token", "value": TOKEN, "domain": host, "path": "/", "secure": True}])
        ctx.add_init_script("try{localStorage.setItem('aads_token'," + json.dumps(TOKEN) + ")}catch(e){}")
        for path in ("/chat", "/settings", "/ops"):
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e, errs=errors: errs.append(str(e)[:160]))
            t0 = time.time()
            try:
                resp = page.goto(BASE + path, wait_until="domcontentloaded", timeout=60000)
                status = resp.status if resp else 0
                if status >= 400:
                    failures.append(f"{path} HTTP {status}")
                if path == "/chat":
                    try:
                        page.wait_for_function(
                            "() => document.querySelector('[data-message-id]') || "
                            "/새 대화|대화를 시작|메시지가 없/.test(document.body.innerText)",
                            timeout=CHAT_TIMEOUT_MS)
                        notes.append(f"/chat 표시 {time.time() - t0:.1f}s")
                    except Exception:  # noqa: BLE001
                        failures.append(f"/chat {CHAT_TIMEOUT_MS // 1000}초 안에 메시지 미표시")
                else:
                    page.wait_for_load_state("load", timeout=60000)
                    notes.append(f"{path} {status}")
                page.wait_for_timeout(1500)
            except Exception as e:  # noqa: BLE001
                failures.append(f"{path} 로드 실패 {type(e).__name__}")
            if errors:
                failures.append(f"{path} 페이지 오류 {len(errors)}건: {errors[0]}")
            page.close()
        browser.close()
    if failures:
        print("SMOKE FAIL " + " / ".join(failures)[:500])
        return 1
    print("SMOKE PASS " + ", ".join(notes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
