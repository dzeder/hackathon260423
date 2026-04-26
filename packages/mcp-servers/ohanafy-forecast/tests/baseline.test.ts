import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetBaselineCacheForTesting, loadBaseline } from "../src/baseline.js";

describe("loadBaseline", () => {
  const originalEnv = process.env.SF_AUTH_URL;

  beforeEach(() => {
    _resetBaselineCacheForTesting();
    delete process.env.SF_AUTH_URL;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SF_AUTH_URL;
    else process.env.SF_AUTH_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns 6 months of seed data when SF_AUTH_URL is unset", async () => {
    const rows = await loadBaseline();
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("each month has the full ForecastMonth shape", async () => {
    const rows = await loadBaseline();
    for (const r of rows) {
      expect(r).toMatchObject({
        month: expect.any(String),
        revenue: expect.any(Number),
        cogs: expect.any(Number),
        opex: expect.any(Number),
        gm: expect.any(Number),
        ebitda: expect.any(Number),
      });
    }
  });

  it("caches across calls within the TTL", async () => {
    const first = await loadBaseline();
    const second = await loadBaseline();
    expect(second).toBe(first);
  });

  it("re-reads after cache reset", async () => {
    const first = await loadBaseline();
    _resetBaselineCacheForTesting();
    const second = await loadBaseline();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
