import { describe, expect, it } from "vitest";
import {
  compareScenarios,
  filterDecisions,
  newDecisionId,
  type DecisionRecord,
  type ScenarioSummary,
} from "../src/logic.js";

describe("compareScenarios", () => {
  const a: ScenarioSummary = {
    scenarioId: "with-events",
    totals: { revenue: 11000, cogs: 7200, opex: 1900, gm: 3800, ebitda: 1900 },
  };
  const b: ScenarioSummary = {
    scenarioId: "baseline",
    totals: { revenue: 10000, cogs: 6800, opex: 1900, gm: 3200, ebitda: 1300 },
  };

  it("reports positive ebitda delta when A > B", () => {
    const out = compareScenarios(a, b);
    expect(out.deltaAbs.ebitda).toBe(600);
    expect(out.deltaPct.ebitda).toBeCloseTo(46.153, 2);
    expect(out.verdict).toBe("a_better_ebitda");
  });

  it("flips verdict when B > A", () => {
    expect(compareScenarios(b, a).verdict).toBe("b_better_ebitda");
  });

  it("returns tied when ebitda identical", () => {
    const c = { ...a, scenarioId: "c", totals: { ...a.totals, ebitda: b.totals.ebitda } };
    expect(compareScenarios(c, b).verdict).toBe("tied");
  });

  it("handles zero baseline safely in pct", () => {
    const zero: ScenarioSummary = {
      scenarioId: "zero",
      totals: { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
    };
    const out = compareScenarios(a, zero);
    expect(out.deltaPct.revenue).toBe(0);
  });
});

describe("filterDecisions", () => {
  it("keeps only matching scenario and sorts newest-first", () => {
    const records: DecisionRecord[] = [
      {
        id: "1",
        scenarioId: "s1",
        note: "old",
        tags: [],
        createdAt: "2026-04-20T10:00:00Z",
      },
      {
        id: "2",
        scenarioId: "s1",
        note: "new",
        tags: [],
        createdAt: "2026-04-21T10:00:00Z",
      },
      {
        id: "3",
        scenarioId: "s2",
        note: "other scenario",
        tags: [],
        createdAt: "2026-04-22T10:00:00Z",
      },
    ];
    const out = filterDecisions(records, "s1");
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("2");
    expect(out[1].id).toBe("1");
  });
});

describe("newDecisionId", () => {
  it("returns a unique-looking string each call", () => {
    const a = newDecisionId();
    const b = newDecisionId();
    expect(a).toMatch(/^dec_/);
    expect(a).not.toBe(b);
  });
});
