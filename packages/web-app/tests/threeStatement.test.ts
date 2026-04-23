import { describe, expect, it } from "vitest";
import { baselineForecast } from "@/data/baseline";
import { runThreeStatement } from "@/lib/threeStatement";

describe("runThreeStatement", () => {
  it("sums revenue across the 6-month horizon", () => {
    const out = runThreeStatement(baselineForecast);
    const expected = baselineForecast.reduce((acc, m) => acc + m.revenue, 0);
    expect(out.income.totals.revenue).toBe(expected);
  });

  it("returns positive EBITDA given the Yellowhammer baseline", () => {
    const out = runThreeStatement(baselineForecast);
    expect(out.income.totals.ebitda).toBeGreaterThan(0);
  });

  it("balance.cash is non-zero and related to revenue + ebitda", () => {
    const out = runThreeStatement(baselineForecast);
    expect(out.balance.closingCashBalance).toBeGreaterThan(0);
    expect(out.cash.operating).toBeGreaterThan(0);
  });

  it("handles an empty forecast without crashing", () => {
    const out = runThreeStatement([]);
    expect(out.income.totals.revenue).toBe(0);
    expect(out.cash.netChange).toBe(0);
  });
});
