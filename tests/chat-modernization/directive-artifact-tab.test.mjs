import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, source } from "./source-loader.mjs";

const directive = {
  id: "directive-1",
  session_id: "session-1",
  artifact_type: "report",
  title: "지시 초안",
  content: ">>>DIRECTIVE_START\n>>>DIRECTIVE_END",
  metadata: { subtype: "directive_draft", draft_id: "draft-1" },
  created_at: "2026-09-13T00:00:00Z",
};

test("directive drafts are isolated from reports and route to the directive tab", () => {
  const { artifactMatchesTab, artifactTabForArtifact, isDirectiveDraftArtifact } = loadSource(
    "src/app/chat/directiveArtifacts.ts",
  );
  assert.equal(isDirectiveDraftArtifact(directive), true);
  assert.equal(artifactMatchesTab(directive, "directive"), true);
  assert.equal(artifactMatchesTab(directive, "report"), false);
  assert.equal(artifactTabForArtifact(directive), "directive");
});

test("directive panel exposes the four CEO actions", () => {
  const panel = source("src/app/chat/ChatArtifactPanel.tsx");
  for (const label of ["바로 지시하기", "지시서 다시 생성", "편집", "삭제"]) {
    assert.ok(panel.includes(label), `missing directive action: ${label}`);
  }
});

test("directive generation includes the current unsent composer draft", () => {
  const page = source("src/app/chat/page.tsx");
  assert.ok(page.includes('const composerDraft = chatInputRef.current?.getValue()?.trim() || ""'));
  assert.ok(page.includes("composer_draft: composerDraft"));
  assert.ok(page.includes("source?.classification?.composer_draft_content"));
});

test("directive edit area scales with the viewport", () => {
  const panel = source("src/app/chat/ChatArtifactPanel.tsx");
  assert.ok(panel.includes("calc(100dvh - 300px)"));
  assert.ok(panel.includes("calc(100dvh - 240px)"));
  assert.ok(panel.includes('maxHeight: "calc(100dvh - 260px)"'));
});

test("directive drafts survive the bounded recent-artifact window after reload", () => {
  const page = source("src/app/chat/page.tsx");
  assert.ok(page.includes("fetchSessionArtifactSnapshot(fetchSid)"));
  assert.ok(page.includes("/directive-drafts?limit=100"));
  assert.ok(page.includes("retainArtifactWindow([...recent, ...directives])"));
  assert.ok(page.includes("const directives = items.filter(isDirectiveDraftArtifact)"));
  assert.ok(page.includes("const recentOthers = items.filter((item) => !isDirectiveDraftArtifact(item)).slice(0, CHAT_ARTIFACT_RENDER_LIMIT)"));
});
