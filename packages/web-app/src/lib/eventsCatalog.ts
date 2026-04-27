import { getDataSource } from "@/data";
import type { ScenarioEvent } from "@/lib/applyEvents";

export type EventCategory = "sports" | "weather" | "holiday" | "macro" | "supplier";

export type EventTemplate = ScenarioEvent & {
  label: string;
  category: EventCategory;
  region: string;
  source: string;
  notes?: string;
};

/**
 * Seed event catalog. Used in two situations:
 *   - dev / CI when no Salesforce org is wired (FixtureDataSource serves it)
 *   - SalesforceDataSource fallback when `Plan_Event_Template__c` is empty or
 *     the SOQL call fails — keeps the demo working in degraded mode
 *
 * Customers populate their own events in `Plan_Event_Template__c`; those rows
 * supersede this seed once SF_AUTH_URL is set and the org has at least one row.
 * Mirrors `seed/events-catalog.json` and the MCP `ohanafy-events` server's seed.
 */
export const seedEventCatalog: EventTemplate[] = [
  {
    id: "iron-bowl-2026",
    label: "Iron Bowl weekend (Auburn vs Alabama)",
    category: "sports",
    region: "AL",
    month: "2026-10",
    revenueDeltaPct: 9.5,
    cogsDeltaPct: 7.2,
    opexDeltaAbs: 35,
    source: "CFBD college football calendar",
    notes: "Late-November rivalry; on-premise + chain program uplift",
  },
  {
    id: "heat-wave-july",
    label: "July heat wave — off-premise energy spike",
    category: "weather",
    region: "AL",
    month: "2026-07",
    revenueDeltaPct: 3.1,
    cogsDeltaPct: 2.2,
    opexDeltaAbs: 10,
    source: "NOAA seasonal outlook",
    notes: "Energy + light-beer categories lift; route cost up",
  },
  {
    id: "fuel-surcharge-q3",
    label: "Diesel price surge — route cost headwind",
    category: "macro",
    region: "US",
    month: "2026-08",
    revenueDeltaPct: 0,
    cogsDeltaPct: 1.4,
    opexDeltaAbs: 28,
    source: "EIA weekly fuel price",
    notes: "Pure opex hit; no volume impact",
  },
  {
    id: "gulf-hurricane-cat-3",
    label: "Gulf hurricane disrupts Mobile distribution",
    category: "weather",
    region: "AL",
    month: "2026-09",
    revenueDeltaPct: -7.5,
    cogsDeltaPct: 2.0,
    opexDeltaAbs: 55,
    source: "NOAA hurricane track",
    notes: "Mobile DC downtime; emergency routing cost",
  },
  {
    id: "memorial-day-kickoff",
    label: "Memorial Day grilling kickoff",
    category: "holiday",
    region: "AL",
    month: "2026-05",
    revenueDeltaPct: 4.2,
    cogsDeltaPct: 3.1,
    opexDeltaAbs: 12,
    source: "NRF holiday calendar",
    notes: "Off-premise chain programs — 12pk and 24pk lift",
  },
  {
    id: "red-bull-new-flavor",
    label: "Red Bull new summer flavor launch",
    category: "supplier",
    region: "US",
    month: "2026-06",
    revenueDeltaPct: 1.8,
    cogsDeltaPct: 1.5,
    opexDeltaAbs: 7,
    source: "supplier CDA",
    notes: "Limited SKU; on-premise first, chain two weeks later",
  },
];

/**
 * Look up one event template by id. Caller passes the catalog they already
 * fetched (from `getEventsCatalog()` or a server-side load). The catalog is
 * a function arg, not a module-level const, so a bug that drops the SF read
 * cannot silently fall back to seed data inside this helper.
 */
export function findEvent(
  catalog: EventTemplate[],
  id: string,
): EventTemplate | undefined {
  return catalog.find((e) => e.id === id);
}

// Module-level cache of the active catalog. Mirrors the MCP server's
// `catalog.ts` and Track A's baseline cache: same Claude turn often
// fetches + searches + suggests, so a process-level cache prevents
// redundant SOQL round-trips across handler invocations.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; rows: EventTemplate[] } | null = null;
let inflight: Promise<EventTemplate[]> | null = null;

/**
 * Returns the active event-template catalog, fetched once per cache window
 * from the configured DataSource (Salesforce in production, FixtureDataSource
 * in dev/CI). Safe to call from any async server-side path; the in-flight
 * promise is shared so concurrent callers don't stampede the SOQL endpoint.
 */
export async function getEventsCatalog(): Promise<EventTemplate[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
  if (inflight) return inflight;
  inflight = getDataSource()
    .getEventTemplates()
    .then((rows) => {
      cached = { at: Date.now(), rows };
      inflight = null;
      return rows;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/** Test-only: clear the cache and optionally pre-seed it. */
export function _setEventsCatalogForTesting(rows: EventTemplate[] | null): void {
  cached = rows ? { at: Date.now(), rows } : null;
  inflight = null;
}
