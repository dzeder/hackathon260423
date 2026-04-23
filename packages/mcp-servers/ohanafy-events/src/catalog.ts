import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventCategory, EventSeason, EventTemplate } from "./logic.js";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../../../seed/events-catalog.json");

type RawEvent = {
  id: string;
  label: string;
  category: string;
  region: string;
  season: string;
  month: string;
  revenue_delta_pct: number;
  cogs_delta_pct: number;
  opex_delta_abs: number;
  source: string;
  notes?: string;
};

type SeedShape = {
  tenant: string;
  region: string;
  unit: string;
  events: RawEvent[];
};

export function loadCatalog(): EventTemplate[] {
  const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as SeedShape;
  return seed.events.map<EventTemplate>((e) => ({
    id: e.id,
    label: e.label,
    category: e.category as EventCategory,
    region: e.region,
    season: e.season as EventSeason,
    month: e.month,
    revenueDeltaPct: e.revenue_delta_pct,
    cogsDeltaPct: e.cogs_delta_pct,
    opexDeltaAbs: e.opex_delta_abs,
    source: e.source,
    notes: e.notes,
  }));
}
