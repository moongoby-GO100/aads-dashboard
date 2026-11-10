/** Serialize writes per session: ignoring stale responses alone cannot protect DB order. */
export class ChatModelSaveQueue {
  private tails = new Map<string, Promise<void>>();
  private states = new Map<string, { model: string; version: number; status: "saving" | "error" | "saved" }>();
  constructor(private timeoutMs = 15000) {}
  pendingModel(sessionId: string) {
    const state = this.get(sessionId);
    return state?.status !== "saved" ? state?.model : undefined;
  }
  get(sessionId: string) { return this.states.get(sessionId); }
  async save(sessionId: string, model: string, write: (signal: AbortSignal) => Promise<unknown>, notify: () => void) {
    const version = (this.get(sessionId)?.version || 0) + 1;
    this.states.set(sessionId, { model, version, status: "saving" });
    notify();
    const task = (this.tails.get(sessionId) || Promise.resolve()).then(async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve().then(() => write(controller.signal)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("모델 저장 시간 초과"));
            }, this.timeoutMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    });
    const tail = task.then(() => {}, () => {});
    this.tails.set(sessionId, tail);
    try {
      await task;
      if (this.get(sessionId)?.version === version) {
        this.states.set(sessionId, { model, version, status: "saved" });
      }
    } catch {
      if (this.get(sessionId)?.version === version) {
        this.states.set(sessionId, { model, version, status: "error" });
      }
    } finally {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
      notify();
    }
  }
}

/** Every retry reads a fresh DB version; abandoned writes retain their old fence. */
export async function saveChatModelFenced<T extends { current_model?: string | null; updated_at?: string; model_selection_guard?: boolean }>(
  sessionId: string, model: string, signal: AbortSignal,
  request: <R>(path: string, opts?: RequestInit) => Promise<R>,
): Promise<T> {
  const path = `/chat/sessions/${sessionId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const before = await request<T>(path, { signal, cache: "no-store" });
    signal.throwIfAborted();
    if (!before.updated_at) throw new Error("모델 저장 버전을 확인할 수 없습니다.");
    try {
      const saved = await request<T>(path, {
        method: "PUT", signal,
        body: JSON.stringify({ current_model: model, expected_updated_at: before.updated_at }),
      });
      signal.throwIfAborted();
      if (!saved.model_selection_guard || saved.current_model !== model) {
        throw new Error("모델 저장을 확인할 수 없습니다. 다시 시도해 주세요.");
      }
      return saved;
    } catch (error) {
      signal.throwIfAborted();
      if ((error as { status?: number }).status !== 409 || attempt === 2) throw error;
    }
  }
  throw new Error("모델 저장 충돌: 다시 저장해 주세요.");
}
