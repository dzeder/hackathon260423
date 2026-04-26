import type { Connection } from "@jsforce/jsforce-node";
import { z } from "zod";
import { query } from "../query";

/**
 * Track C custom objects (Plan_Event_Template__c, Plan_Knowledge_Article__c, ...) live
 * in the org's own namespace — `ohfy__` when deployed as part of the managed package,
 * empty when deployed unmanaged into a dev/scratch org. The shape is stable; only the
 * API name prefix moves. Override via OHFY_PLAN_NS_PREFIX (typical values: "" or "ohfy__").
 */
function nsPrefix(): string {
  return process.env.OHFY_PLAN_NS_PREFIX ?? "";
}

function ns(apiName: string): string {
  return apiName.endsWith("__c") || apiName.endsWith("__mdt")
    ? `${nsPrefix()}${apiName}`
    : apiName;
}

const PlanEventTemplateRow = z.object({
  Event_Id__c: z.string(),
  Label__c: z.string().nullable(),
  Category__c: z.string().nullable(),
  Region__c: z.string().nullable(),
  Season__c: z.string().nullable(),
  Month__c: z.string().nullable(),
  Revenue_Delta_Pct__c: z.number().nullable(),
  COGS_Delta_Pct__c: z.number().nullable(),
  OpEx_Delta_Abs__c: z.number().nullable(),
  Source__c: z.string().nullable(),
  Notes__c: z.string().nullable(),
});

function buildSchema() {
  if (!nsPrefix()) return PlanEventTemplateRow;
  const prefixed: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(PlanEventTemplateRow.shape)) {
    prefixed[ns(k)] = v;
  }
  return z.object(prefixed);
}

export type PlanEventTemplate = {
  id: string;
  label: string | null;
  category: string | null;
  region: string | null;
  season: string | null;
  month: string | null;
  revenueDeltaPct: number | null;
  cogsDeltaPct: number | null;
  opexDeltaAbs: number | null;
  source: string | null;
  notes: string | null;
};

/**
 * Read Plan_Event_Template__c rows from the connected org. Optional region / category
 * filters mirror OhfyPlanDataReader.listEventTemplates so LWC and MCP see the same data.
 */
export async function getPlanEventTemplates(
  conn: Connection,
  opts: { region?: string; category?: string } = {},
): Promise<PlanEventTemplate[]> {
  const wheres: string[] = [];
  if (opts.region) wheres.push(`${ns("Region__c")} = '${escapeSoqlLiteral(opts.region)}'`);
  if (opts.category) wheres.push(`${ns("Category__c")} = '${escapeSoqlLiteral(opts.category)}'`);

  const fields = [
    "Event_Id__c",
    "Label__c",
    "Category__c",
    "Region__c",
    "Season__c",
    "Month__c",
    "Revenue_Delta_Pct__c",
    "COGS_Delta_Pct__c",
    "OpEx_Delta_Abs__c",
    "Source__c",
    "Notes__c",
  ]
    .map(ns)
    .join(", ");

  const soql = [
    `SELECT ${fields}`,
    `FROM ${ns("Plan_Event_Template__c")}`,
    wheres.length ? `WHERE ${wheres.join(" AND ")}` : "",
    `ORDER BY ${ns("Month__c")}`,
    "LIMIT 200",
  ]
    .filter(Boolean)
    .join(" ");

  const rows = await query(conn, soql, buildSchema(), "sf.query.plan_event_template");
  const get = <T>(row: Record<string, unknown>, key: string): T => row[ns(key)] as T;

  return rows.map((r): PlanEventTemplate => {
    const row = r as Record<string, unknown>;
    return {
      id: get<string>(row, "Event_Id__c"),
      label: get<string | null>(row, "Label__c"),
      category: get<string | null>(row, "Category__c"),
      region: get<string | null>(row, "Region__c"),
      season: get<string | null>(row, "Season__c"),
      month: get<string | null>(row, "Month__c"),
      revenueDeltaPct: get<number | null>(row, "Revenue_Delta_Pct__c"),
      cogsDeltaPct: get<number | null>(row, "COGS_Delta_Pct__c"),
      opexDeltaAbs: get<number | null>(row, "OpEx_Delta_Abs__c"),
      source: get<string | null>(row, "Source__c"),
      notes: get<string | null>(row, "Notes__c"),
    };
  });
}

/** Single-quote escape for SOQL string literals (region/category come from a closed enum upstream, defense in depth). */
function escapeSoqlLiteral(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
