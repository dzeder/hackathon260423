import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { baselineForecast } from "@/data/baseline";
import { applyEvents, type ScenarioEvent } from "@/lib/applyEvents";
import { eventsCatalog, findEvent, type EventTemplate } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";
import {
  isSalesforceConfigured,
  querySoql,
  validateSoqlOrThrow,
} from "@/lib/salesforceClient";
import { logError } from "@/lib/copilotLog";

/*
 * Copilot tool registry.
 *
 * Each tool is a {description, input (Zod), handler} triple. `toAnthropicTools`
 * converts this registry into the `tools` array Anthropic's Messages API
 * expects. `dispatch` executes a tool by name and returns the result as a JSON
 * string ready to drop into a tool_result block.
 *
 * We intentionally do NOT import the MCP server packages — the web app has
 * local copies of baseline / applyEvents / eventsCatalog / threeStatement that
 * already drive the dashboards. One source of truth per process.
 */

// ---- shared schemas ----

const ScenarioEventSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  revenueDeltaPct: z.number().optional(),
  cogsDeltaPct: z.number().optional(),
  opexDeltaAbs: z.number().optional(),
});

// ---- tool inputs ----

const SnapshotInput = z.object({
  eventIds: z
    .array(z.string())
    .default([])
    .describe("Event-template ids to apply to the baseline. Empty returns the pure baseline."),
});

const ApplyEventInput = z.object({
  events: z
    .array(ScenarioEventSchema)
    .min(1)
    .describe("Inline scenario events to apply. Use search_events first to discover templates."),
});

const RunThreeStatementInput = z.object({
  eventIds: z.array(z.string()).default([]),
});

const SearchEventsInput = z.object({
  query: z.string().optional().describe("Free-text search across label/description/source."),
  category: z
    .enum(["sports", "weather", "holiday", "macro", "supplier"])
    .optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe("Filter to events in a specific YYYY-MM month."),
});

const GetEventInput = z.object({
  id: z.string().min(1),
});

const SuggestEventsInput = z.object({
  context: z
    .string()
    .min(3)
    .describe("What the user is asking about — used to rank relevance."),
  limit: z.number().int().positive().max(8).default(4),
});

const QuerySalesforceInput = z.object({
  soql: z
    .string()
    .min(3)
    .describe(
      "SOQL query to run against the Ohanafy Plan Salesforce org. E.g. \"SELECT Id, Name FROM Account LIMIT 5\". Read-only.",
    ),
});

// ---- handlers ----

async function snapshotTool(raw: unknown) {
  const { eventIds } = SnapshotInput.parse(raw);
  const events = eventIds
    .map(findEvent)
    .filter((e): e is EventTemplate => Boolean(e));
  const forecast = applyEvents(baselineForecast, events);
  const threeStatement = runThreeStatement(forecast);
  return {
    baseline: summarizeForecast(baselineForecast),
    scenario: summarizeForecast(forecast),
    threeStatement,
    appliedEventIds: events.map((e) => e.id),
    missingEventIds: eventIds.filter((id) => !findEvent(id)),
  };
}

async function applyEventHandler(raw: unknown) {
  const { events } = ApplyEventInput.parse(raw);
  const forecast = applyEvents(baselineForecast, events as ScenarioEvent[]);
  return {
    baseline: summarizeForecast(baselineForecast),
    scenario: summarizeForecast(forecast),
    eventCount: events.length,
  };
}

async function runThreeStatementHandler(raw: unknown) {
  const { eventIds } = RunThreeStatementInput.parse(raw);
  const events = eventIds
    .map(findEvent)
    .filter((e): e is EventTemplate => Boolean(e));
  const forecast = applyEvents(baselineForecast, events);
  return runThreeStatement(forecast);
}

async function searchEventsHandler(raw: unknown) {
  const { query, category, month } = SearchEventsInput.parse(raw);
  const q = query?.toLowerCase();
  const matches = eventsCatalog.filter((e) => {
    if (category && e.category !== category) return false;
    if (month && e.month !== month) return false;
    if (q) {
      const hay = `${e.label} ${e.notes ?? ""} ${e.source ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return {
    events: matches.slice(0, 12),
    totalMatching: matches.length,
    truncated: matches.length > 12,
  };
}

async function getEventHandler(raw: unknown) {
  const { id } = GetEventInput.parse(raw);
  const event = findEvent(id);
  if (!event) {
    return { error: `Event not found: ${id}`, availableIds: eventsCatalog.map((e) => e.id) };
  }
  return { event };
}

async function suggestEventsHandler(raw: unknown) {
  const { context, limit } = SuggestEventsInput.parse(raw);
  const tokens = context.toLowerCase().split(/\W+/).filter((t) => t.length >= 3);
  const scored = eventsCatalog
    .map((e) => {
      const hay = `${e.label} ${e.notes ?? ""} ${e.source ?? ""} ${e.category}`.toLowerCase();
      const score = tokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
      return { event: e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.event);
  return { suggestions: scored, count: scored.length };
}

async function querySalesforceHandler(raw: unknown) {
  const { soql } = QuerySalesforceInput.parse(raw);

  // When the Connected App is wired up (SF_LOGIN_URL / SF_CONSUMER_KEY /
  // SF_CONSUMER_SECRET all set), run the real SOQL against the org via
  // OhfyPlanSoqlReader. Otherwise fall back to canned fixtures so the
  // copilot demo still works without Salesforce credentials.
  if (isSalesforceConfigured()) {
    try {
      // Defense-in-depth: validate on the web side before making the callout.
      // Apex also validates server-side.
      validateSoqlOrThrow(soql);
      const result = await querySoql(soql);
      return {
        soql,
        stubbed: false,
        records: result.records,
        rowCount: result.records.length,
        totalSize: result.totalSize,
      };
    } catch (err) {
      logError("salesforce_soql_failed", {
        message: err instanceof Error ? err.message : "unknown",
      });
      return {
        soql,
        stubbed: false,
        error: err instanceof Error ? err.message : "unknown",
        records: [],
        rowCount: 0,
        note: "Live Salesforce query failed. See /api/health for status.",
      };
    }
  }

  const canned = matchCanned(soql);
  return {
    soql,
    stubbed: true,
    records: canned.records,
    rowCount: canned.records.length,
    note: `${canned.note} [SF not configured — set SF_LOGIN_URL/SF_CONSUMER_KEY/SF_CONSUMER_SECRET to enable live queries]`,
  };
}

// ---- helpers ----

function summarizeForecast(forecast: typeof baselineForecast) {
  return forecast.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      opex: acc.opex + m.opex,
      gm: acc.gm + m.gm,
      ebitda: acc.ebitda + m.ebitda,
    }),
    { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
  );
}

function matchCanned(soql: string): { records: Array<Record<string, unknown>>; note: string } {
  const lower = soql.toLowerCase();
  if (lower.includes("account")) {
    return {
      note:
        "Canned demo account rows — top on-premise accounts in the territory. Real SOQL stub returns the customer's actual accounts.",
      records: [
        {
          Id: "001xx000003CAN1AAO",
          Name: "Bryant-Denny Stadium Concessions",
          Channel__c: "on-premise",
          City__c: "Tuscaloosa",
        },
        {
          Id: "001xx000003CAN2AAO",
          Name: "Regions Field",
          Channel__c: "on-premise",
          City__c: "Birmingham",
        },
        {
          Id: "001xx000003CAN3AAO",
          Name: "Piggly Wiggly — Midtown",
          Channel__c: "off-premise",
          City__c: "Birmingham",
        },
      ],
    };
  }
  if (lower.includes("opportunity") || lower.includes("forecast")) {
    return {
      note: "Canned scenario rows — the wholesaler hasn't wired live forecast objects yet.",
      records: [
        {
          Id: "006xx000004SCE1AAO",
          Name: "Q2 Red Bull Trade Program",
          Amount: 82000,
          CloseDate: "2026-06-15",
          StageName: "Proposal",
        },
      ],
    };
  }
  return {
    note: "No canned match for this SOQL shape. Live SOQL is not yet wired from the web app.",
    records: [],
  };
}

// ---- registry + API ----

type Handler = (raw: unknown) => Promise<unknown>;

type Entry = {
  description: string;
  input: z.ZodTypeAny;
  handler: Handler;
};

export const TOOL_REGISTRY: Record<string, Entry> = {
  snapshot: {
    description:
      "Return baseline + scenario totals and full three-statement (IS/BS/CF) for a list of applied event ids. Call this FIRST for any scenario question to ground the numbers.",
    input: SnapshotInput,
    handler: snapshotTool,
  },
  apply_event: {
    description:
      "Apply inline scenario events (not from the template catalog) to the baseline and return the new totals. Use when the user describes a custom scenario.",
    input: ApplyEventInput,
    handler: applyEventHandler,
  },
  run_three_statement: {
    description: "Run the three-statement model (income + balance + cash) for a scenario.",
    input: RunThreeStatementInput,
    handler: runThreeStatementHandler,
  },
  search_events: {
    description:
      "Search the event-template catalog by free text, category (sports/weather/holiday/macro/supplier), or month.",
    input: SearchEventsInput,
    handler: searchEventsHandler,
  },
  get_event: {
    description: "Return the full definition of one event template by id.",
    input: GetEventInput,
    handler: getEventHandler,
  },
  suggest_events: {
    description:
      "Suggest relevant event templates given a free-text context describing what the user is asking about.",
    input: SuggestEventsInput,
    handler: suggestEventsHandler,
  },
  query_salesforce: {
    description:
      "Run a read-only SOQL query against the Salesforce org. Currently returns canned demo fixtures — real SOQL is stubbed; use sparingly for account/channel/opportunity lookups that can't be answered from baseline.",
    input: QuerySalesforceInput,
    handler: querySalesforceHandler,
  },
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export function toAnthropicTools(): AnthropicTool[] {
  return Object.entries(TOOL_REGISTRY).map(([name, entry]) => {
    const schema = zodToJsonSchema(entry.input, {
      target: "jsonSchema7",
      $refStrategy: "none",
    });
    const cleaned = stripSchemaRoot(schema);
    return {
      name,
      description: entry.description,
      input_schema: cleaned,
    };
  });
}

function stripSchemaRoot(schema: Record<string, unknown>): Record<string, unknown> {
  // zod-to-json-schema wraps in {$schema: ..., ...actual}; Anthropic wants the
  // JSON Schema object with type:object at the top level.
  const { $schema, ...rest } = schema;
  void $schema;
  return rest as Record<string, unknown>;
}

export type DispatchResult = {
  ok: boolean;
  contentJson: string;
};

export async function dispatch(name: string, input: unknown): Promise<DispatchResult> {
  const entry = TOOL_REGISTRY[name];
  if (!entry) {
    return {
      ok: false,
      contentJson: JSON.stringify({ error: `unknown tool: ${name}` }),
    };
  }
  try {
    const result = await entry.handler(input);
    return { ok: true, contentJson: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool threw";
    return {
      ok: false,
      contentJson: JSON.stringify({ error: message }),
    };
  }
}
