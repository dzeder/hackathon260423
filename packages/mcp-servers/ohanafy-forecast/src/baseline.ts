import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection, getMonthlyInvoiceRollup, MissingSfAuthError } from "@ohanafy-plan/sf-client";
import pino from "pino";
import type { ForecastMonth, ScenarioEvent } from "./logic.js";

const log = pino({ name: "ohanafy-forecast.baseline" });

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../../../seed/baseline-forecast.json");

type SeedShape = {
  tenant: string;
  unit: string;
  horizon_months: number;
  baseline: ForecastMonth[];
  event_templates_seed: Array<{
    id: string;
    label: string;
    month: string;
    revenue_delta_pct: number;
    cogs_delta_pct: number;
    opex_delta_abs: number;
    source: string;
  }>;
};

/** Demo-customer assumptions used to derive COGS / OpEx / EBITDA from invoice revenue. */
const ASSUMPTIONS = { gmPct: 34.0, opexRatioPct: 17.9 } as const;

const HORIZON_MONTHS = 6;
const BASELINE_START = "2026-05-01";
const BASELINE_END = "2026-10-31";

/** TTL on the in-process baseline cache. The MCP process is short-lived but a single Claude
 * tool turn can call apply_event/run_three_statement/snapshot back-to-back; one SF round-trip
 * for the lot is fine, three is wasteful. */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; rows: ForecastMonth[] } | null = null;

export function loadSeed(): SeedShape {
  return JSON.parse(readFileSync(seedPath, "utf-8")) as SeedShape;
}

/**
 * Returns the 6-month forecast baseline. Reads from `ohfy__Invoice__c` aggregates when
 * `SF_AUTH_URL` is set; falls back to `seed/baseline-forecast.json` otherwise so this MCP
 * server still starts in zero-config dev / CI without sandbox creds.
 */
export async function loadBaseline(): Promise<ForecastMonth[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
  const rows = process.env.SF_AUTH_URL ? await loadFromOrg() : loadSeed().baseline;
  cached = { at: Date.now(), rows };
  return rows;
}

async function loadFromOrg(): Promise<ForecastMonth[]> {
  try {
    const conn = await createConnection();
    const rollup = await getMonthlyInvoiceRollup(conn, BASELINE_START, BASELINE_END);
    if (rollup.length === 0) {
      log.warn({ msg: "ohfy__Invoice__c rollup empty; falling back to seed" });
      return loadSeed().baseline;
    }
    return rollup.slice(0, HORIZON_MONTHS).map((row) => {
      const revenue = round(row.revenueUsd / 1000);
      const gm = round(revenue * (ASSUMPTIONS.gmPct / 100));
      const cogs = round(revenue - gm);
      const opex = round(revenue * (ASSUMPTIONS.opexRatioPct / 100));
      const ebitda = round(gm - opex);
      return { month: row.month, revenue, cogs, opex, gm, ebitda };
    });
  } catch (err) {
    if (err instanceof MissingSfAuthError) {
      // Should be unreachable — we just checked SF_AUTH_URL — but treat defensively.
      return loadSeed().baseline;
    }
    log.error({ msg: "loadFromOrg failed; falling back to seed", err: String(err) });
    return loadSeed().baseline;
  }
}

function round(n: number): number {
  return Math.round(n);
}

export function loadSeedEvents(): ScenarioEvent[] {
  return loadSeed().event_templates_seed.map((e) => ({
    id: e.id,
    label: e.label,
    month: e.month,
    revenueDeltaPct: e.revenue_delta_pct,
    cogsDeltaPct: e.cogs_delta_pct,
    opexDeltaAbs: e.opex_delta_abs,
  }));
}

/** Test-only: clear the per-process baseline cache. */
export function _resetBaselineCacheForTesting(): void {
  cached = null;
}
