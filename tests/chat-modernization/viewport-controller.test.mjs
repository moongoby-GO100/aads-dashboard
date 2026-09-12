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
