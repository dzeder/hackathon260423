import { createHash } from "node:crypto";
import pino from "pino";

const SERVICE_NAME = "ohanafy-plan-mcp-events";
const TRACK = "B";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: SERVICE_NAME,
    track: TRACK,
    env: process.env.DD_ENV ?? process.env.NODE_ENV ?? "development",
    version: process.env.GIT_SHA ?? "local",
  },
  formatters: {
    level(label) {
      return { level: label, status: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function hashCustomer(customerId: string): string {
  return createHash("sha256").update(customerId).digest("hex").slice(0, 16);
}

let _tracerPromise: Promise<unknown> | null = null;

async function getTracer(): Promise<unknown> {
  if (!process.env.DD_API_KEY) return null;
  if (!_tracerPromise) {
    _tracerPromise = import("dd-trace")
      .then((m) => {
        const tracer = m.default;
        tracer.init({
          service: SERVICE_NAME,
          env: process.env.DD_ENV,
          version: process.env.GIT_SHA ?? "local",
          logInjection: true,
        });
        return tracer;
      })
      .catch((err) => {
        log.warn({ err: String(err) }, "dd-trace init failed");
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

function extractCustomerId(args: unknown): string | undefined {
  if (typeof args === "object" && args !== null && "customerId" in args) {
    const v = (args as Record<string, unknown>).customerId;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export async function traceTool<T>(
  toolName: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const customerId = extractCustomerId(args);
  const customerIdHash = customerId ? hashCustomer(customerId) : "unknown";
  const start = Date.now();
  try {
    const result = await withSpan(
      `mcp.tool.${toolName}`,
      {
        "tool.name": toolName,
        customer_id_hash: customerIdHash,
        track: TRACK,
        service: SERVICE_NAME,
      },
      fn,
    );
    log.info(
      {
        mcp_event: "tool_complete",
        tool_name: toolName,
        customer_id_hash: customerIdHash,
        ms: Date.now() - start,
        ok: true,
      },
      "mcp tool",
    );
    return result;
  } catch (err) {
    log.error(
      {
        mcp_event: "tool_error",
        tool_name: toolName,
        customer_id_hash: customerIdHash,
        ms: Date.now() - start,
        ok: false,
        err: String(err),
      },
      "mcp tool error",
    );
    throw err;
  }
}
