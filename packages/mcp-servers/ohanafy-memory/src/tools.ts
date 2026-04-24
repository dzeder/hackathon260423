import { z } from "zod";
import {
  compareScenarios,
  filterDecisions,
  newDecisionId,
  type DecisionRecord,
} from "./logic.js";
import { sharedStore, MemoryStore } from "./store.js";

/** Every tool call must identify which customer org the request is for. */
export const CustomerContextSchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
});

const TotalsSchema = z.object({
  revenue: z.number(),
  cogs: z.number(),
  opex: z.number(),
  gm: z.number(),
  ebitda: z.number(),
});

const ScenarioSummarySchema = z.object({
  scenarioId: z.string().min(1),
  totals: TotalsSchema,
});

export const RecordDecisionInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
  note: z.string().min(1).max(4000),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const ListDecisionsInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
});

export const CompareScenariosInput = CustomerContextSchema.extend({
  a: ScenarioSummarySchema,
  b: ScenarioSummarySchema,
});

type Deps = { store: MemoryStore };
const defaultDeps: Deps = { store: sharedStore };

export function makeHandlers(deps: Deps = defaultDeps) {
  return {
    async recordDecision(raw: unknown) {
      const input = RecordDecisionInput.parse(raw);
      const record: DecisionRecord = {
        id: newDecisionId(),
        scenarioId: input.scenarioId,
        note: input.note,
        author: input.author,
        tags: input.tags,
        createdAt: new Date().toISOString(),
      };
      deps.store.append(record);
      return { decision: record };
    },
    async listDecisions(raw: unknown) {
      const { scenarioId } = ListDecisionsInput.parse(raw);
      const decisions = filterDecisions(deps.store.list(), scenarioId);
      return { decisions, count: decisions.length };
    },
    async compareScenariosTool(raw: unknown) {
      const { a, b } = CompareScenariosInput.parse(raw);
      return compareScenarios(a, b);
    },
  };
}

const defaults = makeHandlers();

export async function recordDecisionTool(raw: unknown) {
  return defaults.recordDecision(raw);
}

export async function listDecisionsTool(raw: unknown) {
  return defaults.listDecisions(raw);
}

export async function compareScenariosTool(raw: unknown) {
  return defaults.compareScenariosTool(raw);
}

export const TOOL_REGISTRY = {
  record_decision: {
    description: "Append a CFO/analyst note to a scenario's decision log.",
    input: RecordDecisionInput,
    handler: recordDecisionTool,
  },
  list_decisions: {
    description: "List all decisions recorded against a scenario, newest first.",
    input: ListDecisionsInput,
    handler: listDecisionsTool,
  },
  compare_scenarios: {
    description: "Compare two scenario summaries and report abs + pct deltas plus a verdict on EBITDA.",
    input: CompareScenariosInput,
    handler: compareScenariosTool,
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
