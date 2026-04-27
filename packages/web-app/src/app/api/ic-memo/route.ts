import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/data";
import { applyEvents } from "@/lib/applyEvents";
import { checkAuth } from "@/lib/copilotAuth";
import { getEventsCatalog } from "@/lib/eventsCatalog";
import { generateIcMemo } from "@/lib/icMemo";
import { log } from "@/lib/log";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const Body = z.object({
  scenarioId: z.string().min(1),
  appliedEventIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const catalog = await getEventsCatalog();
  const appliedEvents = catalog.filter((e) =>
    parsed.appliedEventIds.includes(e.id),
  );
  const baseline = await getDataSource().getBaseline();
  const scenario = applyEvents(baseline, appliedEvents);
  const threeStatement = runThreeStatement(scenario);

  try {
    const result = await generateIcMemo({
      scenarioId: parsed.scenarioId,
      appliedEventIds: parsed.appliedEventIds,
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error("ic_memo_failed", {
      scenarioId: parsed.scenarioId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "ic_memo_generation_failed" }, { status: 500 });
  }
}
