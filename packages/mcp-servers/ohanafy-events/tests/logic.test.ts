import { describe, expect, it } from "vitest";
import {
  getEvent,
  searchEvents,
  suggestEvents,
  type EventTemplate,
} from "../src/logic.js";

const catalog: EventTemplate[] = [
  {
    id: "iron-bowl-2026",
    label: "Iron Bowl weekend (Auburn vs Alabama)",
    category: "sports",
    region: "AL",
    season: "fall",
    month: "2026-10",
    revenueDeltaPct: 9.5,
    cogsDeltaPct: 7.2,
    opexDeltaAbs: 35,
    source: "CFBD",
  },
  {
    id: "heat-wave-july",
    label: "July heat wave",
    category: "weather",
    region: "AL",
    season: "summer",
    month: "2026-07",
    revenueDeltaPct: 3.1,
    cogsDeltaPct: 2.2,
    opexDeltaAbs: 10,
    source: "NOAA",
  },
  {
    id: "fuel-surcharge-q3",
    label: "Diesel surge",
    category: "macro",
    region: "US",
    season: "summer",
    month: "2026-08",
    revenueDeltaPct: 0,
    cogsDeltaPct: 1.4,
    opexDeltaAbs: 28,
    source: "EIA",
  },
];

describe("searchEvents", () => {
  it("free-text query matches label case-insensitively", () => {
    expect(searchEvents(catalog, { query: "iron" })).toHaveLength(1);
    expect(searchEvents(catalog, { query: "IRON" })).toHaveLength(1);
  });

  it("region filter keeps US-scoped events (macro applies everywhere)", () => {
    const out = searchEvents(catalog, { region: "AL" });
    expect(out.map((e) => e.id).sort()).toEqual([
      "fuel-surcharge-q3",
      "heat-wave-july",
      "iron-bowl-2026",
    ]);
  });

  it("category filter narrows to one class", () => {
    const out = searchEvents(catalog, { category: "weather" });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("heat-wave-july");
  });

  it("season filter respects 'any' as pass-through", () => {
    const out = searchEvents(catalog, { season: "any" });
    expect(out).toHaveLength(3);
  });
});

describe("getEvent", () => {
  it("returns the template for a known id", () => {
    expect(getEvent(catalog, "iron-bowl-2026")?.label).toMatch(/Iron Bowl/);
  });

  it("returns null for an unknown id", () => {
    expect(getEvent(catalog, "nope")).toBeNull();
  });
});

describe("suggestEvents", () => {
  it("scores events in the forecast horizon higher than out-of-horizon events", () => {
    const out = suggestEvents(
      catalog,
      { months: ["2026-10"], avgRevenue: 5000, region: "AL" },
      3,
    );
    expect(out[0].event.id).toBe("iron-bowl-2026");
    expect(out[0].reasons.some((r) => r.includes("month 2026-10"))).toBe(true);
  });

  it("respects the limit parameter", () => {
    const out = suggestEvents(
      catalog,
      { months: ["2026-07", "2026-08", "2026-10"], avgRevenue: 5000, region: "AL" },
      2,
    );
    expect(out).toHaveLength(2);
  });

  it("still returns material events as fallback when horizon doesn't overlap", () => {
    // Material-magnitude events are useful 'what if' suggestions even for a
    // horizon that doesn't include their native month.
    const out = suggestEvents(
      catalog,
      { months: ["2099-01"], avgRevenue: 5000, region: "ZZ" },
      5,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => !s.reasons.some((r) => r.includes("month 2099-01")))).toBe(true);
  });
});
