"""Real /chat assets with intercepted APIs; never writes production data.

Run: python3 tests/browser/chat-user-echo-receipt.py https://aads.newtalk.kr
Uses the installed Python Playwright package and saves screen evidence in /tmp.
"""
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from playwright.async_api import async_playwright

SID = "11111111-2222-4333-8444-555555555555"
WID = "22222222-2222-4333-8444-555555555555"
EXID = "33333333-2222-4333-8444-555555555555"
NOW = datetime.now(timezone.utc)


def message(id_, role, content, seconds, **extra):
    return dict(id=id_, session_id=SID, role=role, content=content,
                created_at=(NOW + timedelta(seconds=seconds)).isoformat(), **extra)


async def scenario(browser, base, width, interrupt):
    context = await browser.new_context(viewport={"width": width, "height": 900})
    await context.add_cookies([dict(name="aads_token", value="isolated-fixture", url=base)])
    await context.add_init_script("""localStorage.setItem('aads_token','isolated-fixture');
      const RealDate=Date;window.Date=class extends RealDate{
        constructor(...args){super(...(args.length?args:[RealDate.now()-3600000]));}
        static now(){return RealDate.now()-3600000;}
      };""")
    old = [message("old-user", "user", "격리 검증 시작", -20),
           message("old-answer", "assistant", "격리 응답 본문입니다. " * 8, -10)]
    rows = list(old)
    session = dict(id=SID, workspace_id=WID, title="사용자 버블 접수 검증", current_model="mixture",
                   created_at=NOW.isoformat(), updated_at=NOW.isoformat(), message_count=2,
                   tags=[], pinned=False, role_key="CTO")
    workspace = dict(id=WID, name="[AADS] 격리 검증", project_key="AADS", icon="", color="#2563eb")
    sent = []
    calls = []
    errors = []

    async def api(route):
        request = route.request
        path = urlparse(request.url).path.split("/api/v1", 1)[-1]
        calls.append(path)
        payload = []
        if path == "/auth/me":
            payload = dict(user_id="fixture", email="fixture@example.invalid", is_admin=True,
                           is_internal_admin=True, tenant_id="fixture", tenant_role="owner")
        elif path == "/chat/workspaces":
            payload = [workspace]
        elif path == "/chat/sessions":
            payload = [session]
        elif path == f"/chat/sessions/{SID}":
            payload = session
        elif path == "/chat/messages":
            payload = rows[::-1] if "sort=desc" in request.url else dict(messages=rows, has_more=False, next_cursor=None)
        elif path == "/chat/messages/send" or path.endswith("/interrupt"):
            body = request.post_data_json
            text = body["content"]
            saved = message(f"saved-user-{len(sent)+1}", "user",
                            ("[추가 지시] " if interrupt else "") + text, len(sent)+1,
                            idempotency_key=body.get("idempotency_key"),
                            intent="interrupt_queued" if interrupt else "code_modify")
            sent.append(saved)
            rows.append(saved)
            if path.endswith("/interrupt"):
                return await route.fulfill(json=dict(queued=True, message_id=saved["id"], execution_id=EXID))
            events = [dict(type="stream_start", execution_id=EXID, stream_id="fixture"),
                      dict(type="delta", content="격리 응답 검증이 완료되었습니다. " * 8),
                      dict(type="done", model="mixture", intent="code_modify")]
            return await route.fulfill(content_type="text/event-stream",
                                       body="".join("data: " + json.dumps(e) + "\n\n" for e in events))
        elif path.endswith("/streaming-status"):
            payload = dict(is_streaming=interrupt, execution_id=EXID if interrupt else None,
                           completed=not interrupt, partial_content="격리 응답 진행 중입니다. " * 8 if interrupt else "")
        elif path.endswith("/last-response"):
            payload = {"message": None}
        elif path.endswith("/todos"):
            payload = []
        elif path.endswith("/roles"):
            payload = dict(roles=[])
        elif path in ("/goals", "/approvals/pending", "/chat/artifacts", "/agenda/", "/chat/templates"):
            payload = []
        elif path == "/llm-models":
            payload = dict(models=[])
        elif path == "/llm-models/chat-preferences":
            payload = dict(preferences=[])
        elif path.endswith("/documents"):
            payload = dict(documents=[], canonical_documents=[])
        elif path.startswith("/goals/for-session/"):
            payload = dict(goals=[], items=[])
        elif path == "/ops/version":
            payload = dict(version="fixture-stable")
        elif path.endswith("/session-attention"):
            payload = dict(items=[], sessions=[])
        elif path.endswith("/directive-drafts"):
            payload = []
        elif path == "/health/relay-capacity":
            payload = dict(available=True, status="ok", active_leases={}, limits={}, queue_depth=0)
        await route.fulfill(json=payload)

    await context.route("**/api/v1/**", api)
    page = await context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        await page.goto(f"{base}/chat#{SID}", wait_until="domcontentloaded", timeout=120000)
        composer = page.locator("textarea").first
        await composer.wait_for(timeout=30000)
        await page.locator('[data-message-id="old-user"]').wait_for(timeout=30000)
        if interrupt:
            await page.wait_for_timeout(1500)
        for n in range(2 if interrupt else 1):
            text = f"접수 확인 {n+1}"
            await composer.fill(text)
            await composer.press("Enter")
            await page.wait_for_function("n => document.querySelector(`[data-message-id=\"saved-user-${n}\"]`)", arg=n+1,
                                         timeout=15000)
        await page.wait_for_timeout(1200)
        actual = await page.locator('[data-message-id]').evaluate_all(
            "nodes => nodes.map(n=>({id:n.dataset.messageId,text:n.innerText}))")
        pending = [row for row in actual if row["id"].startswith(("tmp-", "interrupt-"))]
        assert not pending, f"unreconciled local copies: {pending}"
        for saved in sent:
            assert sum(row["id"] == saved["id"] for row in actual) == 1, actual
        assert not errors, errors
        capture = f"/tmp/aads-user-echo-{width}-{'interrupt' if interrupt else 'normal'}.png"
        await page.screenshot(path=capture, full_page=True)
        print(json.dumps(dict(width=width, interrupt=interrupt, sent=len(sent),
                              saved_bubbles=len(sent), capture=capture, errors=errors,
                              production_api_writes=0), ensure_ascii=False))
    except Exception as error:
        print(str(error), flush=True)
        print(json.dumps(dict(errors=errors, calls=calls, sent=sent, body=(await page.locator('body').inner_text())[-5000:]), ensure_ascii=False))
        try:
            await page.screenshot(path=f"/tmp/aads-user-echo-failure-{width}-{interrupt}.png", timeout=5000)
        except Exception:
            pass
        raise
    finally:
        await context.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            for width in [1440, 390]:
                for interrupt in [False, True]:
                    await scenario(browser, sys.argv[1].rstrip("/"), width, interrupt)
        finally:
            await browser.close()


asyncio.run(main())
