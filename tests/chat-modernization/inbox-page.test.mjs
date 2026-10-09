import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

function makeApi(status, body = {}) {
  const calls = [];
  const removed = [];
  const location = { pathname: "/inbox", search: "", hash: "", href: "/inbox", protocol: "https:" };
  const globals = {
    process: { env: {} },
    window: { location },
    document: { cookie: "" },
    localStorage: { getItem: () => "tok", setItem: () => {}, removeItem: (k) => removed.push(k) },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { status, ok: status >= 200 && status < 300, text: async () => "denied", json: async () => body };
    },
  };
  const mod = loadSource("src/lib/api.ts", globals, new Map());
  return { api: mod.api, InboxApiError: mod.InboxApiError, calls, removed, location };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const lib = () => loadSource("src/lib/inbox.ts", {}, new Map());

const item = (over = {}) => ({
  source: "alert", source_id: "a1", tab: "action", project: "AADS", severity: "critical",
  title: "t", summary: "s", occurred_at_kst: "2026-10-09T03:30:58+09:00", count: 1, read: false,
  link: "/decisions?alert=a1", actions: ["open", "read"], ...over,
});
const summary = (unread) => ({
  tabs: { action: { total: 5, unread }, alert: { total: 2, unread: 1 }, change: { total: 0, unread: 0 }, runner: { total: 1, unread: 1 } },
  degraded_sources: [],
});

test("API 4개가 서버 경로·본문 규격으로 호출된다", async () => {
  const { api, calls } = makeApi(200, { ok: true });
  await api.getInboxSummary();
  await api.getInbox({ tab: "alert", project: "AADS", unreadOnly: true, cursor: "abc", limit: 30 });
  await api.getInbox({ tab: "action" });
  await api.markInboxRead([{ source: "alert", source_id: "a1", title: "내부 필드는 보내지 않는다" }]);
  await api.markInboxReadAll("runner", "2026-10-09T00:00:00.000Z");
  assert.ok(calls[0].url.endsWith("/inbox/summary"));
  assert.ok(calls[1].url.endsWith("/inbox?tab=alert&project=AADS&unread_only=true&cursor=abc&limit=30"));
  assert.ok(calls[2].url.endsWith("/inbox?tab=action"));
  assert.equal(calls[3].init.method, "POST");
  assert.ok(calls[3].url.endsWith("/inbox/read"));
  assert.deepEqual(JSON.parse(calls[3].init.body), { items: [{ source: "alert", source_id: "a1" }] });
  assert.ok(calls[4].url.endsWith("/inbox/read-all"));
  assert.deepEqual(JSON.parse(calls[4].init.body), { tab: "runner", before: "2026-10-09T00:00:00.000Z" });
});

for (const status of [401, 403]) {
  test(`비관리자 ${status}: 로그아웃·리다이렉트 없이 InboxApiError 로 던진다`, async () => {
    const { api, InboxApiError, location, removed } = makeApi(status);
    for (const call of [() => api.getInboxSummary(), () => api.getInbox({ tab: "action" }), () => api.markInboxRead([{ source: "a", source_id: "b" }])]) {
      await assert.rejects(call(), (e) => e instanceof InboxApiError && e.status === status);
    }
    assert.equal(location.href, "/inbox");
    assert.deepEqual(removed, []);
    assert.equal(lib().isInboxDenied({ status }), true);
  });
}

test("5xx 는 권한 없음으로 분류하지 않는다", () => {
  assert.equal(lib().isInboxDenied({ status: 503 }), false);
  assert.equal(lib().isInboxDenied(new Error("network")), false);
});

test("확인 후 처리 필요 탭의 미확인 수가 1 줄고 카드는 읽음이 된다", () => {
  const { applyRead } = lib();
  const items = [item(), item({ source_id: "a2" })];
  const out = applyRead(items, summary(3), "action", "alert:a1", false);
  assert.equal(out.summary.tabs.action.unread, 2);
  assert.equal(out.summary.tabs.alert.unread, 1);
  assert.equal(out.items[0].read, true);
  assert.deepEqual(plain(out.items[0].actions), ["open"]);
  assert.equal(out.items[1].read, false);
  assert.equal(items[0].read, false, "원본 불변");
});

test("미확인만 보기에서는 확인한 카드가 목록에서 빠지고, 이미 읽은 항목은 개수를 줄이지 않는다", () => {
  const { applyRead } = lib();
  const items = [item(), item({ source_id: "r", read: true, actions: ["open"] })];
  assert.equal(applyRead(items, summary(3), "action", "alert:a1", true).items.length, 1);
  assert.equal(applyRead(items, summary(3), "action", "alert:r", false).summary.tabs.action.unread, 3);
  assert.equal(applyRead(items, summary(0), "action", "alert:a1", false).summary.tabs.action.unread, 0);
});

test("degraded 출처는 내부 테이블명 대신 화면용 이름으로, 중복 없이 배너가 된다", () => {
  const { degradedBanners, degradedSourceLabel } = lib();
  assert.deepEqual(
    plain(degradedBanners(["alert_history", "pipeline_runner_events"], ["alert_history", "agent_permission_requests.notify"])),
    ["경보", "러너 진행", "변경 알림"],
  );
  assert.equal(degradedSourceLabel("something_new"), "일부 출처");
  assert.deepEqual(plain(degradedBanners([], undefined)), []);
});

test("시간은 KST MM-DD HH:mm, 링크는 사이트 안 경로만 허용한다", () => {
  const { formatInboxTime, safeInboxLink } = lib();
  assert.equal(formatInboxTime("2026-10-09T03:30:58+09:00"), "10-09 03:30");
  assert.equal(formatInboxTime("2026-10-08T18:05:00+00:00"), "10-09 03:05");
  assert.equal(formatInboxTime("2026-12-31T23:59:00+09:00"), "12-31 23:59");
  assert.equal(formatInboxTime("not a date"), "");
  assert.equal(safeInboxLink("/chat?session=s&job=j"), "/chat?session=s&job=j");
  for (const bad of ["", "https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil"]) {
    assert.equal(safeInboxLink(bad), null, bad);
  }
});

test("페이지 병합은 중복(source+source_id)을 건너뛰고 순서를 유지한다", () => {
  const { mergeItems } = lib();
  const merged = mergeItems([item(), item({ source_id: "a2" })], [item({ source_id: "a2" }), item({ source_id: "a3" })]);
  assert.deepEqual(plain(merged.map((i) => i.source_id)), ["a1", "a2", "a3"]);
});

test("폴링은 60초이고 숨겨진 탭에서는 멈춘다", () => {
  const l = lib();
  assert.equal(l.INBOX_POLL_MS, 60000);
  assert.equal(l.shouldPollInbox(true), false);
  assert.equal(l.shouldPollInbox(false), true);
});

test("탭 4개 순서와 기본 탭", () => {
  const { INBOX_TABS } = lib();
  assert.deepEqual(plain(INBOX_TABS.map((t) => t.label)), ["처리 필요", "경보", "변경 알림", "러너 진행"]);
  assert.deepEqual(plain(INBOX_TABS.map((t) => t.key)), ["action", "alert", "change", "runner"]);
  assert.ok(source("src/app/inbox/page.tsx").includes('useState<InboxTab>("action")'));
});

test("페이지: 탭 전환·배지·빈 상태·degraded·비관리자 안내·모두 확인 확인창이 연결돼 있다", () => {
  const page = source("src/app/inbox/page.tsx");
  for (const id of ["inbox-tab-${t.key}", "inbox-empty", "inbox-degraded-banner", "inbox-degraded-retry", "inbox-denied", "inbox-read-all", "inbox-more", "inbox-unread-only", "inbox-project-filter"]) {
    assert.ok(page.includes(id), id);
  }
  assert.ok(page.includes("처리할 알림이 없습니다"));
  assert.ok(page.includes("window.confirm("));
  assert.ok(page.indexOf("window.confirm(") < page.indexOf("api.markInboxReadAll"), "확인창이 read-all 호출보다 먼저");
  assert.ok(page.includes("다시 불러오기"));
  assert.ok(page.includes("알림 모아보기는 관리자만 볼 수 있습니다"));
  assert.ok(page.includes("onClick={() => setTab(t.key)}"));
  assert.ok(page.includes("min-h-[44px]"));
  assert.ok(page.includes("WebkitLineClamp: 2"));
  assert.ok(page.includes("truncate"), "요약 1줄 말줄임");
  assert.ok(!page.includes("source_id}"), "내부 ID 를 화면에 그리지 않는다");
  assert.ok(!/\{item\.source(_id)?\}/.test(page));
  assert.ok(!page.includes("handle401") && !page.includes("/login"), "비관리자 401 에 로그아웃 이동 없음");
});

test("종 아이콘: 전역 레이아웃에 붙고 action 미확인 배지·60초·숨김 중지를 쓴다", () => {
  const bell = source("src/components/InboxBell.tsx");
  assert.ok(bell.includes('data-testid="inbox-badge"'));
  assert.ok(bell.includes("summary.tabs.action.unread"));
  assert.ok(bell.includes("INBOX_POLL_MS") && bell.includes("shouldPollInbox(document.hidden)"));
  assert.ok(bell.includes("visibilitychange") && bell.includes("INBOX_CHANGED_EVENT"));
  assert.ok(bell.includes("isInboxDenied"));
  assert.ok(source("src/components/ClientLayout.tsx").includes("<InboxBell />"));
  assert.ok(source("src/lib/navigation.ts").includes('href: "/inbox"'));
});

test("채팅 page.tsx 는 건드리지 않았다", () => {
  assert.ok(!source("src/app/chat/page.tsx").includes("inbox"));
});
