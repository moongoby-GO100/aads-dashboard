import {
  approveBody, asProjectKey, badgeProjects, mergeBadgeNotifications, changeFingerprint, changeSourceNotice, keepChangeAttempt, resolveChangeSource, asUuid, canApprove, canRequestChanges, changeBody, describeMockupError,
  groupAssetsByScreen, parseMockupDeepLink, safeChatLink, statusLabel, stripMockupFromUrl, viewportClass,
  type MockupAsset, type MockupNotification, type MockupReview, type MockupRevision,
} from "./mockupReviewModel";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) { failed += 1; console.error(`FAIL ${name} ${detail}`); }
}

const RID = "b90bbca3-5251-4256-836a-8d7f546c9fa2";
const REV = "c22f3fb1-0ee2-49bb-945a-f8f2c3b5199e";
const HASH = "a".repeat(64);

// 딥링크
const dl = parseMockupDeepLink(`?mockup_review=${RID}&mockup_project=AADS&mockup_revision=${REV}`);
check("deeplink full", dl?.reviewId === RID && dl.project === "AADS" && dl.revisionId === REV);
check("deeplink no revision", parseMockupDeepLink(`?mockup_review=${RID}&mockup_project=AADS`)?.revisionId === null);
check("deeplink bad uuid", parseMockupDeepLink("?mockup_review=zzz&mockup_project=AADS") === null);
check("deeplink bad project", parseMockupDeepLink(`?mockup_review=${RID}&mockup_project=../x`) === null);
check("deeplink missing project", parseMockupDeepLink(`?mockup_review=${RID}`) === null);
check("uuid", asUuid(RID) === RID && asUuid("x") === null);
check("project", asProjectKey("AADS") === "AADS" && asProjectKey("a/b") === null && asProjectKey("") === null);

check("strip keeps other params + hash",
  stripMockupFromUrl("/chat", `?mockup_review=${RID}&mockup_project=AADS&x=1`, "#sid") === "/chat?x=1#sid");
check("strip nothing", stripMockupFromUrl("/chat", "?x=1", "#sid") === null);
check("strip all", stripMockupFromUrl("/chat", `?mockup_review=${RID}&mockup_project=AADS&mockup_revision=${REV}`, "") === "/chat");

check("link ok", safeChatLink(`/chat?mockup_review=${RID}#sid`) === `/chat?mockup_review=${RID}#sid`);
check("link external", safeChatLink("https://evil.example/chat") === null);
check("link protocol-relative", safeChatLink("//evil.example") === null);
check("link other path", safeChatLink("/chatter") === null);

// 라벨
check("status ready", statusLabel("review_ready") === "검토 대기");
check("status approved", statusLabel("approved") === "승인됨");
check("status changes", statusLabel("changes_requested") === "수정 요청됨");
check("status unknown passthrough", statusLabel("weird") === "weird");

// 오류 매핑 — 409 / 422
const stale = describeMockupError(409, { detail: { code: "stale_revision", latest_revision: 4, generation: 7 } });
check("409 stale message", stale.message.includes("새로고침") && stale.needsRefresh && stale.code === "stale_revision");
check("409 stale detail", stale.details.includes("최신 판본: v4"));
const invalid = describeMockupError(409, { detail: { code: "invalid_state", status: "approved", required: "review_ready" } });
check("409 invalid_state", invalid.needsRefresh && invalid.details.includes("현재 상태: 승인됨") && invalid.details.includes("필요 상태: 검토 대기"));
const missing = describeMockupError(422, {
  detail: {
    code: "missing_artifacts", blocked_evidence: false,
    missing: [
      { code: "document_ref_missing", role: "prd" },
      { code: "mockup_missing", screen_id: "s1", viewport: "mobile" },
      { code: "state_missing", screen_id: "s1", state: "empty" },
    ],
  },
});
check("422 missing message", missing.message.includes("자료가 부족") && missing.needsRefresh);
check("422 missing lines", missing.details.length === 3
  && missing.details[0] === "연결 문서 없음 (PRD)"
  && missing.details[1] === "목업 이미지 없음 (화면 s1 · mobile)"
  && missing.details[2] === "상태 화면 없음 (화면 s1 · 상태 empty)", JSON.stringify(missing.details));
const blocked = describeMockupError(422, { detail: { code: "missing_artifacts", blocked_evidence: true, missing: [] } });
check("422 blocked evidence", blocked.details.some((d) => d.includes("Before 증거")));
const tampered = describeMockupError(409, { detail: { code: "asset_tampered", assets: [{ asset_id: "a1", reason: "hash_changed" }] } });
check("409 tampered", tampered.message.includes("해시") && tampered.details[0].includes("a1"));
const validation = describeMockupError(422, { detail: [{ loc: ["body", "comment"], msg: "x" }] });
check("422 pydantic", validation.message.includes("요청 형식") && !validation.needsRefresh);
check("source message 404", describeMockupError(404, { detail: { code: "source_message_not_found" } }).message.includes("채팅 메시지"));
check("401", describeMockupError(401, null).message.includes("로그인"));
check("network", describeMockupError(0, null).message.includes("연결"));
check("unknown 500", describeMockupError(500, null).message.includes("HTTP 500"));
check("many missing truncated", describeMockupError(422, { detail: { code: "missing_artifacts", missing: Array.from({ length: 25 }, () => ({ code: "screens_missing" })) } }).details.length === 21);

// 뷰포트·자산 묶음
check("viewport class", viewportClass("1440x900") === "desktop" && viewportClass("390x844") === "mobile"
  && viewportClass("768x1024") === "tablet" && viewportClass("mobile") === "mobile");
const asset = (id: string, screen: string, phase: string, viewport: string, state = "default", role: "primary" | "child" = "primary"): MockupAsset =>
  ({ asset_id: id, role, mime: "image/png", screen_id: screen, phase, viewport, state });
const rev: MockupRevision = {
  revision_id: REV, revision: 2, status: "review_ready", manifest_hash: HASH, is_latest: true, is_approved: false,
  manifest: {
    screens: [{ screen_id: "s1", title: "첫 화면", route: "/a" }, { screen_id: "s2", title: "둘째", route: "/b" }],
    assets: [
      asset("m-d", "s1", "mockup", "1440x900"), asset("b-d", "s1", "before", "1440x900"),
      asset("m-m", "s1", "mockup", "390x844"), asset("child", "s1", "mockup", "1440x900", "default", "child"),
      asset("m-e", "s1", "mockup", "1440x900", "empty"),
    ],
  },
};
const groups = groupAssetsByScreen(rev);
check("groups per screen", groups.length === 2 && groups[1].viewports.length === 0);
check("viewports order", groups[0].viewports.join() === "desktop,mobile");
check("before precedes mockup", groups[0].byViewport.desktop.map((a) => a.asset_id).join() === "b-d,m-d,m-e");
check("child excluded", !groups[0].byViewport.desktop.some((a) => a.asset_id === "child"));

// 요청 본문과 활성 조건
const review: MockupReview = {
  review_id: RID, project: "AADS", title: "t", change_type: "modify", session_id: null, status: "review_ready",
  generation: 5, pointer_generation: 3,
  latest_revision: { revision_id: REV, revision: 2, manifest_hash: HASH }, approved_revision: null,
  pending_change_requests: 0, revisions: [], unresolved_change_requests: [],
};
const ab = approveBody(review, rev, "key-12345678");
check("approve body", ab.revision_id === REV && ab.manifest_hash === HASH && ab.confirm === true
  && ab.expected_generation === 5 && ab.idempotency_key === "key-12345678");
const cb = changeBody(review, rev, { comment: "  고쳐 주세요 ", screenId: "" }, { changeRequestId: "c", sourceMessageId: "m", idempotencyKey: "k" });
check("change body", cb.comment === "고쳐 주세요" && cb.screen_id === null && cb.base_revision_id === REV && cb.expected_generation === 5);
check("canApprove ready+latest", canApprove(review, rev));
check("canApprove not ready", !canApprove({ ...review, status: "approved" }, rev));
check("canApprove changes_requested", !canApprove({ ...review, status: "changes_requested" }, rev));
check("canApprove old revision", !canApprove(review, { ...rev, revision_id: "other" }));
check("canApprove null", !canApprove(null, rev) && !canApprove(review, null));
check("canRequestChanges ready", canRequestChanges(review, rev));
check("canRequestChanges draft", !canRequestChanges({ ...review, status: "draft" }, rev));

// 수정 요청 근거 메시지 — 임의 UUID 를 만들지 않는다
const MSG = "11111111-2222-4333-8444-555555555555";
const SID = "99999999-2222-4333-8444-555555555555";
check("source ok no review session", JSON.stringify(resolveChangeSource({ session_id: null }, null, MSG)) === JSON.stringify({ ok: true, messageId: MSG }));
check("source ok same session", resolveChangeSource({ session_id: SID }, SID, MSG).ok === true);
check("source other session", JSON.stringify(resolveChangeSource({ session_id: SID }, "other", MSG)) === JSON.stringify({ ok: false, reason: "other_session" }));
check("source no message", JSON.stringify(resolveChangeSource({ session_id: null }, SID, null)) === JSON.stringify({ ok: false, reason: "no_message" }));
check("source tmp id rejected", resolveChangeSource({ session_id: null }, SID, "tmp-1700000000").ok === false);
check("source notices differ", changeSourceNotice("other_session") !== changeSourceNotice("no_message"));

// 재시도 — 서버 결과를 모를 때(네트워크·5xx)만 같은 요청을 유지
check("keep on network", keepChangeAttempt(0));
check("keep on 502", keepChangeAttempt(502));
check("drop on 409", !keepChangeAttempt(409));
check("drop on 422", !keepChangeAttempt(422));
check("drop on 404", !keepChangeAttempt(404));
check("network error status 0", describeMockupError(0, null).status === 0);
check("fingerprint stable", changeFingerprint(REV, MSG, " a ", "") === changeFingerprint(REV, MSG, "a", null));
check("fingerprint differs by comment", changeFingerprint(REV, MSG, "a", null) !== changeFingerprint(REV, MSG, "b", null));
check("fingerprint differs by revision", changeFingerprint(REV, MSG, "a", null) !== changeFingerprint("x", MSG, "a", null));

// CEO 배지 — 전 프로젝트 조회·병합
const ceoProjects = badgeProjects("CEO");
check("badgeProjects CEO 6", ceoProjects.length === 6
  && ["AADS", "KIS", "GO100", "SF", "NTV2", "NAS"].every((p) => ceoProjects.includes(p)));
check("badgeProjects ceo lowercase", badgeProjects(" ceo ").length === 6);
check("badgeProjects AADS only", JSON.stringify(badgeProjects("AADS")) === JSON.stringify(["AADS"]));
check("badgeProjects KIS only", JSON.stringify(badgeProjects("KIS")) === JSON.stringify(["KIS"]));
const notif = (id: number, at: string): MockupNotification => ({
  id, kind: "review_ready", title: "t", body: "b", link: "/chat", project: "AADS",
  review_id: null, revision_id: null, read: false, created_at: at,
});
const merged = mergeBadgeNotifications([
  { project: "AADS", items: [notif(1, "2026-10-14T01:00:00Z"), notif(3, "2026-10-16T01:00:00Z")] },
  { project: "KIS", items: null },
  { project: "GO100", items: [notif(2, "2026-10-15T01:00:00Z")] },
]);
check("merge newest first", merged.map((n) => n.id).join(",") === "3,2,1");
check("merge source project", merged[1].sourceProject === "GO100" && merged[0].sourceProject === "AADS");
check("merge failed project skipped", merged.length === 3);
check("merge all failed empty", mergeBadgeNotifications([{ project: "AADS", items: null }]).length === 0);

if (failed > 0) {
  console.error(`${failed} mockupReviewModel selftest(s) failed`);
  process.exit(1);
}
console.log("mockupReviewModel selftest ok");
