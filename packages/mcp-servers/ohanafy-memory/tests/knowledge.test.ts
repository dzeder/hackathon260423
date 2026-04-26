import { describe, expect, it } from "vitest";
import { loadKnowledge, searchKnowledge, tokenize } from "../src/knowledge.js";

const entries = loadKnowledge();

describe("knowledge seed", () => {
  it("loads ≥ 10 entries", () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it("every entry has id, title, body, source, tags", () => {
    for (const e of entries) {
      expect(e.id).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.body.length).toBeGreaterThan(50);
      expect(e.source).toBeTruthy();
      expect(Array.isArray(e.tags)).toBe(true);
    }
  });
});

describe("tokenize", () => {
  it("drops stopwords, punctuation, and single chars", () => {
    const out = tokenize("What happens if the hurricane hits Alabama?");
    expect(out).toEqual(expect.arrayContaining(["hurricane", "hits", "alabama"]));
    expect(out).not.toContain("what");
    expect(out).not.toContain("the");
    expect(out).not.toContain("a");
  });
});

describe("searchKnowledge", () => {
  it("returns the Yellowhammer profile for a profile question", () => {
    const hits = searchKnowledge(entries, "what does the customer sell?", 3);
    const ids = hits.map((h) => h.entry.id);
    expect(ids).toContain("yellowhammer-profile");
  });

  it("returns the hurricane playbook for a hurricane query", () => {
    const hits = searchKnowledge(entries, "hurricane landfall gulf impact", 3);
    expect(hits[0].entry.id).toBe("hurricane-playbook");
  });

  it("returns the SEC football entry for a game-day query", () => {
    const hits = searchKnowledge(entries, "iron bowl sec football weekend", 3);
    expect(hits[0].entry.id).toBe("sec-football-weekend");
  });

  it("returns empty on an empty query", () => {
    expect(searchKnowledge(entries, "   ", 3)).toEqual([]);
  });

  it("returns empty when no entries match the terms", () => {
    const hits = searchKnowledge(entries, "bitcoin blockchain nft", 3);
    expect(hits).toEqual([]);
  });

  it("ranks higher when the query terms appear more frequently", () => {
    const hits = searchKnowledge(entries, "red bull seasonality chain program", 3);
    expect(hits[0].entry.id).toBe("red-bull-seasonality");
  });

  it("respects the limit parameter", () => {
    const hits = searchKnowledge(entries, "alabama", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("includes matchedTerms in every hit", () => {
    const hits = searchKnowledge(entries, "diesel opex", 3);
    expect(hits[0].matchedTerms.length).toBeGreaterThan(0);
  });
});
