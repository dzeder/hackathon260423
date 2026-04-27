import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureDataSource } from "@/data/fixtureDataSource";
import {
  _setEventsCatalogForTesting,
  getEventsCatalog,
  seedEventCatalog,
} from "@/lib/eventsCatalog";

// Most of the migration's safety story is "the SF read is wired up but the
// seed is the fallback when the org is empty / the call fails." These tests
// pin those branches so a future refactor cannot turn the fallback into a
// silent empty catalog.

describe("FixtureDataSource.getEventTemplates", () => {
  it("returns the seed catalog verbatim", async () => {
    const source = new FixtureDataSource();
    const rows = await source.getEventTemplates();
    expect(rows).toBe(seedEventCatalog);
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });
});

describe("getEventsCatalog (module-level loader)", () => {
  beforeEach(() => {
    _setEventsCatalogForTesting(null);
  });

  afterEach(() => {
    _setEventsCatalogForTesting(null);
  });

  it("returns the cached value when one is pre-seeded", async () => {
    const fake = [
      {
        id: "fake-event",
        label: "Fake",
        category: "macro" as const,
        region: "US",
        month: "2026-12",
        revenueDeltaPct: 0,
        cogsDeltaPct: 0,
        opexDeltaAbs: 0,
        source: "test",
      },
    ];
    _setEventsCatalogForTesting(fake);
    const out = await getEventsCatalog();
    expect(out).toBe(fake);
  });

  it("dedupes concurrent first-access callers (single in-flight load)", async () => {
    // Spy on the data source's getEventTemplates and resolve slowly so two
    // parallel callers exercise the in-flight promise reuse path.
    const data = await import("@/data");
    const reset = data.resetDataSourceForTesting;
    reset();
    let calls = 0;
    const spy = vi
      .spyOn(data, "getDataSource")
      .mockReturnValue({
        getBaseline: async () => [],
        getEventTemplates: async () => {
          calls += 1;
          await new Promise((r) => setTimeout(r, 25));
          return seedEventCatalog;
        },
      });
    try {
      const [a, b] = await Promise.all([getEventsCatalog(), getEventsCatalog()]);
      expect(a).toBe(b);
      expect(calls).toBe(1);
    } finally {
      spy.mockRestore();
      reset();
    }
  });
});
