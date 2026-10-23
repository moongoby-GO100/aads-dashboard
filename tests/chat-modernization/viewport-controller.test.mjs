import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { loadSource, source } from "./source-loader.mjs";

// C03-C06 / FR01-FR04 / INV01-INV02 / ADR03 / T01-T04.
test("WP02 viewport controller state-sequence selftest executes", () => {
  loadSource("src/features/chat/viewport/chatViewportController.selftest.ts");
});

test("the chat route has no viewport writer outside the adapter", () => {
  const route = source("src/app/chat/page.tsx");
  const ast = ts.createSourceFile("page.tsx", route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "scrollTop"
    ) violations.push(node.getText(ast));
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["scrollIntoView", "scrollTo", "scrollBy"].includes(node.expression.name.text)
    ) violations.push(node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.deepEqual(violations, []);
  assert.match(route, /new ChatViewportController\(/);
  assert.match(route, /chatViewportController\.commitPendingIntent\(\)/);
});

test("message mutation wrapper performs no DOM or scheduling work inside React updater", () => {
  const route = source("src/app/chat/page.tsx");
  const ast = ts.createSourceFile("page.tsx", route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let wrapper;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "setMessagesPreservingViewport"
    ) wrapper = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(wrapper, "setMessagesPreservingViewport declaration missing");
  const body = wrapper.getText(ast);
  assert.doesNotMatch(body, /setMessages\s*\(\s*\(/, "React updater callback must not own side effects");
  assert.doesNotMatch(body, /requestAnimationFrame|scrollTop|scrollIntoView/);
  assert.match(body, /enqueueMutationAnchor/);
});

// AADS-CHAT-SCROLL-AUTOMOVE-RECUR2-20261013: scrollIntoView moves every scroll
// ancestor, so a call below the chat route moves the message list behind the
// controller's back.
test("chat input focus and CRF section chips do not scroll the message list directly", () => {
  const input = source("src/app/chat/ChatInput.tsx");
  assert.doesNotMatch(input, /\.scrollIntoView\??\.?\(/, "ChatInput focus must not call scrollIntoView");
  assert.match(input, /window\.visualViewport/, "keyboard overlap is measured against the visual viewport");

  const chip = source("src/components/chat/SectionCardContent.tsx");
  assert.match(chip, /if \(onScrollToSection\) onScrollToSection\(target\)/);

  const route = source("src/app/chat/page.tsx");
  assert.match(route, /<SectionCardContent[^>]*onScrollToSection=\{onViewportTarget\}/);
});

// AADS-CHAT-TODO-SCROLL-MOBILE-CTA-20261023: the jump-to-latest pill sits at the
// bottom of the viewport and covered the mobile sticky confirm/cancel footer.
test("jump-to-latest pill is hidden while the dormancy cleanup card is open", () => {
  const route = source("src/app/chat/page.tsx");
  assert.match(route, /chatFollowMode === "manual" && messages\.length > 0 && !dormancyCardOpen && \(\s*<button\s+data-chat-jump-to-latest="true"/);
});

test("expanded TODO panel leaves room for the message list and confirm CTAs are scrolled into view", () => {
  const todo = source("src/app/chat/TodoPanel.tsx");
  assert.match(todo, /min\(52dvh, 560px, max\(160px, calc\(100dvh - 700px\)\)\)/);
  const card = source("src/components/chat/DormancyCard.tsx");
  assert.match(card, /if \(confirming\) confirmRef\.current\?\.scrollIntoView\?\.\(\{ block: "nearest" \}\)/);
  assert.match(card, /<div ref=\{confirmRef\} role="alertdialog"/);
});
