import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./source-loader.mjs";

const page = source("src/app/chat/page.tsx");
const panel = source("src/app/chat/ChatArtifactPanel.tsx");
const handler = page.slice(
  page.indexOf("const handleDocumentLinkClickStable"),
  page.indexOf("}, [activeWs, screenSize, setMobileOverlay]);", page.indexOf("const handleDocumentLinkClickStable")),
);

test("canonical links are read through the authenticated chatApi client, never a raw URL", () => {
  assert.ok(handler.includes("parseCanonicalDocHref(href)"));
  assert.ok(page.includes("chatApi<CanonicalContentResponse>(canonicalContentPath(ref)"));
  assert.ok(!/window\.open\([^)]*documents/.test(page), "canonical documents must not be opened by raw URL");
});

test("canonical title shown is the stored title and the original content is untouched", () => {
  assert.ok(handler.includes("canonicalDisplayTitle(canonicalRef, response)"));
  assert.ok(handler.includes("const content = response.content || \"\";"));
});

test("missing /content route falls back to the detail API only for route-missing 404", () => {
  assert.ok(page.includes("document_not_found|revision_not_found"));
  assert.ok(page.includes("canonicalDetailPath(ref)"));
});

test("every attempt has a timeout so loading cannot stay forever", () => {
  assert.ok(handler.includes("DOCUMENT_ATTEMPT_TIMEOUT_MS"));
  assert.ok(handler.includes("clearTimeout(timer)"));
  assert.ok(handler.includes("doc_error"));
});

test("failure artifact carries recovery metadata and the panel renders retry/login", () => {
  assert.ok(panel.includes('data-testid="doc-retry"'));
  assert.ok(panel.includes('data-testid="doc-login"'));
  assert.ok(panel.includes("reason=session_expired"));
  assert.ok(panel.includes('failure.kind === "auth"'));
});

test("non-previewable binary (pdf) is opened through an authenticated fetch blob, not an unauthenticated URL", () => {
  assert.ok(handler.includes('artifact_type: "file"'));
  assert.ok(page.includes("URL.createObjectURL"));
  assert.ok(page.includes("DOCUMENT_DOWNLOAD_MAX_BYTES"));
});

test("html artifacts still go through html_preview (isolated renderer), not report markdown", () => {
  assert.ok(page.includes('return "html_preview"'));
  assert.ok(!handler.includes("dangerouslySetInnerHTML"));
});

test("session document list opens the artifact instead of navigating away", () => {
  assert.ok(panel.includes('data-testid="session-doc-link"'));
  assert.ok(panel.includes('data-testid="session-canonical-doc"'));
  assert.ok(page.includes("onOpenDocument={handleDocumentLinkClickStable}"));
  assert.ok(page.includes("canonical_documents?: typeof sessionCanonicalDocs"));
});
