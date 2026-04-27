import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/data";
import { getRateLimit, isToolEnabled } from "@/lib/agentConfig";
import { applyEvents } from "@/lib/applyEvents";
import { CustomerIdError, extractCustomerId, hashCustomerId } from "@/lib/customerId";
import { getEventsCatalog } from "@/lib/eventsCatalog";
import { METRICS, incrementCounter } from "@/lib/metrics";
import { consume } from "@/lib/rateLimit";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const SnapshotBody = z.object({
  customerId: z.string().min(1),
  scenarioId: z.string().min(1),
  events: z
    .array(z.object({ id: z.string(), month: z.string().optional(), revenueDeltaPct: z.number().optional() }))
    .default([]),
});

async function handleSnapshot(body: unknown) {
  const parsed = SnapshotBody.parse(body);
  const [baseline, catalog] = await Promise.all([
    getDataSource().getBaseline(),
    getEventsCatalog(),
  ]);
  const appliedIds = new Set(parsed.events.map((e) => e.id));
  const appliedEvents = catalog.filter((e) => appliedIds.has(e.id));
  const scenario = applyEvents(baseline, appliedEvents);
  const threeStatement = runThreeStatement(scenario);
  return {
    scenarioId: parsed.scenarioId,
    customerIdHash: hashCustomerId(parsed.customerId),
    baseline,
    scenario,
    threeStatement,
    eventCount: appliedEvents.length,
    appliedEventIds: [...appliedIds],
  };
}

export async function POST(
  req: Request,
  { params }: { params: { toolName: string } },
) {
  const toolName = params.toolName;
  if (!isToolEnabled(toolName)) {
    incrementCounter(METRICS.TOOL_DISABLED, [`tool:${toolName}`]);
    return NextResponse.json(
      { error: `tool is disabled: ${toolName}` },
      { status: 503 },
    );
  }

  let customerId: string;
  try {
    customerId = extractCustomerId(req);
  } catch (err) {
    if (err instanceof CustomerIdError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Rate-limit gate keyed on the extracted tenant id.
  const decision = consume(customerId, toolName, getRateLimit(toolName));
  if (!decision.allowed) {
    incrementCounter(METRICS.TOOL_RATE_LIMIT, [`tool:${toolName}`]);
    return NextResponse.json(
      { error: `rate limit exceeded for ${toolName}`, retryAfterSec: decision.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec ?? 60) } },
    );
  }

  let bodyRaw: Record<string, unknown>;
  try {
    const parsed = await req.json();
    bodyRaw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    bodyRaw = {};
  }
  const body = { ...bodyRaw, customerId };

  try {
    switch (toolName) {
      case "snapshot":
      case "run_three_statement":
      case "apply_event":
        return NextResponse.json(await handleSnapshot(body));
      default:
        return NextResponse.json(
          { error: `unknown tool: ${toolName}` },
          { status: 404 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "tool handler failed" },
      { status: 400 },
    );
  }
}
