import type { ForecastMonth } from "@/data/baseline";

export type ScenarioEvent = {
  id: string;
  month: string;
  revenueDeltaPct?: number;
  cogsDeltaPct?: number;
  opexDeltaAbs?: number;
};

/**
 * Pure function: apply a list of scenario events to the baseline.
 * Track A expands this into the real event engine (§15 demo path).
 */
export function applyEvents(
  baseline: ForecastMonth[],
  events: ScenarioEvent[],
): ForecastMonth[] {
  return baseline.map((m) => {
    const applicable = events.filter((e) => e.month === m.month);
    if (applicable.length === 0) return m;

    let revenue = m.revenue;
    let cogs = m.cogs;
    let opex = m.opex;

    for (const e of applicable) {
      if (e.revenueDeltaPct) revenue *= 1 + e.revenueDeltaPct / 100;
      if (e.cogsDeltaPct) cogs *= 1 + e.cogsDeltaPct / 100;
      if (e.opexDeltaAbs) opex += e.opexDeltaAbs;
    }

    const gm = revenue - cogs;
    const ebitda = gm - opex;
    return { ...m, revenue, cogs, opex, gm, ebitda };
  });
}
