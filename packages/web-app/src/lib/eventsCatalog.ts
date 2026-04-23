import type { ScenarioEvent } from "@/lib/applyEvents";

export type EventCategory = "sports" | "weather" | "holiday" | "macro" | "supplier";

export type EventTemplate = ScenarioEvent & {
  label: string;
  category: EventCategory;
  region: string;
  source: string;
  notes?: string;
};

// Mirrors seed/events-catalog.json — kept as a client-side constant so the
// demo stays responsive and credentials-free. Swap-out path: a /api/events
// route that proxies to the ohanafy-events MCP server.
export const eventsCatalog: EventTemplate[] = [
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

export function findEvent(id: string): EventTemplate | undefined {
  return eventsCatalog.find((e) => e.id === id);
}
