import {
  createConnection,
  PlanDecisionTypeEnum,
  recordPlanScenarioDecision,
  type RecordPlanScenarioDecisionInput,
  type RecordPlanScenarioDecisionResult,
} from "@ohanafy-plan/sf-client";
import pino from "pino";
import { z } from "zod";
import { loadKnowledge, searchKnowledge } from "./knowledge.js";
import {
  compareScenarios,
  filterDecisions,
  newDecisionId,
  type DecisionRecord,
} from "./logic.js";
import { sharedStore, MemoryStore } from "./store.js";

const log = pino({ name: "ohanafy-memory.tools" });

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
  /** Required by Plan_Scenario_Decision__c picklist when persisting to Salesforce. Defaults to "accept". */
  decisionType: PlanDecisionTypeEnum.default("accept"),
  /** Forwarded to Salesforce as Applied_Event_Ids__c (comma-joined). */
  appliedEventIds: z.array(z.string()).default([]),
});

export const ListDecisionsInput = CustomerContextSchema.extend({
  scenarioId: z.string().min(1),
});

export const CompareScenariosInput = CustomerContextSchema.extend({
  a: ScenarioSummarySchema,
  b: ScenarioSummarySchema,
});

export const SearchKnowledgeInput = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().positive().max(20).default(3),
});

export type SfWriter = (
  input: RecordPlanScenarioDecisionInput,
) => Promise<RecordPlanScenarioDecisionResult | null>;

type Deps = { store: MemoryStore; sfWriter?: SfWriter };

/** Default SF writer: best-effort persistence to Plan_Scenario_Decision__c when SF_AUTH_URL is set. */
async function defaultSfWriter(
  input: RecordPlanScenarioDecisionInput,
): Promise<RecordPlanScenarioDecisionResult | null> {
  if (!process.env.SF_AUTH_URL) return null;
  try {
    const conn = await createConnection();
    return await recordPlanScenarioDecision(conn, input);
  } catch (err) {
    log.warn(
      { msg: "Plan_Scenario_Decision__c write failed; decision still in local store", err: String(err) },
    );
    return null;
  }
}

const defaultDeps: Deps = { store: sharedStore, sfWriter: defaultSfWriter };

export function makeHandlers(deps: Deps = defaultDeps) {
  const sfWriter = deps.sfWriter ?? defaultSfWriter;
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

      const sfRes = await sfWriter({
        scenarioId: input.scenarioId,
        decisionType: input.decisionType,
        rationale: input.note,
        appliedEventIds: input.appliedEventIds,
        userId: input.author ?? input.customerId,
      });

      return {
        decision: record,
        salesforce: sfRes
          ? { sfId: sfRes.sfId, decisionId: sfRes.decisionId }
          : null,
      };
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

export async function searchKnowledgeTool(raw: unknown) {
  const { query, limit } = SearchKnowledgeInput.parse(raw);
  const hits = searchKnowledge(loadKnowledge(), query, limit);
  return { hits, count: hits.length };
}

export const TOOL_REGISTRY = {
  record_decision: {
    description: "Append a CFO/analyst note to a scenario's decision log. Persists locally and, when SF_AUTH_URL is set, also writes a Plan_Scenario_Decision__c row.",
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
  search_knowledge: {
    description: "Search the Yellowhammer knowledge base (customer profile, domain playbooks, glossary) by free-text query. BM25-lite scoring over title + body + tags.",
    input: SearchKnowledgeInput,
    handler: searchKnowledgeTool,
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
