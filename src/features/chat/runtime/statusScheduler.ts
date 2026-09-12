type TimerHandle = ReturnType<typeof setTimeout>;

export type StatusTaskContext = {
  signal: AbortSignal;
  sessionId: string;
  sessionEpoch: number;
  requestRevision: number;
  isCurrent(): boolean;
  acceptRevision(revision: string | null | undefined): boolean;
};

type SchedulerOptions = {
  initialDelayMs?: number;
  delayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
};

function decimal(value: string): bigint | null {
  return /^(?:0|[1-9]\d*)$/.test(value) ? BigInt(value) : null;
}

export class SingleFlightStatusScheduler {
  private timer: TimerHandle | null = null;
  private controller: AbortController | null = null;
  private epoch = 0;
  private stopped = true;
  private inFlight = false;
  private requestRevision = 0;
  private lastAcceptedRevision: string | null = null;
  private sessionId = "";
  private readonly initialDelayMs: number;
  private readonly delayMs: number;
  private readonly scheduleTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly cancelTimer: (handle: TimerHandle) => void;

  constructor(options: SchedulerOptions = {}) {
    this.initialDelayMs = options.initialDelayMs ?? 1_500;
    this.delayMs = options.delayMs ?? 1_500;
    this.scheduleTimer = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    this.cancelTimer = options.cancel || ((handle) => clearTimeout(handle));
  }

  start(sessionId: string, task: (context: StatusTaskContext) => Promise<void>): () => void {
    this.stop();
    this.stopped = false;
    this.sessionId = sessionId;
    this.lastAcceptedRevision = null;
    const epoch = ++this.epoch;
    const scheduleNext = (delay: number) => {
      if (this.stopped || epoch !== this.epoch) return;
      this.timer = this.scheduleTimer(() => {
        this.timer = null;
        void run();
      }, delay);
    };
    const run = async () => {
      if (this.stopped || epoch !== this.epoch || this.inFlight) return;
      this.inFlight = true;
      const controller = new AbortController();
      this.controller = controller;
      const requestRevision = ++this.requestRevision;
      const isCurrent = () => !this.stopped
        && epoch === this.epoch
        && this.sessionId === sessionId
        && !controller.signal.aborted
        && this.controller === controller;
      const acceptRevision = (revision: string | null | undefined) => {
        if (!isCurrent()) return false;
        if (!revision) return true;
        if (revision === this.lastAcceptedRevision) return true;
        if (this.lastAcceptedRevision) {
          const next = decimal(revision);
          const previous = decimal(this.lastAcceptedRevision);
          if (next !== null && previous !== null && next < previous) return false;
        }
        this.lastAcceptedRevision = revision;
        return true;
      };
      try {
        await task({ signal: controller.signal, sessionId, sessionEpoch: epoch, requestRevision, isCurrent, acceptRevision });
      } catch {
        // Status is advisory. The next completion-based tick retries unless
        // stop()/a session epoch change invalidated this request.
      } finally {
        const stillOwnsFlight = this.controller === controller;
        const shouldContinue = !this.stopped && epoch === this.epoch && this.sessionId === sessionId;
        if (stillOwnsFlight) {
          this.controller = null;
          this.inFlight = false;
          if (shouldContinue) scheduleNext(this.delayMs);
        }
      }
    };
    scheduleNext(this.initialDelayMs);
    return () => this.stop();
  }

  stop(): void {
    this.stopped = true;
    this.epoch += 1;
    if (this.timer !== null) this.cancelTimer(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.inFlight = false;
  }
}
