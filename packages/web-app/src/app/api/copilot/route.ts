import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { respondLive } from "@/lib/copilotLive";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";

export const runtime = "nodejs";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  scenarioId: z.string().min(1),
  appliedEventIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    parsed = Body.parse(raw);
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

  const query = {
    prompt: parsed.prompt,
    scenarioId: parsed.scenarioId,
    appliedEventIds: parsed.appliedEventIds,
    baseline: baselineForecast,
    scenario,
    threeStatement,
  };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const live = await respondLive(query);
      return NextResponse.json({ ...live, source: "live" });
    } catch (err) {
      console.warn(
        "copilot: live call failed, falling back to canned",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ ...respond(query), source: "canned" });
}
