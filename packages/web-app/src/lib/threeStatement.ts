import type { ForecastMonth } from "@/data/baseline";

export type IncomeTotals = {
  revenue: number;
  cogs: number;
  opex: number;
  gm: number;
  ebitda: number;
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
  income: { months: ForecastMonth[]; totals: IncomeTotals };
  balance: BalanceSheet;
  cash: CashFlow;
};

export function runThreeStatement(forecast: ForecastMonth[]): ThreeStatement {
  const totals = forecast.reduce<IncomeTotals>(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      opex: acc.opex + m.opex,
      gm: acc.gm + m.gm,
      ebitda: acc.ebitda + m.ebitda,
    }),
    { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 0 },
  );

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
