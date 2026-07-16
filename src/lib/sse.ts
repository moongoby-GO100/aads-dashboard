import type { SSEEvent } from "@/types";

export function connectSSE(
  projectId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void
): () => void {
  let cancelled = false;
  let retries = 0;
  const maxRetries = 3;
  const backoff = [1000, 2000, 4000];

  async function connect() {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1"}/projects/${projectId}/stream`,
        { method: "POST" }
      );
      if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              onEvent(parsed as SSEEvent);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
      retries = 0;
    } catch (err) {
      if (cancelled) return;
      if (retries < maxRetries) {
        setTimeout(connect, backoff[retries++]);
      } else {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  connect();
  return () => { cancelled = true; };
}
