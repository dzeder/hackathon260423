import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { METRICS, incrementCounter, recordCost, recordLatency } from "@/lib/metrics";

describe("metrics", () => {
  const originalAgentHost = process.env.DD_AGENT_HOST;

  beforeEach(() => {
    delete process.env.DD_AGENT_HOST;
  });

  afterEach(() => {
    if (originalAgentHost !== undefined) {
      process.env.DD_AGENT_HOST = originalAgentHost;
    }
  });

  it("no-ops when DD_AGENT_HOST is unset", () => {
    expect(() => recordLatency(METRICS.COPILOT_LATENCY, 123)).not.toThrow();
    expect(() => recordCost(METRICS.COPILOT_COST, 0.04)).not.toThrow();
    expect(() => incrementCounter(METRICS.TOOL_RATE_LIMIT, ["tool:x"])).not.toThrow();
  });

  it("exposes stable metric name constants", () => {
    expect(METRICS.COPILOT_LATENCY).toBe("ohanafy.plan.copilot.latency_ms");
    expect(METRICS.COPILOT_COST).toBe("ohanafy.plan.copilot.cost_usd");
    expect(METRICS.TOOL_RATE_LIMIT).toBe("ohanafy.plan.tool.rate_limit_exceeded");
    expect(METRICS.TOOL_CIRCUIT_OPEN).toBe("ohanafy.plan.tool.circuit_open");
    expect(METRICS.TOOL_DISABLED).toBe("ohanafy.plan.tool.disabled_by_config");
  });
});
