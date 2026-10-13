"""Scroll writer probe v3 for production /chat (S1~S11).

Extends 20261012 probe.py:
  * S9  send a message, scroll up 120/250px while the reply streams, read 2s/10s later.
        The POST /chat/messages/send response is a client-side SSE stream made in the
        page (window.fetch wrapper), so the production bundle's real send -> SSE ->
        delta -> done path runs, but nothing reaches the server (no LLM call, no DB row).
  * S10 focus the input (desktop click / mobile tap, plus a mobile keyboard-height resize).
  * S11 click a CRF section chip in an injected CRF reply, then a new row arrives.
  * S8  late layout (image / report expand) 120px above the bottom.
Every other mutating /api/ request is answered 204 (read-only probe).
Usage: python3 probe3.py desktop|mobile   (PROBE_ONLY=S9a,S10a,...)
"""
import asyncio, json, os, sys, uuid, datetime
from playwright.async_api import async_playwright

BASE = os.environ.get("PROBE_BASE", "https://aads.newtalk.kr")
SESSION = os.environ.get("PROBE_SESSION", "b165b490-9f8a-40fb-aeab-0b483ff95406")
OUT = os.environ.get("PROBE_OUT", "/tmp/scrollprobe3/out")
TOKEN = open(os.environ.get("PROBE_TOKEN_FILE", "/tmp/scrollprobe3/tok")).read().strip()
IDLE = int(os.environ.get("PROBE_IDLE", "20"))
STREAM_SEC = int(os.environ.get("PROBE_STREAM_SEC", "22"))
PATCHED = os.environ.get("PROBE_PATCHED", "")  # path to chunk_patched.js
LOCAL = os.environ.get("PROBE_LOCAL", "").rstrip("/")  # e.g. http://127.0.0.1:3317 (next dev of the patched source)
os.makedirs(OUT, exist_ok=True)

INIT = r"""
(() => {
  const W = window.__scrollProbe = { writes: [], natives: [], others: [], samples: [], lastInput: 0, anchorKey: null, sends: 0 };
  const isC = (el) => el && el.classList && el.classList.contains('ct-messages-scroll');
  const C = () => document.querySelector('.ct-messages-scroll');
  ['wheel','touchstart','touchmove','keydown','pointerdown'].forEach((t) =>
    window.addEventListener(t, () => { W.lastInput = performance.now(); }, { capture: true, passive: true }));
  const rec = (kind, el, before, extra) => {
    const c = C();
    W.writes.push({ t: Math.round(performance.now()), kind, target: isC(el) ? 'container' : (el && (el.tagName + '.' + (el.className || '').toString().slice(0, 40))) || 'window',
      before, after: c ? c.scrollTop : null, sinceInput: W.lastInput ? Math.round(performance.now() - W.lastInput) : null,
      extra, stack: (new Error().stack || '').split('\n').slice(2, 14).join('\n') });
  };
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: d.get, set(v) {
    const b = this.scrollTop; d.set.call(this, v);
    if (isC(this)) rec('scrollTop=', this, b, Math.abs(v - b) > 2000 ? { value: v, rows: Array.from(this.querySelectorAll('[data-message-id]')).slice(-6).map((r) => ({
      id: r.dataset.messageId, rid: r.dataset.messageRenderId || null, top: r.offsetTop, h: r.offsetHeight,
      parent: r.offsetParent ? (r.offsetParent.className || r.offsetParent.tagName).toString().slice(0, 40) : null })) } : { value: v });
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
    const c = e.target;
    if (!isC(c)) {
      const el = c === document ? document.scrollingElement : c;
      if (el && el.scrollTop !== undefined) W.others.push({ t: Math.round(performance.now()),
        target: el === document.scrollingElement ? 'document' : (el.tagName + '.' + (el.className || '').toString().slice(0, 40)), st: Math.round(el.scrollTop) });
      return;
    }
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
      dist: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), mode: c.dataset.followMode });
  }, 100);

  // Client-side SSE for POST /chat/messages/send: the production send/stream code runs, the server sees nothing.
  window.__probeStream = { seconds: 22, tickMs: 150, exec: null };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/chat\/messages\/send(\?|$)/.test(url)) {
      W.sends += 1;
      const enc = new TextEncoder(); const cfg = window.__probeStream;
      const frame = (o) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
      const body = new ReadableStream({ start(ctrl) {
        ctrl.enqueue(frame({ type: 'stream_start', execution_id: cfg.exec || crypto.randomUUID() }));
        let n = 0; const total = Math.round(cfg.seconds * 1000 / cfg.tickMs);
        const iv = setInterval(() => {
          n += 1;
          try {
            ctrl.enqueue(frame({ type: 'delta', content: `${n}. 스크롤 측정용 모의 스트리밍 문단입니다. 실제 서버에는 전송되지 않습니다.\n\n` }));
            if (n >= total) { clearInterval(iv); ctrl.enqueue(frame({ type: 'done', model: 'probe' })); ctrl.close(); }
          } catch { clearInterval(iv); }
        }, cfg.tickMs);
      } });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    }
    return origFetch.apply(this, arguments);
  };
})();
"""

def log(*a):
    print(datetime.datetime.now().strftime("%H:%M:%S"), *a, flush=True)

PICK_ANCHOR = """() => {
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
}"""

STATE = """() => { const c = document.querySelector('.ct-messages-scroll');
  const key = window.__scrollProbe.anchorKey;
  const row = key ? c.querySelector(`[data-message-id="${CSS.escape(key)}"]`) : null;
  return { st: Math.round(c.scrollTop), sh: c.scrollHeight, ch: c.clientHeight, dist: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight),
    mode: c.dataset.followMode, anchorTop: row ? Math.round(row.getBoundingClientRect().top - c.getBoundingClientRect().top) : null,
    docTop: Math.round(document.scrollingElement.scrollTop), vvTop: window.visualViewport ? Math.round(window.visualViewport.offsetTop) : null }; }"""


async def state(page):
    return await page.evaluate(STATE)


async def user_scroll(page, cdp, mobile, dy):
    """Scroll as a user: wheel on desktop, touch drag on mobile. dy<0 = up."""
    box = await page.evaluate("() => { const r = document.querySelector('.ct-messages-scroll').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }")
    if mobile:
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
            if abs(remaining) > 20000:
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


CRF_CONTENT = "✅ 스크롤 측정용 CRF 모의 보고\n\n" + "\n\n".join(
    f"## {t}\n" + "\n".join(f"- {t} 항목 {i}" for i in range(1, 9)) for t in ("지시파악", "목표", "계획", "실행순서", "결과", "검증", "리스크", "다음 단계"))


async def run(profile):
    mobile = profile == "mobile"
    inject = {"rows": []}
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
        await ctx.add_init_script(INIT.replace("seconds: 22", f"seconds: {STREAM_SEC}"))
        page = await ctx.new_page()
        chunks = set()

        def partial_text():
            # S9: the server's partial reply mirrors the SSE text (lagging ~1s); S3: the legacy probe text.
            if stream.get("sse_t0"):
                n = max(0, int((asyncio.get_event_loop().time() - stream["sse_t0"] - 1.0) / 0.15))
                return "".join(f"{i}. 스크롤 측정용 모의 스트리밍 문단입니다. 실제 서버에는 전송되지 않습니다.\n\n" for i in range(1, n + 1))
            return ("스트리밍 모의 토큰 " * 6 + "\n") * stream["n"]

        async def guard(route):
            req = route.request
            if LOCAL and req.url.startswith(BASE) and "/api/" not in req.url:
                # Serve the page and its JS from a local `next dev` of the source under test;
                # the API stays production (same origin, same token, same session data).
                if "/_next/static/chunks/app/chat/page" in req.url:
                    chunks.add(req.url.split("/")[-1].split("?")[0])
                resp = await route.fetch(url=LOCAL + req.url[len(BASE):], max_redirects=0)
                return await route.fulfill(response=resp)
            if "/_next/static/chunks/app/chat/page-" in req.url:
                chunks.add(req.url.split("/")[-1])
                if PATCHED and req.url.endswith("/page-97dde5324d352497.js"):
                    # production chunk with the source fix applied (patch_chunk.py)
                    return await route.fulfill(status=200, content_type="application/javascript; charset=utf-8", body=open(PATCHED, encoding="utf-8").read())
            if req.method not in ("GET", "HEAD", "OPTIONS") and "/api/" in req.url:
                return await route.fulfill(status=204, body="")
            if stream["on"] and "/streaming-status" in req.url and req.method == "GET":
                stream["n"] += 1
                return await route.fulfill(json={"is_streaming": True, "just_completed": False, "stream_status": "tool_running",
                    "stream_status_label": "도구 실행 중", "tool_count": stream["n"], "last_tool": "probe_tool",
                    "partial_content": partial_text(), "content_length": len(partial_text()),
                    "execution_id": stream["exec"], "placeholder_message_id": stream["ph"], "placeholder_ready": True,
                    "capabilities": [], "interrupts": []})
            if stream["on"] and req.method == "GET" and ("/stream" in req.url or "/events" in req.url or "/replay" in req.url) and "/api/" in req.url:
                return await route.fulfill(status=204, body="")
            if "/chat/messages" in req.url and req.method == "GET" and inject["rows"]:
                resp = await route.fetch()
                try:
                    data = await resp.json()
                    if isinstance(data, dict) and isinstance(data.get("messages"), list):
                        rows = [({**r, "content": partial_text()} if r["id"] == stream["ph"] and stream.get("sse_t0") else r) for r in inject["rows"]]
                        data["messages"] = data["messages"] + rows
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
        results = {"_build": {"chat_chunks": sorted(chunks)}}
        results["_build"]["scripts"] = await page.evaluate("() => Array.from(document.scripts).map(s => s.src).filter(s => s.includes('/app/chat/') || s.includes('webpack'))")
        log("build", results["_build"])

        async def snap(name):
            n = await page.evaluate("() => [window.__scrollProbe.writes.length, window.__scrollProbe.natives.length, window.__scrollProbe.samples.length, window.__scrollProbe.others.length]")
            return n

        async def collect(name, n0, extra):
            data = await page.evaluate("(n) => ({ writes: window.__scrollProbe.writes.slice(n[0]), natives: window.__scrollProbe.natives.slice(n[1]), samples: window.__scrollProbe.samples.slice(n[2]), others: window.__scrollProbe.others.slice(n[3]) })", n0)
            tops = [s["top"] for s in data["samples"] if s["top"] is not None]
            res = {"anchor_top_range_px": (max(tops) - min(tops)) if tops else None,
                   "anchor_top_first": tops[0] if tops else None, "anchor_top_last": tops[-1] if tops else None,
                   "container_writes": len([w for w in data["writes"] if w.get("kind") != "MARK" and w.get("target") == "container"]),
                   "all_writes": len([w for w in data["writes"] if w.get("kind") != "MARK"]),
                   "other_scrollers": sorted({o["target"] for o in data["others"]}), **extra, **data}
            results[name] = res
            short = {k: v for k, v in res.items() if k not in ("writes", "natives", "samples", "others")}
            log(profile, name, json.dumps(short, ensure_ascii=False))

        async def to_bottom_then_up(up_px):
            await user_scroll(page, cdp, mobile, 50000)
            await page.wait_for_timeout(1500)
            if up_px:
                await user_scroll(page, cdp, mobile, -up_px)
            await page.wait_for_timeout(1600)

        async def scenario(name, up_px, body):
            await to_bottom_then_up(up_px)
            await page.evaluate(PICK_ANCHOR)
            await page.wait_for_timeout(300)
            s0 = await state(page)
            await mark(page, f"{name}:start")
            n0 = await snap(name)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_before.jpg", quality=60, type="jpeg")
            await body()
            s1 = await state(page)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_after.jpg", quality=60, type="jpeg")
            await collect(name, n0, {"start": s0, "end": s1})

        async def poke():
            await page.evaluate("""() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
              document.dispatchEvent(new Event('visibilitychange'));
              setTimeout(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
                document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }, 300); }""")

        def fake_row(kind, content=None):
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            return {"id": str(uuid.uuid4()), "session_id": SESSION, "role": "assistant", "intent": "pipeline_runner" if content is None else "chat",
                    "content": content or (f"🔔 [probe {kind}] 러너 알림 모의 행\n\n" + "줄\n" * 12), "created_at": now,
                    "attachments": [], "sources": [], "is_hidden": False, "model_used": "probe"}

        async def idle():
            await page.wait_for_timeout(IDLE * 1000)

        async def arrive(count=3):
            await page.wait_for_timeout(2000)
            for i in range(count):
                inject["rows"].append(fake_row(f"S2-{i}"))
                await poke()
                await page.wait_for_timeout(9000)
            await page.wait_for_timeout(2000)

        async def streaming_body():
            stream["on"] = True; stream["n"] = 0
            inject["rows"].append({"id": stream["ph"], "session_id": SESSION, "role": "assistant", "intent": "streaming_placeholder",
                "content": "⏳ 모의 스트리밍", "execution_id": stream["exec"], "model_used": "streaming",
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "attachments": [], "sources": [], "is_hidden": False})
            await poke()
            await page.wait_for_timeout(30000)
            stream["on"] = False
            inject["rows"] = [r for r in inject["rows"] if r["id"] != stream["ph"]]
            stream["exec"] = str(uuid.uuid4()); stream["ph"] = str(uuid.uuid4())
            await page.wait_for_timeout(3000)

        async def late_layout():
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

        async def send_probe():
            ta = page.locator("textarea").first
            if mobile:
                await ta.tap()
            else:
                await ta.click()
            await ta.fill("스크롤 측정 probe (서버 미전송)")
            await page.wait_for_timeout(200)
            before = await page.evaluate("() => window.__scrollProbe.sends")
            await ta.press("Enter")
            await page.wait_for_timeout(400)
            sent = await page.evaluate("() => window.__scrollProbe.sends")
            if sent == before:
                log(profile, "Enter did not send; clicking send button")
                btn = page.locator("button[type=submit], button[aria-label*='전송'], button[title*='전송']").last
                await btn.click()
                await page.wait_for_timeout(400)
                sent = await page.evaluate("() => window.__scrollProbe.sends")
            # blur so the input focus effect (S10) does not mix into S9
            await page.evaluate("() => document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            return sent > before

        async def s9(name, up_px, tail_shrink=0):
            await to_bottom_then_up(0)
            n0 = await snap(name)
            await mark(page, f"{name}:send")
            # server side of the same reply: streaming-status + placeholder row, then the persisted final row
            stream["on"] = True; stream["n"] = 0
            await page.evaluate("(e) => { window.__probeStream.exec = e; }", stream["exec"])
            inject["rows"].append({"id": stream["ph"], "session_id": SESSION, "role": "assistant", "intent": "streaming_placeholder",
                "content": "", "execution_id": stream["exec"], "model_used": "streaming",
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "attachments": [], "sources": [], "is_hidden": False})
            async def finish_server_side():
                await asyncio.sleep(STREAM_SEC + 0.5)
                stream["on"] = False; stream["sse_t0"] = None
                inject["rows"] = [r for r in inject["rows"] if r["id"] != stream["ph"]]
                total = round(STREAM_SEC * 1000 / 150)
                inject["rows"].append({**fake_row("S9-final", "".join(f"{i}. 스크롤 측정용 모의 스트리밍 문단입니다. 실제 서버에는 전송되지 않습니다.\n\n" for i in range(1, total + 1))),
                                       "id": str(uuid.uuid4()), "execution_id": stream["exec"]})
                stream["exec"] = str(uuid.uuid4()); stream["ph"] = str(uuid.uuid4())
            stream["sse_t0"] = asyncio.get_event_loop().time()
            finisher = asyncio.ensure_future(finish_server_side())
            ok = await send_probe()
            await page.wait_for_timeout(1500)  # reply is streaming now
            s_send = await state(page)
            if tail_shrink:
                # S9d: the streaming tail gets shorter right after the reader's wheel/drag
                # (tool status line, partial re-render) -> the browser clamps inside the gesture.
                await page.evaluate("""(h) => { const c = document.querySelector('.ct-messages-scroll');
                  const rows = c.querySelectorAll('[data-message-id]'); const last = rows[rows.length - 1];
                  const s = document.createElement('div'); s.className = '__probe_tail'; s.style.height = h + 'px';
                  last.appendChild(s); c.scrollTop = c.scrollHeight; }""", tail_shrink)
                await page.wait_for_timeout(400)
            await user_scroll(page, cdp, mobile, -up_px)
            if tail_shrink:
                await page.evaluate("() => document.querySelectorAll('.__probe_tail').forEach((e) => e.remove())")
            await page.wait_for_timeout(250)
            await page.evaluate(PICK_ANCHOR)
            await page.wait_for_timeout(100)
            s0 = await state(page)
            await mark(page, f"{name}:scrolled")
            await page.screenshot(path=f"{OUT}/{profile}_{name}_before.jpg", quality=60, type="jpeg")
            await page.wait_for_timeout(2000)
            s2 = await state(page)
            await page.wait_for_timeout(8000)
            s10 = await state(page)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_after10s.jpg", quality=60, type="jpeg")
            await page.wait_for_timeout(max(0, STREAM_SEC * 1000 - 11500) + 5000)  # reply done + final commit
            s_end = await state(page)
            await finisher
            await collect(name, n0, {"sent": ok, "at_send": s_send, "start": s0, "after2s": s2, "after10s": s10, "end": s_end,
                                     "anchor_delta_2s": None if s0["anchorTop"] is None or s2["anchorTop"] is None else s2["anchorTop"] - s0["anchorTop"],
                                     "anchor_delta_10s": None if s0["anchorTop"] is None or s10["anchorTop"] is None else s10["anchorTop"] - s0["anchorTop"],
                                     "anchor_delta_end": None if s0["anchorTop"] is None or s_end["anchorTop"] is None else s_end["anchorTop"] - s0["anchorTop"]})

        async def s10(name, up_px, keyboard=False):
            await to_bottom_then_up(up_px)
            await page.evaluate(PICK_ANCHOR)
            s0 = await state(page)
            n0 = await snap(name)
            await mark(page, f"{name}:focus")
            ta = page.locator("textarea").first
            if mobile:
                await ta.tap()
            else:
                await ta.click()
            if keyboard:
                # Android-style keyboard: the layout viewport shrinks by the keyboard height.
                await page.set_viewport_size({"width": 390, "height": 500})
            await page.wait_for_timeout(1500)
            s1 = await state(page)
            await page.evaluate("() => document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            if keyboard:
                await page.set_viewport_size({"width": 390, "height": 844})
            await page.wait_for_timeout(800)
            s2 = await state(page)
            await collect(name, n0, {"start": s0, "focused": s1, "blurred": s2,
                                     "container_scrolltop_delta_focus": s1["st"] - s0["st"],
                                     "anchor_delta_focus": None if s0["anchorTop"] is None or s1["anchorTop"] is None else s1["anchorTop"] - s0["anchorTop"]})

        async def s11(name):
            inject["rows"].append(fake_row("CRF", CRF_CONTENT))
            await poke()
            await page.wait_for_timeout(9000)
            await to_bottom_then_up(0)
            has = await page.evaluate("() => document.querySelectorAll('.ct-messages-scroll .cb-chipbar').length")
            if not has:
                results[name] = {"error": "CRF chipbar not rendered"}
                log(profile, name, "no chipbar")
                return
            # bring the last chip bar to the top third of the view as a user
            dy = await page.evaluate("""() => { const c = document.querySelector('.ct-messages-scroll');
              const bars = c.querySelectorAll('.cb-chipbar'); const b = bars[bars.length - 1];
              return Math.round(b.getBoundingClientRect().top - c.getBoundingClientRect().top - 120); }""")
            await user_scroll(page, cdp, mobile, dy)
            await page.wait_for_timeout(1600)
            await page.evaluate(PICK_ANCHOR)
            s0 = await state(page)
            n0 = await snap(name)
            await mark(page, f"{name}:chip")
            chip = page.locator(".ct-messages-scroll .cb-chipbar").last.locator(".cb-chipbtn").nth(5)
            if mobile:
                await chip.tap()
            else:
                await chip.click()
            await page.wait_for_timeout(1500)
            s1 = await state(page)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_afterchip.jpg", quality=60, type="jpeg")
            # a new row arrives after the reader jumped to a section
            inject["rows"].append(fake_row("S11-arrive"))
            await poke()
            await page.wait_for_timeout(9000)
            s2 = await state(page)
            await page.screenshot(path=f"{OUT}/{profile}_{name}_afterarrive.jpg", quality=60, type="jpeg")
            await collect(name, n0, {"start": s0, "after_chip": s1, "after_arrive": s2,
                                     "chip_scrolltop_delta": s1["st"] - s0["st"], "arrive_scrolltop_delta": s2["st"] - s1["st"]})

        up3 = 2200 if mobile else 2400
        table = {
            "S1": lambda: scenario("S1_idle_up3screens", up3, idle),
            "S2": lambda: scenario("S2_arrive_up3screens", up3, arrive),
            "S3": lambda: scenario("S3_stream_up180px", 180, streaming_body),
            "S4": lambda: scenario("S4_latelayout_up180px", 180, late_layout),
            "S5": lambda: scenario("S5_arrive_up250px", 250, arrive),
            "S6": lambda: scenario("S6_visibility_up3screens", up3, visibility),
            "S7a": lambda: scenario("S7_arrive_atbottom", 0, arrive),
            "S7b": lambda: scenario("S7_stream_atbottom", 0, streaming_body),
            "S8": lambda: scenario("S8_latelayout_up120px", 120, late_layout),
            "S9a": lambda: s9("S9_send_then_up120px", 120),
            "S9b": lambda: s9("S9_send_then_up250px", 250),
            "S9c": lambda: s9("S9_send_then_up40px", 40),
            "S9d": lambda: s9("S9_send_up120px_tailshrink200", 120, tail_shrink=200),
            "S10a": lambda: s10("S10_focus_up120px", 120),
            "S10b": lambda: s10("S10_focus_up3screens", up3),
            "S10c": lambda: s10("S10_focus_atbottom", 0),
            "S10k": lambda: s10("S10_focus_keyboard_up120px", 120, keyboard=True),
            "S11": lambda: s11("S11_crf_chip"),
        }
        only = os.environ.get("PROBE_ONLY", "")
        keys = [k for k in only.split(",") if k] or list(table)
        if not mobile:
            keys = [k for k in keys if k != "S10k"]
        for key in keys:
            try:
                await asyncio.wait_for(table[key](), timeout=150)
            except Exception as exc:  # keep going; record the failure
                results[key] = {"error": repr(exc)}
                log(profile, key, "ERROR", repr(exc))
        tag = os.environ.get("PROBE_TAG", "")
        json.dump(results, open(f"{OUT}/{profile}{tag}.json", "w"), ensure_ascii=False, indent=1)
        await page.unroute_all(behavior="ignoreErrors")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run(sys.argv[1]))
