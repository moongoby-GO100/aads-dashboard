/**
 * Privacy-safe, transport-agnostic chat telemetry records.
 *
 * This module deliberately does not send data. Callers receive a validated record
 * that an application-owned sink may sample and export. Metric labels are selected
 * only from the finite vocabularies below; release/report correlation is kept out
 * of labels so it cannot create unbounded metric series.
 */

export const CHAT_TELEMETRY_EVENTS = [
  "chat.viewport_write",
  "chat.event_apply",
  "chat.recovery",
  "chat.command",
  "chat.render",
  "chat.query",
  "chat.lease",
] as const;

export type ChatTelemetryEventName = (typeof CHAT_TELEMETRY_EVENTS)[number];

const LABEL_VALUES = {
  "chat.viewport_write": {
    reason: ["initial", "restore_session", "user_send", "jump_latest", "prepend", "hydrate", "content_resize", "anchor_removed"],
    follow_mode: ["auto", "manual"],
    adapter: ["dom", "virtuoso"],
    outcome: ["applied", "blocked_gesture", "stale", "noop"],
  },
  "chat.event_apply": {
    event_type: ["message_delta", "message_snapshot", "message_final", "execution_phase", "tool", "command", "artifact", "usage", "stream_reset", "heartbeat", "unknown"],
    outcome: ["applied", "duplicate", "stale", "invalid", "ignored_additive"],
  },
  "chat.recovery": {
    mechanism: ["reconnect", "snapshot", "model_resume"],
    reason: ["transport_eof", "timeout", "offline", "cursor_expired", "coverage_mismatch", "protocol_invalid", "manual"],
    outcome: ["started", "succeeded", "failed", "cancelled"],
  },
  "chat.command": {
    kind: ["send", "interrupt", "stop", "resume", "edit", "regenerate", "continue", "branch"],
    phase: ["receipt", "queued", "claim", "applied", "failed", "cancelled"],
    outcome: ["accepted", "deduplicated", "conflict", "retryable_error", "terminal_error"],
  },
  "chat.render": {
    surface: ["timeline", "active_response", "composer", "artifact_panel", "status"],
    route: ["chat"],
    outcome: ["completed", "failed", "cancelled"],
  },
  "chat.query": {
    projection: ["minimal", "render", "full", "status", "artifact"],
    outcome: ["fetched", "unchanged", "aborted", "failed", "snapshot_required"],
    skip_reason: ["none", "revision_unchanged", "panel_closed", "stale_scope", "offline"],
  },
  "chat.lease": {
    operation: ["claim", "renew", "release", "terminal_write", "retry_refund"],
    outcome: ["accepted", "epoch_mismatch", "expired", "inactive_slot", "failed"],
  },
} as const satisfies Record<ChatTelemetryEventName, Record<string, readonly string[]>>;

const MEASUREMENT_KEYS = {
  "chat.viewport_write": ["delta_px", "gesture_epoch"],
  "chat.event_apply": ["sequence"],
  "chat.recovery": ["latency_ms", "attempt"],
  "chat.command": ["age_ms", "attempt"],
  "chat.render": ["duration_ms", "input_latency_ms", "long_task_ms"],
  "chat.query": ["rows", "bytes", "latency_ms"],
  "chat.lease": ["owner_epoch", "renew_latency_ms", "refund_count"],
} as const satisfies Record<ChatTelemetryEventName, readonly string[]>;

const SECRET_PATTERN = /(?:sk-(?:ant|proj|live|test)-|bearer\s+|authorization|cookie|password|secret|token[=:])/i;
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const MAX_MEASUREMENT = 1_000_000_000;
const INPUT_KEYS = new Set(["name", "labels", "measurements", "correlation", "observedAtMs"]);
const CORRELATION_KEYS = new Set(["releaseId", "reportId"]);

export type ChatTelemetryInput = {
  name: ChatTelemetryEventName;
  labels?: Readonly<Record<string, unknown>>;
  measurements?: Readonly<Record<string, unknown>>;
  correlation: {
    releaseId: string;
    reportId: string;
  };
  observedAtMs?: number;
};

export type ChatTelemetryRecord = {
  name: ChatTelemetryEventName;
  labels: Readonly<Record<string, string>>;
  measurements: Readonly<Record<string, number>>;
  correlation: Readonly<{
    releaseId: string;
    reportId: string;
  }>;
  observedAtMs: number;
};

export type ChatTelemetryResult =
  | { ok: true; record: ChatTelemetryRecord }
  | { ok: false; reason: "invalid_event" | "invalid_label" | "invalid_measurement" | "invalid_correlation" };

function finiteRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validCorrelation(value: unknown): value is string {
  return typeof value === "string"
    && CORRELATION_PATTERN.test(value)
    && !SECRET_PATTERN.test(value);
}

function normalizeLabels(
  name: ChatTelemetryEventName,
  input: unknown,
): Readonly<Record<string, string>> | null {
  if (input === undefined) return Object.freeze({});
  if (!finiteRecord(input)) return null;
  const schema = LABEL_VALUES[name] as Readonly<Record<string, readonly string[]>>;
  const output: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== "string" || SECRET_PATTERN.test(rawValue)) return null;
    const values = schema[key];
    if (!values?.includes(rawValue)) return null;
    output[key] = rawValue;
  }
  return Object.freeze(output);
}

function normalizeMeasurements(
  name: ChatTelemetryEventName,
  input: unknown,
): Readonly<Record<string, number>> | null {
  if (input === undefined) return Object.freeze({});
  if (!finiteRecord(input)) return null;
  const allowed = MEASUREMENT_KEYS[name] as readonly string[];
  const output: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!allowed.includes(key) || typeof rawValue !== "number" || !Number.isFinite(rawValue)) return null;
    output[key] = Math.max(-MAX_MEASUREMENT, Math.min(MAX_MEASUREMENT, rawValue));
  }
  return Object.freeze(output);
}

export function createChatTelemetryRecord(input: unknown): ChatTelemetryResult {
  if (!finiteRecord(input) || !CHAT_TELEMETRY_EVENTS.includes(input.name as ChatTelemetryEventName)) {
    return { ok: false, reason: "invalid_event" };
  }
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    return { ok: false, reason: "invalid_event" };
  }
  if (!finiteRecord(input.correlation)
      || Object.keys(input.correlation).some((key) => !CORRELATION_KEYS.has(key))
      || !validCorrelation(input.correlation.releaseId)
      || !validCorrelation(input.correlation.reportId)) {
    return { ok: false, reason: "invalid_correlation" };
  }
  const name = input.name as ChatTelemetryEventName;
  const labels = normalizeLabels(name, input.labels);
  if (!labels) return { ok: false, reason: "invalid_label" };
  const measurements = normalizeMeasurements(name, input.measurements);
  if (!measurements) return { ok: false, reason: "invalid_measurement" };
  const observedAtMs = input.observedAtMs === undefined ? Date.now() : input.observedAtMs;
  if (typeof observedAtMs !== "number" || !Number.isFinite(observedAtMs) || observedAtMs < 0) {
    return { ok: false, reason: "invalid_measurement" };
  }
  return {
    ok: true,
    record: Object.freeze({
      name,
      labels,
      measurements,
      correlation: Object.freeze({
        releaseId: input.correlation.releaseId,
        reportId: input.correlation.reportId,
      }),
      observedAtMs,
    }),
  };
}

export function metricSeriesKey(record: ChatTelemetryRecord): string {
  const labels = Object.entries(record.labels).sort(([left], [right]) => left.localeCompare(right));
  return `${record.name}|${labels.map(([key, value]) => `${key}=${value}`).join(",")}`;
}
