import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConnection,
  getPlanEventTemplates,
  MissingSfAuthError,
} from "@ohanafy-plan/sf-client";
import pino from "pino";
import type { EventCategory, EventSeason, EventTemplate } from "./logic.js";

const log = pino({ name: "ohanafy-events.catalog" });

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

const VALID_CATEGORIES = new Set<EventCategory>([
  "sports",
  "weather",
  "holiday",
  "macro",
  "supplier",
]);
const VALID_SEASONS = new Set<EventSeason>([
  "spring",
  "summer",
  "fall",
  "winter",
  "any",
]);

/** Mirrors Track A baseline cache: same Claude turn often searches + suggests + classifies. */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; rows: EventTemplate[] } | null = null;

export function loadSeed(): EventTemplate[] {
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

/**
 * Returns the active event-template catalog. Reads from `Plan_Event_Template__c`
 * when `SF_AUTH_URL` is set; falls back to `seed/events-catalog.json` otherwise so
 * this MCP server still starts in zero-config dev / CI without sandbox creds.
 */
export async function loadCatalog(): Promise<EventTemplate[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
  const rows = process.env.SF_AUTH_URL ? await loadFromOrg() : loadSeed();
  cached = { at: Date.now(), rows };
  return rows;
}

async function loadFromOrg(): Promise<EventTemplate[]> {
  try {
    const conn = await createConnection();
    const rows = await getPlanEventTemplates(conn);
    if (rows.length === 0) {
      log.warn({ msg: "Plan_Event_Template__c empty; falling back to seed" });
      return loadSeed();
    }
    return rows
      .map((r): EventTemplate | null => {
        if (!r.id || !r.label || !r.category || !r.month || !r.region) return null;
        const category = VALID_CATEGORIES.has(r.category as EventCategory)
          ? (r.category as EventCategory)
          : null;
        if (!category) return null;
        const season = r.season && VALID_SEASONS.has(r.season as EventSeason)
          ? (r.season as EventSeason)
          : "any";
        return {
          id: r.id,
          label: r.label,
          category,
          region: r.region,
          season,
          month: r.month,
          revenueDeltaPct: r.revenueDeltaPct ?? 0,
          cogsDeltaPct: r.cogsDeltaPct ?? 0,
          opexDeltaAbs: r.opexDeltaAbs ?? 0,
          source: r.source ?? "",
          notes: r.notes ?? undefined,
        };
      })
      .filter((e): e is EventTemplate => e !== null);
  } catch (err) {
    if (err instanceof MissingSfAuthError) {
      return loadSeed();
    }
    log.error({ msg: "loadFromOrg failed; falling back to seed", err: String(err) });
    return loadSeed();
  }
}

/** Test-only: clear the per-process catalog cache. */
export function _resetCatalogCacheForTesting(): void {
  cached = null;
}
