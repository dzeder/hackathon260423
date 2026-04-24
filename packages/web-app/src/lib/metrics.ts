/**
 * Thin Datadog metrics wrapper. Uses dd-trace's built-in dogstatsd client
 * when the agent is configured (DD_AGENT_HOST set in the environment);
 * no-ops otherwise so unit tests don't need a live collector.
 *
 * Metric naming follows `ohanafy.plan.<surface>.<metric>`:
 *   ohanafy.plan.copilot.latency_ms        (histogram)
 *   ohanafy.plan.copilot.cost_usd          (distribution)
 *   ohanafy.plan.tool.rate_limit_exceeded  (counter)
 *   ohanafy.plan.tool.circuit_open         (counter)
 *
 * Tags are low-cardinality by design: tool, source (live|canned), status.
 * Never add customerId as a tag — use customerIdHash from lib/customerId
 * instead if tenant grouping is needed.
 */

type Tags = readonly string[];

interface DogStatsD {
  histogram: (stat: string, value: number, tags?: Tags) => void;
  distribution: (stat: string, value: number, tags?: Tags) => void;
  increment: (stat: string, value?: number, tags?: Tags) => void;
}

let client: DogStatsD | null = null;

function getClient(): DogStatsD | null {
  if (client) return client;
  if (!process.env.DD_AGENT_HOST) return null;
  try {
    // Lazy-require dd-trace so tests without the dep don't blow up.
    // The init() call is idempotent.
    const tracer = require("dd-trace");
    if (!tracer.init) return null;
    tracer.init({
      service: process.env.DD_SERVICE ?? "ohanafy-plan-webapp",
      env: process.env.DD_ENV ?? "dev",
    });
    const dog: DogStatsD = tracer.dogstatsd;
    if (!dog) return null;
    client = dog;
    return client;
  } catch {
    return null;
  }
}

export function recordLatency(
  stat: string,
  ms: number,
  tags: Tags = [],
): void {
  getClient()?.histogram(stat, ms, tags);
}

export function recordCost(
  stat: string,
  usd: number,
  tags: Tags = [],
): void {
  getClient()?.distribution(stat, usd, tags);
}

export function incrementCounter(
  stat: string,
  tags: Tags = [],
  value = 1,
): void {
  getClient()?.increment(stat, value, tags);
}

export const METRICS = {
  COPILOT_LATENCY: "ohanafy.plan.copilot.latency_ms",
  COPILOT_COST: "ohanafy.plan.copilot.cost_usd",
  TOOL_RATE_LIMIT: "ohanafy.plan.tool.rate_limit_exceeded",
  TOOL_CIRCUIT_OPEN: "ohanafy.plan.tool.circuit_open",
  TOOL_DISABLED: "ohanafy.plan.tool.disabled_by_config",
} as const;
