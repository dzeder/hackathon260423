import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { isToolEnabled } from "@/lib/agentConfig";
import { applyEvents } from "@/lib/applyEvents";
import { CustomerIdError, extractCustomerId, hashCustomerId } from "@/lib/customerId";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const SnapshotBody = z.object({
  customerId: z.string().min(1),
  scenarioId: z.string().min(1),
  events: z
    .array(z.object({ id: z.string(), month: z.string().optional(), revenueDeltaPct: z.number().optional() }))
    .default([]),
});

function handleSnapshot(body: unknown) {
  const parsed = SnapshotBody.parse(body);
  const appliedIds = new Set(parsed.events.map((e) => e.id));
  const appliedEvents = eventsCatalog.filter((e) => appliedIds.has(e.id));
  const scenario = applyEvents(baselineForecast, appliedEvents);
  const threeStatement = runThreeStatement(scenario);
  return {
    scenarioId: parsed.scenarioId,
    customerIdHash: hashCustomerId(parsed.customerId),
    baseline: baselineForecast,
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
        return NextResponse.json(handleSnapshot(body));
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
