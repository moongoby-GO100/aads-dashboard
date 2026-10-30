import { intakeView, intakeError, shouldRenderIntakeCard, type IntakeResponse, type IntakeQuestion } from "./designIntakeModel";
function assert(value: unknown, label: string): asserts value { if (!value) throw new Error(label); }
const question: IntakeQuestion = { id: "q1", area: "layout", question: "배치는?", options: ["A", "B", "C", "기타(직접 입력)", "잘 모름—권장값", "A"], recommended: "B", answer: null, answer_source: null, confirmed_at: null };
const data: IntakeResponse = { session_id: "s", round: 1, questions: [question], brief: { goal: "shop" }, brief_confirmed: false, brief_confirmed_at: null };
assert(intakeView(data).question?.id === "q1", "first unanswered question");
assert(intakeView(data).options.join() === "A,B,C", "three examples, no duplicate special choices");
const saved = { ...question, answer: "B", answer_source: "unknown" as const, confirmed_at: "2026-10-30" };
const review = intakeView({ ...data, questions: [saved] });
assert(review.phase === "review" && review.answered === 1, "unknown recommendation accepted by server reaches review");
assert(review.brief.goal === "shop" && review.brief.answers[0].answer === "B", "summary preserves brief and server answer");
assert(intakeView({ ...data, questions: [saved], brief_confirmed: true }).phase === "confirmed", "confirmed response");
assert(intakeView({ ...data, questions: [] }).phase === "question", "empty questions never enable confirmation");
assert(intakeView({ ...data, questions: [{ ...saved, confirmed_at: null }] }).question !== null, "unconfirmed answer stays pending");
assert(intakeView({ ...data, questions: [saved, { ...question, id: "q2" }] }).question?.id === "q2", "restore first pending question");
for (const source of ["user", "user_other", "unknown"] as const) {
  assert(intakeView({ ...data, questions: [{ ...saved, answer_source: source }] }).phase === "review", `source ${source}`);
}
assert(intakeError(401).includes("인증"), "401 reason");
assert(intakeError(409).includes("최신"), "409 recovery");
assert(intakeError(0).includes("네트워크"), "network reason");
assert(intakeError(400, "invalid answer").includes("invalid answer"), "server reason preserved");
assert(data.questions[0].answer === null && data.brief?.goal === "shop", "pure conversion leaves input unchanged");
assert(intakeView({ ...data, session_id: null, questions: [] }).hidden, "empty by-chat hides card");
assert(!intakeView(data).hidden, "linked questions show card");
assert(intakeView(data).step === 0, "round one step");
assert(intakeView({ ...data, round: 2 }).step === 1, "round two step");
assert(intakeView({ ...data, round: 2, questions: [saved] }).step === 2, "completed round reaches brief review");
assert(intakeView({ ...data, questions: [saved], brief_confirmed: true }).step === 2, "confirmed brief step");
assert(!shouldRenderIntakeCard(null, "API unavailable"), "initial lookup error hides card");
assert(!shouldRenderIntakeCard({ ...data, session_id: null, questions: [] }, null), "empty lookup response hides card");
assert(shouldRenderIntakeCard(data, "answer failed"), "existing questions remain visible after error");
assert(shouldRenderIntakeCard(data, null), "existing questions render without error");
console.log("PASS: design intake response states (by-chat visibility and round checks included)");
