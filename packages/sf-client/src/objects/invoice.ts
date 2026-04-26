import type { Connection } from "@jsforce/jsforce-node";
import { z } from "zod";
import { query } from "../query";

const nullableNumberAsZero = z
  .number()
  .nullable()
  .transform((v): number => v ?? 0);

const MonthlyInvoiceRollupRow = z.object({
  yr: z.number(),
  mth: z.number(),
  rev: nullableNumberAsZero,
  cases: nullableNumberAsZero,
});

export type MonthlyInvoiceRollup = {
  /** ISO month, e.g. "2026-05". */
  month: string;
  /** Sum of `ohfy__Total_Invoice_Value__c`, in USD. */
  revenueUsd: number;
  /** Sum of `ohfy__Total_Case_Equivalents__c`. */
  caseEquivalents: number;
};

/**
 * Aggregate `ohfy__Invoice__c` revenue + case-equivalents per month, inclusive of both bounds.
 * `start` and `end` are ISO date strings.
 */
export async function getMonthlyInvoiceRollup(
  conn: Connection,
  start: string,
  end: string,
): Promise<MonthlyInvoiceRollup[]> {
  const soql = `
    SELECT CALENDAR_YEAR(ohfy__Invoice_Date__c) yr,
           CALENDAR_MONTH(ohfy__Invoice_Date__c) mth,
           SUM(ohfy__Total_Invoice_Value__c) rev,
           SUM(ohfy__Total_Case_Equivalents__c) cases
    FROM ohfy__Invoice__c
    WHERE ohfy__Invoice_Date__c >= ${start}
      AND ohfy__Invoice_Date__c <= ${end}
    GROUP BY CALENDAR_YEAR(ohfy__Invoice_Date__c), CALENDAR_MONTH(ohfy__Invoice_Date__c)
    ORDER BY CALENDAR_YEAR(ohfy__Invoice_Date__c), CALENDAR_MONTH(ohfy__Invoice_Date__c)
  `.trim();

  const rows = await query(conn, soql, MonthlyInvoiceRollupRow, "sf.query.invoice_rollup");
  return rows.map((r) => ({
    month: `${r.yr}-${String(r.mth).padStart(2, "0")}`,
    revenueUsd: r.rev,
    caseEquivalents: r.cases,
  }));
}
