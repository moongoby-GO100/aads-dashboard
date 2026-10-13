"""Apply the source fix of AADS-CHAT-SCROLL-AUTOMOVE-RECUR2-20261013 to the production
chat chunk (page-97dde5324d352497.js, image aads-dashboard:8cbc652eefc0) so the fix can be
measured on production /chat before a build exists (next build is not allowed in this job).

Each replacement mirrors one source change; every pattern must match exactly once.
Usage: python3 patch_chunk.py chunk_orig.js chunk_patched.js
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

PATCHES = [
    # chatViewportController.markUserGesture(durationMs, direction): "up" ends the send stick.
    ("markUserGesture(e=1e3){this.gestureEpoch+=1,",
     "markUserGesture(e=1e3,__d){\"up\"===__d&&(this.bottomStickUntil=0),this.gestureEpoch+=1,"),
    # recordScroll: a layout-shrink clamp is never the reader's scroll; remember an upward move.
    ("r-this.lastUserScrollAt<=250,s=e||a;",
     "r-this.lastUserScrollAt<=250,s=e&&!i||a,__mu=s&&this.stableScrollTop-t.scrollTop>1;"),
    # recordScroll: shouldReleaseBottomStick({ movedUp, metrics }) — upward move or past 64px.
    ("\"auto\"===l&&this.setUnreadCount(0),this.nearBottom||(this.bottomStickUntil=0))}",
     "\"auto\"===l&&this.setUnreadCount(0),(__mu||!rS(t,64))&&(this.bottomStickUntil=0))}"),
    # scrollElementIntoView: reader's click ends follow + stick and overrides the gesture guard.
    ("scrollElementIntoView(e){let t=this.scope();return!!this.scopeIsCurrent(t)&&this.performWrite(\"response-outline\"",
     "scrollElementIntoView(e){return this.bottomStickUntil=0,this.gestureActiveUntil=0,this.cancelPendingIntent(),this.cancelBottomFrames(),this.setFollowMode(\"manual\"),this.performWrite(\"response-outline\""),
    # DOM adapter captureAnchor: neighbour offsets.
    ("neighborKeys:[...a.slice(0,8),...s.slice(0,8)].map(rC).filter(e=>!!e),",
     "...(__nb=>({neighborKeys:__nb.map(rC),neighborOffsets:__nb.map(e=>e.offsetTop-r.scrollTop)}))([...a.slice(0,8),...s.slice(0,8)].filter(e=>!!rC(e))),"),
    # DOM adapter restoreAnchor: a neighbour restores with its own offset.
    ("let o=[r.renderKey||r.renderId||r.messageId,...r.neighborKeys||[]].filter(e=>!!e),a=new Map;for(let e of t(n)){let t=rC(e);t&&!a.has(t)&&a.set(t,e)}let s=null;for(let e of o){let t=a.get(e);if(t){s=t;break}}let l=Number.isFinite(r.offsetPx)?r.offsetPx:Number(r.offsetTop||0),d=Math.max(0,Math.min(i,s?s.offsetTop-l:r.scrollTop));",
     "let l=Number.isFinite(r.offsetPx)?r.offsetPx:Number(r.offsetTop||0),__pk=r.renderKey||r.renderId||r.messageId||null,o=[];__pk&&o.push({key:__pk,offset:l}),(r.neighborKeys||[]).forEach((e,t)=>{let n=r.neighborOffsets?.[t];e&&o.push({key:e,offset:\"number\"==typeof n&&Number.isFinite(n)?n:l})});let a=new Map;for(let e of t(n)){let t=rC(e);if(!t)continue;let r=a.get(t);r?r.push(e):a.set(t,[e])}let s=r.scrollTop;for(let e of o){let t=a.get(e.key);if(!t)continue;let n=r.scrollTop+e.offset,i=t.reduce((e,t)=>Math.abs(t.offsetTop-n)<Math.abs(e.offsetTop-n)?t:e);s=i.offsetTop-e.offset;break}let d=Math.max(0,Math.min(i,s));"),
    # page.tsx scroll listeners: wheel / touch / key direction.
    ("let t=()=>{o1.markUserGesture()},r=!1,",
     "let t=__d=>{o1.markUserGesture(1e3,\"string\"==typeof __d?__d:void 0)},__ly=null,__w=e=>{t(e.deltaY<0?\"up\":e.deltaY>0?\"down\":void 0)},__ts=e=>{__ly=e.touches[0]?.clientY??null,t()},__tm=e=>{let r=e.touches[0]?.clientY??null,n=null!==r&&null!==__ly&&r!==__ly?r>__ly?\"up\":\"down\":void 0;null!==r&&(__ly=r),t(n)},r=!1,"),
    ("[\"Home\",\"End\",\"PageUp\",\"PageDown\",\"ArrowUp\",\"ArrowDown\",\" \"].includes(e.key)&&t()",
     "([\"Home\",\"PageUp\",\"ArrowUp\"].includes(e.key)||\" \"===e.key&&e.shiftKey?t(\"up\"):[\"End\",\"PageDown\",\"ArrowDown\",\" \"].includes(e.key)&&t(\"down\"))"),
    ("e.addEventListener(\"wheel\",t,{passive:!0}),e.addEventListener(\"touchstart\",t,{passive:!0}),e.addEventListener(\"touchmove\",t,{passive:!0}),e.addEventListener(\"pointerdown\",n,{passive:!0})",
     "e.addEventListener(\"wheel\",__w,{passive:!0}),e.addEventListener(\"touchstart\",__ts,{passive:!0}),e.addEventListener(\"touchmove\",__tm,{passive:!0}),e.addEventListener(\"pointerdown\",n,{passive:!0})"),
    ("e.removeEventListener(\"wheel\",t),e.removeEventListener(\"touchstart\",t),e.removeEventListener(\"touchmove\",t),e.removeEventListener(\"pointerdown\",n)",
     "e.removeEventListener(\"wheel\",__w),e.removeEventListener(\"touchstart\",__ts),e.removeEventListener(\"touchmove\",__tm),e.removeEventListener(\"pointerdown\",n)"),
    # ChatInput onFocus: visualViewport overlap -> window.scrollBy, no scrollIntoView.
    ("setTimeout(()=>{($.current??document.activeElement)?.scrollIntoView?.({behavior:\"smooth\",block:\"nearest\"})},300)",
     "setTimeout(()=>{let t=$.current,r=window.visualViewport;if(!t||!r)return;let n=t.getBoundingClientRect().bottom-(r.offsetTop+r.height);n>0&&window.scrollBy({top:n,behavior:\"smooth\"})},300)"),
    # SectionCardContent chip -> onScrollToSection (= MessageItem onViewportTarget = controller).
    # The compiled component caches its JSX, so the prop is reached through one global that
    # the route sets to the same callback it passes as onViewportTarget.
    ("C.current[t]?.scrollIntoView({behavior:\"smooth\",block:\"center\"})",
     "C.current[t]&&(window.__aadsScrollToSection?window.__aadsScrollToSection(C.current[t]):C.current[t].scrollIntoView({behavior:\"smooth\",block:\"center\"}))"),
    ("let o2=(0,o.useCallback)(e=>{o1.scrollElementIntoView(e)},[o1]),",
     "let o2=(0,o.useCallback)(e=>{o1.scrollElementIntoView(e)},[o1]),__sg=(window.__aadsScrollToSection=e=>{o1.scrollElementIntoView(e)}),"),
]

for old, new in PATCHES:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"pattern matched {count}x: {old[:90]}")
    s = s.replace(old, new)
open(dst, "w", encoding="utf-8").write(s)
print(f"applied {len(PATCHES)} patches -> {dst}")
