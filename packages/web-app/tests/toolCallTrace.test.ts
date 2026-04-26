import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  ToolCallTraceSchema,
  ToolCallTracesSchema,
  formatToolsCalled,
  hashInput,
  recordTrace,
  type ToolCallTrace,
} from "@/lib/toolCallTrace";

describe("ToolCallTrace schema", () => {
  it("accepts a minimal valid trace", () => {
    const trace: ToolCallTrace = {
      schemaVersion: SCHEMA_VERSION,
      tool: "apply_events",
      startedAt: "2026-04-24T12:00:00.000Z",
      durationMs: 23,
      ok: true,
    };
    expect(() => ToolCallTraceSchema.parse(trace)).not.toThrow();
  });

  it("rejects traces with missing required fields", () => {
    expect(() =>
      ToolCallTraceSchema.parse({ tool: "x", startedAt: "x", durationMs: 1, ok: true }),
    ).toThrow();
  });

  it("rejects negative durationMs", () => {
    expect(() =>
      ToolCallTraceSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        tool: "x",
        startedAt: "2026-04-24T12:00:00.000Z",
        durationMs: -1,
        ok: true,
      }),
    ).toThrow();
  });

  it("round-trips via JSON without loss", () => {
    const original: ToolCallTrace = {
      schemaVersion: SCHEMA_VERSION,
      tool: "query_baseline",
      startedAt: "2026-04-24T12:00:00.000Z",
      durationMs: 140,
      ok: true,
      inputHash: "abc123",
      outputTokens: 1024,
    };
    const reparsed = ToolCallTraceSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(reparsed).toEqual(original);
  });

  it("accepts an array of traces", () => {
    const traces = [
      {
        schemaVersion: SCHEMA_VERSION,
        tool: "a",
        startedAt: "2026-04-24T12:00:00.000Z",
        durationMs: 1,
        ok: true,
      },
      {
        schemaVersion: SCHEMA_VERSION,
        tool: "b",
        startedAt: "2026-04-24T12:00:01.000Z",
        durationMs: 2,
        ok: false,
        errorCode: "TIMEOUT",
      },
    ];
    expect(() => ToolCallTracesSchema.parse(traces)).not.toThrow();
  });
});

describe("hashInput", () => {
  it("is deterministic across key order", () => {
    expect(hashInput({ a: 1, b: 2 })).toEqual(hashInput({ b: 2, a: 1 }));
  });

  it("differs for different values", () => {
    expect(hashInput({ a: 1 })).not.toEqual(hashInput({ a: 2 }));
  });

  it("handles primitives and null", () => {
    expect(hashInput(null)).toHaveLength(16);
    expect(hashInput(42)).toHaveLength(16);
    expect(hashInput("hello")).toHaveLength(16);
  });
});

describe("recordTrace", () => {
  it("captures ok=true on success with duration", async () => {
    const { result, trace } = await recordTrace("apply_events", () => "done");
    expect(result).toEqual("done");
    expect(trace.ok).toBe(true);
    expect(trace.tool).toBe("apply_events");
    expect(trace.schemaVersion).toBe(SCHEMA_VERSION);
    expect(trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(() => ToolCallTraceSchema.parse(trace)).not.toThrow();
  });

  it("captures ok=false on throw and attaches trace to the error", async () => {
    class BoomError extends Error {
      constructor() {
        super("boom");
        this.name = "BoomError";
      }
    }
    let thrown: unknown;
    try {
      await recordTrace("query_baseline", () => {
        throw new BoomError();
      });
    } catch (err) {
      thrown = err;
    }
    const err = thrown as Error & { trace?: ToolCallTrace };
    expect(err.trace?.ok).toBe(false);
    expect(err.trace?.errorCode).toBe("BoomError");
    expect(() => ToolCallTraceSchema.parse(err.trace)).not.toThrow();
  });

  it("includes inputHash and outputTokens when provided", async () => {
    const { trace } = await recordTrace("respond_live", () => "reply", {
      input: { prompt: "hi" },
      outputTokens: 42,
    });
    expect(trace.inputHash).toHaveLength(16);
    expect(trace.outputTokens).toBe(42);
  });

  it("awaits async functions", async () => {
    const { trace } = await recordTrace("slow_tool", async () => {
      // 25ms to stay above setTimeout slack + durationMs rounding on shared CI runners.
      await new Promise((r) => setTimeout(r, 25));
      return "ok";
    });
    expect(trace.durationMs).toBeGreaterThanOrEqual(20);
  });
});

describe("formatToolsCalled", () => {
  it("produces the Salesforce Tools_Called string format", () => {
    const traces: ToolCallTrace[] = [
      {
        schemaVersion: SCHEMA_VERSION,
        tool: "query_baseline",
        startedAt: "2026-04-24T12:00:00.000Z",
        durationMs: 23,
        ok: true,
      },
      {
        schemaVersion: SCHEMA_VERSION,
        tool: "apply_scenario",
        startedAt: "2026-04-24T12:00:00.023Z",
        durationMs: 71,
        ok: false,
        errorCode: "TIMEOUT",
      },
    ];
    expect(formatToolsCalled(traces)).toBe(
      "query_baseline(23ms,ok=true), apply_scenario(71ms,ok=false)",
    );
  });

  it("returns empty string for empty input", () => {
    expect(formatToolsCalled([])).toBe("");
  });
});
