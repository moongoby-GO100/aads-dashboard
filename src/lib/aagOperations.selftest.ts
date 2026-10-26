import {
  isImpact, impactKindLabel, buildAxisViews, buildRecoveryViews, classifyApiError, coverageProof, filtersToSearch, findingsMatchSnapshot,
  formatAge, isMermaid, isOperations, normalizeFinding, resolveFilters, summarizeAxes,
  DEFAULT_FILTERS, type OperationsAxes,
} from "./aagOperations";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) { failed += 1; console.error(`FAIL ${name} ${detail}`); }
}

const full: OperationsAxes = {
  freshness: { status: "fresh", verified_at: "2026-10-20T01:00:00Z", age_minutes: 12 },
  last_run: { status: "succeeded", finished_at: "2026-10-20T01:00:00Z" },
  debt: { status: "clean", p0: 0, p1: 0, p2: 3, p3: 1 },
  coverage: { status: "full", inventory_scanned: 40, inventory_total: 40, risk_scanned: 8, risk_total: 8 },
};
const tone = (axes: OperationsAxes, key: string) => buildAxisViews(axes).find((v) => v.key === key)?.tone;

// 4축은 각각 판정한다
check("fresh+verified_at => ok", tone(full, "freshness") === "ok");
check("debt P2/P3 only => info (not ok)", tone(full, "debt") === "info");
check("coverage full => ok", tone(full, "coverage") === "ok");
check("last_run success => ok", tone(full, "last_run") === "ok");

// 0/0 커버리지·결함 없음은 미입증
const zero: OperationsAxes = { ...full, debt: { status: "clean", p0: 0, p1: 0, p2: 0, p3: 0 }, coverage: { status: "full", inventory_scanned: 0, inventory_total: 0, risk_scanned: 0, risk_total: 0 } };
check("0/0 coverage => unknown", tone(zero, "coverage") === "unknown");
check("zero debt with unproven coverage => unknown", tone(zero, "debt") === "unknown");
check("zero debt with proven coverage => ok", tone({ ...full, debt: { p0: 0, p1: 0, p2: 0, p3: 0 } }, "debt") === "ok");
check("partial coverage => warn", tone({ ...full, coverage: { inventory_scanned: 10, inventory_total: 40, risk_scanned: 8, risk_total: 8 } }, "coverage") === "warn");
check("missing counts => unknown", tone({ ...full, debt: { status: "clean" } }, "debt") === "unknown");
check("server says clean w/o numbers is not ok", tone({ ...full, debt: { status: "clean", p0: null, p1: null } }, "debt") !== "ok");
check("P0>0 => bad", tone({ ...full, debt: { p0: 2, p1: 0 } }, "debt") === "bad");
check("P1>0 => warn", tone({ ...full, debt: { p0: 0, p1: 5 } }, "debt") === "warn");
check("stale => warn", tone({ ...full, freshness: { status: "stale", verified_at: "2026-10-01T00:00:00Z", age_minutes: 99999 } }, "freshness") === "warn");
check("fresh without verified_at => unknown", tone({ ...full, freshness: { status: "fresh" } }, "freshness") === "unknown");
check("run failed => bad", tone({ ...full, last_run: { status: "failed", error: "x" } }, "last_run") === "bad");
check("unknown run status => unknown", tone({ ...full, last_run: { status: "weird", finished_at: "2026-10-20T01:00:00Z" } }, "last_run") === "unknown");
check("empty axes => all unknown", buildAxisViews({}).every((v) => v.tone === "unknown"));
check("coverage proof reason", !coverageProof({ inventory_scanned: 0, inventory_total: 0, risk_scanned: 1, risk_total: 1 }).proven);
const partialWithFullCounts: OperationsAxes = { ...zero, coverage: { ...full.coverage, status: "partial" } };
check("server partial with full counts => warn", tone(partialWithFullCounts, "coverage") === "warn");
check("unobserved scope prevents clean debt", tone(partialWithFullCounts, "debt") === "unknown");
check("missing coverage status cannot prove full scope", !coverageProof({ ...full.coverage, status: undefined }).proven);
check("overscanned counts cannot prove full scope", !coverageProof({ ...full.coverage, inventory_scanned: 41 }).proven);
check("backend complete status proves measured scope", coverageProof({ ...full.coverage, status: "complete" }).proven);

// 한 개의 green 으로 합치지 않는다
const sum = summarizeAxes(buildAxisViews(zero));
check("summary is per-tone counts", sum.counts.ok === 2 && sum.counts.unknown === 2, JSON.stringify(sum.counts));
check("summary sentence lists unproven", sum.sentence.includes("미입증 2"), sum.sentence);

// 복구 안내는 실행 경로가 아니다
const rec = buildRecoveryViews([{ kind: "rescan", label: "다시 스캔", enabled: true, reason: "" }, { kind: "x", label: "  ", enabled: true }], buildAxisViews(full));
check("blank-label actions dropped", rec.length === 1);
check("enabled action still not executable here", rec[0].note.includes("실행하지 않습니다"));
check("guidance when server sends none and axes need attention", buildRecoveryViews(undefined, buildAxisViews(zero))[0].kind === "guidance");
check("no guidance when nothing needs attention", buildRecoveryViews(undefined, buildAxisViews(full)).length === 0);

// 오류 분류
check("status 0 => network retryable", classifyApiError(0, null).kind === "network" && classifyApiError(0, null).retryable);
check("401 => auth login", classifyApiError(401, null).loginRequired);
check("403 => forbidden not retryable", classifyApiError(403, null).kind === "forbidden" && !classifyApiError(403, null).retryable);
check("404 snapshot detail => not_scanned", classifyApiError(404, { detail: "No authoritative AAG v2 snapshot" }).kind === "not_scanned");
check("404 disabled detail => disabled", classifyApiError(404, { detail: "AAG v2 is disabled" }).kind === "disabled");
check("404 Not Found => endpoint_missing", classifyApiError(404, { detail: "Not Found" }).kind === "endpoint_missing");
check("400 findings => snapshot_changed", classifyApiError(400, { detail: "x" }, "findings").kind === "snapshot_changed");
check("500 => server", classifyApiError(503, null).kind === "server");
check("every error has next action", [0, 401, 403, 404, 400, 500].every((s) => classifyApiError(s, null).action.length > 0));

// 필터 복원
const r1 = resolveFilters("", null);
check("defaults", JSON.stringify(r1.filters) === JSON.stringify(DEFAULT_FILTERS));
const r2 = resolveFilters("project=go100&repo=my-repo&ref=refs/heads/dev&sev=p1&finding=aag-stable-key-v1:abc", null);
check("url wins", r2.filters.project === "GO100" && r2.filters.repositoryId === "my-repo" && r2.filters.targetRef === "refs/heads/dev" && r2.filters.severity === "P1" && r2.filters.finding === "aag-stable-key-v1:abc");
const stored = JSON.stringify({ project: "GO100", repository_id: "kis-autotrade-v4", target_ref: "refs/heads/release" });
check("stored restores when url empty", resolveFilters("", stored).filters.targetRef === "refs/heads/release");
check("stored of other project not applied", resolveFilters("project=AADS", stored).filters.repositoryId === "aads-server");
const bad = resolveFilters("ref=../../etc&sev=P9&project=bad%20name", stored);
check("bad values rejected", bad.rejected.length === 3 && bad.filters.project === "GO100" && bad.filters.severity === "", JSON.stringify(bad));
check("ref traversal rejected", resolveFilters("ref=refs/heads/../x", null).filters.targetRef === "refs/heads/main");
check("round trip", JSON.stringify(resolveFilters(filtersToSearch(r2.filters), null).filters) === JSON.stringify(r2.filters));
check("corrupt storage ignored", resolveFilters("", "{not json").filters.project === "GO100");

// 비공개 운영 값의 영구 캐시는 제공하지 않는다. 로그인 간 격리는 브라우저 회귀로 검증한다.
check("isOperations rejects junk", !isOperations({ project: "x" }) && !isOperations(null));

// 결함 정규화
const f = normalizeFinding({ rule: "ORPHAN_ROUTER", severity: "p2", module: "app\\api\\x.py", stable_finding_key: "aag-stable-key-v1:z", owner: "ops" });
check("finding label is Korean not code", f.ruleLabel === "연결되지 않은 라우터" && !f.title.includes("ORPHAN"));
check("finding path normalized", f.path === "app/api/x.py");
check("finding severity upper", f.severity === "P2" && f.severityRank === 2);
check("unknown rule gets neutral label", normalizeFinding({ rule: "NEW_RULE" }).ruleLabel === "분류 이름이 아직 없는 규칙");
check("finding without key gets row key", normalizeFinding({}, 3).key === "row-3");
check("evidence holds raw ids", f.evidence.some(([k]) => k === "stable_finding_key"));

// 스냅샷 고정
check("snapshot match", findingsMatchSnapshot({ snapshot_id: "s1" }, "s1") && !findingsMatchSnapshot({ snapshot_id: "s2" }, "s1") && !findingsMatchSnapshot(null, "s1"));
check("age format", formatAge(5) === "5분 전" && formatAge(120) === "2시간 전" && formatAge(null) === "경과 시간 미확인");

// 아키텍처 다이어그램: 404 = 스냅샷 없음, 성공 응답 판별
const m404 = classifyApiError(404, { detail: "aads 프로젝트의 최신 AAG v2 스냅샷이 없습니다" }, "mermaid");
check("mermaid 404 => not_scanned with snapshot-missing title", m404.kind === "not_scanned" && m404.title === "이 저장소의 스냅샷이 아직 없습니다" && m404.retryable);
check("mermaid 404 disabled => disabled", classifyApiError(404, { detail: "AAG v2 is disabled" }, "mermaid").kind === "disabled");
check("mermaid 500 => server", classifyApiError(500, null, "mermaid").kind === "server");
check("mermaid 401 => auth", classifyApiError(401, null, "mermaid").loginRequired);
check("mermaid success shape", isMermaid({ snapshot_id: "s1", mermaid: "graph LR\n  A-->B", truncated: false }));
check("mermaid rejects bad shape", !isMermaid(null) && !isMermaid({ snapshot_id: "s1" }) && !isMermaid({ mermaid: "x" }));

const impact = { nodes: [{ id: "src/a.ts", kind: "file", distance: 0 }], edges: [], snapshot_id: "s1", repository_id: "aads-dashboard", target_ref: "refs/heads/main", resolved_commit_sha: "abc", truncated: false, limitations: [], conclusion: "observed" };
check("impact contract", isImpact(impact));
check("impact missing provenance", !isImpact({ ...impact, resolved_commit_sha: null }));
check("impact malformed node", !isImpact({ ...impact, nodes: [{ id: "a", kind: "file", distance: -1 }] }));
check("impact malformed edge", !isImpact({ ...impact, edges: [{ from: "a" }] }));
for (const kind of ["__proto__", "constructor", "toString", "unknown-kind"]) {
  check(`impact unknown label ${kind}`, impactKindLabel(kind) === `기타 관계·대상 (${kind})`);
}
check("impact Korean labels", impactKindLabel("calls") === "호출 관계");
check("impact 404 not no-impact", classifyApiError(404, null, "impact").message.includes("영향이 없다는 뜻이 아닙니다"));
check("impact auth", classifyApiError(401, null, "impact").loginRequired);
check("impact forbidden", classifyApiError(403, null, "impact").kind === "forbidden");

if (failed > 0) {
  console.error(`${failed} aag operations selftest(s) failed`);
  process.exit(1);
}
console.log("aag operations selftest passed");
