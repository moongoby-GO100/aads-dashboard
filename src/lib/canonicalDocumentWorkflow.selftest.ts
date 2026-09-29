import { strict as assert } from "node:assert";
import { canTransitionDocument, canTransitionDocumentForHead } from "./canonicalDocumentWorkflow";

for (const [status, allowed] of [
  ["draft", "review"], ["review", "approve"], ["approved", "archive"], ["archived", ""],
] as const) {
  for (const action of ["review", "approve", "archive"] as const) {
    assert.equal(canTransitionDocument(status, action, true), action === allowed, `${status} → ${action}`);
    assert.equal(canTransitionDocument(status, action, false), false, `missing revision → ${action}`);
  }
}

// A new draft must not hide the previously approved revision's archive action.
assert.equal(canTransitionDocumentForHead("draft", true, "approved", true, "review"), true);
assert.equal(canTransitionDocumentForHead("draft", true, "approved", true, "approve"), false);
assert.equal(canTransitionDocumentForHead("draft", true, "approved", true, "archive"), true);
assert.equal(canTransitionDocumentForHead("draft", true, "missing", false, "archive"), false);
