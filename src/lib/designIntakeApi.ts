import { chatApi, ChatApiError } from "@/app/chat/api";
import { intakeError, type IntakeAnswer, type IntakeResponse } from "./designIntakeModel";

async function request<T>(id: string, suffix = "", body?: unknown, byChat = false): Promise<T> {
  try {
    return await chatApi<T>(`/design/intake/${(byChat ? "by-chat/" : "") + encodeURIComponent(id)}${suffix}`, body === undefined
      ? { cache: "no-store", signal: AbortSignal.timeout(30000) }
      : { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }, { softAuth: true });
  } catch (error) {
    throw new Error(intakeError(error instanceof ChatApiError ? error.status : 0,
      error instanceof ChatApiError ? error.message : undefined));
  }
}
export const designIntakeApi = {
  byChat: (chatSessionId: string) => request<IntakeResponse>(chatSessionId, "", undefined, true),
  get: (id: string) => request<IntakeResponse>(id),
  answer: (id: string, body: IntakeAnswer) => request<{ question_id: string; answer: string; answer_source: string; confirmed_at: string; brief_confirmed: false }>(id, "/answers", body),
  confirm: (id: string, brief: Record<string, unknown>) => request<{ session_id: string; brief: Record<string, unknown>; brief_confirmed: true; brief_confirmed_at: string }>(id, "/confirm", { brief }),
};
