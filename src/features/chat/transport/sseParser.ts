export type FetchSseFrame = {
  data: string;
  event: string;
  id: string | null;
  lastEventId: string;
  retry: number | null;
};

/** Incremental WHATWG event-stream parser for fetch ReadableStream bodies. */
export class FetchSseParser {
  private readonly decoder = new TextDecoder("utf-8");
  private buffer = "";
  private firstCharacter = true;
  private dataBuffer = "";
  private eventType = "";
  private lastEventIdBuffer = "";
  private eventIdTouched = false;
  private retry: number | null = null;

  push(chunk: Uint8Array): FetchSseFrame[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.process(false);
  }

  finish(): FetchSseFrame[] {
    this.buffer += this.decoder.decode();
    // The HTML algorithm discards an unterminated event at EOF. Complete
    // physical lines are still parsed, but no synthetic blank line is added.
    return this.process(true);
  }

  private process(final: boolean): FetchSseFrame[] {
    const frames: FetchSseFrame[] = [];
    while (true) {
      const ending = this.findLineEnding(final);
      if (!ending) break;
      let line = this.buffer.slice(0, ending.index);
      this.buffer = this.buffer.slice(ending.index + ending.length);
      if (this.firstCharacter) {
        this.firstCharacter = false;
        if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      }
      const frame = this.processLine(line);
      if (frame) frames.push(frame);
    }
    if (final) {
      if (this.firstCharacter && this.buffer.charCodeAt(0) === 0xfeff) this.buffer = this.buffer.slice(1);
      this.firstCharacter = false;
      if (this.buffer) this.processLine(this.buffer);
      this.buffer = "";
    }
    return frames;
  }

  private findLineEnding(final: boolean): { index: number; length: number } | null {
    for (let index = 0; index < this.buffer.length; index += 1) {
      const char = this.buffer.charCodeAt(index);
      if (char === 0x0a) return { index, length: 1 };
      if (char !== 0x0d) continue;
      if (index + 1 >= this.buffer.length && !final) return null;
      return {
        index,
        length: this.buffer.charCodeAt(index + 1) === 0x0a ? 2 : 1,
      };
    }
    return null;
  }

  private processLine(line: string): FetchSseFrame | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.dataBuffer += `${value}\n`;
    else if (field === "event") this.eventType = value;
    else if (field === "id" && !value.includes("\0")) {
      this.lastEventIdBuffer = value;
      this.eventIdTouched = true;
    } else if (field === "retry" && /^\d+$/.test(value)) {
      this.retry = Number(value);
    }
    return null;
  }

  private dispatch(): FetchSseFrame | null {
    if (!this.dataBuffer) {
      this.eventType = "";
      this.eventIdTouched = false;
      return null;
    }
    const frame: FetchSseFrame = {
      data: this.dataBuffer.slice(0, -1),
      event: this.eventType || "message",
      id: this.eventIdTouched ? this.lastEventIdBuffer : null,
      lastEventId: this.lastEventIdBuffer,
      retry: this.retry,
    };
    this.dataBuffer = "";
    this.eventType = "";
    this.eventIdTouched = false;
    return frame;
  }
}

export async function* parseFetchSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<FetchSseFrame> {
  const reader = body.getReader();
  const parser = new FetchSseParser();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of parser.push(value)) yield frame;
    }
    if (!signal?.aborted) {
      for (const frame of parser.finish()) yield frame;
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
