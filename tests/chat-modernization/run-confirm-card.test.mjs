import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

// '○○를 실행할까요?' 확인 카드 — 서버 confirmation_required 응답 → 카드 → [실행]/[아니요] 요청 연결.
const lib = loadSource("src/lib/automationRunConfirm.ts");
const copy = loadSource("src/lib/automationCopy.ts");

// vm 로 읽은 모듈의 객체는 다른 realm 이라 JSON 으로 옮겨 비교한다.
const plain = (value) => JSON.parse(JSON.stringify(value));

const DRAFT = "3f2b8c1e-5a4d-4e7b-9c6a-1d2e3f4a5b6c";
const SERVER = {
  status: "confirmation_required",
  execution: "work_recipe",
  draft_id: DRAFT,
  task_id: "t1",
  session_id: "s1",
  card: {
    state: "active",
    headline: "실행할까요?",
    title: "어제 매출 받기",
    body: "어제 매출 받기를 실행할까요?",
    buttons: [
      { id: "confirm_run", label: "실행", primary: true },
      { id: "decline_run", label: "아니요" },
    ],
  },
};

// 카드 동작을 순수 부분(reducer·본문)과 가짜 전송으로 재현한다. 컴포넌트가 쓰는 규칙과 같다.
function makeFlow(confirmation, results) {
  let state = lib.RUN_CONFIRM_INITIAL;
  const calls = [];
  let sending = false;
  const dispatch = (event) => { state = lib.reduceRunConfirm(state, event); };
  return {
    get state() { return state; },
    calls,
    async run() {
      if (sending || !lib.canStartRun(state)) return;
      sending = true;
      dispatch({ type: "run" });
      calls.push(lib.confirmedCommandBody(confirmation, "s1"));
      const r = results.shift();
      sending = false;
      if (r.ok) dispatch({ type: "ok" });
      else dispatch({ type: "fail", status: r.status, code: r.code ?? "" });
    },
    decline() { if (!sending) dispatch({ type: "decline" }); },
  };
}

test("confirmation_required 응답이 카드 데이터가 되고 라벨은 서버 값을 그대로 쓴다", () => {
  const c = lib.parseRunConfirmation(SERVER, "어제 매출 받아줘");
  assert.equal(c.draftId, DRAFT);
  assert.equal(c.headline, "실행할까요?");
  assert.equal(c.body, "어제 매출 받기를 실행할까요?");
  assert.deepEqual(plain(c.buttons.map((b) => b.label)), ["실행", "아니요"]);
  assert.equal(c.directive, "어제 매출 받아줘");
  const custom = lib.parseRunConfirmation({
    ...SERVER, card: { ...SERVER.card, buttons: [{ id: "confirm_run", label: "지금 실행", primary: true }, { id: "decline_run", label: "하지 않기" }] },
  }, "x");
  assert.deepEqual(plain(custom.buttons.map((b) => b.label)), ["지금 실행", "하지 않기"]);
});

test("확인 요청이 아니거나 형식이 틀리면 카드를 만들지 않는다", () => {
  assert.equal(lib.parseRunConfirmation({ status: "queued", task_id: "t" }, "x"), null);
  assert.equal(lib.parseRunConfirmation({ ...SERVER, draft_id: "../etc" }, "x"), null);
  assert.equal(lib.parseRunConfirmation(SERVER, "  "), null);
  assert.equal(lib.parseRunConfirmation(null, "x"), null);
  assert.equal(lib.parseRunConfirmationText("그냥 문장", "x"), null);
  assert.equal(lib.parseRunConfirmationText("{깨진 json confirmation_required", "x"), null);
});

test("card 가 없어도 draft_id 가 맞으면 기본 문장으로 카드를 만든다", () => {
  const c = lib.parseRunConfirmation({ status: "confirmation_required", draft_id: DRAFT, draft_title: "매출 받기" }, "x");
  assert.equal(c.body, copy.COPY.runConfirmBody("매출 받기"));
  assert.deepEqual(plain(c.buttons.map((b) => b.label)), [copy.COPY.runConfirmRun, copy.COPY.runConfirmDecline]);
});

test("채팅 도구 결과 문자열(JSON)에서도 확인 카드를 읽는다", () => {
  const c = lib.parseRunConfirmationText(`결과: ${JSON.stringify(SERVER)}`, "어제 매출 받아줘");
  assert.equal(c.draftId, DRAFT);
});

test("[실행] → confirmed_draft_id 를 붙인 같은 지시 요청 1회, 두 번 눌러도 1회", async () => {
  const c = lib.parseRunConfirmation(SERVER, "어제 매출 받아줘");
  const flow = makeFlow(c, [{ ok: true }, { ok: true }]);
  await Promise.all([flow.run(), flow.run()]);
  await flow.run();
  assert.equal(flow.calls.length, 1);
  assert.deepEqual(plain(flow.calls[0]), { title: "어제 매출 받아줘", confirmed_draft_id: DRAFT, session_id: "s1" });
  assert.equal(flow.state.phase, "done");
});

test("[아니요] → 요청 0회, 실행하지 않음으로 닫힌다", async () => {
  const c = lib.parseRunConfirmation(SERVER, "어제 매출 받아줘");
  const flow = makeFlow(c, []);
  flow.decline();
  await flow.run();
  assert.equal(flow.calls.length, 0);
  assert.equal(flow.state.phase, "declined");
  assert.equal(copy.COPY.runConfirmDeclined, "실행하지 않았습니다.");
});

test("오류(4xx·5xx·네트워크)는 카드 안에서 다시 시도할 수 있다", async () => {
  for (const status of [0, 422, 500]) {
    const c = lib.parseRunConfirmation(SERVER, "어제 매출 받아줘");
    const flow = makeFlow(c, [{ ok: false, status }, { ok: true }]);
    await flow.run();
    assert.equal(flow.state.phase, "error");
    assert.equal(flow.state.errorStatus, status);
    assert.ok(copy.errorSentence(status, "").length > 0);
    await flow.run();
    assert.equal(flow.calls.length, 2);
    assert.equal(flow.state.phase, "done");
  }
});

test("보내는 중에는 [아니요]도 상태를 바꾸지 못한다", () => {
  let s = lib.reduceRunConfirm(lib.RUN_CONFIRM_INITIAL, { type: "run" });
  s = lib.reduceRunConfirm(s, { type: "decline" });
  assert.equal(s.phase, "sending");
});

test("카드 컴포넌트: 요청은 [실행] 경로에서만, 버튼 라벨은 서버 값, 내부 id 는 화면에 쓰지 않는다", () => {
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  const body = src.slice(src.indexOf("function RunConfirmBody"), src.indexOf("function AutomationDraftBody"));
  assert.equal((body.match(/api\./g) ?? []).length, 1);
  assert.match(body, /api\.runOhvisConsoleCommandConfirmed\(confirmedCommandBody\(confirmation, sessionId\)\)/);
  assert.match(body, /if \(sendingRef\.current \|\| !canStartRun\(state\)\) return;/);
  const decline = body.slice(body.indexOf("const decline = useCallback"), body.indexOf("const closeCard"));
  assert.doesNotMatch(decline, /api\.|fetch/);
  assert.match(body, /label=\{declineButton\.label\}/);
  assert.match(body, /runButton\.label/);
  assert.match(body, /errorSentence\(state\.errorStatus, state\.errorCode\)/);
  assert.match(src, /if \(props\.runConfirm\)/);
});

test("API: 확인 재전송은 confirmed_draft_id 를 본문에 싣고 실패를 던지지 않는다", () => {
  const api = source("src/lib/api.ts");
  assert.match(api, /runOhvisConsoleCommandConfirmed:[\s\S]*?automationCall<OhvisConsoleCommandResult>\("\/ohvis\/console\/command", \{ method: "POST", body: data \}\)/);
  assert.match(api, /confirmed_draft_id: string/);
});

test("화면 연결: 오비스 콘솔과 채팅이 확인 응답을 카드로 띄운다", () => {
  const ohvis = source("src/app/ohvis/page.tsx");
  assert.match(ohvis, /const pending = parseRunConfirmation\(sent, title\)/);
  assert.match(ohvis, /runConfirm=\{\{ confirmation: runConfirm, sessionId: activeSessionId \}\}/);
  const chat = source("src/app/chat/page.tsx");
  assert.match(chat, /parseRunConfirmationText\(ev\.content, content\)/);
  assert.match(chat, /runConfirm=\{c\}/);
});
