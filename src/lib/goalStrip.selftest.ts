import {
  activityIcon, autoApprovalChip, autoApprovalDetailRows, autoApprovalNeedsAttention, autoApprovalTooltip,
  cleanupCandidates, cleanupChipLabel, daysSince, dormancyCardState, freshSignals, groupStripGoals, idleLabel,
  mergeStripSignals, p0IdleDays, pausedAutoApprovalGoals, priorityBadge, shortGoalTitle, sortStripGoals, stripGroupOf,
  shouldShowGoalStrip, summarizeOpenGoals, unlinkedChipLabel,
  type GoalSignal, type StripGoal,
} from "./goalStrip";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) { failed += 1; console.error(`FAIL ${name} ${detail}`); }
}

const NOW = Date.parse("2026-10-16T03:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const base = { progress: 0.5, milestone: null, dispatch_note: null };
const g = (id: string, over: Partial<StripGoal>): StripGoal => ({ goal_id: id, title: id, status: "active", ...base, ...over });

// 정렬: 🔄 → ⏳ → P0 → P1·P2 → 💤 (서버 strip_rank 가 있어도, 없어도 같다)
const goals: StripGoal[] = [
  g("dorm-p0", { priority: "P0-CRITICAL", dormant: true, strip_rank: 4 }),
  g("p2", { priority: "P2", strip_rank: 3 }),
  g("p0", { priority: "P0", strip_rank: 2 }),
  g("wait", { priority: "P1", activity: "awaiting", strip_rank: 1 }),
  g("p1", { priority: "P1", strip_rank: 3 }),
  g("work", { priority: "P2", activity: "working", strip_rank: 0 }),
  g("dorm-p1", { priority: "P1", dormant: true, strip_rank: 4 }),
];
check("sort order", sortStripGoals(goals).map((x) => x.goal_id).join(",") === "work,wait,p0,p1,p2,dorm-p0,dorm-p1",
  sortStripGoals(goals).map((x) => x.goal_id).join(","));
const noRank = goals.map((x) => ({ ...x, strip_rank: undefined }));
check("sort order without server rank", sortStripGoals(noRank).map((x) => x.goal_id).join(",") === "work,wait,p0,p1,p2,dorm-p0,dorm-p1");
check("sort keeps input", goals[0].goal_id === "dorm-p0");
check("lead is not a sort key", sortStripGoals([g("a", { priority: "P1", strip_rank: 3 }), g("b", { priority: "P0", strip_rank: 2, is_lead: false }), g("c", { priority: "P2", strip_rank: 3, is_lead: true })])[0].goal_id === "b");
check("dormant P0 before dormant P1", sortStripGoals([g("x", { priority: "P1", dormant: true, strip_rank: 4 }), g("y", { priority: "P0", dormant: true, strip_rank: 4 })])[0].goal_id === "y");

const groups = groupStripGoals(goals);
check("groups skip empty and keep order", groups.map((x) => x.key).join(",") === "working,awaiting,p0,other,dormant");
check("group counts", groups[3].goals.length === 2 && groups[4].goals.length === 2);
check("group label", groups[0].label === "🔄 작업중" && groups[1].label === "⏳ 대표님 대기" && groups[4].label === "💤 휴면");
check("no empty group", groupStripGoals([g("only", { strip_rank: 3, priority: "P1" })]).length === 1);
check("group of unknown rank clamps", stripGroupOf({ strip_rank: 99 }) === "dormant");

// 아이콘
check("icon working", activityIcon("working") === "🔄");
check("icon awaiting", activityIcon("awaiting") === "⏳");
check("icon none", activityIcon(null) === null && activityIcon(undefined) === null);

// 우선순위 배지
check("badge critical", priorityBadge("P0-CRITICAL")?.text === "P0 CRITICAL" && priorityBadge("P0-CRITICAL")?.critical === true);
check("badge p0/p1/p2", priorityBadge("P0")?.text === "P0" && priorityBadge("P1")?.tone === "p1" && priorityBadge("P2")?.tone === "p2");
check("badge empty", priorityBadge("") === null && priorityBadge(null) === null);

// P0 ⚠️ N일 (PR-4)
check("p0 idle 6d no warn", p0IdleDays({ priority: "P0", last_activity_at: ago(6) }, NOW) === null);
check("p0 idle 7d warn", p0IdleDays({ priority: "P0", last_activity_at: ago(7) }, NOW) === 7);
check("p0 critical dormant keeps warn", p0IdleDays({ priority: "P0-CRITICAL", last_activity_at: ago(16) }, NOW) === 16);
check("p1 idle no warn", p0IdleDays({ priority: "P1", last_activity_at: ago(30) }, NOW) === null);
check("p0 no activity record no warn", p0IdleDays({ priority: "P0", last_activity_at: null }, NOW) === null);
check("daysSince bad", daysSince("nope", NOW) === null && daysSince(null, NOW) === null);
check("idle label", idleLabel(ago(21), NOW) === "마지막 활동 21일 전" && idleLabel(ago(0), NOW) === "마지막 활동 오늘" && idleLabel(null, NOW) === "활동 기록 없음");

// 자동승인 칩 8종
const aa = (o: object) => autoApprovalChip(o, NOW);
check("aa manual", aa({ state: "manual" })?.text === "🔒 수동");
check("aa high", aa({ state: "high", used: 3, max: 10, expires_at: ago(-20) })?.text === "🟢 고위험까지 3/10" && aa({ state: "high", used: 3, max: 10, expires_at: ago(-20) })?.warn === false);
check("aa high 80% warn", aa({ state: "high", used: 9, max: 10, expires_at: ago(-20) })?.warn === true);
check("aa exactly 80% no warn", aa({ state: "high", used: 8, max: 10, expires_at: ago(-20) })?.warn === false);
check("aa all", aa({ state: "all", used: 4, max: 20 })?.text === "🟢 전체 4/20" && aa({ state: "all", used: 4, max: 20 })?.tone === "strong");
check("aa exhausted", aa({ state: "exhausted", used: 10, max: 10 })?.text === "⛔ 한도 소진 10/10");
check("aa off", aa({ state: "off" })?.text === "🔒 해제됨");
check("aa delegated", aa({ state: "delegated" })?.text === "👥 위임");
check("aa paused", aa({ state: "paused", used: 3, max: 10 })?.text === "⏸ 정지");
check("aa expired", aa({ state: "expired" })?.text === "⌛ 만료");
check("aa unknown state hidden", aa({ state: "weird" }) === null);
check("aa missing view hidden", autoApprovalChip(null, NOW) === null && autoApprovalChip(undefined, NOW) === null && aa({}) === null);
check("aa no max no usage text", aa({ state: "high" })?.text === "🟢 고위험까지");
check("aa expiry within 7d warn", autoApprovalNeedsAttention({ state: "high", used: 1, max: 10, expires_at: ago(-6) }, NOW) === true);
check("aa expiry 8d no warn", autoApprovalNeedsAttention({ state: "high", used: 1, max: 10, expires_at: ago(-8) }, NOW) === false);
check("aa paused never warn", autoApprovalNeedsAttention({ state: "paused", used: 10, max: 10 }, NOW) === false);

// 툴팁 (AA-6)
const rows = autoApprovalDetailRows({ state: "paused", used: 3, max: 10, set_by: "대표님", set_at: "2026-09-15T00:00:00Z", expires_at: "2026-11-14T00:00:00Z", max_risk_tier: "A1" }, Date.parse("2026-10-16T00:00:00Z"));
const row = (label: string) => rows.find((r) => r.label === label)?.value;
check("tip set_by", row("설정자") === "대표님");
check("tip set_at", row("설정일") === "2026-09-15");
check("tip scope", row("범위") === "고위험까지 자동 통과");
check("tip usage", row("사용") === "3 / 10 (30%)");
check("tip expiry", row("만료") === "2026-11-14 (D-29)", String(row("만료")));
const tip = autoApprovalTooltip({ state: "paused", used: 3, max: 10 }, NOW);
check("tip paused hint", tip.includes("재개하면 다시 켜집니다") && tip.includes("설정자: —"));
check("tip exhausted hint", autoApprovalTooltip({ state: "exhausted", used: 10, max: 10 }, NOW).includes("한도를 갱신"));
check("tip all scope", autoApprovalDetailRows({ state: "all", max_risk_tier: "A2" }, NOW).find((r) => r.label === "범위")?.value === "전체 자동 통과");

// 이름 — 내부 ID 노출 금지
check("title numbered", shortGoalTitle("#119 상한가따라잡기 일일 수익률 3% 이상 달성 (1차 목표)") === "#119");
check("title parens", shortGoalTitle("직원 계약서 서명 (한도)") === "직원 계약서 서명");
check("title long", shortGoalTitle("가나다라마바사아자차카타파하") === "가나다라마바사아자차카타…");
check("title uuid hidden", shortGoalTitle("f4cfeb08-7abd-4a04-b9bc-93bbc7ced036", "AADS") === "AADS 목표");
check("title runner id hidden", shortGoalTitle("runner-27e0fe43") === "이름 없는 목표");
check("title empty", shortGoalTitle("", "GO100") === "GO100 목표");

// 합치기
const signals: GoalSignal[] = [
  { goal_id: "p0", title: "p0", status: "active", priority: "P0", last_activity_at: ago(8), auto_approval: { state: "high", used: 1, max: 10 } },
];
const merged = mergeStripSignals([g("p0", { priority: "P0" }), g("other", {})], signals);
check("merge adds aa", merged[0].auto_approval?.state === "high" && merged[0].last_activity_at === ago(8));
check("merge leaves unmatched", merged[1].auto_approval === undefined && merged[1].goal_id === "other");
check("merge null signals", mergeStripSignals([g("a", {})], null).length === 1);
check("merge keeps server rank", mergeStripSignals([g("p0", { strip_rank: 0, priority: "P1" })], signals)[0].strip_rank === 0);

// 요약·미연결
const all: GoalSignal[] = [
  { goal_id: "1", title: "a", status: "active", priority: "P0" },
  { goal_id: "2", title: "b", status: "blocked", priority: "P0-CRITICAL" },
  { goal_id: "3", title: "c", status: "draft", priority: "P1" },
  { goal_id: "4", title: "d", status: "completed", priority: "P0" },
  { goal_id: "5", title: "e", status: "paused", priority: "P0" },
];
const sum = summarizeOpenGoals(all);
check("summary open/p0", sum?.open === 3 && sum?.p0 === 2, JSON.stringify(sum));
check("summary null", summarizeOpenGoals(null) === null);
check("unlinked", unlinkedChipLabel(3) === "🔗 목표 미연결 3건" && unlinkedChipLabel(0) === null && unlinkedChipLabel(undefined) === null);

// 정리 후보 — blocked 는 휴면과 따로 (DO-2)
const pool: GoalSignal[] = [
  { goal_id: "d1", title: "d1", status: "active", priority: "P2", cleanup_lane: "dormant", last_activity_at: ago(52) },
  { goal_id: "d2", title: "d2", status: "active", priority: "P0", cleanup_lane: "dormant", last_activity_at: ago(21) },
  { goal_id: "b1", title: "b1", status: "blocked", priority: "P0-CRITICAL", cleanup_lane: "blocked_resolution", last_activity_at: ago(16) },
  { goal_id: "n1", title: "n1", status: "active", priority: "P0", cleanup_lane: null, last_activity_at: ago(1) },
];
const cc = cleanupCandidates(pool);
check("cleanup lanes split", cc.dormant.map((x) => x.goal_id).join() === "d2,d1" && cc.blocked.map((x) => x.goal_id).join() === "b1");
check("blocked never in dormant", !cc.dormant.some((x) => x.status === "blocked"));
check("cleanup total", cc.total === 3);
check("active P0 candidates", cc.activeP0.map((x) => x.goal_id).join() === "d2,n1");
check("cleanup empty", cleanupCandidates(null).total === 0 && cleanupCandidates([]).total === 0);

// 카드 상태 3종(+로딩)
const empty = cleanupCandidates([]);
check("card default", dormancyCardState({ loaded: true, error: false, candidates: cc }) === "default");
check("card empty", dormancyCardState({ loaded: true, error: false, candidates: empty }) === "empty");
const p0 = (id: string) => ({ goal_id: id, title: id, status: "active", priority: "P0" });
const manyP0 = cleanupCandidates([p0("a"), p0("b"), p0("c"), p0("d")]);
check("card default when P0 over cap w/o candidates", manyP0.total === 0
  && dormancyCardState({ loaded: true, error: false, candidates: manyP0 }) === "default");
check("card empty at P0 cap", dormancyCardState({ loaded: true, error: false,
  candidates: cleanupCandidates([p0("a"), p0("b"), p0("c")]) }) === "empty");
check("card error beats data", dormancyCardState({ loaded: true, error: true, candidates: cc }) === "error");
check("card error when never loaded", dormancyCardState({ loaded: false, error: true, candidates: empty }) === "error");
check("card loading", dormancyCardState({ loaded: false, error: false, candidates: empty }) === "loading");
check("chip label", cleanupChipLabel(18) === "🧹 휴면·차단 정리 18건" && cleanupChipLabel(18, true) === "🧹 정리 18" && cleanupChipLabel(0) === null);

check("paused aa goals", pausedAutoApprovalGoals([
  { goal_id: "1", title: "a", status: "blocked", auto_approval: { state: "paused" } },
  { goal_id: "2", title: "b", status: "active", auto_approval: { state: "high" } },
  { goal_id: "3", title: "c", status: "completed", auto_approval: { state: "paused" } },
  { goal_id: "4", title: "d", status: "draft" },
]).map((x) => x.goal_id).join() === "1");
check("paused aa null", pausedAutoApprovalGoals(null).length === 0);

// 조회 실패 시 이전 신호 폐기 / 목표 없는 대화의 띠 노출
check("fresh signals ok", freshSignals(pool, false) === pool);
check("fresh signals dropped on error", freshSignals(pool, true) === null);
check("stale auto approval not merged on error", mergeStripSignals(
  [{ goal_id: "x", title: "t", status: "active", project: "p", progress: 0, milestone: null, dispatch_note: null }],
  freshSignals([{ goal_id: "x", title: "t", status: "active", auto_approval: { state: "high" } }], true),
)[0].auto_approval == null);
check("strip shown w/o session goals when cleanup", shouldShowGoalStrip({ sessionGoalCount: 0, cleanupTotal: 2, unlinkedCount: 0 }));
check("strip shown w/o session goals when unlinked", shouldShowGoalStrip({ sessionGoalCount: 0, cleanupTotal: 0, unlinkedCount: 1 }));
check("strip shown with session goals", shouldShowGoalStrip({ sessionGoalCount: 1, cleanupTotal: 0, unlinkedCount: 0 }));
check("strip shown on signals error (retry path)", shouldShowGoalStrip({ sessionGoalCount: 0, cleanupTotal: 0, unlinkedCount: 0, signalsError: true }));
check("strip hidden when nothing", !shouldShowGoalStrip({ sessionGoalCount: 0, cleanupTotal: 0, unlinkedCount: 0 }));

if (failed > 0) {
  console.error(`${failed} goalStrip selftest(s) failed`);
  process.exit(1);
}
console.log("goalStrip selftest ok");
