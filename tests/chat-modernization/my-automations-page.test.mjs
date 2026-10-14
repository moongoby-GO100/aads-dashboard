import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

// '내 자동화' 목록 화면(S7) — PRD FR-22·23·28. 금지어 검사는 automation-cards.test.mjs 의 UI_FILES 에 이 화면이 들어 있다.
const PAGE = "src/app/automations/page.tsx";
const list = loadSource("src/lib/automationList.ts", {}, new Map());
const copy = loadSource("src/lib/automationCopy.ts", {}, new Map());
const plain = (v) => JSON.parse(JSON.stringify(v));

const ID = "11111111-1111-4111-8111-111111111111";
const entry = (over = {}) => ({
  key: `draft:${ID}`, name: "어제 매출 받기", status: "available", status_label: "사용 가능",
  last_run: null, next_run: "2026-10-15T09:00:00+09:00", draft_id: ID, ...over,
});

function makeApi(status, body = {}) {
  const calls = [];
  const globals = {
    process: { env: {} },
    window: { location: { pathname: "/automations", search: "", hash: "", href: "/automations", protocol: "https:" } },
    document: { cookie: "" },
    localStorage: { getItem: () => "tok", setItem: () => {}, removeItem: () => {} },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { status, ok: status >= 200 && status < 300, text: async () => "", json: async () => body };
    },
  };
  return { api: loadSource("src/lib/api.ts", globals, new Map()).api, calls };
}

test("목록 API 4개가 서버 경로·메서드로 호출된다", async () => {
  const { api, calls } = makeApi(200, { automations: [] });
  await api.getAutomations();
  await api.runAutomation(`draft:${ID}`);
  await api.pauseAutomation(`draft:${ID}`);
  await api.resumeAutomation(`draft:${ID}`);
  const key = encodeURIComponent(`draft:${ID}`);
  assert.deepEqual(calls.map((c) => [c.init.method, c.url.replace(/^.*\/api\/v1/, "")]), [
    ["GET", "/automations"],
    ["POST", `/automations/${key}/run`],
    ["POST", `/automations/${key}/pause`],
    ["POST", `/automations/${key}/resume`],
  ]);
});

test("404 는 '준비 중' 상태가 되고 오류 문장이 아니다", async () => {
  const { api } = makeApi(404, { detail: { error: "automation_drafts_disabled" } });
  const result = await api.getAutomations();
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  const page = source(PAGE);
  assert.match(page, /result\.status === 404[\s\S]{0,80}setLoadState\("off"\)/);
  assert.match(page, /COPY\.loadDisabled/);
  assert.equal(copy.errorSentence(404, "automation_drafts_disabled"), copy.COPY.loadDisabled);
});

test("서버 응답을 항목으로 바꾸고 모르는 상태·깨진 항목은 버린다", () => {
  const view = list.parseAutomationList({
    automations: [
      entry(),
      entry({ key: "work:abc", status: "broken", status_label: "고장", draft_id: null, last_run: { status: "failed", at: "2026-10-14T08:00:00+09:00" } }),
      entry({ key: "x", status: "weird" }),
      null,
      "text",
    ],
    unavailable_sources: ["ovis_recipe"],
  });
  assert.equal(view.items.length, 2);
  assert.equal(view.items[0].draftId, ID);
  assert.equal(view.items[1].draftId, null);
  assert.equal(view.items[0].detail, null);
  assert.deepEqual(plain(view.unavailableSources), ["ovis_recipe"]);
  assert.equal(list.parseAutomationList(null).items.length, 0);
  assert.equal(list.parseAutomationList({ automations: "x" }).items.length, 0);
  assert.equal(list.parseAutomationList(entry({ key: "draft:../../x" })).items.length, 0);
  assert.equal(list.parseAutomationList({ automations: [entry({ key: "draft:../../x" })] }).items[0].draftId, null);
});

test("탭 4개(전체/사용 가능/확인 대기/고장)가 상태별로 거른다", () => {
  assert.deepEqual(plain(list.AUTOMATION_TABS.map((t) => t.label)), ["전체", "사용 가능", "확인 대기", "고장"]);
  const view = list.parseAutomationList({
    automations: [
      entry({ key: "a" }),
      entry({ key: "b", status: "waiting" }),
      entry({ key: "c", status: "broken" }),
      entry({ key: "d", status: "broken" }),
      entry({ key: "e", status: "expired" }),
    ],
  });
  const counts = plain(list.countByTab(view.items));
  assert.deepEqual(counts, { all: 5, available: 1, waiting: 1, broken: 2, expired: 1 });
  assert.deepEqual(plain(list.filterByTab(view.items, "broken").map((i) => i.key)), ["c", "d"]);
  assert.equal(list.filterByTab(view.items, "all").length, 5);
});

test("버튼은 서버가 받는 경우에만 나온다: 실행·멈추기·고치기", () => {
  const parse = (over) => list.parseAutomationList({ automations: [entry(over)] }).items[0];
  assert.deepEqual(plain(list.actionsFor(parse({}))), ["run", "pause"]);
  assert.deepEqual(plain(list.actionsFor(parse({ next_run: null }))), ["run", "resume"]);
  assert.deepEqual(plain(list.actionsFor(parse({ status: "broken" }))), ["fix"]);
  assert.deepEqual(plain(list.actionsFor(parse({ status: "waiting" }))), []);
  assert.deepEqual(plain(list.actionsFor(parse({ status: "expired" }))), []);
  assert.deepEqual(plain(list.actionsFor(parse({ key: "work:1" }))), []);
  assert.deepEqual(plain(list.actionsFor(parse({ key: "browser:1", status: "broken" }))), []);
});

test("마지막 실행·다음 실행 문장은 한국 시각이고 내부 오류 문장을 쓰지 않는다", () => {
  assert.match(list.formatWhen("2026-10-15T09:00:00+09:00"), /10월 15일 09:00/);
  assert.match(list.formatWhen("2026-10-15T00:00:00Z"), /10월 15일 09:00/);
  assert.equal(list.formatWhen("not a date"), "");
  assert.equal(list.formatWhen(null), "");
  assert.equal(list.nextRunText(null), "예정 없음");
  assert.equal(list.lastRunText(null), "아직 없어요");
  assert.match(list.lastRunText({ status: "failed", at: "2026-10-14T08:00:00+09:00" }), /10월 14일 08:00 · 실패/);
  assert.equal(list.lastRunText({ status: "succeeded", at: null }), "성공");
  assert.equal(list.runStatusLabel("something_else"), "기록 있음");
});

test("관리자 자세히: 서버가 detail 을 준 항목만 열리고 일반 사용자 항목에는 값이 없다", () => {
  const user = list.parseAutomationList({ automations: [entry()] }).items[0];
  assert.equal(user.detail, null);
  assert.deepEqual(plain(list.detailRows(user)), []);
  const admin = list.parseAutomationList({
    automations: [entry({ detail: { source: "draft", owner: "kim", state: "active", version: "v3", fragments: ["a", "b"] } })],
  }).items[0];
  const rows = Object.fromEntries(list.detailRows(admin).map((r) => [r.label, r.value]));
  assert.equal(rows["내부 식별자"], `draft:${ID}`);
  assert.match(rows["출처"], /draft/);
  assert.equal(rows["만든 사람"], "kim");
  assert.equal(rows["버전"], "v3");
  assert.equal(rows["조각"], "2");
  const bare = list.parseAutomationList({ automations: [entry({ detail: { source: "work_recipe", owner: "", state: "" } })] }).items[0];
  const bareRows = Object.fromEntries(list.detailRows(bare).map((r) => [r.label, r.value]));
  assert.equal(bareRows["버전"], "아직 제공되지 않음");
  assert.equal(bareRows["조각"], "아직 제공되지 않음");
  const page = source(PAGE);
  assert.match(page, /item\.detail && \(/);
  assert.match(page, /COPY\.listDetail\b/);
});

test("고치기는 채팅의 실패 복구 카드로 이어진다", () => {
  const page = source(PAGE);
  assert.match(page, /router\.push\(`\/chat\?automation_draft=\$\{encodeURIComponent\(item\.draftId\)\}`\)/);
});

test("플로팅 [＋ 자동화 만들기] 는 홈과 같은 시작 폼을 쓴다", () => {
  const page = source(PAGE);
  assert.match(page, /import AutomationStartForm from "@\/components\/automation\/AutomationStartForm"/);
  assert.match(page, /<AutomationStartForm/);
  assert.match(page, /position: "fixed"/);
  assert.match(page, /COPY\.listFloating/);
  assert.equal(copy.COPY.listFloating, "＋ 자동화 만들기");
  const home = source("src/components/automation/AutomationHomeEntry.tsx");
  assert.match(home, /<AutomationStartForm/);
  const form = source("src/components/automation/AutomationStartForm.tsx");
  assert.match(form, /api\.createAutomationDraft\(intent\)/);
  assert.match(form, /automation_draft=/);
});

test("내비게이션에 '내 자동화' 가 일반 사용자에게도 보인다", async () => {
  const nav = loadSource("src/lib/navigation.ts", {}, new Map());
  const item = nav.APP_NAV_ITEMS.find((i) => i.href === "/automations");
  assert.ok(item);
  assert.equal(item.label, "내 자동화");
  assert.ok(!item.adminOnly);
  assert.equal(nav.resolveRouteTitle("/automations"), "내 자동화");
});

test("모바일 390px: 48px 조작 영역, 가로 넘침 방지", () => {
  const page = source(PAGE);
  assert.match(page, /minHeight: 48/);
  assert.doesNotMatch(page, /minHeight: (?:[0-9]|[1-3][0-9]|4[0-7])\b(?!\d)(?!px)/);
  assert.doesNotMatch(page, /minWidth: (?:[5-9][0-9]{2,}|[1-9][0-9]{3,})/);
  assert.match(page, /flexWrap: "wrap"/);
  assert.match(page, /overflowWrap: "anywhere"/);
  assert.match(page, /minmax\(0, 1fr\)/);
  assert.match(page, /safe-area-inset-bottom/);
});

test("화면이 뷰포트를 직접 스크롤하지 않는다", () => {
  const page = source(PAGE);
  assert.doesNotMatch(page, /scrollTop\s*=|scrollIntoView|scrollTo\(|scrollBy\(/);
});

test("서버 오류 코드는 일반 문장으로 바뀐다", () => {
  assert.equal(copy.errorSentence(409, "no_schedule"), "정해 둔 예약이 없어요.");
  assert.match(copy.errorSentence(409, "not_supported_for_source"), /채팅에서 요청/);
  for (const code of ["no_schedule", "not_supported_for_source", "approval_required"]) {
    assert.equal(copy.findForbiddenTerm(copy.errorSentence(409, code)), null);
  }
  for (const value of Object.values(copy.COPY).filter((v) => typeof v === "string")) {
    assert.equal(copy.findForbiddenTerm(value), null, value);
  }
});
