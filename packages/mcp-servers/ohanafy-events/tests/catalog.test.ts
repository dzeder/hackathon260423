import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadCatalog, loadSeed, _resetCatalogCacheForTesting } from "../src/catalog.js";

describe("loadCatalog seed fallback (no SF_AUTH_URL)", () => {
  const original = process.env.SF_AUTH_URL;
  beforeEach(() => {
    delete process.env.SF_AUTH_URL;
    _resetCatalogCacheForTesting();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SF_AUTH_URL;
    else process.env.SF_AUTH_URL = original;
    _resetCatalogCacheForTesting();
  });

  it("returns the seed catalog when SF_AUTH_URL is unset", async () => {
    const seed = loadSeed();
    const catalog = await loadCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog).toEqual(seed);
  });

  it("memoizes within the cache window", async () => {
    const a = await loadCatalog();
    const b = await loadCatalog();
    expect(a).toBe(b);
  });
});
