import { createHash } from "node:crypto";
import {
  compareExpectation, executionKeyFor, findHolderCandidate, flattenTree, friendlyError, holderSessionTitle,
  idsFingerprint, isOwnerUser, lastUuid, md5Hex, parseErrorBody, summarizePlan, GOAL_EXPECTATIONS,
  type AssignRole, type TreeItemLike,
} from "./canonicalAssignmentModel";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) { failed += 1; console.error(`FAIL ${name} ${detail}`); }
}

// md5 는 Node crypto 와 같아야 한다(서버 hashlib.md5 와 동일 알고리즘).
for (const text of ["", "a", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(200), "한글 UUID,콤마"]) {
  check(`md5 ${text.length}`, md5Hex(text) === createHash("md5").update(text).digest("hex"));
}

// 서버 ids_fingerprint: 정렬 후 쉼표 결합
const ids = ["b", "a", "c"];
check("fingerprint sorted", idsFingerprint(ids) === createHash("md5").update("a,b,c").digest("hex"));

// 기준값 비교
const GOAL = "ac431290-66be-4d00-8bbb-9bf162917240";
const exp = GOAL_EXPECTATIONS[GOAL];
const mk = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const plan = { PM: mk(36, "p"), Developer: mk(30, "d"), QA: mk(24, "q") } as Record<AssignRole, string[]>;
const issues = compareExpectation(GOAL, plan);
check("counts match but md5 differs warns", issues.length === 1 && issues[0].includes("md5"), JSON.stringify(issues));
const bad = compareExpectation(GOAL, { ...plan, PM: mk(35, "p") });
check("count mismatch warns", bad.some((m) => m.includes("역할별 건수")) && bad.some((m) => m.includes("89")));
check("unknown goal has no expectation", compareExpectation("other", plan).length === 0);
check("expectation total", exp.total === 90 && exp.counts.PM + exp.counts.Developer + exp.counts.QA === 90);

// 트리 집계
const tree: TreeItemLike[] = [
  { id: "e1", type: "epic", status: "draft", children: [
    { id: "s1", type: "story", status: "draft", children: [{ id: "t1", type: "task", status: "draft", assignment_id: "A", children: [] }] },
  ] },
];
const flat = flattenTree(tree);
check("flatten", flat.length === 3);
const sum = summarizePlan({ PM: ["e1", "s1"], Developer: ["t1"], QA: ["ghost"] }, flat);
check("summarize types", sum.rows[0].types.epic === 1 && sum.rows[0].types.story === 1 && sum.rows[1].types.task === 1);
check("summarize assigned", sum.rows[1].assigned === 1 && sum.rows[0].assigned === 0);
check("summarize missing", sum.missing === 1 && sum.rows[2].types.total === 1);

// 보유 세션 후보
const title = holderSessionTitle("PM", GOAL);
check("candidate by assignment", findHolderCandidate("PM", GOAL, [], [{ role_key: "PM@ac431290", session_id: "S1" }])?.sessionId === "S1");
check("candidate by session", findHolderCandidate("PM", GOAL, [{ id: "S2", title, role_key: "PM" }], [])?.source === "session");
check("candidate role_key must match", findHolderCandidate("PM", GOAL, [{ id: "S3", title, role_key: "QA" }], []) === null);
check("candidate none", findHolderCandidate("QA", GOAL, [{ id: "S2", title, role_key: "PM" }], []) === null);

// 오류 문구
check("403 identity", friendlyError(403, "ceo_owner_verification_required").message.startsWith("본인 확인이 필요합니다"));
check("409 stale", friendlyError(409, "target_set_mismatch").message.includes("미리보기를 다시 보세요"));
check("409 unknown stale", friendlyError(409, null).kind === "stale");
check("401 auth", friendlyError(401, null).kind === "auth");
check("header missing", friendlyError(403, "project_scope_denied", "X-Chat-Session-ID is required").kind === "input");
const parsed = parseErrorBody({ detail: { code: "target_set_mismatch", message: "m" } });
check("parse detail", parsed.code === "target_set_mismatch" && parsed.message === "m");
check("parse string", parseErrorBody({ detail: "x" }).message === "x");

// 키·UUID·권한
check("exec key stable", executionKeyFor("cs1") === executionKeyFor("cs1") && executionKeyFor("cs1") !== executionKeyFor("cs2"));
check("lastUuid", lastUuid("https://x/chat#0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9") === "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9");
check("lastUuid none", lastUuid("nope") === "");
check("owner", isOwnerUser({ tenant_role: "owner" }) && isOwnerUser({ membership: { role: "Owner" } }));
check("member not owner", !isOwnerUser({ tenant_role: "member" }) && !isOwnerUser(null));

if (failed > 0) { console.error(`canonicalAssignmentModel selftest: ${failed} failed`); process.exit(1); }
console.log("canonicalAssignmentModel selftest: ok");
