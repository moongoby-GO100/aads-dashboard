import { mockupHtmlFilename, mockupHtmlLink } from "./mockupReviewModel";
import {
  changeFingerprint, changeSourceNotice, resolveChangeSource, approveBody, archiveEmptyMessage, archiveNextOffsets, archiveRevisionNumber, mergeArchiveReviews, reviewToDeepLink, asProjectKey, badgeProjects, mergeBadgeNotifications, keepChangeAttempt, asUuid, canApprove, canRequestChanges, changeBody, describeMockupError,
  groupAssetsByScreen, panelWidthCss, parseMockupDeepLink, parsePanelWide, stepZoomIndex, zoomScale, safeChatLink, statusLabel, stripMockupFromUrl, viewportClass,
  mockupBindingFromArtifact, findMockupArtifact, bindingRevisionFor, pairWithPreviousRevision, outcomeLabel, docRefLabel, targetKey, resolveMockupTarget, intakeBody, findPersistedUserMessage,
  type MockupTarget, type MockupAsset, type MockupNotification, type MockupReviewListItem, type MockupReview, type MockupRevision,
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

// 목업 보관함
const item = (id: string, at: string | null, extra: Partial<MockupReviewListItem> = {}): MockupReviewListItem =>
  ({ review_id: id, title: id, status: "approved", updated_at: at, ...extra });
const RID2 = "11111111-2222-4333-8444-555555555555";
const RID3 = "99999999-2222-4333-8444-555555555555";
const arch = mergeArchiveReviews([
  { project: "AADS", items: [item(RID, "2026-10-14T01:00:00Z"), item(RID3, null)] },
  { project: "KIS", items: null },
  { project: "GO100", items: [item(RID2, "2026-10-16T01:00:00Z"), item(RID2, "2026-10-16T01:00:00Z")] },
]);
check("archive newest first, undated last", arch.map((x) => x.review_id).join(",") === `${RID2},${RID},${RID3}`);
check("archive source project", arch[0].sourceProject === "GO100");
check("archive dedupes same project+id", arch.length === 3);
check("archive all failed empty", mergeArchiveReviews([{ project: "AADS", items: null }]).length === 0);
check("archive revision number", archiveRevisionNumber(item(RID, null, { latest_revision: 3 })) === 3);
check("archive revision number server shape", archiveRevisionNumber(JSON.parse(`{"review_id":"${RID}","title":"t","status":"approved","latest_revision":2}`)) === 2);
check("archive revision number non-number", archiveRevisionNumber(item(RID, null, { latest_revision: null })) === null);
check("archive revision number missing", archiveRevisionNumber(item(RID, null)) === null);
const link1 = reviewToDeepLink({ ...item(RID, null, { link: `/chat?mockup_review=${RID}&mockup_project=KIS&mockup_revision=${REV}#sid` }), sourceProject: "AADS" });
check("deeplink from server link", link1?.project === "KIS" && link1.revisionId === REV && link1.reviewId === RID);
const link2 = reviewToDeepLink({ ...item(RID, null, { link: "https://evil.example/x", latest_revision_id: REV }), sourceProject: "AADS" });
check("deeplink falls back to fields", link2?.project === "AADS" && link2.revisionId === REV);
check("deeplink invalid id", reviewToDeepLink({ ...item("zzz", null), sourceProject: "AADS" }) === null);
const pg = (project: string, n: number | null, total: number) =>
  ({ project, items: n === null ? null : Array.from({ length: n }, (_, i) => item(`${project}-${i}`, null)), total });
const nx = archiveNextOffsets([pg("AADS", 50, 120), pg("KIS", 3, 3), pg("GO100", null, 0), pg("X", 0, 0)]);
check("next offsets only incomplete", nx.length === 1 && nx[0].project === "AADS" && nx[0].offset === 50);
check("next offsets none when complete", archiveNextOffsets([pg("AADS", 50, 50)]).length === 0);
check("empty msg session", archiveEmptyMessage(true, "") === "이 세션에 연결된 목업이 없습니다");
check("empty msg status", archiveEmptyMessage(false, "approved") === "'승인됨' 상태의 목업이 없습니다");
check("empty msg all", archiveEmptyMessage(false, "") === "아직 목업이 없습니다");
check("status revising/revoked", statusLabel("revising") === "수정 중" && statusLabel("revoked") === "승인 철회");

// 이미지 확대 보기
check("wide parse on", parsePanelWide("1") === true);
check("wide parse off", parsePanelWide(null) === false && parsePanelWide("0") === false && parsePanelWide("true") === false);
check("panel width normal", panelWidthCss(false, false) === "min(640px, 94vw)");
check("panel width wide", panelWidthCss(true, false) === "min(1480px, 96vw)");
check("panel width narrow ignores wide", panelWidthCss(true, true) === "100vw" && panelWidthCss(false, true) === "100vw");
check("zoom original is 1", zoomScale("original", 1440, 820, 800, 600) === 1);
check("zoom fit shrinks by width", zoomScale("fit", 1440, 820, 720, 900) === 0.5);
check("zoom fit shrinks by height", zoomScale("fit", 1440, 820, 2000, 410) === 0.5);
check("zoom fit never upscales", zoomScale("fit", 390, 844, 2000, 2000) === 1);
check("zoom invalid natural size", zoomScale("fit", 0, 0, 800, 600) === 1);
check("zoom invalid box", zoomScale("fit", 1440, 820, 0, 0) === 1);
check("step next", stepZoomIndex(0, 1, 3) === 1);
check("step prev", stepZoomIndex(2, -1, 3) === 1);
check("step clamps start", stepZoomIndex(0, -1, 3) === 0);
check("step clamps end", stepZoomIndex(2, 1, 3) === 2);
check("step empty", stepZoomIndex(0, 1, 0) === 0);

const htmlChild = { ...asset("html-child", "s1", "mockup", "1440x900", "default", "child"), mime: "text/html", uri: "internal://mockup_assets/final/목업-목록과-HTML-등록.html" };
check("HTML child uses registered filename", mockupHtmlFilename(htmlChild) === "목업-목록과-HTML-등록.html");
check("HTML link uses isolated viewer", mockupHtmlLink("AADS", RID, REV, "html-child").startsWith("/mockups/view?"));
check("HTML link pins selected asset", new URL(mockupHtmlLink("AADS", RID, REV, "a&b"), "https://example.test").searchParams.get("asset") === "a&b");
check("HTML malformed filename is safe", mockupHtmlFilename({...htmlChild, filename: "%oops.html"}) === "%oops.html");
for (const filename of ["수정 디자인 첫번째.html", "수정 디자인 두번째.html", "비율%20유지.html"]) {
  check(`uploaded original filename survives generic URI: ${filename}`,
    mockupHtmlFilename({...htmlChild, uri: "internal://uploaded_mockups/uuid/mockup.html", filename}) === filename);
}
// ---- 채팅 카드 → 같은 패널 · 수정 요청 대상 고정 ----
check("binding ok", mockupBindingFromArtifact({ mockup_review_id: RID, mockup_project: "AADS", mockup_revision_id: REV })?.reviewId === RID);
check("binding no revision", mockupBindingFromArtifact({ mockup_review_id: RID, mockup_project: "AADS" })?.revisionId === null);
check("binding bad uuid", mockupBindingFromArtifact({ mockup_review_id: "x", mockup_project: "AADS" }) === null);
check("binding bad project", mockupBindingFromArtifact({ mockup_review_id: RID, mockup_project: "../x" }) === null);
check("binding none", mockupBindingFromArtifact(undefined) === null && mockupBindingFromArtifact({}) === null);

check("find card same review", findMockupArtifact([{ id: "a", metadata: {} }, { id: "b", metadata: { mockup_review_id: RID, mockup_project: "AADS" } }], { reviewId: RID, project: "AADS" })?.id === "b");
check("find card other project", findMockupArtifact([{ id: "b", metadata: { mockup_review_id: RID, mockup_project: "KIS" } }], { reviewId: RID, project: "AADS" }) === undefined);
check("find card other review", findMockupArtifact([{ id: "b", metadata: { mockup_review_id: REV, mockup_project: "AADS" } }], { reviewId: RID, project: "AADS" }) === undefined);
const bnd = { project: "AADS", reviewId: RID, revisionId: null };
check("revision hint kept", bindingRevisionFor(bnd, { reviewId: RID, project: "AADS", revisionId: REV }) === REV);
check("revision hint other review ignored", bindingRevisionFor({ ...bnd, revisionId: "x" }, { reviewId: REV, project: "AADS", revisionId: REV }) === "x");
check("revision hint other project ignored", bindingRevisionFor(bnd, { reviewId: RID, project: "KIS", revisionId: REV }) === null);
check("revision hint none", bindingRevisionFor(bnd, null) === null);

const mk = (id: string, sha: string | undefined, state = "default", phase = "mockup"): MockupAsset => ({
  asset_id: id, role: "primary", mime: "image/png", sha256: sha, screen_id: "s1", phase, viewport: "1440x900", state,
});
const pairNow = pairWithPreviousRevision({ manifest: { screens: [], assets: [mk("a2", "h2"), mk("b2", "h3", "error")] } },
  { manifest: { screens: [], assets: [mk("a1", "h1"), mk("b1", "h3", "error")] } }, "s1", "desktop");
check("pair changed", pairNow.length === 2 && pairNow[0].changed && pairNow[0].prev?.asset_id === "a1");
check("pair unchanged by hash", pairNow[1].changed === false);
check("pair without previous", pairWithPreviousRevision({ manifest: { screens: [], assets: [mk("a2", "h2")] } }, null, "s1", "desktop")[0].prev === null);
check("pair unknown hash is changed", pairWithPreviousRevision({ manifest: { screens: [], assets: [mk("a2", undefined)] } }, { manifest: { screens: [], assets: [mk("a1", undefined)] } }, "s1", "desktop")[0].changed);
check("pair other viewport empty", pairWithPreviousRevision({ manifest: { screens: [], assets: [mk("a2", "h2")] } }, null, "s1", "mobile").length === 0);

check("outcome applied", outcomeLabel({ outcome: "applied", status: "resolved" }) === "반영됨");
check("outcome not applied", outcomeLabel({ outcome: "not_applied", status: "resolved" }) === "미반영");
check("outcome pending", outcomeLabel({ outcome: null, status: "open" } as never) === "대기·진행 중");
check("docref exempt", docRefLabel({ role: "prd", exempt_reason: "backend_only" }).includes("면제"));
check("docref key", docRefLabel({ role: "plan", document_key: "x-plan", content_hash: "abcdef123456" }).includes("abcdef12"));

const T_SID = "11111111-1111-4111-8111-111111111111";
const T_RID2 = "22222222-2222-4222-8222-222222222222";
const tgt = (reviewId: string, sessionId = T_SID, generation: number | null = 3): MockupTarget => ({
  sessionId, project: "AADS", reviewId, revisionId: REV, artifactId: null, screenId: null, title: reviewId.slice(0, 4), generation,
});
const none = { sessionId: T_SID, reply: null, panel: null, candidates: [] as MockupTarget[], chosenKey: null };
check("resolve none", resolveMockupTarget(none).kind === "none");
check("resolve panel", resolveMockupTarget({ ...none, panel: tgt(RID) }).kind === "target");
check("resolve reply wins when alone", (() => { const r = resolveMockupTarget({ ...none, reply: tgt(RID) }); return r.kind === "target" && r.via === "reply"; })());
check("resolve same reply+panel is not ambiguous", resolveMockupTarget({ ...none, reply: tgt(RID), panel: tgt(RID) }).kind === "target");
check("resolve reply vs panel asks", (() => { const r = resolveMockupTarget({ ...none, reply: tgt(RID), panel: tgt(T_RID2) }); return r.kind === "ambiguous" && r.reason === "reply_vs_panel"; })());
check("resolve chosen settles ambiguity", (() => { const r = resolveMockupTarget({ ...none, reply: tgt(RID), panel: tgt(T_RID2), chosenKey: targetKey(tgt(T_RID2)) }); return r.kind === "target" && r.via === "chosen"; })());
check("resolve single candidate is not auto-picked", resolveMockupTarget({ ...none, candidates: [tgt(RID)] }).kind === "ambiguous");
check("resolve multiple candidates asks", resolveMockupTarget({ ...none, candidates: [tgt(RID), tgt(T_RID2)] }).kind === "ambiguous");
check("resolve ignores other session", resolveMockupTarget({ ...none, panel: tgt(RID, "33333333-3333-4333-8333-333333333333") }).kind === "none");

const ib = intakeBody(tgt(RID), { changeRequestId: T_RID2, idempotencyKey: REV, sourceMessageId: T_SID }, "  버튼 키워줘  ", null);
check("intake body fields", ib.review_id === RID && ib.expected_generation === 3 && ib.comment === "버튼 키워줘" && ib.reply_to_id === null && ib.session_id === T_SID);
check("intake body drops bad reply id", intakeBody(tgt(RID), { changeRequestId: T_RID2, idempotencyKey: REV, sourceMessageId: T_SID }, "x", "tmp-1").reply_to_id === null);

const now = Date.parse("2026-10-20T00:00:10Z");
const msgs = [
  { id: "tmp-1", role: "user", content: "고쳐줘", created_at: "2026-10-20T00:00:09Z" },
  { id: T_SID, role: "user", content: "고쳐줘", created_at: "2026-10-20T00:00:08Z" },
  { id: T_RID2, role: "user", content: "고쳐줘", created_at: "2026-10-20T00:00:09Z" },
  { id: REV, role: "assistant", content: "고쳐줘", created_at: "2026-10-20T00:00:09Z" },
];
check("persisted message picks latest uuid user msg", findPersistedUserMessage(msgs, "고쳐줘", now)?.id === T_RID2);
check("persisted message not found for other text", findPersistedUserMessage(msgs, "다른 말", now) === null);
check("persisted message ignores old", findPersistedUserMessage([{ id: T_SID, role: "user", content: "고쳐줘", created_at: "2026-10-19T00:00:00Z" }], "고쳐줘", now) === null);

const ev = describeMockupError(409, { detail: { error: "ambiguous_target", candidates: [RID, T_RID2] } });
check("error candidates", ev.candidates.length === 2);

if (failed > 0) {
  console.error(`${failed} mockupReviewModel selftest(s) failed`);
  process.exit(1);
}
console.log("mockupReviewModel selftest ok");
