import { createConnection, getMonthlyInvoiceRollup } from "@ohanafy-plan/sf-client";
import type { DataSource, ForecastAssumptions } from "./dataSource";
import type { ForecastMonth } from "./baseline";

const HORIZON_MONTHS = 6;
const BASELINE_START = "2026-05-01";
const BASELINE_END = "2026-10-31";

/**
 * Yellowhammer assumptions — tracked in seed/baseline-forecast.json. The web app uses these
 * to derive COGS / OpEx / EBITDA from the org's revenue rollup until those costs land in
 * ohfy__ (or a sibling Plan_Financials__c) directly.
 */
export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  gmPct: 34.0,
  opexRatioPct: 17.9,
};

export class SalesforceDataSource implements DataSource {
  constructor(private assumptions: ForecastAssumptions = DEFAULT_ASSUMPTIONS) {}

  async getBaseline(): Promise<ForecastMonth[]> {
    const conn = await createConnection();
    const rollup = await getMonthlyInvoiceRollup(conn, BASELINE_START, BASELINE_END);
    if (rollup.length === 0) {
      throw new Error(
        "ohfy__Invoice__c rollup returned 0 rows for the demo horizon — " +
          "run scripts/load-fixtures-to-org.py to seed the sandbox.",
      );
    }
    return rollup.slice(0, HORIZON_MONTHS).map((row) => toForecastMonth(row, this.assumptions));
  }
}

function toForecastMonth(
  row: { month: string; revenueUsd: number },
  a: ForecastAssumptions,
): ForecastMonth {
  // UI uses USD thousands.
  const revenue = round(row.revenueUsd / 1000);
  const gm = round(revenue * (a.gmPct / 100));
  const cogs = round(revenue - gm);
  const opex = round(revenue * (a.opexRatioPct / 100));
  const ebitda = round(gm - opex);
  return { month: row.month, revenue, cogs, opex, gm, ebitda };
}

function round(n: number): number {
  return Math.round(n);
}
