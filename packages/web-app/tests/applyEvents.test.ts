import { describe, expect, it } from "vitest";
import { applyEvents, type ScenarioEvent } from "@/lib/applyEvents";
import { baselineForecast } from "@/data/baseline";

describe("applyEvents", () => {
  it("returns baseline unchanged when no events match", () => {
    const result = applyEvents(baselineForecast, []);
    expect(result).toEqual(baselineForecast);
  });

  it("applies a revenue delta and recomputes gm/ebitda", () => {
    const event: ScenarioEvent = {
      id: "iron-bowl-2026",
      month: "2026-10",
      revenueDeltaPct: 10,
    };
    const result = applyEvents(baselineForecast, [event]);
    const oct = result.find((m) => m.month === "2026-10")!;
    const baselineOct = baselineForecast.find((m) => m.month === "2026-10")!;
    expect(oct.revenue).toBeCloseTo(baselineOct.revenue * 1.1, 5);
    expect(oct.gm).toBeCloseTo(oct.revenue - oct.cogs, 5);
    expect(oct.ebitda).toBeCloseTo(oct.gm - oct.opex, 5);
  });

  it("is pure — does not mutate baseline", () => {
    const snapshot = JSON.parse(JSON.stringify(baselineForecast));
    applyEvents(baselineForecast, [
      { id: "x", month: "2026-05", revenueDeltaPct: 50 },
    ]);
    expect(baselineForecast).toEqual(snapshot);
  });
});
