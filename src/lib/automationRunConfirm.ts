// "○○를 실행할까요?" 확인 카드의 순수 로직. 문장·버튼 라벨은 서버 card 를 그대로 쓴다.
import { asDraftId, type AutomationCardButton } from "./automationDraft";
import { COPY } from "./automationCopy";

export interface RunConfirmation {
  draftId: string;
  headline: string;
  body: string;
  buttons: AutomationCardButton[];
  directive: string;
}

export type RunConfirmPhase = "idle" | "sending" | "done" | "declined" | "error";

export interface RunConfirmState {
  phase: RunConfirmPhase;
  errorStatus: number;
  errorCode: string;
}

export const RUN_CONFIRM_INITIAL: RunConfirmState = { phase: "idle", errorStatus: 0, errorCode: "" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseButtons(raw: unknown): AutomationCardButton[] {
  if (!Array.isArray(raw)) return [];
  const out: AutomationCardButton[] = [];
  for (const item of raw) {
    const rec = record(item);
    const id = text(rec?.id);
    const label = text(rec?.label);
    if (!id || !label) continue;
    out.push({ id, label, primary: rec?.primary === true });
  }
  return out;
}

// 서버 응답이 확인 요청이면 카드 데이터로 바꾼다. 아니면 null.
export function parseRunConfirmation(raw: unknown, directive: string): RunConfirmation | null {
  const rec = record(raw);
  if (!rec || rec.status !== "confirmation_required") return null;
  const draftId = asDraftId(rec.draft_id);
  const command = String(directive ?? "").trim();
  if (!draftId || !command) return null;
  const card = record(rec.card);
  const buttons = parseButtons(card?.buttons);
  const run = buttons.find((b) => b.id === "confirm_run");
  const decline = buttons.find((b) => b.id === "decline_run");
  const title = text(rec.draft_title) || text(card?.title);
  return {
    draftId,
    headline: text(card?.headline) || COPY.runConfirmHeadline,
    body: text(card?.body) || (title ? COPY.runConfirmBody(title) : COPY.runConfirmBodyPlain),
    buttons: [
      run ?? { id: "confirm_run", label: COPY.runConfirmRun, primary: true },
      decline ?? { id: "decline_run", label: COPY.runConfirmDecline, primary: false },
    ],
    directive: command,
  };
}

// 채팅 도구 결과는 문자열(JSON)로 온다. JSON 이 아니면 null.
export function parseRunConfirmationText(content: unknown, directive: string): RunConfirmation | null {
  if (typeof content !== "string" || !content.includes("confirmation_required")) return null;
  const start = content.indexOf("{");
  if (start < 0) return null;
  try {
    return parseRunConfirmation(JSON.parse(content.slice(start)), directive);
  } catch {
    return null;
  }
}

// 같은 지시를 확인 표시와 함께 다시 보낸다.
export function confirmedCommandBody(
  c: RunConfirmation, sessionId?: string,
): { title: string; confirmed_draft_id: string; session_id?: string } {
  const body: { title: string; confirmed_draft_id: string; session_id?: string } = {
    title: c.directive, confirmed_draft_id: c.draftId,
  };
  if (sessionId) body.session_id = sessionId;
  return body;
}

export type RunConfirmEvent =
  | { type: "run" }
  | { type: "decline" }
  | { type: "ok" }
  | { type: "fail"; status: number; code: string };

// 두 번 눌러도 한 번만 보낸다: sending 중 run 은 상태를 바꾸지 않고, 호출부는 canStartRun 으로 거른다.
export function canStartRun(state: RunConfirmState): boolean {
  return state.phase === "idle" || state.phase === "error";
}

export function reduceRunConfirm(state: RunConfirmState, event: RunConfirmEvent): RunConfirmState {
  switch (event.type) {
    case "run":
      return canStartRun(state) ? { phase: "sending", errorStatus: 0, errorCode: "" } : state;
    case "decline":
      return state.phase === "idle" || state.phase === "error" ? { phase: "declined", errorStatus: 0, errorCode: "" } : state;
    case "ok":
      return state.phase === "sending" ? { phase: "done", errorStatus: 0, errorCode: "" } : state;
    case "fail":
      return state.phase === "sending" ? { phase: "error", errorStatus: event.status, errorCode: event.code } : state;
    default:
      return state;
  }
}
