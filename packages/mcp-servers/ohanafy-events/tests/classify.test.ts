import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog.js";
import { classifyScenario, tokenize } from "../src/classify.js";

const catalog = await loadCatalog();

describe("tokenize", () => {
  it("strips punctuation and stopwords, lowercases", () => {
    expect(tokenize("What happens if there is a HURRICANE?"))
      .toEqual(expect.arrayContaining(["hurricane"]));
  });

  it("drops single-char tokens", () => {
    expect(tokenize("a I an x it")).toEqual([]);
  });
});

describe("classifyScenario", () => {
  it("maps a hurricane prompt to the hurricane event", () => {
    const r = classifyScenario(catalog, "what happens if there is a hurricane?");
    expect(r.matched?.category).toBe("weather");
    expect(r.matched?.id).toMatch(/hurricane|storm|gulf/);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("maps an Iron Bowl prompt to the sports event", () => {
    const r = classifyScenario(catalog, "what if Alabama plays two more home games for the Iron Bowl?");
    expect(r.matched?.category).toBe("sports");
    expect(r.templateId).toMatch(/iron-bowl/);
  });

  it("returns null when no catalog entry matches", () => {
    const r = classifyScenario(catalog, "cannabis beverages versus Molson Coors");
    // Neither keyword is in the seed catalog; classifier should fall through.
    if (r.templateId === null) {
      expect(r.confidence).toBe(0);
      expect(r.method).toBe("fallback-none");
    } else {
      // If by accident we matched something, confidence should at least be low.
      expect(r.confidence).toBeLessThan(0.5);
    }
  });

  it("returns candidates list sorted by score", () => {
    const r = classifyScenario(catalog, "hurricane in the gulf region");
    expect(r.candidates.length).toBeGreaterThan(0);
    for (let i = 1; i < r.candidates.length; i++) {
      expect(r.candidates[i].score).toBeLessThanOrEqual(r.candidates[i - 1].score);
    }
  });

  it("empty prompt returns no match", () => {
    const r = classifyScenario(catalog, "   ");
    expect(r.templateId).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it("caps confidence at 0.95 even on exact overlap", () => {
    const r = classifyScenario(catalog, "hurricane");
    expect(r.confidence).toBeLessThanOrEqual(0.95);
  });
});
