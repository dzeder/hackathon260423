import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/data";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { respondLive } from "@/lib/copilotLive";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { log } from "@/lib/log";
import { METRICS, recordLatency } from "@/lib/metrics";
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
  const startMs = performance.now();
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

  const baseline = await getDataSource().getBaseline();
  const appliedEvents = eventsCatalog.filter((e) =>
    parsed.appliedEventIds.includes(e.id),
  );
  const { result: scenario, trace: applyTrace } = await recordTrace(
    "apply_events",
    () => applyEvents(baseline, appliedEvents),
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
    baseline,
    scenario,
    threeStatement,
  };

  const versions = {
    promptVersion: PROMPT_VERSION,
    toolSchemaVersion: TOOL_SCHEMA_VERSION,
  };

  let source: "live" | "canned" = "canned";
  let body: Record<string, unknown>;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { result: live, trace: liveTrace } = await recordTrace(
        "respond_live",
        () => respondLive(query),
        { input: { prompt: parsed.prompt, scenarioId: parsed.scenarioId } },
      );
      traces.push(liveTrace);
      body = {
        ...live,
        source: "live",
        traces,
        toolsCalled: formatToolsCalled(traces),
        ...versions,
      };
      source = "live";
      recordLatency(METRICS.COPILOT_LATENCY, Math.round(performance.now() - startMs), [
        `source:${source}`,
      ]);
      return NextResponse.json(body);
    } catch (err) {
      const maybeTrace = (err as { trace?: ToolCallTrace }).trace;
      if (maybeTrace) traces.push(maybeTrace);
      log.warn(
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
  body = {
    ...canned,
    source: "canned",
    traces,
    toolsCalled: formatToolsCalled(traces),
    ...versions,
  };
  recordLatency(METRICS.COPILOT_LATENCY, Math.round(performance.now() - startMs), [
    `source:${source}`,
  ]);
  return NextResponse.json(body);
}
