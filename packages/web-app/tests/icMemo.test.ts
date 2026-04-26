import { describe, expect, it } from "vitest";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { eventsCatalog } from "@/lib/eventsCatalog";
import {
  buildIcMemoUserPrompt,
  countWords,
  respondCannedIcMemo,
} from "@/lib/icMemo";
import { runThreeStatement } from "@/lib/threeStatement";

function build(appliedIds: string[]) {
  const baseline = baselineForecast;
  const applied = eventsCatalog.filter((e) => appliedIds.includes(e.id));
  const scenario = applyEvents(baseline, applied);
  const threeStatement = runThreeStatement(scenario);
  return { baseline, scenario, threeStatement };
}

describe("respondCannedIcMemo", () => {
  it("includes a headline with revenue $ and % when events are applied", () => {
    const { baseline, scenario, threeStatement } = build(["iron-bowl-2026"]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
    });
    expect(out.source).toBe("canned");
    expect(out.memo).toMatch(/revenue/i);
    expect(out.memo).toMatch(/%/);
    expect(out.memo).toMatch(/Iron Bowl/);
  });

  it("includes a confidence statement", () => {
    const { baseline, scenario, threeStatement } = build([
      "iron-bowl-2026",
      "heat-wave-july",
    ]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026", "heat-wave-july"],
      baseline,
      scenario,
      threeStatement,
    });
    expect(out.memo.toLowerCase()).toContain("confidence:");
  });

  it("handles the no-events case without throwing", () => {
    const { baseline, scenario, threeStatement } = build([]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: [],
      baseline,
      scenario,
      threeStatement,
    });
    expect(out.memo).toMatch(/no events/i);
    expect(out.wordCount).toBeGreaterThan(0);
  });

  it("contains no emojis", () => {
    const { baseline, scenario, threeStatement } = build(["iron-bowl-2026"]);
    const out = respondCannedIcMemo({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
    });
    expect(out.memo).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("buildIcMemoUserPrompt", () => {
  it("inlines baseline + scenario totals and event detail", () => {
    const { baseline, scenario, threeStatement } = build(["iron-bowl-2026"]);
    const prompt = buildIcMemoUserPrompt({
      scenarioId: "yellowhammer-6mo",
      appliedEventIds: ["iron-bowl-2026"],
      baseline,
      scenario,
      threeStatement,
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
