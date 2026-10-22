import {
  activityIcon, autoApprovalChip, autoApprovalDetailRows, autoApprovalNeedsAttention, autoApprovalTooltip,
  cleanupCandidates, cleanupChipLabel, daysSince, dormancyCardState, DROPDOWN_GROUP_LABEL, DROPDOWN_GROUP_ORDER,
  dropdownGroupOf, dropdownTriggerSummary, freezeOrder, freshSignals, goalDisplayTitle, groupDropdownGoals, idleLabel,
  mergeStripSignals, nextOptionIndex, p0IdleDays, pausedAutoApprovalGoals, priorityBadge, progressPct, shortGoalTitle,
  shouldShowGoalStrip, sortDropdownGoals, summarizeOpenGoals, unlinkedChipLabel,
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

// 7그룹 분류 — 서버 strip_group 이 없는 구서버 응답에서도 같은 규칙 (PRD §3, 처음 맞는 것 하나)
check("group order", DROPDOWN_GROUP_ORDER.join() === "working,awaiting,blocked,p0,other,paused,dormant");
check("group labels", DROPDOWN_GROUP_LABEL.working === "🔄 작업중" && DROPDOWN_GROUP_LABEL.awaiting === "⏳ 대표님 대기"
  && DROPDOWN_GROUP_LABEL.blocked === "⛔ 막힘" && DROPDOWN_GROUP_LABEL.p0 === "P0" && DROPDOWN_GROUP_LABEL.other === "P1 · P2"
  && DROPDOWN_GROUP_LABEL.paused === "⏸ 멈춤" && DROPDOWN_GROUP_LABEL.dormant === "💤 휴면·초안");
check("group working", dropdownGroupOf(g("a", { activity: "working", priority: "P2" })) === "working");
check("group awaiting", dropdownGroupOf(g("a", { activity: "awaiting" })) === "awaiting");
check("group blocked by status", dropdownGroupOf(g("a", { status: "blocked", priority: "P0" })) === "blocked");
check("group blocked by dispatch_note", dropdownGroupOf(g("a", { dispatch_note: "승인 대기" })) === "blocked");
check("blank dispatch_note is not blocked", dropdownGroupOf(g("a", { dispatch_note: "   ", priority: "P1" })) === "other");
check("group p0", dropdownGroupOf(g("a", { priority: "P0-CRITICAL" })) === "p0" && dropdownGroupOf(g("a", { priority: "P0" })) === "p0");
check("group other", dropdownGroupOf(g("a", { priority: "P1" })) === "other" && dropdownGroupOf(g("a", {})) === "other");
check("group paused", dropdownGroupOf(g("a", { goal_paused: true })) === "paused");
check("group dormant", dropdownGroupOf(g("a", { dormant: true })) === "dormant");
check("group draft is dormant", dropdownGroupOf(g("a", { status: "draft" })) === "dormant");
check("paused beats working", dropdownGroupOf(g("a", { goal_paused: true, activity: "working" })) === "paused");
check("working beats dormant", dropdownGroupOf(g("a", { activity: "working", dormant: true })) === "working");
check("dormant beats blocked", dropdownGroupOf(g("a", { dormant: true, status: "blocked" })) === "dormant");
check("draft beats blocked note", dropdownGroupOf(g("a", { status: "draft", dispatch_note: "x" })) === "dormant");
check("blocked beats p0", dropdownGroupOf(g("a", { dispatch_note: "x", priority: "P0" })) === "blocked");
check("server strip_group wins", dropdownGroupOf(g("a", { strip_group: "dormant", activity: "working" })) === "dormant");
check("unknown strip_group falls back", dropdownGroupOf(g("a", { strip_group: "weird", priority: "P0" })) === "p0");
check("null strip_group falls back", dropdownGroupOf(g("a", { strip_group: null, goal_paused: true })) === "paused");

// 정렬: 서버 값이 있어도 없어도 같은 순서
const goals: StripGoal[] = [
  g("dorm", { priority: "P0", dormant: true }),
  g("pause", { priority: "P1", goal_paused: true }),
  g("p2", { priority: "P2" }),
  g("p0", { priority: "P0" }),
  g("blk", { priority: "P2", status: "blocked" }),
  g("wait", { priority: "P1", activity: "awaiting" }),
  g("p1", { priority: "P1" }),
  g("work", { priority: "P2", activity: "working" }),
];
const expectOrder = "work,wait,blk,p0,p1,p2,pause,dorm";
const idsOf = (list: StripGoal[]) => list.map((x) => x.goal_id).join(",");
check("sort without server values", idsOf(sortDropdownGoals(goals)) === expectOrder, idsOf(sortDropdownGoals(goals)));
const withServer = goals.map((x) => {
  const k = dropdownGroupOf(x);
  return { ...x, strip_group: k, strip_order: DROPDOWN_GROUP_ORDER.indexOf(k) };
});
check("sort with server values", idsOf(sortDropdownGoals(withServer)) === expectOrder, idsOf(sortDropdownGoals(withServer)));
check("sort keeps input", goals[0].goal_id === "dorm");
check("server strip_order wins over local rule", idsOf(sortDropdownGoals([
  g("a", { priority: "P1", strip_group: "other", strip_order: 4 }),
  g("b", { priority: "P1", strip_group: "working", strip_order: 0 }),
])) === "b,a");
check("lead is not a sort key", idsOf(sortDropdownGoals([g("a", { priority: "P1" }), g("b", { priority: "P0" }), g("c", { priority: "P2", is_lead: true })])) === "b,a,c");
check("P0-CRITICAL before P0 before P1 in a group", idsOf(sortDropdownGoals([
  g("n", { priority: "P0" }), g("m", { priority: "P0-CRITICAL" }), g("o", { priority: "P0", dispatch_note: null }),
]).slice(0, 1)) === "m");
check("same priority: recent activity first, none last, then title", idsOf(sortDropdownGoals([
  g("none", { priority: "P1" }),
  g("old", { priority: "P1", last_activity_at: ago(9) }),
  g("new", { priority: "P1", last_activity_at: ago(1) }),
  g("abc", { priority: "P1" }),
])) === "new,old,abc,none", idsOf(sortDropdownGoals([
  g("none", { priority: "P1" }), g("old", { priority: "P1", last_activity_at: ago(9) }),
  g("new", { priority: "P1", last_activity_at: ago(1) }), g("abc", { priority: "P1" }),
])));
check("bad last_activity_at counts as none", idsOf(sortDropdownGoals([
  g("bad", { priority: "P1", last_activity_at: "nope" }), g("ok", { priority: "P1", last_activity_at: ago(3) }),
])) === "ok,bad");

const groups = groupDropdownGoals(sortDropdownGoals(goals));
check("groups cover all 7 in order", groups.map((x) => x.key).join() === DROPDOWN_GROUP_ORDER.join());
check("group counts", groups.find((x) => x.key === "other")?.goals.length === 2 && groups.every((x) => x.key === "other" || x.goals.length === 1));
check("group label from key", groups[2].label === "⛔ 막힘");
check("empty groups skipped", groupDropdownGoals([g("only", { priority: "P1" })]).map((x) => x.key).join() === "other");
check("no goals no groups", groupDropdownGoals([]).length === 0);

// 버튼 요약
const sumTop = dropdownTriggerSummary(goals);
check("trigger summary counts", sumTop.total === 8 && sumTop.working === 1 && sumTop.awaiting === 1 && sumTop.blocked === 1, JSON.stringify({ ...sumTop, top: null }));
check("trigger summary top is first sorted", sumTop.top?.goal_id === "work");
check("trigger summary empty", dropdownTriggerSummary([]).total === 0 && dropdownTriggerSummary([]).top === null);
check("trigger summary top is not the lead goal", dropdownTriggerSummary([g("lead", { priority: "P2", is_lead: true }), g("p0", { priority: "P0" })]).top?.goal_id === "p0");

// 열린 동안 순서 고정 (GD-7)
const frozen = sortDropdownGoals(goals).map((x) => x.goal_id);
const changed = goals.map((x) => (x.goal_id === "p2" ? { ...x, activity: "working" as const, progress: 0.9 } : x));
const kept = freezeOrder(frozen, changed);
check("freeze keeps previous order", idsOf(kept) === expectOrder, idsOf(kept));
check("freeze takes fresh values", kept.find((x) => x.goal_id === "p2")?.progress === 0.9 && kept.find((x) => x.goal_id === "p2")?.activity === "working");
const added = freezeOrder(frozen, [...goals, g("new-p1", { priority: "P1" }), g("new-work", { activity: "working" }), g("new-dorm", { dormant: true })]);
check("freeze: new goal goes to end of its own group", idsOf(added) === "work,new-work,wait,blk,p0,p1,p2,new-p1,pause,dorm,new-dorm", idsOf(added));
const removed = freezeOrder(frozen, goals.filter((x) => x.goal_id !== "wait" && x.goal_id !== "dorm"));
check("freeze drops vanished goals", idsOf(removed) === "work,blk,p0,p1,p2,pause", idsOf(removed));
check("freeze from empty prev sorts", idsOf(freezeOrder([], goals)) === expectOrder);
check("freeze ignores duplicate prev ids", freezeOrder(["work", "work"], [g("work", {})]).length === 1);
check("freeze empty goals", freezeOrder(frozen, []).length === 0);

// 진행률·키보드
check("progress 0..1", progressPct(0.5) === 50 && progressPct(1) === 100 && progressPct(0) === 0);
check("progress percent as is", progressPct(60) === 60 && progressPct(1.4) === 1);
check("progress clamps and tolerates bad", progressPct(250) === 100 && progressPct(-5) === 0 && progressPct(null) === 0 && progressPct(undefined) === 0 && progressPct(NaN) === 0);
check("keys ArrowDown/Up", nextOptionIndex("ArrowDown", 1, 5) === 2 && nextOptionIndex("ArrowUp", 1, 5) === 0);
check("keys clamp at ends", nextOptionIndex("ArrowDown", 4, 5) === 4 && nextOptionIndex("ArrowUp", 0, 5) === 0);
check("keys from nothing", nextOptionIndex("ArrowDown", -1, 5) === 0 && nextOptionIndex("ArrowUp", -1, 5) === 4);
check("keys Home/End", nextOptionIndex("Home", 3, 5) === 0 && nextOptionIndex("End", 0, 5) === 4);
check("keys other/empty", nextOptionIndex("a", 1, 5) === null && nextOptionIndex("ArrowDown", 0, 0) === null);

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

check("display title keeps full title", goalDisplayTitle("#119 상한가따라잡기 일일 수익률 3% 이상 달성 (1차 목표)") === "#119 상한가따라잡기 일일 수익률 3% 이상 달성 (1차 목표)");
check("display title hides uuid/runner id", goalDisplayTitle("f4cfeb08-7abd-4a04-b9bc-93bbc7ced036", "AADS") === "AADS 목표" && goalDisplayTitle("runner-27e0fe43") === "이름 없는 목표");

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
