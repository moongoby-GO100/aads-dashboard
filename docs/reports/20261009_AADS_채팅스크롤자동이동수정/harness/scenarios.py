import json, os, sys
from playwright.sync_api import sync_playwright

OUT = os.environ.get("OUT", "/tmp/scrolltest/out")
os.makedirs(OUT, exist_ok=True)
H = "file:///tmp/scrolltest/harness.html"

GROW_BELOW = """() => { commit(() => { const rows=[...document.querySelectorAll('[data-message-id]')]; const last=rows[rows.length-1];
  const d=document.createElement('div'); d.style.height='60px'; d.textContent='token'; last.appendChild(d); }, false); }"""
NEW_MSG = """() => { const c=document.querySelector('.ct-messages-scroll'); commit(() => { c.appendChild(makeRow(c.querySelectorAll('[data-message-id]').length,'assistant',20)); }, true); }"""
GROW_ABOVE = """() => { const c=document.querySelector('.ct-messages-scroll'); const cr=c.getBoundingClientRect();
  const above=[...c.querySelectorAll('[data-message-id]')].filter(r=>r.getBoundingClientRect().bottom < cr.top-50);
  const r=above[above.length-1]; const d=document.createElement('div'); d.style.height='300px'; d.textContent='img'; r.appendChild(d); }"""
RAW_GROW = """() => { const rows=[...document.querySelectorAll('[data-message-id]')]; const last=rows[rows.length-1];
  const d=document.createElement('div'); d.style.height='80px'; d.textContent='late image'; last.appendChild(d); }"""
LATE_SCROLL = "(dy) => { const c=document.querySelector('.ct-messages-scroll'); c.scrollBy({top:dy, behavior:'smooth'}); }"


def user_scroll_up(page, ctx, mobile, px):
    if mobile:
        import time
        cdp = ctx.new_cdp_session(page)
        done = 0
        while done < px:
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 195, "y": 100}]})
            y = 100
            for _ in range(15):
                y += 40
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 195, "y": y}]})
                time.sleep(0.012)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            done += 600
            page.wait_for_timeout(60)
    else:
        page.mouse.move(700, 450)
        for _ in range(max(1, px // 300)):
            page.mouse.wheel(0, -300); page.wait_for_timeout(25)


def run(device):
    mobile = device == "mobile"
    res = {"device": device, "scenarios": {}}
    with sync_playwright() as p:
        b = p.chromium.launch()
        args = dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2) if mobile else dict(viewport={"width": 1440, "height": 900})

        def fresh():
            ctx = b.new_context(**args); page = ctx.new_page()
            page.goto(H); page.wait_for_function("window.__ready"); page.wait_for_timeout(500)
            return ctx, page

        def sc(name, fn):
            ctx, page = fresh()
            log = fn(ctx, page)
            log["events"] = page.evaluate("() => window.__log.filter(e => e.ev !== 'scroll').slice(-40)")
            res["scenarios"][name] = log
            print(device, name, json.dumps({k: v for k, v in log.items() if k != 'events'}, ensure_ascii=False))
            print("   events:", [e for e in log["events"] if e["ev"] in ("TOP-RESET-RESTORED", "CONTENT-RESIZE-MOVED", "mode")])
            ctx.close()

        # A. reading (manual), content changes -> anchor must stay
        def A(ctx, page):
            page.evaluate("setStreaming(true)")
            user_scroll_up(page, ctx, mobile, 3000)
            page.wait_for_timeout(1800)
            m0 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_A_before.png")
            for _ in range(3):
                page.evaluate(GROW_BELOW); page.evaluate(NEW_MSG); page.wait_for_timeout(350)
            page.evaluate(GROW_ABOVE); page.wait_for_timeout(500)
            m1 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_A_after.png")
            return {"before": m0, "after": m1, "anchorTopDelta": (m1["anchorTop"] - m0["anchorTop"]) if m0["anchorId"] == m1["anchorId"] else "ANCHOR-CHANGED", "scrollTopDelta": m1["st"] - m0["st"]}
        sc("A_reading_content_changes", A)

        # B. user keeps scrolling after the 1s gesture window (momentum/fling); then content resizes
        def B(ctx, page):
            page.evaluate("setStreaming(true)")
            user_scroll_up(page, ctx, mobile, 3000)
            page.wait_for_timeout(1800)
            m0 = page.evaluate("measure()")
            page.evaluate(LATE_SCROLL, -2500); page.wait_for_timeout(1800)
            m1 = page.evaluate("measure()")           # where the user actually is now
            page.evaluate(GROW_BELOW); page.wait_for_timeout(700)
            m2 = page.evaluate("measure()")
            page.evaluate(NEW_MSG); page.wait_for_timeout(700)
            m3 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_B_after.png")
            return {"gestureEndPos": m0["st"], "userPosAfterMomentum": m1["st"], "afterResize": m2["st"], "afterNewMessage": m3["st"],
                    "driftAfterResizePx": m2["st"] - m1["st"], "driftAfterNewMsgPx": m3["st"] - m1["st"]}
        sc("B_momentum_then_resize", B)

        # B2. same as B but the resize is not accompanied by a React commit (image/code block/markdown relayout)
        def B2(ctx, page):
            user_scroll_up(page, ctx, mobile, 3000)
            page.wait_for_timeout(1800)
            m0 = page.evaluate("measure()")
            page.evaluate(LATE_SCROLL, -2500); page.wait_for_timeout(1800)
            m1 = page.evaluate("measure()")
            page.evaluate(RAW_GROW); page.wait_for_timeout(700)
            m2 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_B2_after.png")
            return {"gestureEndPos": m0["st"], "userPosAfterMomentum": m1["st"], "afterRawResize": m2["st"], "driftPx": m2["st"] - m1["st"],
                    "anchorBefore": [m1["anchorId"], m1["anchorTop"]], "anchorAfter": [m2["anchorId"], m2["anchorTop"]]}
        sc("B2_momentum_then_raw_resize", B2)

        # C. user flings to the very top after the gesture window ended
        def C(ctx, page):
            page.evaluate("setStreaming(true)")
            user_scroll_up(page, ctx, mobile, 3000)
            page.wait_for_timeout(1800)
            m0 = page.evaluate("measure()")
            page.evaluate(LATE_SCROLL, -100000); page.wait_for_timeout(3000)
            m1 = page.evaluate("measure()")
            return {"beforeFling": m0["st"], "afterFlingToTop": m1["st"], "reachedTop": m1["st"] <= 16}
        sc("C_fling_to_top", C)

        # D. at the bottom: must follow
        def D(ctx, page):
            page.evaluate("setStreaming(true)")
            m0 = page.evaluate("measure()")
            for _ in range(4):
                page.evaluate(GROW_BELOW); page.evaluate(NEW_MSG); page.wait_for_timeout(450)
            m1 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_D_follow.png")
            return {"before": m0, "after": m1, "distanceFromBottom": m1["sh"] - m1["st"] - m1["ch"]}
        sc("D_bottom_follows", D)
        # E. reader nudges up a little (inside the 300px near-bottom zone) while a reply streams
        def E(ctx, page):
            page.evaluate("setStreaming(true)")
            if mobile:
                import time
                cdp = ctx.new_cdp_session(page)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 195, "y": 100}]})
                y = 100
                for _ in range(10):
                    y += 20
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 195, "y": y}]}); time.sleep(0.012)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            else:
                page.mouse.move(700, 450); page.mouse.wheel(0, -200)
            page.wait_for_timeout(1800)
            m0 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_E_before.png")
            for _ in range(3):
                page.evaluate(GROW_BELOW); page.wait_for_timeout(400)
            m1 = page.evaluate("measure()"); page.screenshot(path=f"{OUT}/{device}_E_after.png")
            d0 = m0["sh"] - m0["st"] - m0["ch"]; d1 = m1["sh"] - m1["st"] - m1["ch"]
            return {"distFromBottomBefore": d0, "distFromBottomAfter": d1, "modeBefore": m0["mode"], "modeAfter": m1["mode"],
                    "anchorBefore": [m0["anchorId"], m0["anchorTop"]], "anchorAfter": [m1["anchorId"], m1["anchorTop"]]}
        sc("E_small_scroll_up_inside_300px_zone", E)
        # F. real momentum: one user input, then ~2.8s of frame-rate scroll events with commits+growth arriving the whole time
        def F(ctx, page):
            page.evaluate("setStreaming(true)")
            user_scroll_up(page, ctx, mobile, 1500)
            page.wait_for_timeout(300)
            page.evaluate("""() => new Promise(res => {
              const c=document.querySelector('.ct-messages-scroll'); window.__trace=[]; const t0=performance.now(); let last=t0, lastCommit=t0, expected=c.scrollTop;
              function frame(now){
                const dt=now-last; last=now; expected-=dt*3.5;          // ~3500 px/s decelerating-free fling
                c.scrollTop=Math.max(0, c.scrollTop-dt*3.5);             // native momentum step (not a gesture event)
                window.__trace.push([Math.round(now-t0), Math.round(c.scrollTop)]);
                if (now-lastCommit>110) { lastCommit=now; commit(()=>{ const rows=[...c.querySelectorAll('[data-message-id]')]; const l=rows[rows.length-1]; const d=document.createElement('div'); d.style.height='30px'; d.textContent='t'; l.appendChild(d); }, false); }
                if (now-t0<2800) requestAnimationFrame(frame); else res();
              }
              requestAnimationFrame(frame);
            })""")
            tr = page.evaluate("window.__trace")
            back = sum(1 for i in range(1, len(tr)) if tr[i][1] > tr[i-1][1])
            reverted = sum(max(0, tr[i][1]-tr[i-1][1]) for i in range(1, len(tr)))
            page.wait_for_timeout(500)
            m = page.evaluate("measure()")
            return {"frames": len(tr), "startScrollTop": tr[0][1], "endOfMomentum": tr[-1][1], "backwardJumps": back, "revertedPxTotal": reverted, "finalAfterSettle": m["st"]}
        sc("F_continuous_momentum_with_commits", F)
        b.close()
    json.dump(res, open(f"{OUT}/{device}_scenarios.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    run(sys.argv[1])
