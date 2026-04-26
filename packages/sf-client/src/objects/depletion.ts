import type { Connection } from "@jsforce/jsforce-node";
import { z } from "zod";
import { query } from "../query";

const MonthlyDepletionRollupRow = z.object({
  yr: z.number(),
  mth: z.number(),
  cases: z.number().nullable().transform((v): number => v ?? 0),
});

export type MonthlyDepletionRollup = {
  month: string;
  caseQuantity: number;
};

/** Aggregate `ohfy__Depletion__c` cases per month over an inclusive date range. */
export async function getMonthlyDepletionRollup(
  conn: Connection,
  start: string,
  end: string,
): Promise<MonthlyDepletionRollup[]> {
  const soql = `
    SELECT CALENDAR_YEAR(ohfy__Date__c) yr,
           CALENDAR_MONTH(ohfy__Date__c) mth,
           SUM(ohfy__Case_Quantity__c) cases
    FROM ohfy__Depletion__c
    WHERE ohfy__Date__c >= ${start}
      AND ohfy__Date__c <= ${end}
    GROUP BY CALENDAR_YEAR(ohfy__Date__c), CALENDAR_MONTH(ohfy__Date__c)
    ORDER BY CALENDAR_YEAR(ohfy__Date__c), CALENDAR_MONTH(ohfy__Date__c)
  `.trim();

  const rows = await query(conn, soql, MonthlyDepletionRollupRow, "sf.query.depletion_rollup");
  return rows.map((r) => ({
    month: `${r.yr}-${String(r.mth).padStart(2, "0")}`,
    caseQuantity: r.cases,
  }));
}
