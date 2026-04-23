export type ForecastMonth = {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  gm: number;
  ebitda: number;
};

export type ScenarioEvent = {
  id: string;
  label?: string;
  month: string;
  revenueDeltaPct?: number;
  cogsDeltaPct?: number;
  opexDeltaAbs?: number;
};

export type IncomeStatement = {
  months: ForecastMonth[];
  totals: { revenue: number; cogs: number; opex: number; gm: number; ebitda: number };
};

export type BalanceSheet = {
  closingCashBalance: number;
  accountsReceivable: number;
  inventory: number;
  accountsPayable: number;
  equity: number;
};

export type CashFlow = {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
};

export type ThreeStatement = {
  income: IncomeStatement;
  balance: BalanceSheet;
  cash: CashFlow;
};

export function applyEvents(
  baseline: ForecastMonth[],
  events: ScenarioEvent[],
): ForecastMonth[] {
  return baseline.map((m) => {
    const applicable = events.filter((e) => e.month === m.month);
    if (applicable.length === 0) return { ...m };

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
    return { month: m.month, revenue, cogs, opex, gm, ebitda };
  });
}

export function runThreeStatement(forecast: ForecastMonth[]): ThreeStatement {
  const totals = forecast.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      opex: acc.opex + m.opex,
      gm: acc.gm + m.gm,
      ebitda: acc.ebitda + m.ebitda,
    }),
    { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
  );

  // Working-capital stand-ins calibrated to the horizon. Demo-kernel grade:
  // approximations good enough to show movement when events stack.
  const accountsReceivable = Math.round(totals.revenue * 0.18);
  const inventory = Math.round(totals.cogs * 0.12);
  const accountsPayable = Math.round(totals.cogs * 0.09);
  const operating = Math.round(totals.ebitda * 0.82);
  const investing = Math.round(totals.revenue * -0.02);
  const financing = Math.round(totals.revenue * -0.01);
  const netChange = operating + investing + financing;
  const closingCashBalance = Math.round(netChange + totals.revenue * 0.05);
  const equity = Math.round(totals.ebitda + accountsReceivable - accountsPayable);

  return {
    income: { months: forecast, totals },
    balance: { closingCashBalance, accountsReceivable, inventory, accountsPayable, equity },
    cash: { operating, investing, financing, netChange },
  };
}

export function snapshotScenario(
  baseline: ForecastMonth[],
  events: ScenarioEvent[],
): { forecast: ForecastMonth[]; threeStatement: ThreeStatement; eventCount: number } {
  const forecast = applyEvents(baseline, events);
  const threeStatement = runThreeStatement(forecast);
  return { forecast, threeStatement, eventCount: events.length };
}
