import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const Query = z.object({
  appliedEventIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Query>;
  try {
    parsed = Query.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }
  const appliedEvents = eventsCatalog.filter((e) =>
    parsed.appliedEventIds.includes(e.id),
  );
  const scenario = applyEvents(baselineForecast, appliedEvents);
  const threeStatement = runThreeStatement(scenario);
  return NextResponse.json({
    baseline: baselineForecast,
    scenario,
    threeStatement,
    eventCount: appliedEvents.length,
  });
}

export async function GET() {
  return NextResponse.json({
    baseline: baselineForecast,
    catalog: eventsCatalog,
  });
}
