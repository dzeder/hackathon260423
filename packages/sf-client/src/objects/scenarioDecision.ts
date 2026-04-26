import { createHash, randomUUID } from "node:crypto";
import type { Connection } from "@jsforce/jsforce-node";
import tracer from "dd-trace";
import { z } from "zod";

/**
 * Track C custom objects share the org's namespace prefix — `ohfy__` in the
 * packaging org, empty in unmanaged dev. Same convention as eventTemplate.ts.
 */
function nsPrefix(): string {
  return process.env.OHFY_PLAN_NS_PREFIX ?? "";
}

function ns(apiName: string): string {
  return apiName.endsWith("__c") || apiName.endsWith("__mdt")
    ? `${nsPrefix()}${apiName}`
    : apiName;
}

const VALID_DECISION_TYPES = ["accept", "reject", "pivot", "scope-cut"] as const;
export type PlanDecisionType = (typeof VALID_DECISION_TYPES)[number];
export const PlanDecisionTypeEnum = z.enum(VALID_DECISION_TYPES);

export type RecordPlanScenarioDecisionInput = {
  scenarioId: string;
  decisionType: PlanDecisionType;
  rationale: string;
  appliedEventIds?: string[];
  /** Raw user identifier — hashed before write. */
  userId?: string;
};

export type RecordPlanScenarioDecisionResult = {
  /** SF row Id (15/18-char). */
  sfId: string;
  /** External `Decision_Id__c` UUID generated client-side. */
  decisionId: string;
};

/**
 * Insert a Plan_Scenario_Decision__c row through the connected jsforce session.
 * Mirrors `OhfyPlanDataReader.recordDecision` (Apex) for callers that don't
 * run inside a Lightning context — i.e. the ohanafy-memory MCP server reaching
 * back from a copilot turn.
 *
 * UserId is SHA-256 hashed before write (full hex digest, matching Apex's
 * `EncodingUtil.convertToHex`). Returns the new SF Id and the client-generated
 * external id so callers can tie back to the row.
 */
export async function recordPlanScenarioDecision(
  conn: Connection,
  input: RecordPlanScenarioDecisionInput,
): Promise<RecordPlanScenarioDecisionResult> {
  if (!input.scenarioId) throw new Error("scenarioId is required");

  const decisionId = randomUUID();
  const userIdHash = createHash("sha256")
    .update(input.userId ?? "")
    .digest("hex");
  const appliedIds = (input.appliedEventIds ?? []).join(",");

  const payload: Record<string, unknown> = {
    [ns("Decision_Id__c")]: decisionId,
    [ns("Scenario_Id__c")]: input.scenarioId,
    [ns("Decision_Type__c")]: input.decisionType,
    [ns("Rationale__c")]: input.rationale,
    [ns("User_Id_Hash__c")]: userIdHash,
    [ns("Recorded_At__c")]: new Date().toISOString(),
    [ns("Applied_Event_Ids__c")]: appliedIds,
  };

  return tracer.trace(
    "sf.write.plan_scenario_decision",
    { tags: { decision_type: input.decisionType } },
    async (span) => {
      const sobject = conn.sobject(ns("Plan_Scenario_Decision__c"));
      const res = await sobject.create(payload);
      const success = Array.isArray(res) ? res[0] : res;
      if (!success.success) {
        const errs = "errors" in success ? success.errors : [];
        throw new Error(
          `Plan_Scenario_Decision__c insert failed: ${JSON.stringify(errs)}`,
        );
      }
      span?.setTag("sf_id", success.id);
      return { sfId: success.id, decisionId };
    },
  );
}
