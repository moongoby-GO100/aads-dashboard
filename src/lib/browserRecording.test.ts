import { afterEach, describe, expect, it, vi } from "vitest";
import { canStartRecording, completeRecordingStart, recordingContext, recordingPage, sameRecordingIdentity, type RecordingIdentity } from "./browserRecording";

import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

const pc: RecordingIdentity = { sessionId: "123456789012-more", lane: "pc", agentId: "pc-1" };
const server: RecordingIdentity = { lane: "server", selectedId: "task-1" };

describe("manual browser recording", () => {
  it("allows PC without a server task only when connected and scoped", () => {
    expect(canStartRecording(pc, "live", false)).toBe(true);
    expect(canStartRecording(pc, "failed", false)).toBe(false);
    expect(canStartRecording({ ...pc, sessionId: undefined }, "live", false)).toBe(false);
    expect(canStartRecording({ ...pc, agentId: "" }, "live", false)).toBe(false);
    expect(canStartRecording(pc, "live", true)).toBe(false);
  });
  it("preserves the server handler without a live connection guard", () => {
    for (const connection of ["idle", "connecting", "failed", "live"]) {
      expect(canStartRecording(server, connection, false)).toBe(true);
    }
    expect(canStartRecording({ ...server, selectedId: undefined }, "live", false)).toBe(false);
  });
  it("validates HTTP URLs and extracts hostname without port or path", () => {
    expect(recordingPage("https://example.com:8443/path?q=x")).toEqual({ url: "https://example.com:8443/path?q=x", domain: "example.com" });
    for (const url of ["", "broken", "javascript:alert(1)", "file:///tmp/x", "about:blank"]) expect(recordingPage(url)).toBeNull();
    expect(recordingPage("http://localhost/path")?.domain).toBe("localhost");
  });
  it("generates the chat key and omits empty server keys and absent credentials", () => {
    expect(recordingContext(pc)).toEqual({ lane: "pc", browser_work_key: "chat-123456789012" });
    expect(recordingContext(server, "  ")).toEqual({ lane: "server" });
    expect(recordingContext(server, undefined, {})).toEqual({ lane: "server" });
    const scope = { account: { credential_id: "vault-id", field: "password" as const } };
    expect(recordingContext(server, "work", scope)).toEqual({ lane: "server", browser_work_key: "work", credential_scope: scope });
  });
  it("rejects stale responses for every captured identity dimension", () => {
    const captured = { ...pc, selectedId: "task-1" };
    expect(sameRecordingIdentity(captured, { ...captured })).toBe(true);
    for (const update of [{ sessionId: "other" }, { lane: "server" as const }, { selectedId: "task-2" }, { agentId: "pc-2" }]) {
      expect(sameRecordingIdentity(captured, { ...captured, ...update })).toBe(false);
    }
  });
});

describe("recording response boundaries", () => {
  it("does not save or enable recording after selection changes before start resolves", async () => {
    let resolve!: (id: string) => void;
    const request = new Promise<string>((done) => { resolve = done; });
    let current = true;
    const save = vi.fn(async () => ({ step_count: 1 }));
    const apply = vi.fn();
    const result = completeRecordingStart(request, () => current, save, apply);
    current = false;
    resolve("recording-1");
    await result;
    expect(save).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("does not enable recording after selection changes while the initial step is pending", async () => {
    let resolve!: (value: { step_count: number }) => void;
    const step = new Promise<{ step_count: number }>((done) => { resolve = done; });
    let current = true;
    const apply = vi.fn();
    const save = vi.fn(() => step);
    const result = completeRecordingStart(Promise.resolve("recording-1"), () => current, save, apply);
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith("recording-1");
    current = false;
    resolve({ step_count: 1 });
    await result;
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies a completed start for the same selection", async () => {
    const apply = vi.fn();
    await completeRecordingStart(Promise.resolve("recording-1"), () => true, async () => ({ step_count: 1 }), apply);
    expect(apply).toHaveBeenCalledWith({ step_count: 1 });
  });
});

describe("recording API payloads", () => {
  it("omits missing optional fields on start and step", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ recording_id: "id", step_count: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const context = recordingContext(server, "");
    await api.startOhvisRecipeRecording({ name: "test", domain: "example.com", ...context });
    await api.recordOhvisRecipeStep("id", { action: "navigate" }, context);
    const bodies = fetcher.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toEqual({ name: "test", domain: "example.com", lane: "server" });
    expect(bodies[1]).toEqual({ payload: { action: "navigate" }, succeeded: true, lane: "server" });
  });
  it("forwards the same credential references and PC context to start and steps", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ recording_id: "id", step_count: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const context = recordingContext(pc, undefined, { account: { credential_id: "vault-id", field: "username" } });
    await api.startOhvisRecipeRecording({ name: "test", domain: "example.com", ...context });
    await api.recordOhvisRecipeStep("id", { action: "navigate" }, context);
    for (const call of fetcher.mock.calls) {
      const body = JSON.parse((call as unknown as [string, RequestInit])[1].body as string);
      expect(body).toMatchObject(context);
    }
  });
});
