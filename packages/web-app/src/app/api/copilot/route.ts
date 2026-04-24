import { NextResponse } from "next/server";
import { z } from "zod";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { respondLive } from "@/lib/copilotLive";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import {
  formatToolsCalled,
  recordTrace,
  type ToolCallTrace,
} from "@/lib/toolCallTrace";
import { PROMPT_VERSION, TOOL_SCHEMA_VERSION } from "@/lib/versions";

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

  const traces: ToolCallTrace[] = [];

  const appliedEvents = eventsCatalog.filter((e) =>
    parsed.appliedEventIds.includes(e.id),
  );
  const { result: scenario, trace: applyTrace } = await recordTrace(
    "apply_events",
    () => applyEvents(baselineForecast, appliedEvents),
    { input: { eventIds: parsed.appliedEventIds } },
  );
  traces.push(applyTrace);

  const { result: threeStatement, trace: tsTrace } = await recordTrace(
    "run_three_statement",
    () => runThreeStatement(scenario),
  );
  traces.push(tsTrace);

  const query = {
    prompt: parsed.prompt,
    scenarioId: parsed.scenarioId,
    appliedEventIds: parsed.appliedEventIds,
    baseline: baselineForecast,
    scenario,
    threeStatement,
  };

  const versions = {
    promptVersion: PROMPT_VERSION,
    toolSchemaVersion: TOOL_SCHEMA_VERSION,
  };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { result: live, trace: liveTrace } = await recordTrace(
        "respond_live",
        () => respondLive(query),
        { input: { prompt: parsed.prompt, scenarioId: parsed.scenarioId } },
      );
      traces.push(liveTrace);
      return NextResponse.json({
        ...live,
        source: "live",
        traces,
        toolsCalled: formatToolsCalled(traces),
        ...versions,
      });
    } catch (err) {
      const maybeTrace = (err as { trace?: ToolCallTrace }).trace;
      if (maybeTrace) traces.push(maybeTrace);
      console.warn(
        "copilot: live call failed, falling back to canned",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { result: canned, trace: cannedTrace } = await recordTrace(
    "respond_canned",
    () => respond(query),
    { input: { prompt: parsed.prompt, scenarioId: parsed.scenarioId } },
  );
  traces.push(cannedTrace);
  return NextResponse.json({
    ...canned,
    source: "canned",
    traces,
    toolsCalled: formatToolsCalled(traces),
    ...versions,
  });
}
