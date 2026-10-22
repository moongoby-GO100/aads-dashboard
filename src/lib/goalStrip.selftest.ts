import {
  APPROVAL_CHIP_TOOLTIP, NO_DISPATCH_TARGET_MESSAGE, formatKst, ownerAssignFailureText, parseApiFailure, progressChip,
  redispatchFailure, redispatchSuccessText, scrubReason, stuckMilestonesOfGoal, stuckViewOfMilestone,
  activityIcon, autoApprovalChip, autoApprovalDetailRows, autoApprovalNeedsAttention, autoApprovalTooltip,
  cleanupCandidates, cleanupChipLabel, daysSince, dormancyCardState, DROPDOWN_GROUP_LABEL, DROPDOWN_GROUP_ORDER,
  dropdownGroupOf, dropdownTriggerSummary, freezeOrder, freshSignals, goalDisplayTitle, groupDropdownGoals, idleLabel,
  mergeStripSignals, nextOptionIndex, p0IdleDays, pausedAutoApprovalGoals, priorityBadge, progressPct, shortGoalTitle,
  shouldShowGoalStrip, sortDropdownGoals, summarizeOpenGoals, unlinkedChipLabel,
  type GoalSignal, type StripGoal,
} from "./goalStrip";
import {
  EMPTY_SELECTION, applyBlockReason, buildApplyRequest, candidatesVersionOf, chooseAction, isDemotedP0, keyAfterFailure,
  keyForAttempt, mergeTargetOptions, parseTriageFailure, reconcileSelection, requestFingerprint, requiredP0Count,
  setMergeTarget, summarizeSelection, toggleKeepP0, triageFailureHeadline, triageFailureText, visibleCandidates,
  type TriageSelection,
} from "./goalTriage";

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
check("aa manual", aa({ state: "manual" })?.text === "승인: 수동");
check("aa high", aa({ state: "high", used: 3, max: 10, expires_at: ago(-20) })?.text === "승인: 고위험까지 자동 3/10" && aa({ state: "high", used: 3, max: 10, expires_at: ago(-20) })?.warn === false);
check("aa high 80% warn", aa({ state: "high", used: 9, max: 10, expires_at: ago(-20) })?.warn === true);
check("aa exactly 80% no warn", aa({ state: "high", used: 8, max: 10, expires_at: ago(-20) })?.warn === false);
check("aa all", aa({ state: "all", used: 4, max: 20 })?.text === "승인: 전체 자동 4/20" && aa({ state: "all", used: 4, max: 20 })?.tone === "strong");
check("aa exhausted", aa({ state: "exhausted", used: 10, max: 10 })?.text === "승인: 한도 소진 10/10");
check("aa off", aa({ state: "off" })?.text === "승인: 해제됨");
check("aa delegated", aa({ state: "delegated" })?.text === "승인: 위임");
check("aa paused", aa({ state: "paused", used: 3, max: 10 })?.text === "승인: 멈춤");
check("aa expired", aa({ state: "expired" })?.text === "승인: 만료");
check("aa unknown state hidden", aa({ state: "weird" }) === null);
check("aa missing view hidden", autoApprovalChip(null, NOW) === null && autoApprovalChip(undefined, NOW) === null && aa({}) === null);
check("aa no max no usage text", aa({ state: "high" })?.text === "승인: 고위험까지 자동");
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

// 승인 칩과 진행 칩은 별개 — 승인 문구 4종과 툴팁
check("approval tooltip", APPROVAL_CHIP_TOOLTIP === "위험 작업 때 대표님 승인 버튼을 띄울지 정하는 설정입니다. 진행 여부와는 별개입니다.");
check("approval chip never says 수동 as progress", !aa({ state: "manual" })?.text.includes("진행"));

// 진행 칩 7가지 (서버 progress_state)
const pc = (o: Partial<StripGoal>) => progressChip({ ...g("p", {}), ...o });
const PROGRESS_COPY: Array<[string, string]> = [
  ["working", "진행: 진행중"], ["no_owner", "진행: 담당 없음"], ["awaiting_reply", "진행: 답 대기"],
  ["answered_no_progress", "진행: 답했으나 진행 없음"], ["blocked", "진행: 막힘"], ["paused", "진행: 멈춤"], ["idle", "진행: 대기"],
];
for (const [state, text] of PROGRESS_COPY) check(`progress ${state}`, pc({ progress_state: state }).text === text, pc({ progress_state: state }).text);
check("progress substitute", pc({ progress_state: "no_owner", progress_substitute: true }).text === "진행: 담당 없음·주도 세션 대행");
check("substitute flag ignored for other states", pc({ progress_state: "working", progress_substitute: true }).text === "진행: 진행중");
check("progress stuck flags", ["blocked", "answered_no_progress", "no_owner"].every((s) => pc({ progress_state: s }).stuck)
  && ["working", "awaiting_reply", "paused", "idle"].every((s) => !pc({ progress_state: s }).stuck));
check("progress raw state never in text", PROGRESS_COPY.every(([s]) => !pc({ progress_state: s }).text.includes(s)));

// 구 응답 폴백 — progress_state 가 없거나 모르는 값이면 기존 7그룹 규칙
check("fallback working", pc({ activity: "working" }).text === "진행: 진행중");
check("fallback awaiting", pc({ activity: "awaiting" }).text === "진행: 답 대기");
check("fallback blocked by note", pc({ dispatch_note: "승인 대기 중" }).text === "진행: 막힘" && pc({ dispatch_note: "승인 대기 중" }).stuck);
check("fallback blocked by status", pc({ status: "blocked" }).text === "진행: 막힘");
check("fallback paused", pc({ goal_paused: true }).text === "진행: 멈춤");
check("fallback idle", pc({ priority: "P1" }).text === "진행: 대기" && pc({ dormant: true }).text === "진행: 대기");
check("fallback unknown server value", pc({ progress_state: "weird", activity: "working" }).text === "진행: 진행중");
check("fallback null server value", pc({ progress_state: null }).text === "진행: 대기");
check("progress reason from progress_reason", pc({ progress_state: "blocked", progress_reason: "M2: 3회 보냈으나 답이 확인되지 않음" }).reason === "M2: 3회 보냈으나 답이 확인되지 않음");
check("progress reason falls back to dispatch_note", pc({ dispatch_note: "승인 대기 중" }).reason === "승인 대기 중");

// 사유 정리 · 막힌 시각(KST)
const MID = "0a1b2c3d-1111-2222-3333-444455556666";
check("scrub uuid", scrubReason(`마일스톤 ${MID} 막힘`) === "마일스톤 막힘" && scrubReason(MID) === null && scrubReason("  ") === null);
check("kst", formatKst("2026-10-22T08:24:00Z") === "10/22 17:24 (KST)" && formatKst("2026-10-22T15:30:00Z") === "10/23 00:30 (KST)");
check("kst invalid", formatKst("nope") === null && formatKst(null) === null);
const stuckList = stuckMilestonesOfGoal({ blocked_milestones: [
  { milestone_id: MID, title: "M2 검증", state: "answered_no_progress", reason: "담당이 답했으나 진행 없음", blocked_at: "2026-10-22T08:24:00Z" },
  { milestone_id: "", title: "버림" },
] });
check("stuck list", stuckList.length === 1 && stuckList[0].label === "답했으나 진행 없음" && stuckList[0].blockedAt === "10/22 17:24 (KST)"
  && stuckList[0].milestoneId === MID && stuckList[0].title === "M2 검증");
check("stuck list empty", stuckMilestonesOfGoal({}).length === 0 && stuckMilestonesOfGoal({ blocked_milestones: null }).length === 0);
const panelMs = { id: MID, status: "in_progress" };
const bm = [{ milestone_id: MID, blocked_at: "2026-10-22T08:24:00Z", reason: "3회 보냈으나 답 없음" }];
check("panel stuck from server", stuckViewOfMilestone({ ...panelMs, progress_state: "blocked", progress_reason: "사유A" }, bm)?.reason === "사유A"
  && stuckViewOfMilestone({ ...panelMs, progress_state: "blocked", progress_reason: "사유A" }, bm)?.blockedAt === "10/22 17:24 (KST)");
check("panel stuck reason from blocked list", stuckViewOfMilestone({ ...panelMs, progress_state: "blocked" }, bm)?.reason === "3회 보냈으나 답 없음");
check("panel no_owner has no time", stuckViewOfMilestone({ ...panelMs, progress_state: "no_owner", progress_reason: "담당 세션 없음" }, [])?.blockedAt === null);
check("panel working not stuck", stuckViewOfMilestone({ ...panelMs, progress_state: "working" }, bm) === null
  && stuckViewOfMilestone({ ...panelMs, progress_state: "awaiting_reply" }, bm) === null);
check("panel old response uses dispatch_note", stuckViewOfMilestone({ ...panelMs, dispatch_note: "승인 대기" }, undefined)?.label === "막힘");
check("panel old response without note", stuckViewOfMilestone(panelMs, undefined) === null
  && stuckViewOfMilestone({ id: MID, status: "completed", dispatch_note: "x" }, undefined) === null);
check("panel view never carries uuid text", !JSON.stringify([stuckViewOfMilestone({ ...panelMs, progress_state: "blocked", progress_reason: `${MID} 막힘` }, bm)?.reason]).includes(MID));

// 다시 보내기 · 담당 지정 결과
const apiErr = (status: number, body: unknown) => new Error(`API error ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
const noTarget = apiErr(409, { detail: { code: "no_dispatch_target", message: "담당도 주도 세션도 없어 보낼 곳이 없다" } });
check("parse api failure", parseApiFailure(noTarget).status === 409 && parseApiFailure(noTarget).code === "no_dispatch_target");
check("parse api failure string detail", parseApiFailure(apiErr(404, { detail: "milestone_not_found" })).code === "milestone_not_found");
check("parse api failure non-json", parseApiFailure(apiErr(502, "Bad Gateway")).status === 502 && parseApiFailure(new Error("network")).status === null);
check("redispatch 409 no target", redispatchFailure(noTarget).kind === "no_target" && redispatchFailure(noTarget).text === NO_DISPATCH_TARGET_MESSAGE
  && NO_DISPATCH_TARGET_MESSAGE === "보낼 담당·주도 세션이 없습니다. 먼저 담당을 지정하세요");
check("redispatch 409 not in progress", redispatchFailure(apiErr(409, { detail: { code: "milestone_not_in_progress" } })).kind === "not_in_progress");
check("redispatch 500 generic", redispatchFailure(apiErr(500, "boom")).kind === "error" && redispatchFailure(apiErr(500, "boom")).text.includes("오류 500"));
check("redispatch network error", redispatchFailure(new Error("Failed to fetch")).text === "다시 보내지 못했습니다");
check("redispatch success copy", redispatchSuccessText(false).includes("다음 주기") && redispatchSuccessText(true).includes("재개"));
check("owner 422 not linked", ownerAssignFailureText(apiErr(422, { detail: "owner_not_linked" })).includes("연결돼 있지 않아"));
check("owner 403", ownerAssignFailureText(apiErr(403, { detail: "cross_project" })).includes("다른 프로젝트"));
check("owner generic", ownerAssignFailureText(new Error("x")) === "담당을 지정하지 못했습니다");

// ── 정리 카드 선택·반영 (goalTriage) ─────────────────────────────────────────────
const tp = (id: string, over: Partial<GoalSignal> = {}): GoalSignal => ({ goal_id: id, title: id, status: "active", priority: "P0", ...over });
const triagePool: GoalSignal[] = [
  tp("p1", { last_activity_at: ago(1) }), tp("p2", { last_activity_at: ago(2) }), tp("p3", { last_activity_at: ago(3) }),
  tp("p4", { last_activity_at: ago(19), cleanup_lane: "dormant" }),
  tp("d1", { priority: "P1", cleanup_lane: "dormant", last_activity_at: ago(30) }),
  tp("d2", { priority: "P2", cleanup_lane: "dormant", last_activity_at: ago(40) }),
  tp("b1", { priority: "P1", status: "blocked", cleanup_lane: "blocked_resolution", last_activity_at: ago(20) }),
  tp("t1", { priority: "P1", last_activity_at: ago(1) }),
];
const tc = cleanupCandidates(triagePool);
const open = triagePool;
const VER = "v1:abc";
let sel: TriageSelection = EMPTY_SELECTION;

check("triage required p0 count", requiredP0Count(tc) === 3 && requiredP0Count(cleanupCandidates([p0("a")])) === 1 && requiredP0Count(empty) === 0);
check("apply blocked below 3 P0", applyBlockReason(sel, tc, VER) === "p0_count");
sel = toggleKeepP0(toggleKeepP0(sel, "p1"), "p2");
check("apply blocked at 2 P0", applyBlockReason(sel, tc, VER) === "p0_count" && sel.keepP0.length === 2);
sel = toggleKeepP0(sel, "p3");
check("apply blocked w/o choices even at 3 P0 (P0 demotion alone is a change)", applyBlockReason(sel, tc, VER) === null);
check("4th P0 pick ignored", toggleKeepP0(sel, "p4") === sel && toggleKeepP0(sel, "p4").keepP0.length === 3);
check("P0 pick toggles off", toggleKeepP0(sel, "p3").keepP0.join() === "p1,p2");
check("apply blocked without version", applyBlockReason(sel, tc, null) === "no_version" && applyBlockReason(sel, tc, "") === "no_version");
check("unpicked active P0 shows demotion, picked does not", isDemotedP0(tp("p4"), sel) && !isDemotedP0(tp("p1"), sel)
  && !isDemotedP0(tp("b", { status: "blocked" }), sel) && !isDemotedP0(tp("d1", { priority: "P1" }), sel));

// 선택·해제·줄 밖 동작
sel = chooseAction(sel, "d1", "dormant", "resume");
check("choose resume", sel.choices.d1?.action === "resume");
check("choose same again clears", chooseAction(sel, "d1", "dormant", "resume").choices.d1 === undefined);
check("unblock not allowed on dormant, resume not allowed on blocked", chooseAction(sel, "d2", "dormant", "unblock") === sel
  && chooseAction(sel, "b1", "blocked", "resume") === sel);
sel = chooseAction(sel, "b1", "blocked", "unblock");
check("choose unblock on blocked", sel.choices.b1?.action === "unblock");
sel = chooseAction(sel, "d2", "dormant", "merge");
check("merge without target blocks apply", sel.choices.d2?.mergeInto === null && applyBlockReason(sel, tc, VER) === "merge_target");
check("merge target excludes self and ending goals", (() => {
  const s2 = chooseAction(sel, "d1", "dormant", "close");
  const ids = mergeTargetOptions(open, s2, "d2").map((x) => x.goal_id);
  return !ids.includes("d2") && !ids.includes("d1") && ids.includes("p4") && ids.includes("b1");
})());
check("merge target can be any open goal incl. picked P0", mergeTargetOptions(open, sel, "d2").some((x) => x.goal_id === "p1"));
sel = setMergeTarget(sel, "d2", "p1");
check("merge with target allowed", applyBlockReason(sel, tc, VER) === null && sel.choices.d2?.mergeInto === "p1");
check("switching away from merge drops target", chooseAction(sel, "d2", "dormant", "pause").choices.d2?.mergeInto === null);
check("setMergeTarget ignored when not merge", setMergeTarget(sel, "d1", "p1") === sel);

// ① 에서 고른 P0 는 ②·③ 에서 빠지고 그 선택도 사라진다
const withP4 = toggleKeepP0(chooseAction(EMPTY_SELECTION, "p4", "dormant", "close"), "p1");
check("kept P0 leaves its row choice", withP4.choices.p4 !== undefined);
const keptP4 = toggleKeepP0(withP4, "p4");
check("keeping a dormant P0 hides it from ② and drops its choice", keptP4.choices.p4 === undefined
  && !visibleCandidates(tc, keptP4).dormant.some((x) => x.goal_id === "p4") && visibleCandidates(tc, EMPTY_SELECTION).dormant.some((x) => x.goal_id === "p4"));

// 요약 문구 숫자 · 요청 본문
const sm = summarizeSelection(sel, tc);
check("summary counts", sm.p0 === 3 && sm.dormant === 2 && sm.blocked === 1 && sm.byAction.resume === 1 && sm.byAction.merge === 1
  && sm.byAction.unblock === 1 && sm.unselected === 1 && sm.merging === 1 && sm.closing === 0, JSON.stringify(sm));
const req = buildApplyRequest(sel, tc, VER);
check("request body", req.keep_p0.join() === "p1,p2,p3" && req.candidates_version === VER && req.actions.length === 3
  && req.actions.some((a) => a.goal_id === "d2" && a.action === "merge" && a.merge_into === "p1")
  && req.actions.some((a) => a.goal_id === "b1" && a.action === "unblock" && a.merge_into === undefined)
  && !req.actions.some((a) => a.goal_id === "p4"), JSON.stringify(req));
check("fingerprint order independent", requestFingerprint(req) === requestFingerprint({ ...req, keep_p0: [...req.keep_p0].reverse(), actions: [...req.actions].reverse() })
  && requestFingerprint(req) !== requestFingerprint({ ...req, candidates_version: "v1:def" }));
check("nothing to apply w/ ≤3 P0 and no choice", applyBlockReason(EMPTY_SELECTION, cleanupCandidates([p0("a"), p0("b")]), VER) === "p0_count"
  && applyBlockReason(toggleKeepP0(toggleKeepP0(EMPTY_SELECTION, "a"), "b"), cleanupCandidates([p0("a"), p0("b")]), VER) === "nothing");

// 후보가 바뀌면 유효한 선택만 남긴다 (stale_candidates 뒤 UI-3)
check("reconcile keeps everything valid (same object)", reconcileSelection(sel, tc, open) === sel);
const changedCands = cleanupCandidates(triagePool.filter((x) => x.goal_id !== "d1" && x.goal_id !== "p2")
  .map((x) => (x.goal_id === "b1" ? { ...x, status: "active", cleanup_lane: null } : x)));
const rec = reconcileSelection(sel, changedCands, triagePool.filter((x) => x.goal_id !== "d1" && x.goal_id !== "p2"));
check("reconcile drops vanished/changedCands, keeps valid", rec.keepP0.join() === "p1,p3" && rec.choices.d1 === undefined && rec.choices.b1 === undefined
  && rec.choices.d2?.action === "merge" && rec.choices.d2?.mergeInto === "p1", JSON.stringify(rec));
const targetGone = reconcileSelection(sel, tc, open.filter((x) => x.goal_id !== "p1"));
check("reconcile clears vanished merge target but keeps merge", targetGone.choices.d2?.action === "merge" && targetGone.choices.d2?.mergeInto === null);
const targetEnding = reconcileSelection(chooseAction(sel, "d1", "dormant", "merge"), tc, open);
const mergeChain = reconcileSelection(setMergeTarget(chooseAction(sel, "d1", "dormant", "merge"), "d1", "d2"), tc, open);
check("reconcile clears merge into a goal that is itself merged", mergeChain.choices.d1?.mergeInto === null && targetEnding.choices.d1?.mergeInto === null);
check("reconcile keeps nothing on empty candidates", reconcileSelection(sel, empty, []).keepP0.length === 0 && Object.keys(reconcileSelection(sel, empty, []).choices).length === 0);
check("candidates version from first row", candidatesVersionOf([{ ...tp("a"), candidates_version: null }, { ...tp("b"), candidates_version: "v1:x" }]) === "v1:x" && candidatesVersionOf(null) === null);

// Idempotency-Key — 카드 열 때 한 번, 재시도 재사용, 처리된 실패 뒤·내용이 바뀌면 새 키
const k0 = { key: "k-open", fingerprint: null as string | null };
const k1 = keyForAttempt(k0, "fp1");
check("first attempt uses the opening key", k1.key === "k-open" && k1.fingerprint === "fp1");
check("retry w/ same request reuses key", keyForAttempt(k1, "fp1").key === "k-open");
check("changedCands request gets a new key", keyForAttempt(k1, "fp2").key !== "k-open");
const f409 = parseTriageFailure(new Error('409: {"detail":{"error":"p0_cap_exceeded","cap":3,"current_p0":[{"goal_id":"a"},{"goal_id":"b"},{"goal_id":"c"},{"goal_id":"d"}]}}'));
check("parse 409 p0 cap", f409.status === 409 && f409.code === "p0_cap_exceeded" && f409.definitive && f409.cap === 3 && f409.currentP0 === 4);
check("new key after processed failure", keyAfterFailure(k1, f409).key !== "k-open");
const fNet = parseTriageFailure(new TypeError("Failed to fetch"));
const f500 = parseTriageFailure(new Error("500: boom"));
check("same key kept when outcome unknown", !fNet.definitive && !f500.definitive && keyAfterFailure(k1, fNet) === k1 && keyAfterFailure(k1, f500) === k1);
check("parse status prop and API error prefix", parseTriageFailure(Object.assign(new Error("403: x"), { status: 403 })).status === 403
  && parseTriageFailure(new Error('API error 422: {"detail":[{"msg":"x"}]}')).code === null);

// 실패 문구 — 헤드라인과 사람이 읽을 원인
check("failure headline", triageFailureHeadline(f409) === "반영하지 못했습니다 — 아무것도 바뀌지 않았습니다"
  && triageFailureHeadline(fNet) !== "반영하지 못했습니다 — 아무것도 바뀌지 않았습니다");
check("p0 cap text", triageFailureText(f409).includes("상한 3개") && triageFailureText(f409).includes("4개") && triageFailureText(f409).includes("p0_cap_exceeded"));
check("stale text", triageFailureText(parseTriageFailure(new Error('409: {"detail":{"error":"stale_candidates","candidates":[]}}'))).includes("최신 후보"));
check("403 text", triageFailureText(parseTriageFailure(new Error('403: {"detail":{"error":"triage_ceo_only"}}'))).includes("대표님만"));
check("network text warns outcome unknown", triageFailureText(fNet).includes("두 번 반영되지 않습니다"));
check("every known code has human text", ["keep_p0_not_active_p0", "goal_not_found", "goal_already_closed", "not_blocked", "merge_into_required",
  "invalid_merge_target", "duplicate_action", "idempotency_key_reused", "idempotency_key_required"].every((c) => {
  const t = triageFailureText(parseTriageFailure(new Error(`422: {"detail":{"error":"${c}"}}`)));
  return t.includes(c) && t.length > 20 && !t.startsWith("서버가 요청을 받아들이지");
}));

if (failed > 0) {
  console.error(`${failed} goalStrip selftest(s) failed`);
  process.exit(1);
}
console.log("goalStrip selftest ok");
