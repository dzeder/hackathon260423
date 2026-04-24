import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Version string embedded in every trace. Bump on any breaking change to the
 * shape. Salesforce-side consumers read this off the payload before parsing.
 */
export const SCHEMA_VERSION = "1.0" as const;

export const ToolCallTraceSchema = z.object({
  schemaVersion: z.string(),
  tool: z.string().min(1),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  ok: z.boolean(),
  errorCode: z.string().optional(),
  inputHash: z.string().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});

export const ToolCallTracesSchema = z.array(ToolCallTraceSchema);

export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;

/** SHA-256 of canonicalized JSON. Used for correlating repeated inputs without logging the raw value. */
export function hashInput(input: unknown): string {
  const canon = canonicalize(input);
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export interface RecordTraceOptions {
  input?: unknown;
  outputTokens?: number;
}

/**
 * Time an async operation and return its result alongside a ToolCallTrace.
 * Never throws: failures are captured into the trace and re-thrown only after
 * the trace is produced via the callback.
 */
export async function recordTrace<T>(
  tool: string,
  fn: () => Promise<T> | T,
  opts: RecordTraceOptions = {},
): Promise<{ result: T; trace: ToolCallTrace }> {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const result = await fn();
    const trace: ToolCallTrace = {
      schemaVersion: SCHEMA_VERSION,
      tool,
      startedAt,
      durationMs: Math.round(performance.now() - start),
      ok: true,
      ...(opts.input !== undefined ? { inputHash: hashInput(opts.input) } : {}),
      ...(opts.outputTokens !== undefined ? { outputTokens: opts.outputTokens } : {}),
    };
    return { result, trace };
  } catch (err) {
    const trace: ToolCallTrace = {
      schemaVersion: SCHEMA_VERSION,
      tool,
      startedAt,
      durationMs: Math.round(performance.now() - start),
      ok: false,
      errorCode: errorCodeOf(err),
      ...(opts.input !== undefined ? { inputHash: hashInput(opts.input) } : {}),
    };
    (err as { trace?: ToolCallTrace }).trace = trace;
    throw err;
  }
}

function errorCodeOf(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return code ?? err.name;
  }
  return "UNKNOWN";
}

/**
 * Format a trace list as the comma-separated string the Salesforce
 * Plan_Agent_Log__c.Tools_Called__c field stores:
 *   "queryBaseline(23ms,ok=true), applyScenario(71ms,ok=false)"
 */
export function formatToolsCalled(traces: readonly ToolCallTrace[]): string {
  return traces
    .map((t) => `${t.tool}(${t.durationMs}ms,ok=${t.ok})`)
    .join(", ");
}
