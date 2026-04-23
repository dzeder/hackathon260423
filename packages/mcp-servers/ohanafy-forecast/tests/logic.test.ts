import { describe, expect, it } from "vitest";
import {
  applyEvents,
  runThreeStatement,
  snapshotScenario,
  type ForecastMonth,
  type ScenarioEvent,
} from "../src/logic.js";

const baseline: ForecastMonth[] = [
  { month: "2026-05", revenue: 1000, cogs: 600, opex: 200, gm: 400, ebitda: 200 },
  { month: "2026-06", revenue: 1100, cogs: 650, opex: 210, gm: 450, ebitda: 240 },
];

describe("applyEvents", () => {
  it("passes through untouched months", () => {
    const out = applyEvents(baseline, [
      { id: "x", month: "2026-06", revenueDeltaPct: 10 },
    ]);
    expect(out[0]).toEqual(baseline[0]);
    expect(out[1].revenue).toBeCloseTo(1210, 5);
  });

  it("stacks multiple events on the same month multiplicatively for pct deltas", () => {
    const events: ScenarioEvent[] = [
      { id: "a", month: "2026-05", revenueDeltaPct: 10 },
      { id: "b", month: "2026-05", revenueDeltaPct: 10 },
    ];
    const out = applyEvents(baseline, events);
    expect(out[0].revenue).toBeCloseTo(1000 * 1.1 * 1.1, 5);
  });

  it("adds opex deltas absolutely", () => {
    const out = applyEvents(baseline, [
      { id: "c", month: "2026-05", opexDeltaAbs: 50 },
    ]);
    expect(out[0].opex).toBe(250);
    expect(out[0].ebitda).toBe(out[0].gm - 250);
  });

  it("is pure — does not mutate the baseline", () => {
    const snapshot = JSON.parse(JSON.stringify(baseline));
    applyEvents(baseline, [{ id: "z", month: "2026-05", revenueDeltaPct: 50 }]);
    expect(baseline).toEqual(snapshot);
  });
});

describe("runThreeStatement", () => {
  it("totals income statement line items", () => {
    const out = runThreeStatement(baseline);
    expect(out.income.totals.revenue).toBe(2100);
    expect(out.income.totals.cogs).toBe(1250);
    expect(out.income.totals.gm).toBe(850);
  });

  it("produces non-zero balance + cash figures", () => {
    const out = runThreeStatement(baseline);
    expect(out.balance.closingCashBalance).toBeGreaterThan(0);
    expect(out.cash.netChange).not.toBe(0);
  });
});

describe("snapshotScenario", () => {
  it("returns forecast + three-statement + event count together", () => {
    const out = snapshotScenario(baseline, [
      { id: "iron", month: "2026-05", revenueDeltaPct: 5 },
    ]);
    expect(out.eventCount).toBe(1);
    expect(out.forecast).toHaveLength(2);
    expect(out.threeStatement.income.totals.revenue).toBeGreaterThan(2100);
  });
});
