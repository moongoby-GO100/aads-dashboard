// 로컬 fixture 전용. 실제 서버 응답이 아니다 — 이 값으로 통과해도 "live API 검증"이 아니다.
export const SNAP = "11111111-2222-4333-8444-555555555555";
export const SNAP2 = "99999999-2222-4333-8444-555555555555";

export const axesHealthy = {
  freshness: { status: "fresh", verified_at: "2026-10-20T01:00:00Z", age_minutes: 12 },
  last_run: { status: "succeeded", finished_at: "2026-10-20T01:00:00Z", error: null, reason: null },
  debt: { status: "open", p0: 1, p1: 2, p2: 5, p3: 0 },
  coverage: { status: "full", inventory_scanned: 40, inventory_total: 40, risk_scanned: 8, risk_total: 8 },
};

export const axesUnproven = {
  freshness: { status: "stale", verified_at: "2026-10-01T01:00:00Z", age_minutes: 28000 },
  last_run: { status: "failed", finished_at: "2026-10-01T01:05:00Z", error: "ingest_failed", reason: "central ingest rejected the scan" },
  debt: { status: "clean", p0: 0, p1: 0, p2: 0, p3: 0 },
  coverage: { status: "full", inventory_scanned: 0, inventory_total: 0, risk_scanned: 0, risk_total: 0 },
};

export const operations = (over = {}) => ({
  schema_version: "aag-operations-v1",
  project: "GO100",
  repository_id: "kis-autotrade-v4",
  target_ref: "refs/heads/main",
  snapshot_id: SNAP,
  commit_sha: "7394faf0c1d2e3f4a5b6c7d8e9f00112233445566",
  axes: axesHealthy,
  recovery_actions: [
    { kind: "rescan", label: "다시 스캔", enabled: false, reason: "운영 승인이 필요합니다" },
  ],
  limitations: ["프런트엔드 호출 추출은 정적 분석 범위까지만 반영됩니다"],
  ...over,
});

const mk = (i, severity, rule) => ({
  stable_finding_key: `aag-stable-key-v1:${severity}-${i}`,
  severity, rule,
  path: `app/api/module_${i}.py`,
  message: `${severity} 결함 ${i}`,
  status: "open",
  owners: ["ops"],
});

export const ALL_FINDINGS = [
  mk(1, "P0", "ROUTE_SHADOWED"),
  mk(2, "P1", "ORPHAN_ROUTER"), mk(3, "P1", "ORPHAN_ROUTER"),
  ...Array.from({ length: 6 }, (_, i) => mk(10 + i, "P2", "STALE_BACKUP")),
];

export function findingsPage(url) {
  const q = url.searchParams;
  const sev = q.get("severity");
  const key = q.get("stable_finding_key");
  const size = Number(q.get("page_size") || 50);
  let list = ALL_FINDINGS.filter((f) => (!sev || f.severity === sev) && (!key || f.stable_finding_key === key));
  const offset = q.get("cursor") ? Number(q.get("cursor").replace("c:", "")) : 0;
  const page = list.slice(offset, offset + Math.min(size, 4));
  const next = offset + page.length < list.length ? `c:${offset + page.length}` : null;
  return {
    schema_version: "aag-v2", snapshot_id: q.get("snapshot_id"),
    findings: page,
    pagination: { pinned: true, offset, page_size: size, returned: page.length, total: list.length, next_cursor: next },
    limitation: [],
  };
}
