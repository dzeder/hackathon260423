import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/data";
import { applyEvents } from "@/lib/applyEvents";
import { getEventsCatalog } from "@/lib/eventsCatalog";
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
  const baseline = await getDataSource().getBaseline();
  const catalog = await getEventsCatalog();
  const appliedEvents = catalog.filter((e) =>
    parsed.appliedEventIds.includes(e.id),
  );
  const scenario = applyEvents(baseline, appliedEvents);
  const threeStatement = runThreeStatement(scenario);
  return NextResponse.json({
    baseline,
    scenario,
    threeStatement,
    eventCount: appliedEvents.length,
  });
}

export async function GET() {
  const [baseline, catalog] = await Promise.all([
    getDataSource().getBaseline(),
    getEventsCatalog(),
  ]);
  return NextResponse.json({
    baseline,
    catalog,
  });
}
