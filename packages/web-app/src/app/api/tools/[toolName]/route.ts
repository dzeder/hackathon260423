import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const SnapshotBody = z.object({
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

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
