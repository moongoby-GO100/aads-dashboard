// 수정 요청 대상 고정 — 패널(아티팩트 영역)과 입력창(채팅 영역)이 다른 트리라 작은 외부 저장소로 잇는다.
// 입력창이 "수정 요청 모드"일 때만, 다음에 보낸 내 메시지가 서버 /change-intake 로 접수된다. 평소 대화는 건드리지 않는다.
import { useSyncExternalStore } from "react";
import { mockupApi, MockupApiError } from "@/lib/mockupReviewApi";
import {
  describeMockupError, findPersistedUserMessage, intakeBody, keepChangeAttempt, newUuid, resolveMockupTarget, targetKey,
  type IntakeBody, type MockupErrorView, type MockupTarget, type PersistedUserMessage, type TargetResolution,
} from "@/lib/mockupReviewModel";

export type MockupNotice =
  | { kind: "registered"; at: number }
  | { kind: "failed"; at: number; intentId: string | null; error: MockupErrorView | null; reason?: "message_not_found" };

export type PendingIntent = { intentId: string; project: string; body: IntakeBody; createdAt: number };

type State = {
  sessionId: string | null;
  panel: MockupTarget | null;
  reply: MockupTarget | null;
  candidates: MockupTarget[];
  candidatesFailed: boolean;
  chosenKey: string | null;
  armed: MockupTarget | null;
  notice: MockupNotice | null;
};

const EMPTY: State = { sessionId: null, panel: null, reply: null, candidates: [], candidatesFailed: false, chosenKey: null, armed: null, notice: null };
let state: State = EMPTY;
let uiEpoch = 0;
export type MockupUiFence = { sessionId: string; epoch: number };
export function captureMockupUiFence(sessionId: string): MockupUiFence {
  // Capture at send time, before any message lookup or network wait.
  return { sessionId, epoch: state.sessionId === sessionId ? ++uiEpoch : -1 };
}
function isCurrent(fence: MockupUiFence): boolean {
  return fence.sessionId === state.sessionId && fence.epoch === uiEpoch;
}
const listeners = new Set<() => void>();
const INTENT_STORAGE = "aads:mockup:pending-intents";

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function readIntents(): PendingIntent[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(INTENT_STORAGE) ?? "[]") as PendingIntent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIntents(list: PendingIntent[]) {
  try {
    window.sessionStorage.setItem(INTENT_STORAGE, JSON.stringify(list.slice(-20)));
  } catch { /* 저장소를 못 쓰면 이번 화면에서만 재시도할 수 있다 */ }
}

export const mockupTargetStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  // 세션이 바뀌면 대상·후보·장전 상태를 모두 버린다. 다른 세션의 목업을 따라가지 않는다.
  resetForSession(sessionId: string | null) {
    if (state.sessionId !== sessionId) { uiEpoch++; emit({ ...EMPTY, sessionId }); }
  },
  setPanel(sessionId: string, panel: MockupTarget | null) {
    if (state.sessionId !== sessionId) return;
    emit({ ...state, sessionId, panel });
  },
  setReply(sessionId: string, reply: MockupTarget | null) {
    if (state.sessionId !== sessionId) return;
    emit({ ...state, sessionId, reply });
  },
  setCandidates(sessionId: string, candidates: MockupTarget[], failed = false) {
    if (state.sessionId !== sessionId) return;
    emit({ ...state, sessionId, candidates, candidatesFailed: failed });
  },
  choose(key: string | null) {
    emit({ ...state, chosenKey: key });
  },
  arm(target: MockupTarget) {
    uiEpoch++;
    emit({ ...state, sessionId: target.sessionId, armed: target, chosenKey: null, notice: null });
  },
  disarm() {
    uiEpoch++;
    if (state.armed) emit({ ...state, armed: null, chosenKey: null });
  },
  setNotice(notice: MockupNotice | null) {
    emit({ ...state, notice });
  },
  resolve(sessionId: string): TargetResolution {
    return resolveMockupTarget({ sessionId, reply: state.reply, panel: state.panel, candidates: state.candidates, chosenKey: state.chosenKey });
  },
  // 전송 직전 판정. 장전된 대상이 답장·패널과 어긋나면 사용자가 고를 때까지 보내지 않는다.
  sendResolution():
    | { kind: "none" }
    | { kind: "target"; target: MockupTarget }
    | { kind: "ambiguous"; candidates: MockupTarget[] } {
    const armed = state.armed;
    if (!armed) return { kind: "none" };
    if (state.chosenKey === targetKey(armed)) return { kind: "target", target: armed };
    const res = resolveMockupTarget({ sessionId: armed.sessionId, reply: state.reply, panel: state.panel, candidates: state.candidates, chosenKey: state.chosenKey });
    if (res.kind === "ambiguous") return { kind: "ambiguous", candidates: res.candidates };
    if (res.kind === "target" && targetKey(res.target) !== targetKey(armed)) return { kind: "ambiguous", candidates: [armed, res.target] };
    return { kind: "target", target: armed };
  },
  pendingIntents: readIntents,
  dropIntent(intentId: string) {
    writeIntents(readIntents().filter((i) => i.intentId !== intentId));
  },
};

export function useMockupTarget(): State {
  return useSyncExternalStore(mockupTargetStore.subscribe, mockupTargetStore.get, () => EMPTY);
}

// 같은 의도는 같은 change_request_id·idempotency_key 로 다시 보낸다 — 응답 유실 뒤 재시도해도 서버에 중복이 생기지 않는다.
export async function submitPendingIntent(intent: PendingIntent, fence = captureMockupUiFence(intent.body.session_id)): Promise<{ ok: true } | { ok: false; error: MockupErrorView }> {
  try {
    await mockupApi.intakeChange(intent.project, intent.body);
    mockupTargetStore.dropIntent(intent.intentId);
    if (isCurrent(fence)) emit({ ...state, armed: null, chosenKey: null, notice: { kind: "registered", at: Date.now() } });
    return { ok: true };
  } catch (e) {
    const error = e instanceof MockupApiError ? e.view : describeMockupError(0, null);
    if (!keepChangeAttempt(error.status) && error.status !== 401) mockupTargetStore.dropIntent(intent.intentId);
    if (isCurrent(fence)) mockupTargetStore.setNotice({ kind: "failed", at: Date.now(), intentId: intent.intentId, error });
    return { ok: false, error };
  }
}

// 전송이 끝난 뒤 호출한다. 저장된 내 메시지 id 를 읽어 오지 못하면 접수하지 않고 실패를 알린다.
export async function registerMockupChangeAfterSend(opts: {
  uiFence?: MockupUiFence;
  target: MockupTarget; content: string; sentAt: number; replyToId: string | null;
  loadMessages: () => Promise<PersistedUserMessage[]>;
}): Promise<{ ok: boolean }> {
  const fence = opts.uiFence ?? captureMockupUiFence(opts.target.sessionId);
  let messages: PersistedUserMessage[] = [];
  try { messages = await opts.loadMessages(); } catch { messages = []; }
  const saved = findPersistedUserMessage(messages, opts.content, opts.sentAt);
  if (!saved) {
    if (isCurrent(fence)) mockupTargetStore.setNotice({ kind: "failed", at: Date.now(), intentId: null, error: null, reason: "message_not_found" });
    return { ok: false };
  }
  const body = intakeBody(opts.target, { changeRequestId: newUuid(), idempotencyKey: newUuid(), sourceMessageId: saved.id }, opts.content, opts.replyToId);
  const intent: PendingIntent = { intentId: saved.id, project: opts.target.project, body, createdAt: Date.now() };
  writeIntents([...readIntents().filter((i) => i.intentId !== intent.intentId), intent]);
  const r = await submitPendingIntent(intent, fence);
  return { ok: r.ok };
}
