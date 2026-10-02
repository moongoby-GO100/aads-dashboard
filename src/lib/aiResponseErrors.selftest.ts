import {
  classifyFailure,
  dailyBuckets,
  describeDetail,
  formatKst,
  isAiResponseErrorsResponse,
  judgeRecurrence,
  kindLabel,
  kstDay,
  type AiResponseErrorItem,
} from "./aiResponseErrors";

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${name}: got ${a}, expected ${e}`);
}

function item(over: Partial<AiResponseErrorItem>): AiResponseErrorItem {
  return {
    kind: "llm_outage",
    occurred_at: "2026-10-02T03:00:00+00:00",
    source_table: "chat_messages",
    source_id: "1",
    session_id: null,
    model_used: null,
    summary: "",
    detail: null,
    error_book_key: null,
    ...over,
  };
}

// 라벨: 내부 kind 문자열이 새지 않는다
check("label outage", kindLabel("llm_outage"), "장애 응답");
check("label fallback", kindLabel("fallback_exhausted"), "폴백 소진");
check("label quality", kindLabel("low_quality"), "저품질");
check("label book", kindLabel("error_book_chat"), "오류 사전");
check("label unknown", kindLabel("something_new"), "기타 응답 오류");

// KST 날짜: UTC 15:00 이후는 KST 다음 날
check("kstDay rollover", kstDay("2026-10-01T15:30:00+00:00"), "2026-10-02");
check("kstDay same", kstDay("2026-10-01T14:59:00+00:00"), "2026-10-01");
check("kstDay bad", kstDay("nope"), "");
check("formatKst", formatKst("2026-10-01T15:30:00+00:00"), "2026-10-02 00:30");
check("formatKst null", formatKst(null), "-");

// 일별 집계: 빈 날도 0, 범위 밖 제외, kind별 분리
const now = new Date("2026-10-02T06:00:00+00:00");
const buckets = dailyBuckets(
  [
    item({ occurred_at: "2026-10-02T01:00:00+00:00" }),
    item({ occurred_at: "2026-10-02T02:00:00+00:00", kind: "low_quality" }),
    item({ occurred_at: "2026-09-30T01:00:00+00:00" }),
    item({ occurred_at: "2026-09-20T01:00:00+00:00" }),
  ],
  3,
  now,
);
check("bucket days", buckets.map((b) => b.day), ["2026-09-30", "2026-10-01", "2026-10-02"]);
check("bucket totals", buckets.map((b) => b.total), [1, 0, 2]);
check("bucket kinds", buckets[2].byKind, { llm_outage: 1, low_quality: 1 });

// 재발 판정
const periodStartMs = Date.parse("2026-09-25T00:00:00+00:00");
const noWider = { periodStartMs, widerItems: [] as AiResponseErrorItem[] };

const oldFallback = item({
  kind: "fallback_exhausted",
  detail: { first_seen: "2026-09-01T00:00:00+00:00", occurrence_count: 12 },
});
check("fallback prior", judgeRecurrence(oldFallback, noWider).state, "prior");

const newFallback = item({
  kind: "fallback_exhausted",
  detail: { first_seen: "2026-09-30T00:00:00+00:00", occurrence_count: 3 },
});
const newFallbackResult = judgeRecurrence(newFallback, noWider);
check("fallback new", newFallbackResult.state, "new");
if (!newFallbackResult.reason.includes("3회")) throw new Error("new fallback reason should mention repeats");

const keyed = item({ kind: "error_book_chat", source_id: "now", error_book_key: "chat.x" });
const keyedPrior = item({
  kind: "error_book_chat",
  source_id: "old",
  error_book_key: "chat.x",
  occurred_at: "2026-09-10T00:00:00+00:00",
});
check("key prior", judgeRecurrence(keyed, { periodStartMs, widerItems: [keyedPrior, keyed] }).state, "prior");
check("key not self", judgeRecurrence(keyed, { periodStartMs, widerItems: [keyed] }).state, "new");

const bookRecurred = item({ kind: "error_book_chat", detail: { recurrence_count: 2 } });
check("book recurrence_count", judgeRecurrence(bookRecurred, noWider).state, "prior");

// 식별자 없는 채팅 오류는 추측하지 않는다
check("no identity", judgeRecurrence(item({}), noWider).state, "na");
check("low quality na", judgeRecurrence(item({ kind: "low_quality", detail: { quality_score: 0.2 } }), noWider).state, "na");

// 상세 문구: 내부 키 이름 없이 업무 문구
check("detail quality", describeDetail(item({ detail: { quality_score: 0.25, intent: "chat" } })), "품질 0.25 · 의도 chat");
check("detail null", describeDetail(item({ detail: null })), "");

// 실패 분류
check("net", classifyFailure(null).reason, "network");
check("401", classifyFailure(401).action, "login");
check("403", classifyFailure(403).reason, "forbidden");
check("503 view", classifyFailure(503, { detail: "ai_response_errors view not installed" }).reason, "view_missing");
check("503 other", classifyFailure(503, { detail: "overloaded" }).reason, "server");
check("500", classifyFailure(500).reason, "server");
check("422", classifyFailure(422).reason, "bad_response");
if (classifyFailure(503, { detail: "ai_response_errors view not installed" }).title !== "조회 뷰가 아직 운영 DB에 적용되지 않았습니다") {
  throw new Error("503 view message must match the agreed wording");
}

// 응답 계약 검사
check("contract ok", isAiResponseErrorsResponse({ summary: { total: 0, by_kind: {} }, items: [] }), true);
check("contract bad", isAiResponseErrorsResponse({ items: [] }), false);
check("contract null", isAiResponseErrorsResponse(null), false);

console.log("aiResponseErrors selftest: OK");
