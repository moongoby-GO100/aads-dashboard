import { createApi, readTokenFromCookies, ApiError, LOGIN_URL, CHAT_URL, PANEL_FRAME_URL, COOKIE_NAME } from "./lib/api.js";
import { sendAuthToFrame } from "./lib/auth-bridge.js";
import {
  nextPollDelay, POLL_BASE_MS, taskStatusLabel, taskStatusTone, canRetry, describePermission, isExpired,
  sortByUpdatedDesc, formatTime, formatDateTime, connectionMessage, actionErrorMessage, frameImageSrc,
} from "./lib/format.js";

const getToken = () => readTokenFromCookies(chrome.cookies);
const api = createApi({
  fetchImpl: (url, init) => fetch(url, init),
  getToken,
});

const $ = (id) => document.getElementById(id);
const REJECT_ARM_MS = 5000;

const state = {
  failures: 0,
  timer: null,
  inflight: false,
  pending: [],
  tasks: [],
  expandedTaskId: null,
  details: new Map(),
  cardMessages: new Map(),
  busy: new Set(),
  armedReject: new Map(),
  authFailed: false,
  tokenSent: false,
  deliverTried: false,
  frameLoaded: false,
  frameFailed: false,
  frameTimer: null,
  sheetView: null,
  sheetOnly: false,
  sheetReturnFocus: null,
  lastRefreshText: "",
  statusText: "연결 확인 중…",
};
const FRAME_LOAD_TIMEOUT_MS = 15000;

function el(tag, { cls, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return String(raw || "").split("?")[0];
  }
}

function hostOf(raw) {
  try {
    return new URL(raw).hostname;
  } catch {
    return String(raw || "").split("?")[0] || "알 수 없는 사이트";
  }
}

function updateDotTitle() {
  const parts = [state.statusText];
  if (state.lastRefreshText) parts.push(state.lastRefreshText);
  $("status-dot").title = parts.join(" · ");
}

function setStatus(stateName, text) {
  state.statusText = text;
  $("status-dot").className = `dot ${stateName}`;
  $("status-text").textContent = text;
  $("topbar").classList.toggle("has-error", stateName === "error");
  $("login-banner").hidden = stateName !== "login";
  updateDotTitle();
}

function field(label, value) {
  return el("div", { cls: "field" }, [el("dt", { text: label }), el("dd", { text: value })]);
}

function renderSummaryCounts() {
  const approvals = state.pending.filter((r) => !isExpired(r)).length;
  $("approvals-summary-count").textContent = String(approvals);
  $("chip-approvals").classList.toggle("attention", approvals > 0);
  $("tasks-summary-count").textContent = String(state.tasks.length);
}

function renderApprovals() {
  renderSummaryCounts();
  const box = $("approvals");
  const list = state.pending.filter((r) => !isExpired(r));
  $("approvals-count").textContent = list.length ? `(${list.length})` : "";
  if (!list.length) {
    box.replaceChildren(el("div", { cls: "empty", text: "승인을 기다리는 작업이 없습니다." }));
    return;
  }
  box.replaceChildren(...list.map(renderApprovalCard));
}

function renderApprovalCard(req) {
  const { what, where, why } = describePermission(req);
  const busy = state.busy.has(req.id);
  const armed = state.armedReject.has(req.id);

  const approve = el("button", { cls: "btn primary", text: "승인", attrs: { type: "button" } });
  approve.disabled = busy;
  approve.addEventListener("click", () => decide(req.id, "approve"));

  const reject = el("button", {
    cls: `btn danger${armed ? " armed" : ""}`,
    text: armed ? "정말 거부" : "거부",
    attrs: { type: "button" },
  });
  reject.disabled = busy;
  reject.addEventListener("click", () => {
    if (!state.armedReject.has(req.id)) return armRejection(req.id);
    decide(req.id, "reject");
  });

  const actions = el("div", { cls: "row" }, [approve, reject]);
  if (armed) {
    const cancel = el("button", { cls: "btn", text: "취소", attrs: { type: "button" } });
    cancel.addEventListener("click", () => disarmRejection(req.id, true));
    actions.append(cancel);
  }

  const card = el("article", { cls: "card attention" }, [
    el("dl", {}, [field("작업", what), field("사이트", where), field("사유", why)]),
    actions,
  ]);
  const message = state.cardMessages.get(req.id);
  if (message) card.append(el("div", { cls: "msg", text: message }));
  card.append(
    el("details", {}, [
      el("summary", { text: "상세 정보" }),
      el("pre", {
        text: [
          `요청 ID: ${req.id}`,
          `작업 키: ${req.work_key || "-"}`,
          `작업 종류: ${req.action_type || "-"}`,
          `요청 시각: ${formatDateTime(req.created_at) || "-"}`,
          `만료 시각: ${formatDateTime(req.expires_at) || "-"}`,
        ].join("\n"),
      }),
    ]),
  );
  return card;
}

function armRejection(id) {
  disarmRejection(id, false);
  state.armedReject.set(id, setTimeout(() => disarmRejection(id, true), REJECT_ARM_MS));
  renderApprovals();
}

function disarmRejection(id, rerender) {
  const t = state.armedReject.get(id);
  if (t) clearTimeout(t);
  state.armedReject.delete(id);
  if (rerender) renderApprovals();
}

async function decide(id, action) {
  disarmRejection(id, false);
  state.busy.add(id);
  state.cardMessages.delete(id);
  renderApprovals();
  const label = action === "approve" ? "승인" : "거부";
  try {
    await (action === "approve" ? api.approve(id) : api.reject(id));
    state.pending = state.pending.filter((r) => r.id !== id);
  } catch (err) {
    state.cardMessages.set(id, actionErrorMessage(err, label));
    if (err.kind === "not_found") state.pending = state.pending.filter((r) => r.id !== id);
    if (err.kind === "auth") await refresh();
  } finally {
    state.busy.delete(id);
    renderApprovals();
  }
  refresh();
}

function renderTasks() {
  renderSummaryCounts();
  const box = $("tasks");
  $("tasks-count").textContent = state.tasks.length ? `(최근 ${state.tasks.length}건)` : "";
  if (!state.tasks.length) {
    box.replaceChildren(el("div", { cls: "empty", text: "최근 브라우저 작업이 없습니다." }));
    return;
  }
  box.replaceChildren(...state.tasks.map(renderTask));
}

function renderTask(task) {
  const tone = taskStatusTone(task.status);
  const lastStep = (task.current_step || "").trim() || (task.error ? `오류: ${String(task.error).slice(0, 120)}` : "단계 정보 없음");
  const head = el("button", { cls: "task-head", attrs: { type: "button", "aria-expanded": String(state.expandedTaskId === task.id) } }, [
    el("span", { cls: "task-line" }, [
      el("span", { cls: "task-host", text: hostOf(task.target_url) }),
      el("span", { cls: `badge ${tone}`, text: taskStatusLabel(task.status) }),
    ]),
    el("span", { text: `마지막 단계: ${lastStep}` }),
    el("span", { cls: "muted", text: formatDateTime(task.updated_at) }),
  ]);
  head.addEventListener("click", () => toggleTask(task.id));
  const card = el("article", { cls: "card task" }, [head]);
  if (state.expandedTaskId === task.id) card.append(renderTaskDetail(task));
  return card;
}

function renderTaskDetail(task) {
  const box = el("div", { cls: "task-detail" });
  box.append(field("대상", safeUrl(task.target_url)));
  const detail = state.details.get(task.id);
  if (!detail) {
    box.append(el("div", { cls: "muted", text: "상세 정보를 불러오는 중…" }));
  } else if (detail.error) {
    box.append(el("div", { cls: "msg", text: detail.error }));
  } else {
    const src = frameImageSrc(detail.frame);
    if (src) {
      box.append(el("img", { cls: "frame", attrs: { src, alt: "브라우저 실시간 화면", loading: "lazy" } }));
      const where = [detail.frame.page_title, safeUrl(detail.frame.current_url)].filter(Boolean).join(" · ");
      if (where) box.append(el("div", { cls: "muted", text: where }));
    } else {
      box.append(el("div", { cls: "muted", text: "표시할 실시간 화면이 없습니다." }));
    }
    if (detail.steps.length) {
      box.append(
        el("ol", { cls: "steps" }, detail.steps.slice(-8).map((s) =>
          el("li", { text: `${s.narration || s.step}${s.created_at ? ` (${formatDateTime(s.created_at)})` : ""}` }),
        )),
      );
    } else {
      box.append(el("div", { cls: "muted", text: "기록된 진행 단계가 없습니다." }));
    }
    if (detail.events.length) {
      box.append(
        el("details", {}, [
          el("summary", { text: `이벤트 기록 (${detail.events.length})` }),
          el("pre", {
            text: detail.events.slice(0, 15).map((e) => `${formatDateTime(e.created_at)}  ${e.event_type}`).join("\n"),
          }),
        ]),
      );
    }
  }
  const retry = el("button", { cls: "btn", text: "다시 시도", attrs: { type: "button" } });
  retry.disabled = !canRetry(task.status) || state.busy.has(task.id);
  if (!canRetry(task.status)) retry.title = "진행 중이거나 승인·로그인을 기다리는 작업은 다시 시도할 수 없습니다.";
  retry.addEventListener("click", () => retryTask(task.id));
  box.append(el("div", { cls: "row" }, [retry]));
  const message = state.cardMessages.get(task.id);
  if (message) box.append(el("div", { cls: `msg${message.ok ? " ok" : ""}`, text: message.text ?? message }));
  box.append(
    el("details", {}, [
      el("summary", { text: "상세 정보" }),
      el("pre", { text: `작업 ID: ${task.id}\n작업 키: ${task.work_key || "-"}\n상태 코드: ${task.status}` }),
    ]),
  );
  return box;
}

async function toggleTask(id) {
  state.expandedTaskId = state.expandedTaskId === id ? null : id;
  renderTasks();
  if (state.expandedTaskId) await loadDetail(id);
}

async function loadDetail(id) {
  try {
    state.details.set(id, await api.getTaskDetail(id));
  } catch (err) {
    state.details.set(id, { error: actionErrorMessage(err, "상세 조회") });
    if (err.kind === "auth") refresh();
  }
  if (state.expandedTaskId === id) renderTasks();
}

async function retryTask(id) {
  state.busy.add(id);
  state.cardMessages.delete(id);
  renderTasks();
  try {
    const result = await api.retryTask(id);
    state.cardMessages.set(id, {
      ok: true,
      text: result.status === "already_active" ? "이미 진행 중인 작업입니다." : "다시 시도를 요청했습니다.",
    });
  } catch (err) {
    state.cardMessages.set(id, { ok: false, text: actionErrorMessage(err, "다시 시도") });
  } finally {
    state.busy.delete(id);
    renderTasks();
  }
  refresh();
}

function updateChatNotice() {
  const failed = state.frameFailed || state.authFailed || (state.frameLoaded && state.deliverTried && !state.tokenSent);
  $("chat-notice").hidden = !failed;
}

function buildFrame() {
  clearTimeout(state.frameTimer);
  state.tokenSent = false;
  state.deliverTried = false;
  state.frameLoaded = false;
  state.frameFailed = false;
  const frame = el("iframe", {
    attrs: {
      src: PANEL_FRAME_URL,
      title: "OHVIS 채팅",
      sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads",
      allow: "clipboard-write",
    },
  });
  frame.addEventListener("load", () => {
    clearTimeout(state.frameTimer);
    state.frameLoaded = true;
    state.frameFailed = false;
    deliverAuth(frame);
  });
  frame.addEventListener("error", () => {
    clearTimeout(state.frameTimer);
    state.frameFailed = true;
    updateChatNotice();
  });
  state.frameTimer = setTimeout(() => {
    if (state.frameLoaded) return;
    state.frameFailed = true;
    updateChatNotice();
  }, FRAME_LOAD_TIMEOUT_MS);
  $("chat-body").replaceChildren(frame);
  updateChatNotice();
}

function renderChat() {
  if (!$("chat-body").querySelector("iframe")) buildFrame();
}

function reconnectChat() {
  state.authFailed = false;
  buildFrame();
  refresh();
}

async function deliverAuth(frame) {
  if (state.tokenSent || state.authFailed) return;
  try {
    state.tokenSent = await sendAuthToFrame({ frameWindow: frame.contentWindow, getToken });
  } catch {
    state.tokenSent = false;
  }
  state.deliverTried = true;
  updateChatNotice();
}

function openChatTab() {
  chrome.tabs.create({ url: CHAT_URL });
}

function sheetTitle(view) {
  if (state.sheetOnly || view === "all") return "승인·작업";
  return view === "approvals" ? "승인 대기" : "진행 작업";
}

function renderSheet() {
  const view = state.sheetOnly ? "all" : state.sheetView;
  const sheet = $("sheet");
  sheet.hidden = !view;
  $("sheet-backdrop").hidden = state.sheetOnly || !view;
  if (view) sheet.dataset.view = view;
  $("sheet-title").textContent = sheetTitle(view);
  for (const [chip, name] of [["chip-approvals", "approvals"], ["chip-tasks", "tasks"]]) {
    $(chip).setAttribute("aria-expanded", String(!state.sheetOnly && state.sheetView === name));
  }
  const toggle = $("btn-sheet-only");
  toggle.textContent = state.sheetOnly ? "채팅 보기" : "승인·작업만 보기";
}

function openSheet(view, trigger) {
  closeMenu(false);
  if (state.sheetOnly) {
    $(view === "tasks" ? "sheet-tasks" : "sheet-approvals").scrollIntoView({ block: "start" });
    return;
  }
  if (!state.sheetView) state.sheetReturnFocus = trigger || document.activeElement;
  state.sheetView = view;
  renderSheet();
  $("sheet").focus();
}

function closeSheet(restoreFocus = true) {
  if (!state.sheetView) return;
  state.sheetView = null;
  renderSheet();
  const target = state.sheetReturnFocus;
  state.sheetReturnFocus = null;
  if (restoreFocus && target && document.contains(target)) target.focus();
}

function toggleSheet(view, trigger) {
  if (!state.sheetOnly && state.sheetView === view) closeSheet();
  else openSheet(view, trigger);
}

function toggleSheetOnly() {
  closeMenu(false);
  closeSheet(false);
  state.sheetOnly = !state.sheetOnly;
  document.body.classList.toggle("sheet-only", state.sheetOnly);
  renderSheet();
}

function menuOpen() {
  return !$("menu").hidden;
}

function openMenu() {
  $("menu").hidden = false;
  $("btn-menu").setAttribute("aria-expanded", "true");
  $("menu").querySelector("button")?.focus();
}

function closeMenu(restoreFocus) {
  if (!menuOpen()) return;
  $("menu").hidden = true;
  $("btn-menu").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("btn-menu").focus();
}

function onMenuKeydown(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = [...$("menu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next].focus();
}

function onDocumentKeydown(event) {
  if (event.key !== "Escape") return;
  if (menuOpen()) closeMenu(true);
  else if (state.sheetView && !state.sheetOnly) closeSheet();
}

function onDocumentPointerdown(event) {
  const t = event.target;
  if (menuOpen() && !t.closest(".menu-wrap")) closeMenu(false);
  if (state.sheetView && !state.sheetOnly && !t.closest("#sheet") && !t.closest(".chip") && !t.closest(".menu-wrap")) closeSheet(false);
}

function applyResults([pendingResult, tasksResult]) {
  const errors = [];
  if (pendingResult.status === "fulfilled") {
    state.pending = pendingResult.value;
    renderApprovals();
  } else errors.push(pendingResult.reason);
  if (tasksResult.status === "fulfilled") {
    state.tasks = sortByUpdatedDesc(tasksResult.value).slice(0, 10);
    renderTasks();
  } else errors.push(tasksResult.reason);
  return errors;
}

async function refresh() {
  if (state.inflight) return;
  state.inflight = true;
  clearTimeout(state.timer);
  try {
    const errors = applyResults(await Promise.allSettled([api.listPending(), api.listTasks(10)]));
    const authError = errors.find((e) => e instanceof ApiError && e.kind === "auth");
    state.authFailed = Boolean(authError);
    updateChatNotice();
    if (authError) {
      state.failures = 0;
      const msg = connectionMessage(authError);
      setStatus(msg.state, msg.text);
    } else if (errors.length) {
      state.failures += 1;
      const first = errors[0] instanceof ApiError ? errors[0] : new ApiError("client", 0, "unknown");
      const msg = connectionMessage(first, nextPollDelay(state.failures));
      setStatus(msg.state, msg.text);
    } else {
      state.failures = 0;
      const frame = $("chat-body").querySelector("iframe");
      if (frame && state.frameLoaded && !state.tokenSent) deliverAuth(frame);
      setStatus("ok", "로그인됨 · 정상 연결");
      state.lastRefreshText = `마지막 갱신 ${formatTime(Date.now())}`;
      updateDotTitle();
      if (state.expandedTaskId) await loadDetail(state.expandedTaskId);
    }
  } finally {
    state.inflight = false;
    schedule();
  }
}

function schedule() {
  clearTimeout(state.timer);
  if (document.visibilityState !== "visible") return;
  const delay = state.failures ? nextPollDelay(state.failures) : POLL_BASE_MS;
  state.timer = setTimeout(refresh, delay);
}

function init() {
  const menuAction = (fn) => () => {
    closeMenu(false);
    fn();
  };
  $("btn-refresh").addEventListener("click", menuAction(refresh));
  $("btn-chat-tab").addEventListener("click", menuAction(openChatTab));
  $("btn-sheet-only").addEventListener("click", toggleSheetOnly);
  $("btn-menu").addEventListener("click", () => (menuOpen() ? closeMenu(false) : openMenu()));
  $("menu").addEventListener("keydown", onMenuKeydown);
  $("btn-login").addEventListener("click", () => chrome.tabs.create({ url: LOGIN_URL }));
  $("btn-chat-reconnect").addEventListener("click", reconnectChat);
  $("chip-approvals").addEventListener("click", (e) => toggleSheet("approvals", e.currentTarget));
  $("chip-tasks").addEventListener("click", (e) => toggleSheet("tasks", e.currentTarget));
  $("btn-sheet-close").addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", onDocumentKeydown);
  document.addEventListener("pointerdown", onDocumentPointerdown);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
    else clearTimeout(state.timer);
  });

  chrome.cookies.onChanged.addListener(({ cookie }) => {
    if (cookie.name === COOKIE_NAME && cookie.domain.replace(/^\./, "") === "aads.newtalk.kr") refresh();
  });

  renderApprovals();
  renderTasks();
  renderSheet();
  renderChat();
  // 0.1.x 의 chatMode=tab 저장값(채팅이 사라져 보이던 원인)을 최초 로드 시 embed 로 되돌린다
  chrome.storage.local.get("chatMode").then(({ chatMode }) => {
    if (chatMode === "tab") return chrome.storage.local.set({ chatMode: "embed" });
  }).catch(() => {});
  refresh();
}

init();
