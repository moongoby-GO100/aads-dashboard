import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { loadSource, source } from "./source-loader.mjs";

// 업무 자동화 대화형 등록 — 채팅 카드(S1~S6·S8)·홈 진입점 (FR-01~20·24~27, NFR-04~06, AC-10·11).
const UI_FILES = [
  "src/components/chat/AutomationDraftCard.tsx",
  "src/components/automation/AutomationHomeEntry.tsx",
  "src/lib/automationCopy.ts",
];
const NEW_FILES = [...UI_FILES, "src/features/chat/automation/useAutomationDraftCards.ts", "src/lib/automationDraft.ts"];

const parse = (file) => {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, kind);
};

function visibleTexts(file) {
  const ast = parse(file);
  const texts = [];
  const insideForbiddenList = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && p.name.getText(ast) === "FORBIDDEN_UI_TERMS") return true;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      if (!insideForbiddenList(node) && !ts.isImportDeclaration(node.parent)) texts.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return texts;
}

const copy = loadSource("src/lib/automationCopy.ts");
const draft = loadSource("src/lib/automationDraft.ts");

test("normal automation UI strings contain 0 internal terms", () => {
  assert.ok(copy.FORBIDDEN_UI_TERMS.includes("work_key"));
  for (const term of ["work_key", "lane", "credential_scope", "session_id", "recipe", "registration", "e2e"]) {
    assert.ok(copy.FORBIDDEN_UI_TERMS.includes(term), term);
  }
  const hits = [];
  for (const file of UI_FILES) {
    for (const text of visibleTexts(file)) {
      const hit = copy.findForbiddenTerm(text);
      if (hit) hits.push(`${file}: ${hit} in "${text}"`);
    }
  }
  assert.deepEqual(hits, []);
  const rendered = [
    ...copy.AUTOMATION_EXAMPLES, ...copy.REJECT_REASONS.map((r) => r.label),
    ...copy.SCHEDULE_CHOICES.map((c) => c.label), ...Object.values(copy.COPY).filter((v) => typeof v === "string"),
  ];
  for (const text of rendered) assert.equal(copy.findForbiddenTerm(text), null, text);
  for (const status of [0, 401, 403, 404, 409, 422, 429, 503, 500]) {
    assert.equal(copy.findForbiddenTerm(copy.errorSentence(status, "x")), null);
  }
});

test("the forbidden-term detector catches each listed term but not ordinary words", () => {
  for (const term of ["work_key", "lane", "credential_scope", "session_id", "recipe", "registration", "e2e"]) {
    assert.equal(copy.findForbiddenTerm(`값 ${term} 값`), term);
  }
  assert.equal(copy.findForbiddenTerm("blaneful registering planet"), null);
});

test("home offers 3 example sentences", () => {
  assert.equal(copy.AUTOMATION_EXAMPLES.length, 3);
});

test("new automation files never write the viewport directly", () => {
  for (const file of NEW_FILES) {
    const ast = parse(file);
    const violations = [];
    const visit = (node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left) && ["scrollTop", "scrollLeft"].includes(node.left.name.text)) {
        violations.push(node.getText(ast));
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ["scrollIntoView", "scrollTo", "scrollBy"].includes(node.expression.name.text)) {
        violations.push(node.getText(ast));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.deepEqual(violations, [], file);
  }
});

test("chat route renders the cards and scrolls only through the viewport controller wrappers", () => {
  const route = source("src/app/chat/page.tsx");
  assert.match(route, /import AutomationDraftCard from "@\/components\/chat\/AutomationDraftCard"/);
  assert.match(route, /useAutomationDraftCards\(handleAutomationCardAdded\)/);
  assert.match(route, /handleAutomationCardAdded = useCallback\(\(\) => \{\s*scrollToMessagesBottom\(true\);/);
  assert.match(route, /handleAutomationCardLayout = useCallback\(\(\) => \{\s*scrollToMessagesBottom\(false\);/);
  assert.match(route, /<AutomationDraftCard[\s\S]*?onLayoutChange=\{handleAutomationCardLayout\}/);
  assert.ok(route.indexOf("<AutomationDraftCard") < route.indexOf("bottomVaultCards.map"));
});

test("card embeds the existing credential card and server stays the source of truth", () => {
  const card = source("src/components/chat/AutomationDraftCard.tsx");
  assert.match(card, /import VaultCredentialCard from "@\/components\/chat\/VaultCredentialCard"/);
  assert.match(card, /<VaultCredentialCard/);
  assert.match(card, /api\.getAutomationDraft\(draftId\)/);
  assert.match(card, /visibilitychange/);
  const hook = source("src/features/chat/automation/useAutomationDraftCards.ts");
  assert.doesNotMatch(hook, /getAutomationDraft|\.fields\b|headline/);
});

test("mobile 390px: 48px controls, 16px inputs, no horizontal overflow", () => {
  const card = source("src/components/chat/AutomationDraftCard.tsx");
  const home = source("src/components/automation/AutomationHomeEntry.tsx");
  for (const [name, text] of [["card", card], ["home", home]]) {
    assert.match(text, /minHeight: 48/, name);
    assert.match(text, /fontSize: 16/, name);
    assert.doesNotMatch(text, /minHeight: (?:[0-9]|[1-3][0-9]|4[0-7])\b(?!\d)(?!px)/, name);
    assert.doesNotMatch(text, /minWidth: (?:[5-9][0-9]{2,}|[1-9][0-9]{3,})/, name);
  }
  assert.match(card, /tableLayout: "fixed"/);
  assert.match(card, /overflowWrap: "anywhere"/);
  assert.match(card, /flex: "1 1 120px"/);
  assert.match(home, /flexWrap: "wrap"/);
});

test("home entry shows button + pending badge and degrades quietly when the switch is off", () => {
  const home = source("src/components/automation/AutomationHomeEntry.tsx");
  const page = source("src/app/home/page.tsx");
  assert.match(page, /import AutomationHomeEntry from "@\/components\/automation\/AutomationHomeEntry"/);
  assert.match(page, /<AutomationHomeEntry \/>/);
  assert.match(home, /getAutomationPendingCount\(\)/);
  assert.match(home, /automation_drafts_disabled/);
  assert.match(home, /COPY\.loadDisabled/);
  assert.match(home, /AUTOMATION_EXAMPLES\.map/);
  assert.match(home, /automation_draft=/);
});

test("pure helpers: evidence parsing, polling and card id cache", () => {
  assert.equal(draft.safeImageUrl("javascript:alert(1)"), null);
  assert.equal(draft.safeImageUrl("http://x/a.png"), null);
  assert.equal(draft.safeImageUrl("//evil/a.png"), null);
  assert.equal(draft.safeImageUrl("https://x/a.png"), "https://x/a.png");
  assert.equal(draft.safeImageUrl("/api/x.png"), "/api/x.png");
  assert.equal(draft.safeImageUrl("data:image/svg+xml;base64,AAAA"), null);
  const ev = draft.parseEvidence({
    steps: [{ text: "로그인" }, { text: "메뉴 열기" }, { text: "표 읽기" }], current_step: 1,
    preview_rows: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ a: n, b: "x".repeat(200) })),
    preview_columns: ["a", "b"],
  });
  assert.deepEqual(Array.from(ev.steps, (s) => s.status), ["done", "now", "wait"]);
  assert.equal(ev.rows.length, 5);
  assert.ok(ev.rows[0][1].length <= 60);
  assert.equal(draft.progressPercent(ev.steps), 33);
  assert.equal(draft.parseEvidence(null).steps.length, 0);
  assert.equal(draft.pollIntervalFor("demonstrating"), 2000);
  assert.equal(draft.pollIntervalFor("pending_approval"), 6000);
  assert.equal(draft.pollIntervalFor("cancelled"), null);
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(draft.draftIdFromSearch(`?automation_draft=${id}&x=1`), id);
  assert.equal(draft.draftIdFromSearch("?automation_draft=../../etc"), null);
  assert.equal(draft.stripDraftFromUrl("/chat", `?automation_draft=${id}&x=1`, ""), "/chat?x=1");
  const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
  assert.equal(ids.reduce((acc, x) => draft.addCardId(acc, x), []).length, draft.MAX_OPEN_CARDS);
  assert.equal(draft.parseStoredCardIds("not json").length, 0);
  assert.equal(JSON.stringify(draft.parseTimeValue("07:30")), '{"hour":7,"minute":30}');
  assert.equal(draft.parseTimeValue("25:00"), null);
  assert.equal(draft.describeSchedule({ kind: "weekly", hour: 9, minute: 0, day_of_week: "mon" }), "매주 월요일 09:00");
});

test("자동화 카드: 늦게 도착한 오래된 조회 응답이 최신 응답을 덮어쓰지 않는다", () => {
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.match(src, /const seq = \+\+loadSeqRef\.current;/);
  assert.match(src, /if \(seq < appliedSeqRef\.current\) return;/);
  assert.match(src, /appliedSeqRef\.current = seq;/);
});

test("자동화 카드: 이미지 한 번 실패가 이후 갱신된 프레임 표시를 막지 않는다", () => {
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.ok(!/e\.currentTarget\.style\.display\s*=\s*["']none["']/.test(src), "img 의 display 를 영구히 none 으로 바꾸면 안 됨");
  assert.match(src, /failedSrc === src/);
  assert.match(src, /onLoad=\{\(\) => setFailedSrc\(""\)\}/);
  assert.equal((src.match(/<RetryImg\b/g) || []).length, 2);
});

const STOP_WORDS = /그만|멈추|중단|중지|취소|stop|cancel/i;

test("진행 화면: 서버에 중단 API 가 없으므로 중단을 뜻하는 버튼이 0건이고 숨기기는 사실대로 표시한다", () => {
  for (const state of ["credential_ready", "demonstrating", "revising"]) {
    for (const startFailed of [false, true]) {
      const buttons = draft.progressButtons(state, startFailed);
      for (const b of buttons) {
        assert.doesNotMatch(b.label, STOP_WORDS, `${state}: ${b.label}`);
        assert.notEqual(b.id, "cancel");
      }
      const hide = buttons.find((b) => b.id === "hide_card");
      assert.ok(hide, state);
      assert.match(hide.label, /숨기기/);
      assert.match(hide.label, /시연은 계속/);
    }
  }
  assert.deepEqual(Array.from(draft.progressButtons("demonstrating", false), (b) => b.id), ["hide_card"]);
  assert.deepEqual(Array.from(draft.progressButtons("credential_ready", true), (b) => b.id), ["retry_demo", "hide_card"]);
  assert.deepEqual(Array.from(draft.progressButtons("revising", false), (b) => b.id), ["hide_card", "manual_record"]);
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.doesNotMatch(src, /automation-btn-stop/);
  assert.match(src, /progressButtons\(draft\.state, demoStartFailed\)/);
  assert.match(src, /b\.id === "hide_card" \? closeCard\(\)/);
  assert.match(copy.COPY.hideNote, /서버에서 계속/);
});

test("서버 카드의 위험 단계 멈춤만 /risk-decision 으로 연결되고 그 밖의 취소는 카드 닫기로 표시된다", () => {
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.match(src, /current === "paused_risk"\) void act\("cancel", \(\) => api\.decideAutomationRisk\(draftId, "cancel"\)\)/);
  const card = [{ id: "start_manual", label: "직접 보여줄게요", primary: true }, { id: "cancel", label: "취소", primary: false }];
  assert.equal(draft.closeOnlyButtons("manual_record", card).find((b) => b.id === "cancel").label, "닫기");
  assert.equal(draft.closeOnlyButtons("paused_risk", card).find((b) => b.id === "cancel").label, "취소");
});

test("failed 카드: 서버가 409 로 거절하는 manual-record 버튼은 어떤 실패 코드에서도 보이지 않는다", () => {
  const serverFailed = {
    auth_failed: [["relink_login", "로그인 다시 연결", true], ["cancel", "그만두기", false]],
    challenge: [["manual_record", "직접 보여줄게요", true], ["cancel", "그만두기", false]],
    blocked: [["retry_demo", "다시 해 보기", true], ["cancel", "그만두기", false]],
    layout_changed: [["manual_record", "직접 보여줄게요", true], ["cancel", "그만두기", false]],
    empty_result: [["retry_demo", "다시 해 보기", true], ["cancel", "그만두기", false]],
    transient: [["retry_demo", "다시 해 보기", true], ["cancel", "그만두기", false]],
    default: [["retry_demo", "다시 해 보기", true], ["relink_login", "로그인 다시 연결", false], ["cancel", "그만두기", false]],
  };
  for (const [code, rows] of Object.entries(serverFailed)) {
    const buttons = draft.failedRecoveryButtons(rows.map(([id, label, primary]) => ({ id, label, primary })), code === "default" ? null : code);
    const ids = Array.from(buttons, (b) => b.id);
    if (code === "auth_failed" || code === "challenge") assert.ok(!ids.includes("retry_demo"), `${code}: 서버가 /demo 를 409 로 거절한다`);
    assert.ok(!ids.includes("manual_record"), code);
    assert.ok(!ids.includes("start_manual"), code);
    assert.ok(ids.some((id) => id === "retry_demo" || id === "relink_login"), `${code}: 복구 버튼이 있어야 한다`);
    assert.ok(buttons.some((b) => b.primary), code);
    for (const b of buttons) assert.ok(["retry_demo", "relink_login", "cancel"].includes(b.id), `${code}: ${b.id}`);
    const cancel = buttons.find((b) => b.id === "cancel");
    if (cancel) assert.doesNotMatch(cancel.label, /그만/);
  }
  const challenge = draft.failedRecoveryButtons(serverFailed.challenge.map(([id, label, primary]) => ({ id, label, primary })), "challenge");
  assert.deepEqual(Array.from(challenge, (b) => [b.id, b.label, b.primary]), [["relink_login", "로그인 다시 연결", true], ["cancel", "닫기", false]]);
  for (const code of ["auth_failed", "challenge"]) {
    const forced = draft.failedRecoveryButtons([
      { id: "retry_demo", label: "다시 해 보기", primary: true },
      { id: "relink_login", label: "로그인 다시 연결", primary: false },
      { id: "cancel", label: "그만두기", primary: false },
    ], code);
    assert.deepEqual(Array.from(forced, (b) => b.id), ["relink_login", "cancel"], code);
    assert.equal(forced[0].primary, true, code);
  }
  const layout = draft.failedRecoveryButtons(serverFailed.layout_changed.map(([id, label, primary]) => ({ id, label, primary })), "layout_changed");
  assert.deepEqual(Array.from(layout, (b) => [b.id, b.primary]), [["retry_demo", true], ["cancel", false]]);
  const keep = draft.failedRecoveryButtons([{ id: "relink_login", label: "로그인 다시 연결", primary: true }]);
  assert.equal(keep.length, 1);
  assert.equal(keep[0].label, "로그인 다시 연결");
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.match(src, /failedRecoveryButtons\(card\.buttons, draft\.failure_code\)/);
  assert.match(src, /if \(current !== "revising" && current !== "manual_record"\) return;/);
  assert.doesNotMatch(src, /manualUnavailable/);
});

test("로그인 연결: intent_confirmed 에서 계정·입력 요청이 없으면 request_error 유무와 무관하게 버튼이 보이고 오류 문구는 로컬에 남는다", () => {
  assert.equal(draft.showCredentialConnect("intent_confirmed", undefined), true);
  assert.equal(draft.showCredentialConnect("intent_confirmed", { status: "none" }), true);
  assert.equal(draft.showCredentialConnect("intent_confirmed", { status: "none", request_error: "x" }), true);
  assert.equal(draft.showCredentialConnect("intent_confirmed", { status: "choices", credentials: [{ id: "a", display_name: "a", host: "h", verified: true }] }), false);
  assert.equal(draft.showCredentialConnect("intent_confirmed", { status: "linked" }), false);
  assert.equal(draft.showCredentialConnect("intent_confirmed", { status: "requested", requestId: "r1" }), false);
  assert.equal(draft.showCredentialConnect("credential_waiting", { status: "none" }), false);
  assert.equal(draft.showCredentialConnect("intent_draft", { status: "none" }), false);
  // 폴링 1: 오류 있음 → 폴링 2: 오류 사라짐. 버튼은 계속 보이고 오류 문구도 남는다.
  let failed = false;
  failed = draft.credentialErrorAfter(failed, { status: "none", request_error: "boom" });
  assert.equal(failed, true);
  const polled = { status: "none" };
  failed = draft.credentialErrorAfter(failed, polled);
  assert.equal(failed, true);
  assert.equal(draft.showCredentialConnect("intent_confirmed", polled), true);
  assert.equal(draft.credentialErrorAfter(false, polled), false);
  const src = source("src/components/chat/AutomationDraftCard.tsx");
  assert.match(src, /showCredentialConnect\(draft\.state, credential\)/);
  assert.doesNotMatch(src, /credential\?\.request_error &&/);
  assert.match(src, /credentialFailed \? COPY\.credentialRetry : COPY\.credentialConnect/);
});
