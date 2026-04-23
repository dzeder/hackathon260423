import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ForecastMonth, ScenarioEvent } from "./logic.js";

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

export function loadSeed(): SeedShape {
  return JSON.parse(readFileSync(seedPath, "utf-8")) as SeedShape;
}

export function loadBaseline(): ForecastMonth[] {
  return loadSeed().baseline;
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
