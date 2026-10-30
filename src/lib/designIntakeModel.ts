// 선행 design_intake.py HTTP 계약. session_id는 채팅 ID가 아닌 질문 세션 ID다.
export type AnswerSource = "user" | "user_other" | "unknown";
export interface IntakeQuestion {
  id: string;
  area: string;
  question: string;
  options: string[];
  recommended: string | null;
  answer: string | null;
  answer_source: AnswerSource | null;
  confirmed_at: string | null;
}
export interface IntakeResponse {
  session_id: string | null;
  round: number;
  questions: IntakeQuestion[];
  brief: Record<string, unknown> | null;
  brief_confirmed: boolean;
  brief_confirmed_at: string | null;
}
export interface IntakeAnswer { question_id: string; answer: string; answer_source: AnswerSource }
export const INTAKE_STEPS = ["1차 질문", "2차 질문", "브리프 확인"] as const;
export function shouldRenderIntakeCard(data: IntakeResponse | null, _error: string | null): boolean {
  return data !== null && !intakeView(data).hidden;
}
export function intakeView(data: IntakeResponse) {
  const answered = (q: IntakeQuestion) => Boolean(q.answer?.trim() && q.confirmed_at && q.answer_source);
  const question = data.questions.find(q => !answered(q)) ?? null;
  const complete = data.questions.length > 0 && !question;
  const brief: Record<string, unknown> & { answers: Array<{ question_id: string; question: string; answer: string | null; answer_source: AnswerSource | null }> } = {
    ...data.brief, answers: data.questions.map(q => ({ question_id: q.id, question: q.question, answer: q.answer, answer_source: q.answer_source })),
  };
  return {
    hidden: data.session_id === null && data.questions.length === 0,
    step: complete ? 2 : data.round === 2 ? 1 : 0,
    phase: complete ? (data.brief_confirmed ? "confirmed" : "review") : "question",
    question,
    answered: data.questions.filter(answered).length,
    total: data.questions.length,
    options: question ? [...new Set(question.options.filter(x => x.trim() && !["기타(직접 입력)", "잘 모름—권장값"].includes(x)))] : [],
    // 기존 브리프 속성을 보존하며 실제 서버가 수락한 답을 확인 화면과 POST에 동일하게 사용한다.
    brief,
  };
}
export function intakeError(status: number, reason?: string): string {
  const label = status === 401 ? "로그인 인증을 확인한 뒤 다시 시도해 주세요."
    : status === 409 ? "질문 상태가 변경되었거나 권장 답변이 없습니다. 최신 질문을 불러와 주세요."
    : status === 0 ? "네트워크 연결을 확인해 주세요." : "질문 처리에 실패했습니다.";
  return reason ? `${label} (${reason})` : label;
}
