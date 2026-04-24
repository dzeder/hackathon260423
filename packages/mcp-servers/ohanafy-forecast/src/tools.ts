import { z } from "zod";
import { loadBaseline } from "./baseline.js";
import { applyEvents, runThreeStatement, snapshotScenario } from "./logic.js";

/** Every tool call must identify which customer org the request is for. */
export const CustomerContextSchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
});

export const ScenarioEventSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  revenueDeltaPct: z.number().optional(),
  cogsDeltaPct: z.number().optional(),
  opexDeltaAbs: z.number().optional(),
});

export const ApplyEventInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
  events: z.array(ScenarioEventSchema).min(1),
});

export const RunThreeStatementInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
  events: z.array(ScenarioEventSchema).default([]),
});

export const SnapshotInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
  events: z.array(ScenarioEventSchema).default([]),
});

export async function applyEventTool(raw: unknown) {
  const { events } = ApplyEventInput.parse(raw);
  const forecast = applyEvents(loadBaseline(), events);
  return { forecast, eventCount: events.length };
}

export async function runThreeStatementTool(raw: unknown) {
  const { events } = RunThreeStatementInput.parse(raw);
  const forecast = applyEvents(loadBaseline(), events);
  return runThreeStatement(forecast);
}

export async function snapshotTool(raw: unknown) {
  const { events } = SnapshotInput.parse(raw);
  return snapshotScenario(loadBaseline(), events);
}

export const TOOL_REGISTRY = {
  apply_event: {
    description: "Apply one or more scenario events to the Yellowhammer baseline forecast.",
    input: ApplyEventInput,
    handler: applyEventTool,
  },
  run_three_statement: {
    description: "Run the three-statement model against a scenario (income + balance + cash).",
    input: RunThreeStatementInput,
    handler: runThreeStatementTool,
  },
  snapshot: {
    description: "Return forecast + three-statement + event count for a scenario in one call.",
    input: SnapshotInput,
    handler: snapshotTool,
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
