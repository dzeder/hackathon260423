import { describe, expect, it } from "vitest";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { seedEventCatalog } from "@/lib/eventsCatalog";
import {
  buildIcMemoUserPrompt,
  countWords,
  respondCannedIcMemo,
} from "@/lib/icMemo";
import { runThreeStatement } from "@/lib/threeStatement";

function build(appliedIds: string[]) {
  const baseline = baselineForecast;
  const applied = seedEventCatalog.filter((e) => appliedIds.includes(e.id));
  const scenario = applyEvents(baseline, applied);
  const threeStatement = runThreeStatement(scenario);
  return { baseline, scenario, threeStatement, catalog: seedEventCatalog };
}

describe("respondCannedIcMemo", () => {
  it("includes a headline with revenue $ and % when events are applied", () => {
    const { baseline, scenario, threeStatement, catalog } = build(["iron-bowl-2026"]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    expect(out.source).toBe("canned");
    expect(out.memo).toMatch(/revenue/i);
    expect(out.memo).toMatch(/%/);
    expect(out.memo).toMatch(/Iron Bowl/);
  });

  it("includes a confidence statement", () => {
    const { baseline, scenario, threeStatement, catalog } = build([
      "iron-bowl-2026",
      "heat-wave-july",
    ]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026", "heat-wave-july"],
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    expect(out.memo.toLowerCase()).toContain("confidence:");
  });

  it("handles the no-events case without throwing", () => {
    const { baseline, scenario, threeStatement, catalog } = build([]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: [],
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    expect(out.memo).toMatch(/no events|no drivers/i);
    expect(out.wordCount).toBeGreaterThan(0);
  });

  it("lands in the 120–180 word band across the §15 event combinations", () => {
    const cases: string[][] = [
      [],
      ["iron-bowl-2026"],
      ["iron-bowl-2026", "heat-wave-july"],
      ["iron-bowl-2026", "heat-wave-july", "gulf-hurricane-cat-3"],
    ];
    for (const ids of cases) {
      const { baseline, scenario, threeStatement, catalog } = build(ids);
      const out = respondCannedIcMemo({
        scenarioId: "yellowhammer-6mo",
        appliedEventIds: ids,
        baseline,
        scenario,
        threeStatement,
        catalog,
      });
      expect(out.wordCount).toBeGreaterThanOrEqual(120);
      expect(out.wordCount).toBeLessThanOrEqual(180);
    }
  });

  it("contains no emojis", () => {
    const { baseline, scenario, threeStatement, catalog } = build(["iron-bowl-2026"]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    expect(out.memo).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("buildIcMemoUserPrompt", () => {
  it("inlines baseline + scenario totals and event detail", () => {
    const { baseline, scenario, threeStatement, catalog } = build(["iron-bowl-2026"]);
    const prompt = buildIcMemoUserPrompt({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
      catalog,
    });
    expect(prompt).toContain("yellowhammer-6mo");
    expect(prompt).toContain("Baseline 6-month totals");
    expect(prompt).toContain("Scenario 6-month totals");
    expect(prompt).toContain("iron-bowl-2026");
  });
});

describe("countWords", () => {
  it("collapses whitespace and counts non-empty tokens", () => {
    expect(countWords("  one two\nthree   four  ")).toBe(4);
    expect(countWords("")).toBe(0);
  });
});
