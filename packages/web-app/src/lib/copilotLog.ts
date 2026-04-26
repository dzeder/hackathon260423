import { createHash } from "node:crypto";
import pino from "pino";

/*
 * Structured logger for the copilot.
 *
 * Emits one JSON line per turn with everything useful for Datadog search and
 * cost analysis, and NOTHING that would leak customer content: no prompts,
 * no assistant text, no tool input/output bodies. Only metadata —
 * conversation id, iteration count, tool names, token counts, cost, model.
 *
 * If DD_API_KEY is present we wire dd-trace spans around Claude calls and
 * tool dispatch. Otherwise spans degrade to no-ops so dev/CI runs stay clean.
 *
 * For per-customer log scoping the `customer_id` is hashed before logging,
 * per CLAUDE.md's "never log PII or customer names" rule. The hash is
 * stable so one customer can be traced across logs.
 */

const redact = [
  // Belt-and-suspenders: if something slips into the log payload accidentally,
  // pino will redact by path. These are the common content-carrying keys.
  "userText",
  "assistantText",
  "finalText",
  "content",
  "prompt",
  "input",
  "output",
  "*.userText",
  "*.assistantText",
  "*.finalText",
  "*.content",
  "*.prompt",
  "*.input",
  "*.output",
];

export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: "ohanafy-plan-webapp",
    env: process.env.DD_ENV ?? process.env.NODE_ENV ?? "development",
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },
  redact: {
    paths: redact,
    censor: "[REDACTED]",
  },
  formatters: {
    // Datadog looks for `status` to colour log levels.
    level(label) {
      return { level: label, status: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Stable hash of the customer id. Used as `customer_id_hash` field. */
export function hashCustomer(customerId: string): string {
  return createHash("sha256").update(customerId).digest("hex").slice(0, 16);
}

/*
 * dd-trace wrapper — loaded on demand so the module import stays cheap for
 * dev + CI. Vercel sets `VERCEL=1` and CLAUDE.md already configures DD env
 * vars (DD_API_KEY, DD_SITE, DD_SERVICE). If the tracer isn't initialized,
 * `withSpan` calls the fn directly.
 */

let _tracerPromise: Promise<unknown> | null = null;
async function getTracer() {
  if (!process.env.DD_API_KEY) return null;
  if (!_tracerPromise) {
    _tracerPromise = import("dd-trace")
      .then((m) => {
        // Initialize once. Vercel serverless: keep flushInterval short so
        // spans leave the function before it freezes.
        const tracer = m.default;
        tracer.init({
          service: "ohanafy-plan-webapp",
          env: process.env.DD_ENV,
          version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
          flushInterval: 1000,
          logInjection: true,
        });
        return tracer;
      })
      .catch((err) => {
        log.warn({ err: String(err) }, "dd-trace init failed — continuing without tracing");
        return null;
      });
  }
  return _tracerPromise;
}

type SpanFields = Record<string, string | number | boolean | null | undefined>;

export async function withSpan<T>(
  name: string,
  fields: SpanFields,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = await getTracer();
  if (!tracer) return fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tracer as any;
  return t.trace(name, { tags: fields }, fn);
}

export type TurnLogPayload = {
  customerId: string;
  userId: string;
  conversationId: string;
  model: string;
  iterations: number;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  costCapHit: boolean;
  toolNames: string[];
  latencyMs: number;
  source: "live" | "canned";
};

export function logTurn(payload: TurnLogPayload): void {
  log.info(
    {
      copilot_event: "turn_complete",
      customer_id_hash: hashCustomer(payload.customerId),
      user_id_hash: hashCustomer(payload.userId),
      conversation_id: payload.conversationId,
      model: payload.model,
      iterations: payload.iterations,
      stop_reason: payload.stopReason,
      input_tokens: payload.inputTokens,
      output_tokens: payload.outputTokens,
      cache_read_tokens: payload.cacheReadTokens,
      cache_creation_tokens: payload.cacheCreationTokens,
      cost_usd: payload.costUsd,
      cost_cap_hit: payload.costCapHit,
      tool_count: payload.toolNames.length,
      tool_names: payload.toolNames,
      latency_ms: payload.latencyMs,
      source: payload.source,
    },
    "copilot turn",
  );
}

export function logError(
  message: string,
  fields: Record<string, unknown> = {},
): void {
  log.error(fields, message);
}
