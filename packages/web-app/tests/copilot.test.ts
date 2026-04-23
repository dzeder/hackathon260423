import { describe, expect, it } from "vitest";
import { baselineForecast } from "@/data/baseline";
import { applyEvents } from "@/lib/applyEvents";
import { respond } from "@/lib/copilot";
import { eventsCatalog } from "@/lib/eventsCatalog";
import { runThreeStatement } from "@/lib/threeStatement";

function buildQuery(prompt: string, appliedEventIds: string[] = []) {
  const events = eventsCatalog.filter((e) => appliedEventIds.includes(e.id));
  const scenario = applyEvents(baselineForecast, events);
  const threeStatement = runThreeStatement(scenario);
  return {
    prompt,
    scenarioId: "t",
    appliedEventIds,
    baseline: baselineForecast,
    scenario,
    threeStatement,
  };
}

describe("copilot respond", () => {
  it("recognizes Iron Bowl in the prompt and returns the sports citation", () => {
    const out = respond(buildQuery("What happens on Iron Bowl weekend?"));
    expect(out.citations.some((c) => c.toLowerCase().includes("cfbd"))).toBe(true);
    expect(out.bullets.some((b) => b.includes("2026-10"))).toBe(true);
  });

  it("renders EBITDA deltas when the prompt asks about profit", () => {
    const out = respond(buildQuery("what's the ebitda delta?", ["iron-bowl-2026"]));
    expect(out.text).toMatch(/ebitda/i);
    expect(out.bullets.join(" ")).toMatch(/baseline ebitda/i);
  });

  it("returns a default response for an unrelated prompt", () => {
    const out = respond(buildQuery("Unrelated question about ponies"));
    expect(out.text).toMatch(/I can answer/);
  });

  it("downside-risk prompt returns the hurricane scenario", () => {
    const out = respond(buildQuery("What's the biggest downside risk?"));
    expect(out.citations.join(" ")).toMatch(/NOAA/);
  });
});
