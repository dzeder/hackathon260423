import {
  createConnection,
  getMonthlyInvoiceRollup,
  getPlanEventTemplates,
} from "@ohanafy-plan/sf-client";
import type { DataSource, ForecastAssumptions } from "./dataSource";
import type { ForecastMonth } from "./baseline";
import {
  seedEventCatalog,
  type EventCategory,
  type EventTemplate,
} from "@/lib/eventsCatalog";
import { logError } from "@/lib/copilotLog";

const HORIZON_MONTHS = 6;
const BASELINE_START = "2026-05-01";
const BASELINE_END = "2026-10-31";

/**
 * Demo-customer assumptions — tracked in seed/baseline-forecast.json. The web app uses these
 * to derive COGS / OpEx / EBITDA from the org's revenue rollup until those costs land in
 * ohfy__ (or a sibling Plan_Financials__c) directly.
 */
export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  gmPct: 34.0,
  opexRatioPct: 17.9,
};

const VALID_CATEGORIES = new Set<EventCategory>([
  "sports",
  "weather",
  "holiday",
  "macro",
  "supplier",
]);

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

  async getEventTemplates(): Promise<EventTemplate[]> {
    try {
      const conn = await createConnection();
      const rows = await getPlanEventTemplates(conn);
      if (rows.length === 0) return seedEventCatalog;
      const mapped = rows
        .map((r): EventTemplate | null => {
          if (!r.id || !r.label || !r.category || !r.month || !r.region) return null;
          if (!VALID_CATEGORIES.has(r.category as EventCategory)) return null;
          return {
            id: r.id,
            label: r.label,
            category: r.category as EventCategory,
            region: r.region,
            month: r.month,
            revenueDeltaPct: r.revenueDeltaPct ?? 0,
            cogsDeltaPct: r.cogsDeltaPct ?? 0,
            opexDeltaAbs: r.opexDeltaAbs ?? 0,
            source: r.source ?? "",
            notes: r.notes ?? undefined,
          };
        })
        .filter((e): e is EventTemplate => e !== null);
      // If every row failed validation we don't want a silent empty catalog —
      // fall back to seed so the dashboard still renders something useful.
      return mapped.length > 0 ? mapped : seedEventCatalog;
    } catch (err) {
      logError("event_templates_load_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return seedEventCatalog;
    }
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
