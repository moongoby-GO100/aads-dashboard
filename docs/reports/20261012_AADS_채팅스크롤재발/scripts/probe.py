"""Read-only scroll writer probe for production /chat.

Records every write to the chat message container's scroll position with a stack,
plus 'scroll' events that had no recorded writer (browser-native movement), plus
the on-screen top of a fixed anchor row sampled every 100ms.
No message is sent. Optional route hooks inject fake rows client-side only.
"""
import asyncio, json, os, sys, time, uuid, datetime
from playwright.async_api import async_playwright

BASE = os.environ.get("PROBE_BASE", "https://aads.newtalk.kr")
SESSION = os.environ.get("PROBE_SESSION", "b165b490-9f8a-40fb-aeab-0b483ff95406")
OUT = os.environ.get("PROBE_OUT", "/tmp/scrollprobe/out")
TOKEN = open("/tmp/scrollprobe/tok").read().strip()
IDLE = int(os.environ.get("PROBE_IDLE", "60"))
os.makedirs(OUT, exist_ok=True)

INIT = r"""
(() => {
  const W = window.__scrollProbe = { writes: [], natives: [], samples: [], lastInput: 0, anchorKey: null, t0: performance.now() };
  const isC = (el) => el && el.classList && el.classList.contains('ct-messages-scroll');
  const C = () => document.querySelector('.ct-messages-scroll');
  ['wheel','touchstart','touchmove','keydown','pointerdown'].forEach((t) =>
    window.addEventListener(t, () => { W.lastInput = performance.now(); }, { capture: true, passive: true }));
  const rec = (kind, el, before, extra) => {
    const c = C();
    W.writes.push({ t: Math.round(performance.now()), kind, target: isC(el) ? 'container' : (el && el.tagName) || 'window',
      before, after: c ? c.scrollTop : null, sinceInput: W.lastInput ? Math.round(performance.now() - W.lastInput) : null,
      extra, stack: (new Error().stack || '').split('\n').slice(2, 14).join('\n') });
  };
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: d.get, set(v) {
    const b = this.scrollTop; d.set.call(this, v);
    if (isC(this)) rec('scrollTop=', this, b, { value: v });
  }});
  for (const name of ['scrollIntoView', 'scrollTo', 'scrollBy', 'scroll']) {
    const orig = Element.prototype[name];
    Element.prototype[name] = function (...a) {
      const c = C(); const b = c ? c.scrollTop : null; const r = orig.apply(this, a);
      if (c && (this === c || c.contains(this) || name === 'scrollIntoView')) rec(name, this, b, { args: JSON.stringify(a[0] ?? null) });
      return r;
    };
  }
  const f = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (o) {
    const c = C(); const b = c ? c.scrollTop : null; const r = f.call(this, o);
    if (c && (!o || !o.preventScroll)) rec('focus(no preventScroll)', this, b, { tag: this.tagName });
    return r;
  };
  let last = null;
  document.addEventListener('scroll', (e) => {
    const c = e.target; if (!isC(c)) return;
    const st = c.scrollTop; const now = performance.now();
    const w = W.writes.length && W.writes[W.writes.length - 1];
    const byWriter = w && now - w.t < 20 && Math.abs((w.after ?? -9) - st) <= 1;
    if (!byWriter && last !== null && Math.abs(st - last) > 0.5) {
      W.natives.push({ t: Math.round(now), from: last, to: st, sh: c.scrollHeight, ch: c.clientHeight,
        sinceInput: W.lastInput ? Math.round(now - W.lastInput) : null });
    }
    last = st;
  }, { capture: true, passive: true });
  setInterval(() => {
    const c = C(); if (!c) return;
    let row = null;
    if (W.anchorKey) row = c.querySelector(`[data-message-id="${CSS.escape(W.anchorKey)}"]`);
    const top = row ? Math.round(row.getBoundingClientRect().top - c.getBoundingClientRect().top) : null;
    W.samples.push({ t: Math.round(performance.now()), st: Math.round(c.scrollTop), sh: c.scrollHeight, ch: c.clientHeight, top,
      mode: c.dataset.followMode });
  }, 100);
})();
"""

def log(*a):
    print(datetime.datetime.now().strftime("%H:%M:%S"), *a, flush=True)

async def pick_anchor(page):
    return await page.evaluate("""() => {
      const c = document.querySelector('.ct-messages-scroll');
      const r = c.getBoundingClientRect();
      let row = null;
      for (let y = r.top + 30; y < r.bottom - 10 && !row; y += 20) {
        const el = document.elementFromPoint(r.left + r.width / 2, y);
        const cand = el && el.closest('[data-message-id]');
        if (cand && c.contains(cand) && cand.getBoundingClientRect().top >= r.top - 5) row = cand;
      }
      if (!row) { const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); row = el && el.closest('[data-message-id]'); }
      window.__scrollProbe.anchorKey = row ? row.dataset.messageId : null;
      return row ? row.dataset.messageId : null;
    }""")

async def state(page):
    return await page.evaluate("""() => { const c = document.querySelector('.ct-messages-scroll');
      return { st: Math.round(c.scrollTop), sh: c.scrollHeight, ch: c.clientHeight, dist: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), mode: c.dataset.followMode }; }""")

async def user_scroll(page, cdp, mobile, dy):
    """Scroll as a user: wheel on desktop, touch gesture on mobile. dy<0 = up."""
    box = await page.evaluate("() => { const r = document.querySelector('.ct-messages-scroll').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }")
    if mobile:
        # finger drags: moving the finger down scrolls up. Chunks of <=300px, slow enough to avoid fling.
        remaining = dy
        while abs(remaining) > 0.5:
            chunk = max(-300, min(300, remaining))
            x, y0 = box[0], box[1] + (chunk / 2)
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
            steps = 10
            for i in range(1, steps + 1):
                await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 - chunk * i / steps}]})
                await page.wait_for_timeout(16)
            await page.wait_for_timeout(120)
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            await page.wait_for_timeout(60)
            remaining -= chunk
            if abs(remaining) > 20000:  # 'go to bottom': jump with End key equivalent via many drags is slow
                await page.evaluate("() => { const c = document.querySelector('.ct-messages-scroll'); c.dispatchEvent(new Event('touchstart')); c.scrollTop = c.scrollHeight; }")
                break
    else:
        await page.mouse.move(box[0], box[1])
        step = 100 if dy > 0 else -100
        for _ in range(int(abs(dy) / 100)):
            await page.mouse.wheel(0, step)
            await page.wait_for_timeout(30)
        rest = dy - step * int(abs(dy) / 100)
        if rest:
            await page.mouse.wheel(0, rest)

async def mark(page, label):
    await page.evaluate("(l) => { window.__scrollProbe.writes.push({ t: Math.round(performance.now()), kind: 'MARK', label: l }); }", label)

async def run(profile):
    mobile = profile == "mobile"
    inject = {"rows": []}
    fetched = {"n": 0}
    stream = {"on": False, "n": 0, "exec": str(uuid.uuid4()), "ph": str(uuid.uuid4())}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900},
            service_workers="block", is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1,
            user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" if mobile else None),
        )
        await ctx.add_cookies([{"name": "aads_token", "value": TOKEN, "url": BASE}])
        await ctx.add_init_script(f"localStorage.setItem('aads_token', {json.dumps(TOKEN)});")
        await ctx.add_init_script(INIT)
        page = await ctx.new_page()
        # Block every mutating request: this probe is read-only.
        async def guard(route):
            req = route.request
            if os.environ.get("PROBE_PATCH") and "/chunks/app/chat/page-2213a37374d23dc1.js" in req.url:
                log("serving patched chat chunk")
                return await route.fulfill(status=200, content_type="application/javascript", body=open("/tmp/scrollprobe/chunk_patched.js").read())
            if req.method not in ("GET", "HEAD", "OPTIONS") and "/api/" in req.url:
                return await route.fulfill(status=204, body="")
            if "/chat/messages" in req.url and req.method == "GET": fetched["n"] += 1
            if stream["on"] and "/streaming-status" in req.url and req.method == "GET":
                stream["n"] += 1
                return await route.fulfill(json={"is_streaming": True, "just_completed": False, "stream_status": "tool_running",
                    "stream_status_label": "도구 실행 중", "tool_count": stream["n"], "last_tool": "probe_tool",
                    "partial_content": ("스트리밍 모의 토큰 " * 6 + "\n") * stream["n"], "content_length": 60 * stream["n"],
                    "execution_id": stream["exec"], "placeholder_message_id": stream["ph"], "placeholder_ready": True,
                    "capabilities": [], "interrupts": []})
            if stream["on"] and req.method == "GET" and ("/stream" in req.url or "/events" in req.url or "/replay" in req.url) and "/api/" in req.url:
                return await route.fulfill(status=204, body="")
            if "/chat/messages" in req.url and req.method == "GET" and inject["rows"]:
                resp = await route.fetch()
                try:
                    data = await resp.json()
                    if isinstance(data, dict) and isinstance(data.get("messages"), list):
                        data["messages"] = data["messages"] + inject["rows"]
                        return await route.fulfill(response=resp, json=data)
                except Exception:
                    pass
                return await route.fulfill(response=resp)
            return await route.continue_()
        await page.route("**/*", guard)
        cdp = await ctx.new_cdp_session(page)
        await page.goto(f"{BASE}/chat#{SESSION}", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_selector(".ct-messages-scroll [data-message-id]", timeout=90000)
        await page.wait_for_timeout(6000)
        results = {}

        async def scenario(name, up_px, body, from_bottom=False):
            # go to bottom as a user, then up by up_px
            await user_scroll(page, cdp, mobile, 50000)
            await page.wait_for_timeout(1500)
            await user_scroll(page, cdp, mobile, -up_px)
            await page.wait_for_timeout(1600)
            anchor = await pick_anchor(page)
            await page.wait_for_timeout(300)
            s0 = await state(page)
            await mark(page, f"{name}:start")
            n0 = await page.evaluate("() => [window.__scrollProbe.writes.length, window.__scrollProbe.natives.length, window.__scrollProbe.samples.length]")
            await page.screenshot(path=f"{OUT}/{profile}_{name}_before.png")
            await body()
            s1 = await state(page)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_after.png")
            data = await page.evaluate("(n) => ({ writes: window.__scrollProbe.writes.slice(n[0]), natives: window.__scrollProbe.natives.slice(n[1]), samples: window.__scrollProbe.samples.slice(n[2]) })", n0)
            tops = [s["top"] for s in data["samples"] if s["top"] is not None]
            moved = (max(tops) - min(tops)) if tops else None
            results[name] = {"anchor": anchor, "start": s0, "end": s1, "anchor_top_range_px": moved,
                             "anchor_top_first": tops[0] if tops else None, "anchor_top_last": tops[-1] if tops else None,
                             "writes": data["writes"], "natives": data["natives"], "samples": data["samples"]}
            log(profile, name, "start", s0, "end", s1, "anchorMove", moved, "writes", len([w for w in data["writes"] if w.get("kind") != "MARK"]), "natives", len(data["natives"]))

        async def idle():
            await page.wait_for_timeout(IDLE * 1000)

        def fake_row(kind):
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            return {"id": str(uuid.uuid4()), "session_id": SESSION, "role": "assistant", "intent": "pipeline_runner",
                    "content": f"🔔 [probe {kind}] 러너 알림 모의 행\n\n" + "줄\n" * 12, "created_at": now,
                    "attachments": [], "sources": [], "is_hidden": False, "model_used": "probe"}

        async def poke():
            await page.evaluate("""() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
              document.dispatchEvent(new Event('visibilitychange'));
              setTimeout(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
                document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }, 300); }""")

        async def arrive():
            await page.wait_for_timeout(2000)
            for i in range(3):
                inject["rows"].append(fake_row(f"S2-{i}"))
                await poke()
                await page.wait_for_timeout(9000)
                log("probe rows visible:", await page.evaluate("() => (document.querySelector('.ct-messages-scroll').innerText.match(/probe S/g) || []).length"), "msgs fetched:", fetched["n"])
            await page.wait_for_timeout(3000)

        async def streaming_body():
            stream["on"] = True; stream["n"] = 0
            inject["rows"].append({"id": stream["ph"], "session_id": SESSION, "role": "assistant", "intent": "streaming_placeholder",
                "content": "⏳ 모의 스트리밍", "execution_id": stream["exec"], "model_used": "streaming",
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "attachments": [], "sources": [], "is_hidden": False})
            await poke()
            await page.wait_for_timeout(40000)
            stream["on"] = False
            inject["rows"] = [r for r in inject["rows"] if r["id"] != stream["ph"]]
            stream["exec"] = str(uuid.uuid4()); stream["ph"] = str(uuid.uuid4())
            await page.wait_for_timeout(3000)

        async def late_layout():
            # S4: a row above the reading position grows (late image/code/chart) and shrinks (collapse).
            for delta in (420, 0, 900, 0):
                await page.evaluate("""(d) => { const c = document.querySelector('.ct-messages-scroll');
                  const rows = Array.from(c.querySelectorAll('[data-message-id]'));
                  const above = rows.filter((r) => r.getBoundingClientRect().bottom < c.getBoundingClientRect().top - 50);
                  const row = above[above.length - 2] || above[0];
                  if (!row) return;
                  let s = row.querySelector('.__probe_late');
                  if (!s) { s = document.createElement('div'); s.className = '__probe_late'; s.style.display = 'block'; s.style.width = '100%';
                    (row.firstElementChild || row).prepend(s); }
                  s.style.height = d + 'px'; }""", delta)
                await page.wait_for_timeout(2500)

        async def visibility():
            await page.wait_for_timeout(2000)
            await page.evaluate("""() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
              document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); }""")
            await page.wait_for_timeout(5000)
            await page.evaluate("""() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
              document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
              window.dispatchEvent(new Event('offline')); setTimeout(() => window.dispatchEvent(new Event('online')), 500); }""")
            await page.wait_for_timeout(12000)

        only = os.environ.get("PROBE_ONLY", "")
        dbg = await page.evaluate("""() => { const c = document.querySelector('.ct-messages-scroll'); const r = c.querySelector('[data-message-id]');
          return { rows: c.querySelectorAll('[data-message-id]').length, offsetParent: r && r.offsetParent && (r.offsetParent.className || r.offsetParent.tagName), cPos: getComputedStyle(c).position }; }""")
        log("dom", dbg)
        if only:
            sc = {"S1": ("S1_idle_up3screens", 2400 if not mobile else 2200, idle), "S2": ("S2_arrive_up3screens", 2400, arrive),
                  "S5a": ("S5_arrive_up180px", 180, arrive), "S5i": ("S5_idle_up180px", 180, idle), "S6": ("S6_visibility_up3screens", 2400, visibility),
                  "S3a": ("S3_stream_up3screens", 2400, streaming_body), "S3b": ("S3_stream_up180px", 180, streaming_body),
                  "S5b": ("S5_arrive_up250px", 250, arrive),
                  "S4a": ("S4_latelayout_up3screens", 2400, late_layout), "S4b": ("S4_latelayout_up180px", 180, late_layout),
                  "S7a": ("S7_arrive_atbottom", 0, arrive), "S7b": ("S7_stream_atbottom", 0, streaming_body)}
            for key in only.split(","):
                await scenario(*sc[key])
            json.dump(results, open(f"{OUT}/{profile}.json", "w"), ensure_ascii=False, indent=1)
            await browser.close()
            return
        await scenario("S1_idle_up3screens", 2400 if not mobile else 2200, idle)
        await scenario("S2_arrive_up3screens", 2400 if not mobile else 2200, arrive)
        await scenario("S5_arrive_up180px", 180, arrive)
        await scenario("S5_idle_up180px", 180, idle)
        await scenario("S6_visibility_up3screens", 2400 if not mobile else 2200, visibility)
        json.dump(results, open(f"{OUT}/{profile}.json", "w"), ensure_ascii=False, indent=1)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run(sys.argv[1]))
