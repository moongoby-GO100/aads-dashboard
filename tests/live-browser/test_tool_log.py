"""Real browser test of nested log following without moving the chat viewport."""
import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = await browser.new_page()
        await page.goto(os.environ.get('LIVE_TEST_URL', 'http://127.0.0.1:3198') + '/?tool-log')
        log = page.get_by_test_id('tool-log')
        outer = page.get_by_test_id('outer-chat')
        await log.wait_for(state='attached')
        await page.wait_for_function("document.querySelector('[data-testid=tool-log]').scrollTop > 0")
        await outer.evaluate('(e) => { e.scrollTop = 450; }')
        initial = await log.evaluate('(e) => e.scrollTop')
        await page.get_by_role('button', name='Append log').click()
        await page.wait_for_function("document.querySelector('[data-testid=tool-log]').scrollTop > " + str(initial))
        assert await outer.evaluate('(e) => e.scrollTop') == 450
        await log.evaluate('(e) => { e.scrollTop = 60; e.dispatchEvent(new Event("scroll")); }')
        await page.get_by_role('button', name='Append log').click()
        await page.wait_for_timeout(100)
        assert await log.evaluate('(e) => e.scrollTop') == 60
        assert await outer.evaluate('(e) => e.scrollTop') == 450
        await log.evaluate('(e) => { e.scrollTop = e.scrollHeight; e.dispatchEvent(new Event("scroll")); }')
        await page.get_by_role('button', name='Append log').click()
        await page.wait_for_timeout(100)
        assert await log.evaluate('(e) => e.scrollHeight - e.clientHeight - e.scrollTop') <= 1
        assert await outer.evaluate('(e) => e.scrollTop') == 450
        await page.screenshot(path='/tmp/ohvis-followup-tool-log.png')
        print('PASS: follows new logs; preserves history reading; resumes at bottom; outer chat stays fixed')
        await browser.close()


asyncio.run(main())
