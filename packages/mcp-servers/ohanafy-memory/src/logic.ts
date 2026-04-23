export type DecisionRecord = {
  id: string;
  scenarioId: string;
  note: string;
  author?: string;
  tags: string[];
  createdAt: string;
};

export type ScenarioSummary = {
  scenarioId: string;
  totals: { revenue: number; cogs: number; opex: number; gm: number; ebitda: number };
};

export type ScenarioCompareResult = {
  a: string;
  b: string;
  deltaAbs: { revenue: number; cogs: number; opex: number; gm: number; ebitda: number };
  deltaPct: { revenue: number; cogs: number; opex: number; gm: number; ebitda: number };
  verdict: "a_better_ebitda" | "b_better_ebitda" | "tied";
};

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / Math.abs(b)) * 100;
}

export function compareScenarios(
  a: ScenarioSummary,
  b: ScenarioSummary,
): ScenarioCompareResult {
  const deltaAbs = {
    revenue: a.totals.revenue - b.totals.revenue,
    cogs: a.totals.cogs - b.totals.cogs,
    opex: a.totals.opex - b.totals.opex,
    gm: a.totals.gm - b.totals.gm,
    ebitda: a.totals.ebitda - b.totals.ebitda,
  };
  const deltaPct = {
    revenue: pct(a.totals.revenue, b.totals.revenue),
    cogs: pct(a.totals.cogs, b.totals.cogs),
    opex: pct(a.totals.opex, b.totals.opex),
    gm: pct(a.totals.gm, b.totals.gm),
    ebitda: pct(a.totals.ebitda, b.totals.ebitda),
  };
  let verdict: ScenarioCompareResult["verdict"];
  if (deltaAbs.ebitda > 0) verdict = "a_better_ebitda";
  else if (deltaAbs.ebitda < 0) verdict = "b_better_ebitda";
  else verdict = "tied";
  return { a: a.scenarioId, b: b.scenarioId, deltaAbs, deltaPct, verdict };
}

export function newDecisionId(): string {
  return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function filterDecisions(
  records: DecisionRecord[],
  scenarioId: string,
): DecisionRecord[] {
  return records
    .filter((r) => r.scenarioId === scenarioId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
