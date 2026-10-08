"""Builds the standalone harness HTML: real ChatViewportController (tsc output) + page.tsx listener wiring."""
import os

JS = "/tmp/scrolltest/js"
policy = open(f"{JS}/lib/chatScrollPolicy.js").read()
ctrl = open(f"{JS}/features/chat/viewport/chatViewportController.js").read()

WIRING = r"""
const container = document.querySelector('.ct-messages-scroll');
window.__log = []; const T0 = performance.now();
const L = (o) => window.__log.push(Object.assign({t: Math.round(performance.now()-T0)}, o));
const followModes = [];
const controller = new ChatViewportController(createDomChatViewportAdapter(() => container), {
  onFollowModeChange: (m) => { container.dataset.followMode = m; L({ev:'mode', m}); },
  onUnreadCountChange: (n) => { window.__unread = n; },
});
window.controller = controller; container.dataset.followMode = 'auto';
controller.resetSession('s1');
let isInitialLoad = false;           // page.tsx isInitialLoadRef after the 800ms release
let streaming = false; window.setStreaming = (v) => { streaming = v; };

// ---- verbatim from page.tsx 7188-7286 ----
const markUserScrollIntent = () => { controller.markUserGesture(); L({ev:'gesture'}); };
let scrollbarPointerActive = false;
const markScrollbarPointerIntent = (event) => {
  const rect = container.getBoundingClientRect();
  const nativeScrollbarWidth = Math.max(0, container.offsetWidth - container.clientWidth);
  const scrollbarHitWidth = Math.max(16, nativeScrollbarWidth + 4);
  if (event.clientX >= rect.right - scrollbarHitWidth) { scrollbarPointerActive = true; markUserScrollIntent(); }
};
const markScrollbarPointerMove = () => { if (scrollbarPointerActive) markUserScrollIntent(); };
const releaseScrollbarPointer = () => { scrollbarPointerActive = false; };
const markKeyboardScrollIntent = (event) => {
  if (["Home","End","PageUp","PageDown","ArrowUp","ArrowDown"," "].includes(event.key)) markUserScrollIntent();
};
const restoreIfUnexpectedTopReset = (source) => {
  if (!isInitialLoad && controller.restoreUnexpectedTopReset()) {
    console.warn("[chat-scroll] unexpected top reset restored", {source});
    L({ev:'TOP-RESET-RESTORED', source, st: Math.round(container.scrollTop)});
    return true;
  }
  return false;
};
const handleScroll = () => {
  L({ev:'scroll', st: Math.round(container.scrollTop), sh: container.scrollHeight, gesture: controller.hasActiveGesture});
  if (restoreIfUnexpectedTopReset("scroll")) return;
  controller.recordScroll(controller.hasActiveGesture);
};
let mutationAuditFrame = 0, resizeAuditFrame = 0;
const resizeObserver = new ResizeObserver(() => {
  if (resizeAuditFrame) return;
  resizeAuditFrame = requestAnimationFrame(() => {
    resizeAuditFrame = 0;
    const before = container.scrollTop;
    const corrected = controller.correctContentResize();
    if (Math.abs(container.scrollTop - before) > 1) L({ev:'CONTENT-RESIZE-MOVED', from: Math.round(before), to: Math.round(container.scrollTop)});
  });
});
const observedRows = new WeakSet();
const observeMessageRows = () => {
  container.querySelectorAll('[data-message-id]').forEach((row) => {
    if (observedRows.has(row)) return; observedRows.add(row); resizeObserver.observe(row);
  });
};
const mutationObserver = new MutationObserver(() => {
  if (mutationAuditFrame) return;
  mutationAuditFrame = requestAnimationFrame(() => { mutationAuditFrame = 0; observeMessageRows(); restoreIfUnexpectedTopReset("mutation"); });
});
observeMessageRows();
mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });
container.addEventListener("scroll", handleScroll, { passive: true });
container.addEventListener("wheel", markUserScrollIntent, { passive: true });
container.addEventListener("touchstart", markUserScrollIntent, { passive: true });
container.addEventListener("touchmove", markUserScrollIntent, { passive: true });
container.addEventListener("pointerdown", markScrollbarPointerIntent, { passive: true });
window.addEventListener("pointermove", markScrollbarPointerMove, { passive: true });
window.addEventListener("pointerup", releaseScrollbarPointer, { passive: true });
window.addEventListener("pointercancel", releaseScrollbarPointer, { passive: true });
window.addEventListener("keydown", markKeyboardScrollIntent);
// ---- end verbatim ----

// page.tsx 7344: streaming tick
setInterval(() => { if (streaming) controller.requestBottom(false, "message-commit"); }, 300);

// setMessagesPreservingViewport + useLayoutEffects (5127, 5184, 7336)
window.commit = (mutator, grew) => {
  controller.enqueueMutationAnchor(controller.captureAnchor(), "message-commit");
  mutator();
  controller.commitPendingIntent();
  controller.settleAfterMessageChange(streaming, !!grew);
};
let n = 0;
window.makeRow = (i, role, extra) => {
  const d = document.createElement('div');
  d.dataset.messageId = 'msg-' + String(i).padStart(3, '0');
  d.dataset.messageRenderId = d.dataset.messageId;
  d.className = 'row ' + role;
  d.innerHTML = '<b>#' + i + ' ' + role + '</b> ' + 'lorem ipsum dolor sit amet '.repeat(extra || (role === 'user' ? 6 : 50));
  return d;
};
for (let i = 0; i < 150; i++) container.appendChild(makeRow(i, i % 2 ? 'assistant' : 'user'));
observeMessageRows();
controller.requestBottom(true, 'initial');
window.__ready = true;
window.measure = () => {
  const cr = container.getBoundingClientRect();
  const rows = [...container.querySelectorAll('[data-message-id]')];
  const a = rows.find(r => r.getBoundingClientRect().bottom > cr.top + 40);
  return {st: Math.round(container.scrollTop), sh: container.scrollHeight, ch: container.clientHeight,
          mode: container.dataset.followMode, anchorId: a && a.dataset.messageId,
          anchorTop: a && Math.round(a.getBoundingClientRect().top - cr.top)};
};
"""

HTML = f"""<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
html,body{{margin:0;height:100%;font:15px/1.5 sans-serif}}
.wrap{{height:100vh;position:relative}}
.ct-messages-scroll{{height:100%;overflow-y:auto;overflow-anchor:none;-webkit-overflow-scrolling:touch;padding:12px;box-sizing:border-box}}
.row{{margin:0 0 14px;padding:10px;border-radius:8px;max-width:760px}}
.row.user{{background:#dbeafe;margin-left:auto}} .row.assistant{{background:#f3f4f6}}
</style></head><body><div class=wrap><div class="ct-messages-scroll"></div></div>
<script>
var module={{exports:{{}}}};
function run(src, exp, req){{ var m={{exports:{{}}}}; new Function('module','exports','require',src)(m,m.exports,req); return m.exports; }}
var policy = run({policy!r}, null, function(){{}});
var ctrlMod = run({ctrl!r}, null, function(p){{ return policy; }});
var ChatViewportController = ctrlMod.ChatViewportController, createDomChatViewportAdapter = ctrlMod.createDomChatViewportAdapter;
</script>
<script>{WIRING}</script></body></html>"""

os.makedirs("/tmp/scrolltest/out", exist_ok=True)
open("/tmp/scrolltest/harness.html", "w").write(HTML)
print("ok", len(HTML))
